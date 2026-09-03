const RECOVERABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "OPENSEARCH_INDEX_MISSING",
  "OPENSEARCH_ALIAS_MISSING",
  "OPENSEARCH_UNAVAILABLE"
]);
const RECOVERABLE_STATUS = new Set([429, 502, 503, 504]);

function statusCodeOf(error) {
  return Number(error?.statusCode || error?.meta?.statusCode || error?.meta?.body?.status) || null;
}

function isRecoverableOpenSearchError(error) {
  return RECOVERABLE_CODES.has(error?.code) || RECOVERABLE_STATUS.has(statusCodeOf(error));
}

function stableReasonCode(error) {
  return RECOVERABLE_CODES.has(error?.code) ? error.code : "OPENSEARCH_UNAVAILABLE";
}

function safeErrorCode(error) {
  if (typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)) return error.code;
  const statusCode = statusCodeOf(error);
  if (statusCode === 400) return "OPENSEARCH_BAD_REQUEST";
  if (statusCode === 401) return "OPENSEARCH_AUTHENTICATION_FAILED";
  if (statusCode === 403) return "OPENSEARCH_AUTHORIZATION_FAILED";
  if (RECOVERABLE_STATUS.has(statusCode)) return "OPENSEARCH_UNAVAILABLE";
  return "OPENSEARCH_REQUEST_FAILED";
}

function asTimestamp(value) {
  return value instanceof Date ? value.getTime() : Number(value);
}

function createFallbackSearchAdapter(primary, memory, options = {}) {
  const now = options.now || (() => Date.now());
  const cooldownMs = Number.isFinite(Number(options.cooldownMs)) && Number(options.cooldownMs) >= 0
    ? Number(options.cooldownMs)
    : 30_000;
  let unavailableUntil = null;
  let lastRecoverableFailure = null;
  let primaryProbeInFlight = false;

  function currentTime() {
    return asTimestamp(now());
  }

  function coolingDown() {
    return unavailableUntil != null && currentTime() < unavailableUntil;
  }

  function recordFailure(error) {
    lastRecoverableFailure = stableReasonCode(error);
    unavailableUntil = currentTime() + cooldownMs;
    return lastRecoverableFailure;
  }

  function recordRecovery() {
    unavailableUntil = null;
    lastRecoverableFailure = null;
  }

  async function callMemory(method, args, fallbackReason, includeMetadata) {
    const result = await memory[method](...args);
    if (!includeMetadata || result == null || Array.isArray(result) || typeof result !== "object") return result;
    return {
      ...result,
      backend: "memory",
      fallback: true,
      fallbackReason
    };
  }

  async function callWithFallback(method, args = [], includeMetadata = false) {
    if (coolingDown() || primaryProbeInFlight) {
      return callMemory(method, args, "OPENSEARCH_COOLDOWN", includeMetadata);
    }

    const isHalfOpenProbe = unavailableUntil != null;
    if (isHalfOpenProbe) primaryProbeInFlight = true;
    try {
      const result = await primary[method](...args);
      recordRecovery();
      if (!includeMetadata || result == null || Array.isArray(result) || typeof result !== "object") return result;
      return {
        ...result,
        backend: "opensearch",
        fallback: false,
        fallbackReason: null
      };
    } catch (error) {
      if (!isRecoverableOpenSearchError(error)) throw error;
      return callMemory(method, args, recordFailure(error), includeMetadata);
    } finally {
      if (isHalfOpenProbe) primaryProbeInFlight = false;
    }
  }

  async function reindex() {
    const memoryResult = await memory.reindex();
    try {
      const primaryResult = await primary.reindex();
      recordRecovery();
      return {
        ...primaryResult,
        backend: "opensearch",
        fallback: false,
        fallbackReason: null
      };
    } catch (error) {
      if (!isRecoverableOpenSearchError(error)) throw error;
      return {
        ...memoryResult,
        backend: "memory",
        fallback: true,
        fallbackReason: recordFailure(error)
      };
    }
  }

  async function stats() {
    const memoryState = await memory.stats();
    let openSearchState;
    try {
      openSearchState = await primary.stats();
    } catch (error) {
      openSearchState = { available: false, errorCode: safeErrorCode(error) };
    }
    const timestamp = currentTime();
    const active = (unavailableUntil != null && timestamp < unavailableUntil) || primaryProbeInFlight;
    return {
      adapter: "fallback",
      backend: active ? "memory" : "opensearch",
      fallback: active,
      fallbackReason: active ? lastRecoverableFailure : null,
      memory: memoryState,
      opensearch: openSearchState,
      cooldown: {
        active,
        ...(primaryProbeInFlight ? { probing: true } : {}),
        unavailableUntil,
        remainingMs: active ? unavailableUntil - timestamp : 0
      }
    };
  }

  async function close() {
    const adapters = primary === memory ? [primary] : [primary, memory];
    const results = await Promise.allSettled(adapters.map((adapter) => (
      typeof adapter.close === "function" ? adapter.close() : undefined
    )));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      const failureCount = results.filter((result) => result.status === "rejected").length;
      const error = new Error(`Failed to close ${failureCount} search adapter${failureCount === 1 ? "" : "s"}.`);
      error.code = "SEARCH_ADAPTER_CLOSE_FAILED";
      error.failureCount = failureCount;
      throw error;
    }
  }

  return {
    name: "fallback",
    close,
    getEntry: (id) => callWithFallback("getEntry", [id]),
    listCategories: () => callWithFallback("listCategories"),
    reindex,
    search: (params) => callWithFallback("search", [params], true),
    stats
  };
}

module.exports = {
  createFallbackSearchAdapter,
  isRecoverableOpenSearchError
};
