const fs = require("fs");
const { Client } = require("@opensearch-project/opensearch");

function readOpenSearchConfig(env = process.env) {
  return {
    node: env.OPENSEARCH_NODE || "https://127.0.0.1:9200",
    username: env.OPENSEARCH_USERNAME || "admin",
    password: env.OPENSEARCH_PASSWORD || env.OPENSEARCH_INITIAL_ADMIN_PASSWORD || "",
    indexAlias: env.OPENSEARCH_INDEX_ALIAS || "directory-profiles",
    requestTimeout: Number(env.OPENSEARCH_REQUEST_TIMEOUT_MS) || 2000,
    rejectUnauthorized: env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED !== "false",
    caPath: env.OPENSEARCH_CA_PATH || ""
  };
}

function createOpenSearchClient(options = {}) {
  const { env, ...overrides } = options;
  const config = { ...readOpenSearchConfig(env), ...overrides };
  if (config.username && !config.password) {
    const error = new Error("OpenSearch password is required when a username is configured");
    error.code = "OPENSEARCH_CONFIG_INVALID";
    throw error;
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
