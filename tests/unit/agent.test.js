const test = require("node:test");
const assert = require("assert/strict");
const { answerDirectoryQuestion, deterministicIntent, inferFilters } = require("../../src/server/agent/agent");
const { createTestContext } = require("../helpers");

test("deterministic agent refuses to invent missing entries", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("Find a submarine catering partner on Mars", context);
  assert.equal(response.references.length, 0);
  assert.match(response.answer, /will not invent/i);
});

test("agent answer is grounded in returned directory entries", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("Who handles traditional kitchen consultation?", context);
  assert.ok(response.references.length > 0);
  response.references.forEach((reference) => {
    assert.ok(context.store.getEntry(reference.id));
  });
});

test("agent can answer category list questions", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("List categories", context);
  assert.deepEqual(response.tools, ["list_directory_categories"]);
  assert.match(response.answer, /Architecture/);
});

test("agent uses deterministic suggestions for autocomplete input", async () => {
  const context = createTestContext();
  const response = await answerDirectoryQuestion("kit des chi", context);
  assert.deepEqual(response.tools, ["searchSuggestions"]);
  assert.match(response.answer, /Autocomplete suggestions/);
  assert.equal(response.references.length, 0);
});

test("intent and filter inference are deterministic", () => {
  const context = createTestContext();
  assert.equal(deterministicIntent("lookup atelier-north-architecture"), "entry_lookup");
  const filters = inferFilters("Find Architecture renovation", context.store.getTaxonomy());
  assert.equal(filters.category, "Architecture");
  assert.ok(filters.tags.includes("renovation"));
});

test("filter inference recognizes every canonical design filter", () => {
  const context = createTestContext();
  const filters = inferFilters(
    "Show me Architecture Residential Architect in California for a Bathroom New Build in Modern style with Full-service Design",
    context.store.getTaxonomy()
  );

  assert.deepEqual(filters, {
    category: "Architecture",
    businessType: "Residential Architect",
    state: "California",
    rooms: ["Bathroom"],
    projectTypes: ["New Build"],
    styles: ["Modern"],
    services: ["Full-service Design"],
    tags: ["modern", "new build", "residential"]
  });
});

test("agent keeps low OpenSearch BM25 scores and exposes match labels in results and explanations", async () => {
  const base = createTestContext();
  let searchParams;
  const entry = base.store.getEntry("atelier-north-architecture");
  const context = {
    store: base.store,
    searchAdapter: {
      async stats() {
        return {
          adapter: "opensearch",
          semanticEnabled: true,
          semanticProvider: "local-hash"
        };
      },
      async search(params) {
        searchParams = params;
        return {
          backend: "opensearch",
          fallback: false,
          fallbackReason: null,
          mode: "keyword",
          total: 1,
          results: [{
            id: entry.id,
            entry,
            score: 0.75,
            matchLabels: [{ facet: "styles", value: "modern", label: "Modern" }],
            whyMatched: "matched by ranking fallback"
          }]
        };
      }
    }
  };

  const response = await answerDirectoryQuestion(
    "Show me Architecture Residential Architect in California with Modern style",
    context
  );

  assert.equal(searchParams.mode, "keyword");
  assert.equal(response.results.length, 1);
  assert.deepEqual(response.results[0].matchLabels, [
    { facet: "styles", value: "modern", label: "Modern" }
  ]);
  assert.match(response.answer, /Modern/);
});

test("agent retains local-hash hybrid mode only for the memory adapter", async () => {
  const context = createTestContext({ searchOptions: { semanticProvider: "local-hash" } });
  const response = await answerDirectoryQuestion("Show me modern Architecture", context);

  assert.equal(response.mode, "hybrid");
});

test("agent still applies the fixed low-score guard to memory results", async () => {
  const base = createTestContext();
  const entry = base.store.getEntry("atelier-north-architecture");
  const context = {
    store: base.store,
    searchAdapter: {
      async stats() {
        return { adapter: "memory", semanticEnabled: false, semanticProvider: null };
      },
      async search() {
        return {
          backend: "memory",
          fallback: false,
          fallbackReason: null,
          mode: "keyword",
          total: 1,
          results: [{
            id: entry.id,
            entry,
            score: 0.75,
            matchLabels: [],
            whyMatched: "matched by ranking fallback"
          }]
        };
      }
    }
  };

  const response = await answerDirectoryQuestion("Show me Architecture", context);
  assert.deepEqual(response.results, []);
  assert.equal(response.grounded, false);
});
