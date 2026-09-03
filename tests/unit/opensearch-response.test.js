const test = require("node:test");
const assert = require("assert/strict");
const seed = require("../../src/data/seed-directory.json");
const { collectTaxonomy } = require("../../src/server/directory/taxonomy");
const {
  decodePreferenceQueryName,
  parseSearchResponse
} = require("../../src/server/search/opensearch/response");

const taxonomy = collectTaxonomy(seed.entries, seed.taxonomy);

test("parses matched queries into labels and normalized aggregations into display labels", () => {
  const parsed = parseSearchResponse({ body: {
    took: 7,
    hits: { total: { value: 1 }, hits: [{
      _id: "atelier-north-architecture",
      _score: 12.5,
      _source: { profile: seed.entries[0] },
      matched_queries: ["preference__rooms__kitchen", "preference__styles__modern"],
      highlight: { description: ["Residential <em>renovation</em> practice"] }
    }] },
    aggregations: { rooms: { buckets: [{ key: "kitchen", doc_count: 3 }] } }
  } }, { filters: { rooms: ["Kitchen"], styles: ["Modern"] } }, taxonomy, {
    backend: "opensearch", fallback: false
  });

  assert.deepEqual(parsed.results[0].matchLabels.map(({ label }) => label), ["Kitchen", "Modern"]);
  assert.equal(parsed.results[0].highlights.description[0], "Residential <em>renovation</em> practice");
  assert.equal(parsed.results[0].whyMatched, "Kitchen; Modern; Residential renovation practice");
  assert.equal(parsed.facets.rooms[0].label, "Kitchen");
  assert.equal(parsed.backend, "opensearch");
});

test("accepts plain response bodies, keeps exact totals, and ignores unknown named queries", () => {
  const parsed = parseSearchResponse({
    took: 4,
    hits: { total: 2, hits: [{
      _id: "profile-2",
      _score: 2.25,
      _source: { profile: seed.entries[1] },
      matched_queries: ["unrelated__name", "preference__services__consultation"]
    }] },
    aggregations: { category: { buckets: [
      { key: "architecture", doc_count: 2 },
      { key: "unapproved-category", doc_count: 9 }
    ] } }
  }, { query: "studio", sort: "name", filters: {} }, taxonomy, {
    backend: "memory", fallback: true, fallbackReason: "unavailable"
  });

  assert.equal(parsed.query, "studio");
  assert.equal(parsed.sort, "name");
  assert.equal(parsed.total, 2);
  assert.equal(parsed.tookMs, 4);
  assert.deepEqual(parsed.results[0].matchLabels, [
    { facet: "services", value: "consultation", label: "Consultation" }
  ]);
  assert.equal(parsed.facets.category[0].label, "Architecture");
  assert.deepEqual(parsed.facets.category, [{ value: "architecture", label: "Architecture", count: 2 }]);
  assert.equal(parsed.fallback, true);
  assert.equal(parsed.fallbackReason, "unavailable");
});

test("decodes only known preference facets and canonical labels", () => {
  assert.deepEqual(decodePreferenceQueryName("preference__projectTypes__new-build", taxonomy), {
    facet: "projectTypes", value: "new-build", label: "New Build"
  });
  assert.equal(decodePreferenceQueryName("preference__unknown__value", taxonomy), null);
  assert.equal(decodePreferenceQueryName("not-a-preference", taxonomy), null);
});
