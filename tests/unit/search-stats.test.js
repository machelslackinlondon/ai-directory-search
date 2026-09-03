const test = require("node:test");
const assert = require("node:assert/strict");
const { formatStartupSearchStats } = require("../../src/server/search/searchStats");

test("startup summary reports the active backend and warm memory count for fallback stats", () => {
  assert.equal(formatStartupSearchStats({
    adapter: "fallback",
    backend: "opensearch",
    fallback: false,
    memory: { adapter: "memory", entries: 6 },
    opensearch: { adapter: "opensearch", entries: 6 }
  }), "Loaded 6 entries with opensearch index.");
});

test("startup summary uses the active OpenSearch count when backend counts diverge", () => {
  assert.equal(formatStartupSearchStats({
    adapter: "fallback",
    backend: "opensearch",
    fallback: false,
    memory: { adapter: "memory", entries: 6 },
    opensearch: { adapter: "opensearch", entries: 4 }
  }), "Loaded 4 entries with opensearch index.");
});

test("startup summary explicitly reports an unavailable OpenSearch primary", () => {
  assert.equal(formatStartupSearchStats({
    adapter: "fallback",
    backend: "opensearch",
    fallback: false,
    memory: { adapter: "memory", entries: 6 },
    opensearch: { available: false, errorCode: "OPENSEARCH_UNAVAILABLE" }
  }), "OpenSearch unavailable; 6 entries ready in memory fallback.");
});

test("startup summary preserves the direct memory adapter shape", () => {
  assert.equal(
    formatStartupSearchStats({ adapter: "memory", entries: 6 }),
    "Loaded 6 entries with memory index."
  );
});
