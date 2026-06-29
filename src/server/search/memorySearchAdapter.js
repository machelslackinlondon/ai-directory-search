const { expandQueryTerms } = require("../directory/taxonomy");
const { normalizeText, tokenize, unique } = require("../utils/text");

const FIELD_WEIGHTS = {
  name: 8,
  aliases: 7,
  category: 5,
  subcategory: 5,
  tags: 6,
  description: 3,
  facets: 3,
  relatedTerms: 2,
  location: 2,
  metadata: 1,
  contact: 1
};

function flattenObject(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(flattenObject).join(" ");
  if (typeof value === "object") return Object.values(value).map(flattenObject).join(" ");
  return String(value);
}

function getFieldTexts(entry) {
  const taxonomy = entry.taxonomy || {};
  return {
    name: entry.name,
    aliases: (taxonomy.aliases || []).join(" "),
    category: entry.category,
    subcategory: taxonomy.subcategory,
    tags: (entry.tags || []).join(" "),
    description: entry.description,
    facets: flattenObject(taxonomy.facets),
    relatedTerms: [...(taxonomy.relatedTerms || []), ...(taxonomy.synonyms || [])].join(" "),
    location: entry.location,
    metadata: flattenObject(entry.metadata),
    contact: entry.contact
  };
}

function makeDocumentText(entry) {
  return Object.values(getFieldTexts(entry)).join(" ");
}

function hashToken(token, size) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % size;
}

function vectorize(text, size = 64) {
  const vector = Array(size).fill(0);
  tokenize(text).forEach((token) => {
    vector[hashToken(token, size)] += 1;
  });
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function parseFilters(filters = {}) {
  return {
    category: filters.category || "",
    subcategory: filters.subcategory || "",
    tags: Array.isArray(filters.tags) ? filters.tags.filter(Boolean) : String(filters.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    location: filters.location || "",
    facets: filters.facets || {},
    metadata: filters.metadata || {}
  };
}

function entryMatchesFilters(entry, filters = {}) {
  const normalized = parseFilters(filters);
  const taxonomy = entry.taxonomy || {};

  if (normalized.category && normalizeText(entry.category) !== normalizeText(normalized.category)) return false;
  if (normalized.subcategory && normalizeText(taxonomy.subcategory) !== normalizeText(normalized.subcategory)) return false;
  if (normalized.location && !normalizeText(entry.location).includes(normalizeText(normalized.location))) return false;

  const entryTags = (entry.tags || []).map(normalizeText);
  if (normalized.tags.length > 0 && !normalized.tags.every((tag) => entryTags.includes(normalizeText(tag)))) return false;

  for (const [facet, value] of Object.entries(normalized.facets || {})) {
    const wanted = Array.isArray(value) ? value : [value];
    const actual = (taxonomy.facets && taxonomy.facets[facet]) || [];
    const actualText = actual.map(normalizeText);
    if (!wanted.every((item) => actualText.includes(normalizeText(item)))) return false;
  }

  for (const [key, value] of Object.entries(normalized.metadata || {})) {
    if (!normalizeText(flattenObject(entry.metadata && entry.metadata[key])).includes(normalizeText(value))) return false;
  }

  return true;
}

function scoreEntry(entry, query, expanded) {
  const queryText = normalizeText(query);
  const originalTokens = tokenize(query);
  const originalTokenSet = new Set(originalTokens.map(normalizeText));
  const queryTokens = unique([...(originalTokens || []), ...(expanded.terms || [])]);
  const phrases = unique([queryText, ...expanded.phrases]).filter(Boolean);
  const fields = getFieldTexts(entry);
  const matchedFields = {};
  const reasons = [];
  let score = 0;

  Object.entries(fields).forEach(([field, text]) => {
    const normalizedField = normalizeText(text);
    if (!normalizedField) return;

    const hits = [];
    queryTokens.forEach((term) => {
      const normalizedTerm = normalizeText(term);
      if (normalizedField.includes(normalizedTerm)) {
        hits.push(term);
        score += (FIELD_WEIGHTS[field] || 1) * (originalTokenSet.has(normalizedTerm) ? 1 : 0.25);
      }
    });

    phrases.forEach((phrase) => {
      if (phrase && phrase.length > 2 && normalizedField.includes(phrase)) {
        hits.push(phrase);
        score += (FIELD_WEIGHTS[field] || 1) * (phrase === queryText ? 2 : 0.5);
      }
    });

    if (hits.length > 0) {
      matchedFields[field] = unique(hits);
      if (field === "name") reasons.push(`name matched ${matchedFields[field].join(", ")}`);
      else if (field === "tags") reasons.push(`tags matched ${matchedFields[field].join(", ")}`);
      else if (field === "description") reasons.push(`description mentioned ${matchedFields[field].slice(0, 3).join(", ")}`);
      else reasons.push(`${field} matched ${matchedFields[field].slice(0, 3).join(", ")}`);
    }
  });

  if (!queryText) {
    score = 1;
    reasons.push("included because it matches the current filters");
  }

  return {
    matchedFields,
    reasons: unique(reasons),
    score
  };
}

function sortResults(results, sort) {
  const copy = [...results];
  if (sort === "name") return copy.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  if (sort === "newest") return copy.sort((a, b) => Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt));
  if (sort === "updated") return copy.sort((a, b) => Date.parse(b.entry.updatedAt) - Date.parse(a.entry.updatedAt));
  if (sort === "category") return copy.sort((a, b) => a.entry.category.localeCompare(b.entry.category) || a.entry.name.localeCompare(b.entry.name));
  return copy.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
}

function createMemorySearchAdapter(store, options = {}) {
  let indexVersion = 0;
  let indexedAt = null;
  let documentVectors = new Map();

  function semanticEnabled() {
    return (options.semanticProvider || process.env.SEMANTIC_PROVIDER) === "local-hash";
  }

  function reindex() {
    indexVersion += 1;
    indexedAt = new Date().toISOString();
    documentVectors = new Map();
    if (semanticEnabled()) {
      store.listEntries().forEach((entry) => {
        documentVectors.set(entry.id, vectorize(makeDocumentText(entry)));
      });
    }
    return stats();
  }

  function stats() {
    const entries = store.listEntries();
    return {
      adapter: "memory",
      entries: entries.length,
      indexVersion,
      indexedAt,
      semanticEnabled: semanticEnabled(),
      semanticProvider: semanticEnabled() ? "local-hash" : null,
      categories: store.getTaxonomy().categories.length,
      tags: store.getTaxonomy().tags.length
    };
  }

  function search(params = {}) {
    if (!indexedAt) reindex();
    const started = process.hrtime.bigint();
    const query = params.query || "";
    const sort = params.sort || "relevance";
    const limit = Math.max(1, Math.min(Number(params.limit) || 20, 100));
    const offset = Math.max(0, Number(params.offset) || 0);
    const mode = params.mode || "keyword";
    const taxonomy = store.getTaxonomy();
    const expanded = expandQueryTerms(query, taxonomy);
    const queryVector = semanticEnabled() && query ? vectorize(query) : null;

    let results = store.listEntries()
      .filter((entry) => entryMatchesFilters(entry, params.filters || {}))
      .map((entry) => {
        const scored = scoreEntry(entry, query, expanded);
        let score = scored.score;
        let semanticScore = 0;
        if (queryVector && (mode === "semantic" || mode === "hybrid")) {
          semanticScore = cosineSimilarity(queryVector, documentVectors.get(entry.id) || vectorize(makeDocumentText(entry)));
          score += semanticScore * (mode === "semantic" ? 40 : 12);
        }
        return {
          id: entry.id,
          entry,
          score: Number(score.toFixed(4)),
          semanticScore: Number(semanticScore.toFixed(4)),
          matchedFields: scored.matchedFields,
          reasons: scored.reasons,
          whyMatched: scored.reasons.length > 0 ? scored.reasons.join("; ") : "matched by ranking fallback"
        };
      });

    if (query && mode !== "semantic") {
      results = results.filter((result) => result.score > 0);
    } else if (query && mode === "semantic" && semanticEnabled()) {
      results = results.filter((result) => result.semanticScore > 0);
    }

    const total = results.length;
    const sorted = sortResults(results, sort).slice(offset, offset + limit);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1000000;

    return {
      query,
      mode: semanticEnabled() ? mode : "keyword",
      semanticAvailable: semanticEnabled(),
      filters: parseFilters(params.filters || {}),
      sort,
      total,
      tookMs: Number(elapsedMs.toFixed(3)),
      results: sorted
    };
  }

  reindex();

  return {
    name: "memory",
    getEntry: store.getEntry,
    listCategories: () => store.getTaxonomy().categories,
    reindex,
    search,
    stats
  };
}

module.exports = {
  createMemorySearchAdapter,
  entryMatchesFilters,
  scoreEntry,
  sortResults,
  vectorize
};
