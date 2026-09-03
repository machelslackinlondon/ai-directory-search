const {
  normalizeKeyword,
  normalizeSearchFilters,
  PRIMARY_FILTER_FIELDS,
  PREFERENCE_FILTER_FIELDS
} = require("../searchContract");
const { slugify } = require("../../utils/text");

const FUZZY_FIELDS = [
  "name^8", "aliases^7", "businessType.search^6", "category.search^5",
  "tags.search^5", "description^3", "rooms.search^3", "projectTypes.search^3",
  "styles.search^3", "services.search^3", "synonyms^2", "relatedTerms"
];
const AUTOCOMPLETE_FIELDS = ["name.autocomplete^3", "aliases.autocomplete^2"];
const FACET_FIELDS = [...PRIMARY_FILTER_FIELDS, ...PREFERENCE_FILTER_FIELDS];

function buildSort(sort) {
  if (sort === "name") return [{ "name.sort": "asc" }];
  if (sort === "newest") return [{ createdAt: "desc" }];
  if (sort === "updated") return [{ updatedAt: "desc" }];
  if (sort === "category") return [{ category: "asc" }, { "name.sort": "asc" }];
  return [{ _score: "desc" }, { "name.sort": "asc" }];
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function normalizedFilters(filters = {}) {
  const facets = filters.facets || {};
  return normalizeSearchFilters({
    ...filters,
    rooms: filters.rooms || facets.rooms,
    projectTypes: filters.projectTypes || facets.projectTypes,
    styles: filters.styles || facets.styles,
    services: filters.services || facets.services
  });
}

function preferenceClause(facet, label) {
  const value = normalizeKeyword(label);
  return {
    constant_score: {
      filter: { term: { [facet]: value } },
      boost: 4,
      _name: `preference__${facet}__${slugify(label)}`
    }
  };
}

function buildSearchBody(params = {}) {
  const query = String(params.query || "").trim();
  const filters = normalizedFilters(params.filters || {});
  const primaryFilters = PRIMARY_FILTER_FIELDS
    .filter((field) => filters[field])
    .map((field) => ({ term: { [field]: normalizeKeyword(filters[field]) } }));
  const tagFilters = filters.tags.map((tag) => ({ term: { tags: normalizeKeyword(tag) } }));
  const preferences = PREFERENCE_FILTER_FIELDS.flatMap((facet) =>
    filters[facet].map((label) => preferenceClause(facet, label))
  );
  const lexical = query
    ? {
        bool: {
          should: [
            { match_phrase: { name: { query, boost: 12 } } },
            {
              multi_match: {
                query,
                type: "best_fields",
                tie_breaker: 0.3,
                fuzziness: "AUTO",
                prefix_length: 1,
                fields: FUZZY_FIELDS
              }
            },
            { multi_match: { query, type: "best_fields", fields: AUTOCOMPLETE_FIELDS } }
          ],
          minimum_should_match: 1
        }
      }
    : { match_all: {} };
  const body = {
    from: boundedNumber(params.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    size: boundedNumber(params.limit, 20, 1, 100),
    track_total_hits: true,
    query: {
      bool: {
        must: [lexical],
        filter: [...primaryFilters, ...tagFilters],
        should: preferences
      }
    },
    aggs: Object.fromEntries(FACET_FIELDS.map((field) => [field, { terms: { field, size: 100 } }])),
    highlight: { fields: { name: {}, description: {} } },
    sort: buildSort(params.sort || "relevance")
  };

  if (preferences.length > 0) {
    body.post_filter = { bool: { should: preferences, minimum_should_match: 1 } };
  }

  return body;
}

module.exports = { buildSearchBody, buildSort };
