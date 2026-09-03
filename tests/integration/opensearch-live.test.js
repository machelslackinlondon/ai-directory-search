require("dotenv").config({ quiet: true });
const test = require("node:test");
const assert = require("assert/strict");
const { createDirectoryStore } = require("../../src/server/directory/store");
const { createOpenSearchClient } = require("../../src/server/search/opensearch/client");
const { createOpenSearchSearchAdapter, bodyOf } = require("../../src/server/search/opensearchSearchAdapter");
const { SCHEMA_VERSION } = require("../../src/server/search/opensearch/indexDefinition");

const live = process.env.OPENSEARCH_LIVE_TEST === "1";
const liveTest = live ? test : test.skip;
const expectedId = "atelier-north-architecture";
let client;
let adapter;
let store;
let lifecycle;
let physicalIndex;

function resultIds(result) {
  return result.results.map(({ id }) => id);
}

function facetCount(result, facet, label) {
  return result.facets[facet].find((item) => item.label === label)?.count;
}

if (live) {
  test.before(async () => {
    store = createDirectoryStore();
    client = createOpenSearchClient();
    adapter = createOpenSearchSearchAdapter(store, { client });
    await adapter.waitForReady();

    let tick = Date.now() + (process.pid * 1_000);
    adapter = createOpenSearchSearchAdapter(store, {
      client,
      now: () => {
        const current = new Date(tick);
        tick += 1_000;
        return current;
      }
    });
    const firstBootstrap = await adapter.bootstrap();
    const secondBootstrap = await adapter.bootstrap();
    const reindexed = await adapter.reindex();
    const verified = await adapter.verify();
    physicalIndex = reindexed.physicalIndex;
    lifecycle = { firstBootstrap, secondBootstrap, reindexed, verified };
  });

  test.after(async () => {
    if (adapter) await adapter.close();
  });
}

liveTest("lifecycle is idempotent and leaves one stable alias over all six strict-schema documents", async () => {
  assert.equal(lifecycle.firstBootstrap.physicalIndex, lifecycle.secondBootstrap.physicalIndex);
  assert.equal(lifecycle.verified.verified, true);
  assert.equal(lifecycle.verified.schemaVersion, SCHEMA_VERSION);
  assert.equal(lifecycle.verified.entries, 6);
  assert.deepEqual(lifecycle.verified.physicalIndexes, [physicalIndex]);
  const allDocuments = await adapter.search({ limit: 6 });
  assert.deepEqual(
    resultIds(allDocuments).sort(),
    store.listEntries().map(({ id }) => id).sort()
  );

  const aliases = bodyOf(await client.indices.getAlias({ name: "directory-profiles" }));
  assert.deepEqual(Object.keys(aliases), [physicalIndex]);
  const mappings = bodyOf(await client.indices.getMapping({ index: physicalIndex }));
  assert.equal(mappings[physicalIndex].mappings.dynamic, "strict");
  assert.equal(mappings[physicalIndex].mappings._meta.schema_version, SCHEMA_VERSION);
});

liveTest("native BM25 settings drive a scored lexical search", async () => {
  const settings = bodyOf(await client.indices.getSettings({ index: physicalIndex }));
  const bm25 = settings[physicalIndex].settings.index.similarity.default;
  assert.equal(bm25.type, "BM25");
  assert.equal(Number(bm25.k1), 1.2);
  assert.equal(Number(bm25.b), 0.75);
  assert.equal(String(bm25.discount_overlaps), "true");

  const result = await adapter.search({ query: "architecture" });
  assert.ok(result.total >= 2);
  assert.ok(result.results.every(({ score }) => score > 0));
  assert.ok(resultIds(result).includes(expectedId));
});

liveTest("search-time synonyms retrieve renovation profiles for remodeling", async () => {
  const analyzed = bodyOf(await client.indices.analyze({
    index: physicalIndex,
    body: { analyzer: "directory_description_search", text: "remodel" }
  }));
  assert.deepEqual(analyzed.tokens.map(({ token }) => token), ["remodel", "renovate", "remodel"]);

  const result = await adapter.search({ query: "remodeling" });
  assert.ok(result.total > 0);
  assert.ok(resultIds(result).includes(expectedId));
});

liveTest("an alias-only query retrieves the canonical Civic Form profile", async () => {
  const expectedAliasId = "civic-form-architects";
  const result = await adapter.search({ query: "CFA Studio" });
  assert.equal(result.results[0].id, expectedAliasId);

  const aliasesOnly = bodyOf(await client.search({
    index: physicalIndex,
    body: { query: { match: { aliases: { query: "CFA Studio", operator: "and" } } } }
  }));
  assert.deepEqual(aliasesOnly.hits.hits.map(({ _id }) => _id), [expectedAliasId]);
});

liveTest("bounded fuzzy matching accepts an in-bound typo and rejects an over-bound typo", async () => {
  const inBound = await adapter.search({ query: "Axtelier" });
  const overBound = await adapter.search({ query: "Axxxxlier" });
  assert.deepEqual(resultIds(inBound), [expectedId]);
  assert.equal(overBound.total, 0);
});

liveTest("name and alias edge n-grams autocomplete their partial prefixes", async () => {
  const nameResult = await adapter.search({ query: "Atel" });
  const aliasResult = await adapter.search({ query: "CF" });
  assert.equal(nameResult.results[0].id, expectedId);
  assert.equal(aliasResult.results[0].id, "civic-form-architects");
});

liveTest("primary filters combine California and Architecture with AND semantics", async () => {
  const result = await adapter.search({
    filters: { state: "California", category: "Architecture" }
  });
  assert.deepEqual(resultIds(result), [expectedId]);
});

liveTest("global preferences use OR selection, additive boosts, and canonical match labels", async () => {
  const result = await adapter.search({
    filters: { rooms: ["Kitchen"], styles: ["Modern"] }
  });
  assert.ok(result.total > 1);
  assert.ok(result.results.every(({ entry }) =>
    entry.rooms.includes("Kitchen") || entry.styles.includes("Modern")
  ));
  const atelier = result.results.find(({ id }) => id === expectedId);
  assert.deepEqual([...atelier.matchLabels].sort((left, right) => left.facet.localeCompare(right.facet)), [
    { facet: "rooms", value: "kitchen", label: "Kitchen" },
    { facet: "styles", value: "modern", label: "Modern" }
  ]);
  const oneMatch = result.results.find(({ matchLabels }) => matchLabels.length === 1);
  assert.ok(oneMatch);
  assert.ok(atelier.score > oneMatch.score);
});

liveTest("facet aggregations report canonical counts for all indexed documents", async () => {
  const result = await adapter.search({ limit: 6 });
  assert.equal(facetCount(result, "category", "Architecture"), 2);
  assert.equal(facetCount(result, "rooms", "Kitchen"), 3);
  assert.equal(facetCount(result, "styles", "Modern"), 4);
  assert.equal(facetCount(result, "services", "Consultation"), 4);
});
