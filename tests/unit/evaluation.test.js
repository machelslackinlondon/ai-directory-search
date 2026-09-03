const test = require("node:test");
const assert = require("assert/strict");
const seed = require("../../src/data/seed-directory.json");
const { createMemoryDirectoryStore } = require("../../src/server/directory/store");
const { runEvaluation } = require("../../src/server/evals/runEvaluation");
const { createMemorySearchAdapter } = require("../../src/server/search/memorySearchAdapter");
const evaluationCases = require("../../evals/queries.json");

function responseFor(entry) {
  return {
    backend: "opensearch",
    fallback: false,
    fallbackReason: null,
    mode: "keyword",
    total: entry ? 1 : 0,
    results: entry ? [{
      id: entry.id,
      entry,
      score: 20,
      matchLabels: [],
      whyMatched: "controlled evaluation result"
    }] : []
  };
}

function sequenceAdapter(responses) {
  let call = 0;
  return {
    async stats() { return { adapter: "opensearch" }; },
    async search() {
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return response;
    }
  };
}

async function evaluateWith(retrievalEntry, agentEntry) {
  const store = createMemoryDirectoryStore(seed);
  const searchAdapter = sequenceAdapter([
    responseFor(retrievalEntry && store.getEntry(retrievalEntry)),
    responseFor(agentEntry && store.getEntry(agentEntry))
  ]);
  return runEvaluation({
    cases: [{
      query: "Who handles modern residential architecture?",
      expectedIds: ["atelier-north-architecture"]
    }],
    store,
    searchAdapter
  });
}

test("evaluation marks references shared by agent results and evaluated retrieval as grounded", async () => {
  const result = await evaluateWith("atelier-north-architecture", "atelier-north-architecture");

  assert.equal(result.rows[0].groundedAnswer, true);
  assert.equal(result.metrics.groundedAnswerRate, 1);
});

test("evaluation does not count an empty reference list as grounded", async () => {
  const result = await evaluateWith(null, null);

  assert.equal(result.rows[0].groundedAnswer, false);
  assert.equal(result.metrics.groundedAnswerRate, 0);
});

test("evaluation rejects store-only references absent from the evaluated retrieval set", async () => {
  const result = await evaluateWith("atelier-north-architecture", "hearth-kitchen-studio");

  assert.deepEqual(result.rows[0].resultIds, ["atelier-north-architecture"]);
  assert.equal(result.rows[0].groundedAnswer, false);
  assert.equal(result.metrics.groundedAnswerRate, 0);
});

test("project evaluation cases keep every agent reference in the evaluated retrieval set", async () => {
  const store = createMemoryDirectoryStore(seed);
  const result = await runEvaluation({
    cases: evaluationCases,
    store,
    searchAdapter: createMemorySearchAdapter(store)
  });

  assert.equal(result.metrics.groundedAnswerRate, 1);
});
