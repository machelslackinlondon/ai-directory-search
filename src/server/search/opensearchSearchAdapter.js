const { createOpenSearchClient } = require("./opensearch/client");
const { toSearchDocument } = require("./opensearch/document");
const {
  ANALYZE_CASES,
  DEFAULT_INDEX_ALIAS,
  INDEX_TEMPLATE,
  SCHEMA_VERSION,
  TEMPLATE_NAME,
  makePhysicalIndexName
} = require("./opensearch/indexDefinition");
const { buildSearchBody } = require("./opensearch/query");
const { parseSearchResponse } = require("./opensearch/response");

function bodyOf(response) {
  return response && response.body !== undefined ? response.body : response;
}

function statusCodeOf(error) {
  return error?.statusCode || error?.meta?.statusCode || error?.meta?.body?.status;
}

function operationError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function createOpenSearchSearchAdapter(store, options = {}) {
  const client = options.client || createOpenSearchClient({ env: options.env });
  const alias = options.indexAlias || options.env?.OPENSEARCH_INDEX_ALIAS || process.env.OPENSEARCH_INDEX_ALIAS || DEFAULT_INDEX_ALIAS;
  const now = options.now || (() => new Date());
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const readyTimeoutMs = options.readyTimeoutMs ?? 30_000;
  let lastSuccessfulReindex = null;

  async function installTemplate() {
    await client.indices.putIndexTemplate({ name: TEMPLATE_NAME, body: INDEX_TEMPLATE });
  }

  async function aliasTargets() {
    try {
      const aliases = bodyOf(await client.indices.getAlias({ name: alias })) || {};
      return Object.keys(aliases);
    } catch (error) {
      if (statusCodeOf(error) === 404) return [];
      throw error;
    }
  }

  async function verifyAnalyzers(physicalIndex) {
    const checks = [];
    for (const sample of ANALYZE_CASES) {
      const result = bodyOf(await client.indices.analyze({
        index: physicalIndex,
        body: { analyzer: sample.analyzer, text: sample.text }
      })) || {};
      const actual = (result.tokens || []).map(({ token }) => token);
      if (actual.length !== sample.expected.length || actual.some((token, index) => token !== sample.expected[index])) {
        throw operationError(
          "OPENSEARCH_ANALYZER_MISMATCH",
          `OpenSearch analyzer ${sample.analyzer} returned unexpected tokens`,
          { analyzer: sample.analyzer, expected: sample.expected, actual }
        );
      }
      checks.push({ analyzer: sample.analyzer, text: sample.text, tokens: actual });
    }
    return checks;
  }

  async function bootstrap() {
    await installTemplate();
    const aliasExists = Boolean(bodyOf(await client.indices.existsAlias({ name: alias })));
    let physicalIndex;

    if (aliasExists) {
      const targets = await aliasTargets();
      if (targets.length !== 1) {
        throw operationError("OPENSEARCH_ALIAS_INVALID", `OpenSearch alias ${alias} must have exactly one target`);
      }
      [physicalIndex] = targets;
    } else {
      physicalIndex = makePhysicalIndexName(now());
      await client.indices.create({ index: physicalIndex });
    }

    const analyzerChecks = await verifyAnalyzers(physicalIndex);
    if (!aliasExists) {
      await client.indices.updateAliases({
        body: { actions: [{ add: { index: physicalIndex, alias } }] }
      });
    }

    return {
      alias,
      physicalIndex,
      template: TEMPLATE_NAME,
      schemaVersion: SCHEMA_VERSION,
      analyzerChecks
    };
  }

  async function reindex() {
    const entries = store.listEntries();
    const startedAt = now();
    const physicalIndex = makePhysicalIndexName(startedAt);
    await installTemplate();
    await client.indices.create({ index: physicalIndex });
    await verifyAnalyzers(physicalIndex);

    const dropped = [];
    const bulkResult = bodyOf(await client.helpers.bulk({
      datasource: entries,
      refreshOnCompletion: true,
      onDocument(entry) {
        return [{ index: { _index: physicalIndex, _id: entry.id } }, toSearchDocument(entry)];
      },
      onDrop(document) {
        dropped.push({
          id: document.document?.id || "unknown",
          error: document.error?.reason || "bulk drop"
        });
      }
    })) || {};
    const failed = Number(bulkResult.failed || 0);

    if (failed > 0 || dropped.length > 0) {
      const failureCount = Math.max(failed, dropped.length);
      const details = dropped.map(({ id, error }) => `${id}: ${error}`).join("; ");
      throw operationError(
        "OPENSEARCH_BULK_FAILED",
        `${failureCount} document(s) failed during OpenSearch bulk indexing${details ? ` (${details})` : ""}`,
        { failed, dropped }
      );
    }

    const countResult = bodyOf(await client.count({ index: physicalIndex })) || {};
    const indexed = Number(countResult.count || 0);
    if (indexed !== entries.length) {
      throw operationError(
        "OPENSEARCH_COUNT_MISMATCH",
        `OpenSearch index ${physicalIndex} contains ${indexed} documents; expected ${entries.length}`,
        { actual: indexed, expected: entries.length }
      );
    }

    const previousTargets = await aliasTargets();
    const actions = [
      ...previousTargets.map((index) => ({ remove: { index, alias } })),
      { add: { index: physicalIndex, alias } }
    ];
    await client.indices.updateAliases({ body: { actions } });
    lastSuccessfulReindex = startedAt.toISOString();

    return { alias, physicalIndex, indexed, lastSuccessfulReindex };
  }

  async function search(params = {}) {
    const response = await client.search({ index: alias, body: buildSearchBody(params) });
    return parseSearchResponse(response, params, store.getTaxonomy(), { backend: "opensearch" });
  }

  async function getEntry(id) {
    try {
      const result = bodyOf(await client.get({ index: alias, id })) || {};
      if (!result._source?.profile) {
        throw operationError(
          "OPENSEARCH_DOCUMENT_INVALID",
          `OpenSearch document ${id} does not contain a canonical profile`
        );
      }
      return result._source.profile;
    } catch (error) {
      if (statusCodeOf(error) === 404) return null;
      throw error;
    }
  }

  async function listCategories() {
    return store.getTaxonomy().categories;
  }

  async function stats() {
    const [healthResult, targets] = await Promise.all([
      client.cluster.health(),
      aliasTargets()
    ]);
    let entries = null;
    let schemaVersion = null;

    if (targets.length > 0) {
      const [countResult, mappingResult] = await Promise.all([
        client.count({ index: alias }),
        client.indices.getMapping({ index: targets.join(",") })
      ]);
      entries = Number((bodyOf(countResult) || {}).count || 0);
      const mappings = bodyOf(mappingResult) || {};
      schemaVersion = mappings[targets[0]]?.mappings?._meta?.schema_version ?? null;
    }

    return {
      adapter: "opensearch",
      alias,
      physicalIndexes: targets,
      entries,
      schemaVersion,
      health: (bodyOf(healthResult) || {}).status || "unknown",
      lastSuccessfulReindex
    };
  }

  async function verify() {
    const state = await stats();
    if (state.physicalIndexes.length === 0) {
      throw operationError("OPENSEARCH_ALIAS_MISSING", `OpenSearch alias ${alias} does not exist`);
    }
    if (state.physicalIndexes.length !== 1) {
      throw operationError("OPENSEARCH_ALIAS_INVALID", `OpenSearch alias ${alias} must have exactly one target`);
    }
    if (state.schemaVersion !== SCHEMA_VERSION) {
      throw operationError(
        "OPENSEARCH_SCHEMA_MISMATCH",
        `OpenSearch schema version is ${state.schemaVersion}; expected ${SCHEMA_VERSION}`
      );
    }
    const expected = store.listEntries().length;
    if (state.entries !== expected) {
      throw operationError(
        "OPENSEARCH_COUNT_MISMATCH",
        `OpenSearch alias ${alias} contains ${state.entries} documents; expected ${expected}`
      );
    }
    return { ...state, verified: true };
  }

  async function waitForReady() {
    const deadline = now().getTime() + readyTimeoutMs;
    let lastError;
    while (now().getTime() <= deadline) {
      try {
        const health = bodyOf(await client.cluster.health()) || {};
        if (health.status === "yellow" || health.status === "green") return health;
        lastError = operationError("OPENSEARCH_NOT_READY", `OpenSearch cluster health is ${health.status || "unknown"}`);
      } catch (error) {
        lastError = error;
      }
      await sleep(500);
    }
    throw operationError("OPENSEARCH_NOT_READY", "OpenSearch did not become ready before the deadline", {
      causeCode: lastError?.code || null
    });
  }

  async function close() {
    if (typeof client.close === "function") await client.close();
  }

  return {
    name: "opensearch",
    bootstrap,
    close,
    getEntry,
    listCategories,
    reindex,
    search,
    stats,
    verify,
    waitForReady
  };
}

module.exports = { bodyOf, createOpenSearchSearchAdapter };
