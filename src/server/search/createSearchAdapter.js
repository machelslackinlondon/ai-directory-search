const { createMemorySearchAdapter } = require("./memorySearchAdapter");
const { createOpenSearchSearchAdapter } = require("./opensearchSearchAdapter");
const { createFallbackSearchAdapter } = require("./fallbackSearchAdapter");

function createSearchAdapter(store, options = {}) {
  const memory = options.memoryAdapter || createMemorySearchAdapter(store, options.memoryOptions);
  const backend = options.backend || process.env.SEARCH_BACKEND || "opensearch";
  if (backend === "memory") return memory;
  if (backend !== "opensearch") throw new Error(`Unsupported SEARCH_BACKEND: ${backend}`);

  const primary = options.openSearchAdapter || createOpenSearchSearchAdapter(store, {
    client: options.openSearchClient,
    ...options.openSearchOptions
  });
  const cooldownInput = process.env.OPENSEARCH_FALLBACK_COOLDOWN_MS;
  const configuredCooldown = cooldownInput === undefined || cooldownInput.trim() === ""
    ? Number.NaN
    : Number(cooldownInput);
  return createFallbackSearchAdapter(primary, memory, {
    cooldownMs: options.cooldownMs ?? (Number.isFinite(configuredCooldown) ? configuredCooldown : 30_000),
    now: options.now
  });
}

module.exports = { createSearchAdapter };
