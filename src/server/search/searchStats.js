function formatStartupSearchStats(stats) {
  const backend = stats.backend || stats.adapter;
  if (stats.adapter === "fallback" && stats.opensearch?.available === false) {
    return `OpenSearch unavailable; ${stats.memory?.entries ?? "unknown"} entries ready in memory fallback.`;
  }
  const activeState = backend === "opensearch"
    ? stats.opensearch
    : backend === "memory"
      ? stats.memory
      : stats;
  const entries = activeState?.entries ?? stats.entries ?? "unknown";
  return `Loaded ${entries} entries with ${backend} index.`;
}

module.exports = { formatStartupSearchStats };
