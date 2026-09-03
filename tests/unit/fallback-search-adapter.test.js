const test = require("node:test");
const assert = require("assert/strict");

const {
  createFallbackSearchAdapter,
  isRecoverableOpenSearchError
} = require("../../src/server/search/fallbackSearchAdapter");
const { createSearchAdapter } = require("../../src/server/search/createSearchAdapter");
const { createMemoryDirectoryStore } = require("../../src/server/directory/store");

function makeAdapter(overrides = {}) {
  return {
    async search() { return { backend: "memory", fallback: false, fallbackReason: null, results: [], total: 0 }; },
    async getEntry() { return null; },
    async listCategories() { return []; },
    async reindex() { return { adapter: "memory", entries: 0 }; },
    async stats() { return { adapter: "memory", entries: 0 }; },
    async close() {},
    ...overrides
  };
}

function errorWithStatus(statusCode) {
  return Object.assign(new Error(`status ${statusCode}`), { statusCode });
}

test("classifies only documented OpenSearch outages as recoverable", () => {
  for (const error of [
    Object.assign(new Error("refused"), { code: "ECONNREFUSED" }),
    Object.assign(new Error("missing index"), { code: "OPENSEARCH_INDEX_MISSING" }),
    Object.assign(new Error("missing alias"), { code: "OPENSEARCH_ALIAS_MISSING" }),
    { meta: { body: { status: 503 } } }
  ]) {
    assert.equal(isRecoverableOpenSearchError(error), true);
  }

  for (const statusCode of [400, 401, 403]) {
    assert.equal(isRecoverableOpenSearchError(errorWithStatus(statusCode)), false);
  }
  assert.equal(isRecoverableOpenSearchError(Object.assign(new Error("schema"), { code: "OPENSEARCH_SCHEMA_MISMATCH" })), false);
});

test("falls back on transport failure, cools down, and probes after cooldown", async () => {
  let now = 1_000;
  let primaryCalls = 0;
  const primary = makeAdapter({
    async search() {
      primaryCalls += 1;
      if (primaryCalls === 1) throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      return { backend: "opensearch", fallback: false, fallbackReason: null, results: [], total: 0 };
    }
  });
  const memory = makeAdapter({
    async search() { return { backend: "memory", fallback: false, fallbackReason: null, results: [], total: 0 }; }
  });
  const adapter = createFallbackSearchAdapter(primary, memory, { now: () => now, cooldownMs: 30_000 });

  const first = await adapter.search({ query: "modern" });
  const second = await adapter.search({ query: "modern" });
  now += 30_001;
  const third = await adapter.search({ query: "modern" });

  assert.deepEqual(
    { backend: first.backend, fallback: first.fallback, fallbackReason: first.fallbackReason },
    { backend: "memory", fallback: true, fallbackReason: "ECONNREFUSED" }
  );
  assert.deepEqual(
    { backend: second.backend, fallback: second.fallback, fallbackReason: second.fallbackReason },
    { backend: "memory", fallback: true, fallbackReason: "OPENSEARCH_COOLDOWN" }
  );
  assert.equal(primaryCalls, 2);
  assert.deepEqual(
    { backend: third.backend, fallback: third.fallback, fallbackReason: third.fallbackReason },
    { backend: "opensearch", fallback: false, fallbackReason: null }
  );
});

test("does not hide authentication, malformed-query, or schema errors", async () => {
  for (const error of [
    errorWithStatus(400),
    errorWithStatus(401),
    errorWithStatus(403),
    Object.assign(new Error("wrong mapping"), { code: "OPENSEARCH_SCHEMA_MISMATCH" })
  ]) {
    const adapter = createFallbackSearchAdapter(
      makeAdapter({ async search() { throw error; } }),
      makeAdapter()
    );
    await assert.rejects(adapter.search({ query: "x" }), error);
  }
});

test("reindex warms memory and returns degraded state for a recoverable primary failure", async () => {
  let memoryReindexed = false;
  const adapter = createFallbackSearchAdapter(
    makeAdapter({ async reindex() { throw Object.assign(new Error("unavailable"), { code: "OPENSEARCH_ALIAS_MISSING" }); } }),
    makeAdapter({
      async reindex() {
        memoryReindexed = true;
        return { adapter: "memory", entries: 3, indexVersion: 2 };
      }
    }),
    { now: () => 500, cooldownMs: 100 }
  );

  const result = await adapter.reindex();

  assert.equal(memoryReindexed, true);
  assert.deepEqual(result, {
    adapter: "memory",
    entries: 3,
    indexVersion: 2,
    backend: "memory",
    fallback: true,
    fallbackReason: "OPENSEARCH_ALIAS_MISSING"
  });
});

test("stats includes memory, best-effort OpenSearch, and cooldown without error messages", async () => {
  const secret = "do-not-expose-me";
  const adapter = createFallbackSearchAdapter(
    makeAdapter({
      async search() { throw Object.assign(new Error("unavailable"), { code: "ECONNRESET" }); },
      async stats() { throw Object.assign(new Error(secret), { code: "ECONNRESET" }); }
    }),
    makeAdapter({ async stats() { return { adapter: "memory", entries: 7 }; } }),
    { now: () => 500, cooldownMs: 100 }
  );

  await adapter.search({ query: "x" });
  const stats = await adapter.stats();

  assert.deepEqual(stats.memory, { adapter: "memory", entries: 7 });
  assert.deepEqual(stats.opensearch, { available: false, errorCode: "ECONNRESET" });
  assert.deepEqual(stats.cooldown, { active: true, unavailableUntil: 600, remainingMs: 100 });
  assert.equal(stats.backend, "memory");
  assert.equal(stats.fallback, true);
  assert.equal(stats.fallbackReason, "ECONNRESET");
  assert.equal(JSON.stringify(stats).includes(secret), false);
});

test("stats preserves a safe non-recoverable primary error code", async () => {
  const adapter = createFallbackSearchAdapter(
    makeAdapter({
      async stats() { throw Object.assign(new Error("credentials must stay private"), { code: "OPENSEARCH_AUTHENTICATION_FAILED" }); }
    }),
    makeAdapter()
  );

  const stats = await adapter.stats();

  assert.deepEqual(stats.opensearch, { available: false, errorCode: "OPENSEARCH_AUTHENTICATION_FAILED" });
});

test("composition defaults to fallback OpenSearch and permits explicit memory tests", async () => {
  const store = createMemoryDirectoryStore({ entries: [] });
  const memory = makeAdapter({ name: "memory" });
  const primary = makeAdapter({ name: "opensearch" });

  const defaultAdapter = createSearchAdapter(store, {
    memoryAdapter: memory,
    openSearchAdapter: primary,
    now: () => 0
  });
  assert.equal(defaultAdapter.name, "fallback");
  assert.equal(await defaultAdapter.getEntry("missing"), null);

  assert.equal(createSearchAdapter(store, { backend: "memory", memoryAdapter: memory }), memory);
  assert.throws(() => createSearchAdapter(store, { backend: "unsupported", memoryAdapter: memory }), /Unsupported SEARCH_BACKEND/);
});

test("closing a fallback adapter closes each distinct adapter once", async () => {
  let primaryClosed = 0;
  let memoryClosed = 0;
  const adapter = createFallbackSearchAdapter(
    makeAdapter({ async close() { primaryClosed += 1; } }),
    makeAdapter({ async close() { memoryClosed += 1; } })
  );

  await adapter.close();

  assert.equal(primaryClosed, 1);
  assert.equal(memoryClosed, 1);
});
