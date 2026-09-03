const test = require("node:test");
const assert = require("assert/strict");
const { createTestContext } = require("../helpers");
const { entryMatchesFilters } = require("../../src/server/search/memorySearchAdapter");

test("keyword ranking places the most relevant entry first", () => {
  const { searchAdapter } = createTestContext();
  const response = searchAdapter.search({ query: "modern residential architecture renovation", limit: 5 });
  assert.equal(response.results[0].id, "atelier-north-architecture");
  assert.ok(response.results[0].whyMatched.includes("tags") || response.results[0].whyMatched.includes("description"));
});

test("filter logic narrows by category and tags", () => {
  const { searchAdapter } = createTestContext();
  const response = searchAdapter.search({
    query: "modern residential",
    filters: {
      category: "Architecture",
      tags: ["residential"]
    }
  });
  assert.ok(response.results.length >= 1);
  assert.ok(response.results.every((result) => result.entry.category === "Architecture"));
  assert.ok(response.results.every((result) => result.entry.tags.includes("residential")));
});

test("entryMatchesFilters supports facets", () => {
  const { store } = createTestContext();
  const entry = store.getEntry("harbor-interiors");
  assert.equal(entryMatchesFilters(entry, {
    facets: {
      styles: ["Modern"]
    }
  }), true);
  assert.equal(entryMatchesFilters(entry, {
    facets: {
      styles: ["Traditional"]
    }
  }), false);
});

test("sort controls produce deterministic name ordering", () => {
  const { searchAdapter } = createTestContext();
  const response = searchAdapter.search({ query: "", sort: "name", limit: 3 });
  assert.deepEqual(response.results.map((result) => result.entry.name), [
    "Atelier North Architecture",
    "Civic Form Architects",
    "Harbor Interiors"
  ]);
});

test("local semantic provider is optional and reports availability", () => {
  const { searchAdapter } = createTestContext({ searchOptions: { semanticProvider: "local-hash" } });
  const stats = searchAdapter.stats();
  const response = searchAdapter.search({ query: "outdoor landscape design", mode: "hybrid" });
  assert.equal(stats.semanticEnabled, true);
  assert.equal(response.semanticAvailable, true);
  assert.ok(response.results.length > 0);
});
