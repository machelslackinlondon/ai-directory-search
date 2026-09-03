const { DESIGN_FACETS, US_STATES } = require("../../directory/designTaxonomy");
const { normalizeKeyword } = require("../searchContract");
const { slugify } = require("../../utils/text");

const PREFERENCE_FACETS = new Set(["rooms", "projectTypes", "styles", "services"]);

function labelsForFacet(facet, taxonomy = {}) {
  if (facet === "category") return (taxonomy.categories || []).map(({ category }) => category);
  if (facet === "businessType") return (taxonomy.categories || []).flatMap(({ subcategories }) => subcategories || []);
  if (facet === "state") return US_STATES;
  return taxonomy.facets?.[facet] || DESIGN_FACETS[facet] || [];
}

function canonicalLabel(facet, value, taxonomy) {
  const normalized = normalizeKeyword(value);
  return labelsForFacet(facet, taxonomy).find((label) =>
    normalizeKeyword(label) === normalized || slugify(label) === String(value)
  ) || null;
}

function decodePreferenceQueryName(name, taxonomy) {
  const match = /^preference__([^_]+)__(.+)$/.exec(String(name || ""));
  if (!match || !PREFERENCE_FACETS.has(match[1])) return null;
  const [facet, value] = match.slice(1);
  const label = labelsForFacet(facet, taxonomy).find((item) => slugify(item) === value);
  return label ? { facet, value, label } : null;
}

function stripHighlightMarkup(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function parseSearchResponse(response, params = {}, taxonomy = {}, metadata = {}) {
  const body = response && response.body ? response.body : (response || {});
  const hits = body.hits || {};
  const total = typeof hits.total === "number" ? hits.total : Number(hits.total?.value || 0);
  const results = (hits.hits || []).map((hit) => {
    const matchLabels = (hit.matched_queries || [])
      .map((name) => decodePreferenceQueryName(name, taxonomy))
      .filter(Boolean);
    const highlights = hit.highlight || {};
    const reasons = [
      ...matchLabels.map(({ label }) => label),
      ...Object.values(highlights).flat().map(stripHighlightMarkup).filter(Boolean)
    ];
    return {
      id: hit._id || hit._source?.id,
      entry: hit._source?.profile || hit._source || {},
      score: hit._score == null ? 0 : hit._score,
      semanticScore: 0,
      matchLabels,
      matchedFields: {},
      highlights,
      reasons,
      whyMatched: reasons.join("; ") || "matched by ranking fallback"
    };
  });
  const facets = Object.fromEntries(Object.entries(body.aggregations || {}).map(([facet, aggregation]) => [
    facet,
    (aggregation.buckets || []).flatMap(({ key, doc_count: count }) => {
      const label = canonicalLabel(facet, key, taxonomy);
      return label ? [{ value: slugify(key), label, count }] : [];
    })
  ]));

  return {
    query: String(params.query || ""),
    mode: "keyword",
    semanticAvailable: false,
    filters: params.filters || {},
    sort: params.sort || "relevance",
    total,
    tookMs: Number(body.took || 0),
    backend: metadata.backend || "opensearch",
    fallback: Boolean(metadata.fallback),
    fallbackReason: metadata.fallbackReason || null,
    facets,
    results
  };
}

module.exports = { decodePreferenceQueryName, parseSearchResponse };
