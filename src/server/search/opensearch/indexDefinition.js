const SCHEMA_VERSION = 1;
const TEMPLATE_NAME = "directory-profiles-template-v1";
const INDEX_PATTERN = "directory-profiles-v1-*";
const DEFAULT_INDEX_ALIAS = "directory-profiles";

const analysis = {
  char_filter: {},
  tokenizer: {
    directory_autocomplete: {
      type: "edge_ngram",
      min_gram: 2,
      max_gram: 20,
      token_chars: ["letter", "digit"]
    }
  },
  filter: {
    directory_light_stemmer: { type: "stemmer", language: "light_english" },
    directory_synonyms: {
      type: "synonym_graph",
      lenient: false,
      synonyms: [
        "remodel, remodeling, renovation",
        "new build, new construction",
        "outdoor design, garden design, landscape design",
        "full service design, full-service design"
      ]
    }
  },
  analyzer: {
    directory_text: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding"] },
    directory_description_index: {
      type: "custom",
      tokenizer: "standard",
      filter: ["lowercase", "asciifolding", "directory_light_stemmer"]
    },
    directory_description_search: {
      type: "custom",
      tokenizer: "standard",
      filter: ["lowercase", "asciifolding", "directory_synonyms", "directory_light_stemmer"]
    },
    directory_autocomplete: {
      type: "custom",
      tokenizer: "directory_autocomplete",
      filter: ["lowercase", "asciifolding"]
    }
  },
  normalizer: {
    directory_keyword: { type: "custom", filter: ["trim", "lowercase", "asciifolding"] }
  }
};

const settings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  similarity: {
    default: { type: "BM25", k1: 1.2, b: 0.75, discount_overlaps: true }
  },
  analysis
};

const searchableKeyword = {
  type: "keyword",
  normalizer: "directory_keyword",
  fields: { search: { type: "text", analyzer: "directory_text" } }
};

const name = {
  type: "text",
  analyzer: "directory_text",
  fields: {
    sort: { type: "keyword", normalizer: "directory_keyword" },
    autocomplete: {
      type: "text",
      analyzer: "directory_autocomplete",
      search_analyzer: "directory_text"
    }
  }
};

const aliases = {
  type: "text",
  analyzer: "directory_text",
  fields: {
    autocomplete: {
      type: "text",
      analyzer: "directory_autocomplete",
      search_analyzer: "directory_text"
    }
  }
};

const description = {
  type: "text",
  analyzer: "directory_description_index",
  search_analyzer: "directory_description_search"
};

const INDEX_TEMPLATE = {
  index_patterns: [INDEX_PATTERN],
  priority: 100,
  template: {
    settings,
    mappings: {
      dynamic: "strict",
      _meta: { schema_version: SCHEMA_VERSION },
      properties: {
        id: { type: "keyword", normalizer: "directory_keyword" },
        name,
        description,
        category: searchableKeyword,
        businessType: searchableKeyword,
        state: searchableKeyword,
        city: searchableKeyword,
        tags: searchableKeyword,
        rooms: searchableKeyword,
        projectTypes: searchableKeyword,
        styles: searchableKeyword,
        services: searchableKeyword,
        aliases,
        synonyms: { type: "text", analyzer: "directory_text" },
        relatedTerms: { type: "text", analyzer: "directory_text" },
        createdAt: { type: "date" },
        updatedAt: { type: "date" },
        profile: { type: "object", enabled: false }
      }
    }
  }
};

const ANALYZE_CASES = [
  { analyzer: "directory_text", text: "Caf\u00e9 MODERN", expected: ["cafe", "modern"] },
  { analyzer: "directory_description_index", text: "renovating", expected: ["renovate"] },
  { analyzer: "directory_description_search", text: "remodel", expected: ["remodel", "renovate", "remodel"] },
  { analyzer: "directory_autocomplete", text: "Arch", expected: ["ar", "arc", "arch"] }
];

function makePhysicalIndexName(now = new Date()) {
  return `${DEFAULT_INDEX_ALIAS}-v${SCHEMA_VERSION}-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
}

module.exports = {
  ANALYZE_CASES,
  DEFAULT_INDEX_ALIAS,
  INDEX_PATTERN,
  INDEX_TEMPLATE,
  SCHEMA_VERSION,
  TEMPLATE_NAME,
  makePhysicalIndexName
};
