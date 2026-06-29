const test = require("node:test");
const assert = require("assert/strict");
const { createTestContext } = require("../helpers");
const { entryMatchesFilters } = require("../../src/server/search/memorySearchAdapter");

test("keyword ranking places the most relevant entry first", () => {
  const { searchAdapter } = createTestContext();
  const response = searchAdapter.search({ query: "AI vendor risk procurement guide", limit: 5 });
  assert.equal(response.results[0].id, "document-responsible-ai-procurement");
  assert.ok(response.results[0].whyMatched.includes("tags") || response.results[0].whyMatched.includes("description"));
});

test("filter logic narrows by category and tags", () => {
  const { searchAdapter } = createTestContext();
  const response = searchAdapter.search({
    query: "search",
    filters: {
      category: "tools",
      tags: ["local"]
    }
  });
  assert.ok(response.results.length >= 1);
  assert.ok(response.results.every((result) => result.entry.category === "tools"));
  assert.ok(response.results.every((result) => result.entry.tags.includes("local")));
});

test("entryMatchesFilters supports facets", () => {
  const { store } = createTestContext();
  const entry = store.getEntry("document-responsible-ai-procurement");
  assert.equal(entryMatchesFilters(entry, {
    facets: {
      audience: ["procurement"]
    }
  }), true);
  assert.equal(entryMatchesFilters(entry, {
    facets: {
      audience: ["engineering"]
    }
  }), false);
});

test("sort controls produce deterministic name ordering", () => {
  const { searchAdapter } = createTestContext();
  const response = searchAdapter.search({ query: "", sort: "name", limit: 3 });
  assert.deepEqual(response.results.map((result) => result.entry.name), [
    "Atlas Vector Toolkit",
    "Ava Chen",
    "Civic Cloud Migration"
  ]);
});

test("local semantic provider is optional and reports availability", () => {
  const { searchAdapter } = createTestContext({ searchOptions: { semanticProvider: "local-hash" } });
  const stats = searchAdapter.stats();
  const response = searchAdapter.search({ query: "offline vector retrieval", mode: "hybrid" });
  assert.equal(stats.semanticEnabled, true);
  assert.equal(response.semanticAvailable, true);
  assert.ok(response.results.length > 0);
});
