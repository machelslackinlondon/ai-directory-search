const test = require("node:test");
const assert = require("assert/strict");
const { buildSearchBody, buildSort } = require("../../src/server/search/opensearch/query");

test("builds BM25 fields, fuzzy and autocomplete clauses, primary AND filters, and one preference OR", () => {
  const body = buildSearchBody({
    query: "modern renovation",
    filters: {
      category: "Architecture",
      state: "California",
      rooms: ["Kitchen", "Bathroom"],
      services: ["Consultation"]
    },
    limit: 20,
    offset: 0,
    sort: "relevance"
  });

  assert.deepEqual(body.query.bool.filter, [
    { term: { category: "architecture" } },
    { term: { state: "california" } }
  ]);
  assert.equal(body.query.bool.should.length, 3);
  assert.equal(body.post_filter.bool.minimum_should_match, 1);
  assert.equal(body.post_filter.bool.should.length, 3);
  const lexical = body.query.bool.must[0].bool.should;
  const fuzzy = lexical.find((clause) => clause.multi_match?.fuzziness === "AUTO");
  const autocomplete = lexical.find((clause) => clause.multi_match?.fields?.includes("name.autocomplete^3"));
  assert.ok(fuzzy.multi_match.fields.includes("aliases^7"));
  assert.ok(fuzzy.multi_match.fields.includes("rooms.search^3"));
  assert.ok(autocomplete);
  assert.deepEqual(body.sort, [{ _score: "desc" }, { "name.sort": "asc" }]);
});

test("normalizes punctuation-preserving exact filters and encodes every preference in one named query group", () => {
  const body = buildSearchBody({
    query: "",
    filters: {
      category: " Interior Design + Decor ",
      businessType: "Interior Designer",
      state: "CALIFORNIA",
      tags: ["High-End", "Residential"],
      rooms: ["Living Room"],
      projectTypes: ["New Build"],
      styles: ["Modern"],
      services: ["Full-service Design"]
    }
  });

  assert.deepEqual(body.query.bool.filter, [
    { term: { category: "interior design + decor" } },
    { term: { businessType: "interior designer" } },
    { term: { state: "california" } },
    { term: { tags: "high-end" } },
    { term: { tags: "residential" } }
  ]);
  assert.equal(body.query.bool.must[0].match_all !== undefined, true);
  assert.deepEqual(body.query.bool.should.map((clause) => clause._name), [
    "preference__rooms__living-room",
    "preference__projectTypes__new-build",
    "preference__styles__modern",
    "preference__services__full-service-design"
  ]);
  assert.deepEqual(Object.keys(body.aggs).sort(), [
    "businessType", "category", "projectTypes", "rooms", "services", "state", "styles"
  ]);
  assert.equal(body.post_filter.bool.should[0].constant_score.filter.term.rooms, "living room");
});

test("omits preference post filtering when none are selected and supports every deterministic sort", () => {
  const body = buildSearchBody({ query: "", filters: {}, limit: 200, offset: -5, sort: "unknown" });
  assert.equal(body.post_filter, undefined);
  assert.deepEqual(body.query.bool.must, [{ match_all: {} }]);
  assert.equal(body.size, 100);
  assert.equal(body.from, 0);
  assert.deepEqual(buildSort("name"), [{ "name.sort": "asc" }]);
  assert.deepEqual(buildSort("newest"), [{ createdAt: "desc" }]);
  assert.deepEqual(buildSort("updated"), [{ updatedAt: "desc" }]);
  assert.deepEqual(buildSort("category"), [{ category: "asc" }, { "name.sort": "asc" }]);
  assert.deepEqual(buildSort("anything-else"), [{ _score: "desc" }, { "name.sort": "asc" }]);
});
