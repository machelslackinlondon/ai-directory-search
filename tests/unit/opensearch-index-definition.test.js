const test = require("node:test");
const assert = require("assert/strict");
const {
  ANALYZE_CASES,
  DEFAULT_INDEX_ALIAS,
  INDEX_PATTERN,
  INDEX_TEMPLATE,
  SCHEMA_VERSION,
  TEMPLATE_NAME,
  makePhysicalIndexName
} = require("../../src/server/search/opensearch/indexDefinition");
const { toSearchDocument } = require("../../src/server/search/opensearch/document");

test("defines strict mappings and the approved analysis components", () => {
  const template = INDEX_TEMPLATE.template;
  assert.equal(TEMPLATE_NAME, "directory-profiles-template-v1");
  assert.equal(INDEX_PATTERN, "directory-profiles-v1-*");
  assert.equal(DEFAULT_INDEX_ALIAS, "directory-profiles");
  assert.equal(template.mappings.dynamic, "strict");
  assert.equal(template.mappings._meta.schema_version, SCHEMA_VERSION);
  assert.equal(template.settings.number_of_shards, 1);
  assert.equal(template.settings.number_of_replicas, 0);
  assert.deepEqual(template.settings.similarity.default, {
    type: "BM25", k1: 1.2, b: 0.75, discount_overlaps: true
  });
  assert.deepEqual(template.settings.analysis.analyzer.directory_text.filter, ["lowercase", "asciifolding"]);
  assert.equal(template.settings.analysis.filter.directory_synonyms.type, "synonym_graph");
  assert.equal(template.settings.analysis.tokenizer.directory_autocomplete.type, "edge_ngram");
  assert.equal(template.mappings.properties.profile.enabled, false);
});

test("maps searchable keywords, narrative text, aliases, and dates explicitly", () => {
  const properties = INDEX_TEMPLATE.template.mappings.properties;
  assert.deepEqual(properties.category, {
    type: "keyword",
    normalizer: "directory_keyword",
    fields: { search: { type: "text", analyzer: "directory_text" } }
  });
  assert.equal(properties.description.search_analyzer, "directory_description_search");
  assert.equal(properties.aliases.fields.autocomplete.analyzer, "directory_autocomplete");
  assert.equal(properties.name.fields.sort.normalizer, "directory_keyword");
  assert.deepEqual(Object.keys(properties).sort(), [
    "aliases", "businessType", "category", "city", "createdAt", "description", "id", "name",
    "profile", "projectTypes", "relatedTerms", "rooms", "services", "state", "styles", "synonyms",
    "tags", "updatedAt"
  ]);
  assert.equal(properties.createdAt.type, "date");
  assert.equal(properties.updatedAt.type, "date");
});

test("exports hand-checked analyzer cases and deterministic versioned physical names", () => {
  assert.deepEqual(ANALYZE_CASES, [
    { analyzer: "directory_text", text: "Caf\u00e9 MODERN", expected: ["cafe", "modern"] },
    { analyzer: "directory_description_index", text: "renovating", expected: ["renovate"] },
    { analyzer: "directory_description_search", text: "remodel", expected: ["remodel", "remodeling", "renovation"] },
    { analyzer: "directory_autocomplete", text: "Arch", expected: ["ar", "arc", "arch"] }
  ]);
  assert.equal(makePhysicalIndexName(new Date("2026-09-03T12:34:56.000Z")), "directory-profiles-v1-20260903123456");
});

test("projects canonical entries to flat index documents while retaining the full profile", () => {
  const entry = {
    id: "firm-1",
    name: "Caf\u00e9 Studio",
    description: "Renovation practice",
    category: "Interior Design + Decor",
    taxonomy: {
      subcategory: "Interior Designer",
      facets: { rooms: ["Kitchen"], styles: ["Modern"] },
      aliases: ["Cafe Studio"],
      synonyms: ["renovation"],
      relatedTerms: ["kitchen design"]
    },
    tags: ["residential"],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };

  assert.deepEqual(toSearchDocument(entry), {
    id: "firm-1",
    name: "Caf\u00e9 Studio",
    description: "Renovation practice",
    category: "Interior Design + Decor",
    businessType: "Interior Designer",
    state: "",
    city: "",
    tags: ["residential"],
    rooms: ["Kitchen"],
    projectTypes: [],
    styles: ["Modern"],
    services: [],
    aliases: ["Cafe Studio"],
    synonyms: ["renovation"],
    relatedTerms: ["kitchen design"],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    profile: entry
  });
});
