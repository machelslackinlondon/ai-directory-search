const fs = require("fs");
const { Client } = require("@opensearch-project/opensearch");

function configError(message) {
  const error = new Error(message);
  error.code = "OPENSEARCH_CONFIG_INVALID";
  return error;
}

function positiveTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw configError("OpenSearch request timeout must be a finite positive number");
  }
  return timeout;
}

function tlsBoolean(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw configError("OpenSearch TLS verification must be true or false");
}

function validatedNode(value) {
  try {
    if (typeof value !== "string") throw new TypeError("node must be a string");
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new TypeError("unsupported node URL");
    }
    return value;
  } catch {
    throw configError("OpenSearch node URL is invalid");
  }
}

function readOpenSearchConfig(env = process.env) {
  return {
    node: env.OPENSEARCH_NODE || "https://127.0.0.1:9200",
    username: env.OPENSEARCH_USERNAME || "admin",
    password: env.OPENSEARCH_PASSWORD || env.OPENSEARCH_INITIAL_ADMIN_PASSWORD || "",
    indexAlias: env.OPENSEARCH_INDEX_ALIAS || "directory-profiles",
    requestTimeout: env.OPENSEARCH_REQUEST_TIMEOUT_MS === undefined
      ? 2000
      : positiveTimeout(env.OPENSEARCH_REQUEST_TIMEOUT_MS),
    rejectUnauthorized: env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED === undefined
      ? true
      : tlsBoolean(env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED),
    caPath: env.OPENSEARCH_CA_PATH || ""
  };
}

function createOpenSearchClient(options = {}) {
  const { env, ...overrides } = options;
  const config = { ...readOpenSearchConfig(env), ...overrides };
  config.requestTimeout = positiveTimeout(config.requestTimeout);
  config.rejectUnauthorized = tlsBoolean(config.rejectUnauthorized);
  config.node = validatedNode(config.node);
  if (config.username && !config.password) {
    throw configError("OpenSearch password is required when a username is configured");
  }

  try {
    return new Client({
      node: config.node,
      auth: config.username ? { username: config.username, password: config.password } : undefined,
      requestTimeout: config.requestTimeout,
      ssl: {
        rejectUnauthorized: config.rejectUnauthorized,
        ...(config.caPath ? { ca: fs.readFileSync(config.caPath) } : {})
      }
    });
  } catch {
    throw configError("OpenSearch client configuration is invalid");
  }
}

module.exports = { createOpenSearchClient, readOpenSearchConfig };
