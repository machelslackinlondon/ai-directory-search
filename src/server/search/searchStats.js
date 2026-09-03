function formatStartupSearchStats(stats) {
  const backend = stats.backend || stats.adapter;
  const entries = stats.entries ?? stats.memory?.entries ?? stats.opensearch?.entries;
  return `Loaded ${entries} entries with ${backend} index.`;
}

module.exports = { formatStartupSearchStats };
