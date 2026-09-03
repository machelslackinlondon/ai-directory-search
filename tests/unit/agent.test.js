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

test("filter inference rejects canonical labels embedded inside larger tokens", () => {
  const context = createTestContext();
  const filters = inferFilters(
    "The postmodern architecture team remained responsive",
    context.store.getTaxonomy()
  );

  assert.equal(filters.category, "Architecture");
  assert.equal(filters.state, undefined);
  assert.equal(filters.styles, undefined);
  assert.equal(Boolean(filters.tags?.includes("modern")), false);
});

test("filter inference keeps normalized phrases and longest canonical labels", () => {
  const context = createTestContext();
  const filters = inferFilters(
    "Modern Interior Design + Décor by an Interior Design Consultant in Maine for a Living Room New Build with Full service Design",
    context.store.getTaxonomy()
  );

  assert.equal(filters.category, "Interior Design + Decor");
  assert.equal(filters.businessType, "Interior Design Consultant");
  assert.equal(filters.state, "Maine");
  assert.deepEqual(filters.rooms, ["Living Room"]);
  assert.deepEqual(filters.projectTypes, ["New Build"]);
  assert.deepEqual(filters.styles, ["Modern"]);
  assert.deepEqual(filters.services, ["Full-service Design"]);
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

test("agent preserves non-recoverable search errors without retrying", async (t) => {
  const cases = [
    Object.assign(new Error("Bad request."), { code: "OPENSEARCH_BAD_REQUEST", statusCode: 400 }),
    Object.assign(new Error("Authentication failed."), { code: "OPENSEARCH_AUTHENTICATION_FAILED", statusCode: 401 }),
    Object.assign(new Error("Authorization failed."), { code: "OPENSEARCH_AUTHORIZATION_FAILED", statusCode: 403 }),
    Object.assign(new Error("Schema mismatch."), { code: "OPENSEARCH_SCHEMA_MISMATCH" })
  ];

  for (const expectedError of cases) {
    await t.test(expectedError.code, async () => {
      const base = createTestContext();
      let searchCalls = 0;
      const context = {
        store: base.store,
        searchAdapter: {
          async stats() { return { adapter: "opensearch" }; },
          async search() {
            searchCalls += 1;
            throw expectedError;
          }
        }
      };

      await assert.rejects(
        () => answerDirectoryQuestion("Show me Architecture", context),
        (error) => error === expectedError
      );
      assert.equal(searchCalls, 1);
    });
  }
});
