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
  if (config.username && !config.password) {
    throw configError("OpenSearch password is required when a username is configured");
  }

  return new Client({
    node: config.node,
    auth: config.username ? { username: config.username, password: config.password } : undefined,
    requestTimeout: config.requestTimeout,
    ssl: {
      rejectUnauthorized: config.rejectUnauthorized,
      ...(config.caPath ? { ca: fs.readFileSync(config.caPath) } : {})
    }
  });
}

module.exports = { createOpenSearchClient, readOpenSearchConfig };
