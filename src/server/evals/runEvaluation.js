const fs = require("fs");
const path = require("path");
const { answerDirectoryQuestion } = require("../agent/agent");
const { createDirectoryStore } = require("../directory/store");
const { createMemorySearchAdapter } = require("../search/memorySearchAdapter");

function loadCases(filePath = path.join(process.cwd(), "evals", "queries.json")) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function reciprocalRank(results, expectedIds) {
  const index = results.findIndex((result) => expectedIds.includes(result.id));
  return index === -1 ? 0 : 1 / (index + 1);
}

function precisionAtK(results, expectedIds, k) {
  const top = results.slice(0, k);
  if (top.length === 0) return 0;
  const hits = top.filter((result) => expectedIds.includes(result.id)).length;
  return hits / top.length;
}

function recallAtK(results, expectedIds, k) {
  const top = results.slice(0, k);
  const hits = expectedIds.filter((id) => top.some((result) => result.id === id)).length;
  return expectedIds.length === 0 ? 1 : hits / expectedIds.length;
}

function isGroundedAgentResponse(agent, resultIds) {
  const references = agent.references || [];
  if (references.length === 0) return false;
  const agentResultIds = new Set((agent.results || []).map((result) => result.id || result.entry?.id).filter(Boolean));
  return references.every((reference) => (
    agentResultIds.has(reference.id) && resultIds.includes(reference.id)
  ));
}

async function runEvaluation(options = {}) {
  const cases = options.cases || loadCases(options.filePath);
  const store = options.store || createDirectoryStore({ memoryOnly: true });
  const searchAdapter = options.searchAdapter || createMemorySearchAdapter(store);
  const rows = [];

  for (const item of cases) {
    const started = process.hrtime.bigint();
    const response = await searchAdapter.search({ query: item.query, limit: 100, mode: "keyword" });
    const agent = await answerDirectoryQuestion(item.query, { store, searchAdapter }, { limit: 3 });
    const latencyMs = Number(process.hrtime.bigint() - started) / 1000000;
    const resultIds = response.results.map((result) => result.id);
    rows.push({
      query: item.query,
      expectedIds: item.expectedIds,
      resultIds,
      top1: item.expectedIds.includes(resultIds[0]),
      top3: resultIds.slice(0, 3).some((id) => item.expectedIds.includes(id)),
      precisionAt3: precisionAtK(response.results, item.expectedIds, 3),
      recallAt3: recallAtK(response.results, item.expectedIds, 3),
      reciprocalRank: reciprocalRank(response.results, item.expectedIds),
      latencyMs,
      empty: resultIds.length === 0,
      groundedAnswer: isGroundedAgentResponse(agent, resultIds)
    });
  }

  const count = rows.length || 1;
  const metrics = {
    cases: rows.length,
    top1Accuracy: rows.filter((row) => row.top1).length / count,
    top3Accuracy: rows.filter((row) => row.top3).length / count,
    precisionAt3: rows.reduce((sum, row) => sum + row.precisionAt3, 0) / count,
    recallAt3: rows.reduce((sum, row) => sum + row.recallAt3, 0) / count,
    meanReciprocalRank: rows.reduce((sum, row) => sum + row.reciprocalRank, 0) / count,
    averageLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / count,
    emptyResultRate: rows.filter((row) => row.empty).length / count,
    groundedAnswerRate: rows.filter((row) => row.groundedAnswer).length / count
  };

  return { metrics, rows };
}

if (require.main === module) {
  runEvaluation().then(({ metrics, rows }) => {
    console.log("Search evaluation");
    console.log(JSON.stringify(metrics, null, 2));
    console.log("");
    rows.forEach((row) => {
      console.log(`- ${row.query}`);
      console.log(`  expected: ${row.expectedIds.join(", ")}`);
      console.log(`  results:  ${row.resultIds.slice(0, 5).join(", ") || "(none)"}`);
    });
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  isGroundedAgentResponse,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  runEvaluation
};
