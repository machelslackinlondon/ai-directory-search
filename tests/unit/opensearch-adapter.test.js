const test = require("node:test");
const assert = require("assert/strict");

const seed = require("../../src/data/seed-directory.json");
const { createMemoryDirectoryStore } = require("../../src/server/directory/store");
const {
  ANALYZE_CASES,
  INDEX_TEMPLATE,
  TEMPLATE_NAME
} = require("../../src/server/search/opensearch/indexDefinition");
const { createOpenSearchSearchAdapter } = require("../../src/server/search/opensearchSearchAdapter");
const {
  createOpenSearchClient,
  readOpenSearchConfig
} = require("../../src/server/search/opensearch/client");

const store = createMemoryDirectoryStore(seed);
const OLD_INDEX = "directory-profiles-v1-old";

function makeError(message, code, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}

function makeOpenSearchError({
  statusCode,
  type,
  shape = "direct",
  message = "OpenSearch error",
  includeTopLevelStatus = true
}) {
  const error = new Error(message);
  if (includeTopLevelStatus) error.statusCode = statusCode;
  const body = { status: statusCode, error: { type, reason: message } };
  if (shape === "wrapped") error.meta = { statusCode, body };
  else error.body = body;
  return error;
}

function serializedError(error) {
  return JSON.stringify({
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...error
  });
}

function makeClientDouble(calls, options = {}) {
  const alias = options.alias || "directory-profiles";
  const aliasTargets = options.aliasTargets || (options.aliasExists ? [OLD_INDEX] : []);
  const healthOutcomes = [...(options.healthOutcomes || options.healthStatuses || ["yellow"])];
  const direct = Boolean(options.directResponses);

  function response(body) {
    return direct ? body : { body };
  }

  function record(method, result) {
    return async (args) => {
      calls.push({ method, args });
      const value = typeof result === "function" ? await result(args) : result;
      if (value instanceof Error) throw value;
      return value;
    };
  }

  function aliasesBody() {
    return Object.fromEntries(aliasTargets.map((index) => [index, { aliases: { [alias]: {} } }]));
  }

  function mappingsBody(args) {
    const indexes = String(args.index || aliasTargets.join(",")).split(",").filter(Boolean);
    return Object.fromEntries(indexes.map((index) => [index, {
      mappings: {
        dynamic: options.mappingDynamic ?? "strict",
        _meta: { schema_version: options.schemaVersion ?? 1 }
      }
    }]));
  }

  const client = {
    cluster: {
      health: record("cluster.health", () => {
        const outcome = healthOutcomes.shift() || "yellow";
        return outcome instanceof Error ? outcome : response({ status: outcome });
      })
    },
    indices: {
      putIndexTemplate: record("indices.putIndexTemplate", options.putTemplateError || response({ acknowledged: true })),
      existsAlias: record("indices.existsAlias", response(options.aliasExists ?? aliasTargets.length > 0)),
      create: record("indices.create", response({ acknowledged: true })),
      analyze: record("indices.analyze", ({ body }) => {
        const sample = ANALYZE_CASES.find(({ analyzer, text }) => analyzer === body.analyzer && text === body.text);
        const expected = sample?.expected || [];
        const tokens = options.analyzerMismatch === body.analyzer ? ["wrong"] : expected;
        return response({ tokens: tokens.map((token) => ({ token })) });
      }),
      getAlias: record("indices.getAlias", response(aliasesBody())),
      updateAliases: record("indices.updateAliases", response({ acknowledged: true })),
      getMapping: record("indices.getMapping", (args) => response(mappingsBody(args)))
    },
    helpers: {
      bulk: record("helpers.bulk", async (args) => {
        const documents = [];
        for (const entry of args.datasource) documents.push(args.onDocument(entry));
        client.bulkDocuments = documents;
        if (options.bulkDrop) {
          args.onDrop({
            document: args.datasource[0],
            error: { reason: options.bulkDrop }
          });
        }
        return {
          successful: args.datasource.length - (options.bulkFailed || 0),
          failed: options.bulkFailed || 0
        };
      })
    },
    count: record("count", ({ index }) => response({
      count: typeof options.count === "function"
        ? options.count(index)
        : (options.count ?? store.listEntries().length)
    })),
    search: record("search", options.searchError || response(options.searchBody || {
      took: 3,
      hits: {
        total: { value: 1 },
        hits: [{
          _id: seed.entries[0].id,
          _score: 4.2,
          _source: { id: seed.entries[0].id, profile: seed.entries[0] }
        }]
      },
      aggregations: {}
    })),
    get: record("get", () => {
      if (options.getError) return options.getError;
      return response(options.getBody || { _source: { profile: seed.entries[0] } });
    }),
    close: record("close", undefined)
  };

  return client;
}

test("readOpenSearchConfig applies secure defaults and explicit environment values", () => {
  assert.deepEqual(readOpenSearchConfig({}), {
    node: "https://127.0.0.1:9200",
    username: "admin",
    password: "",
    indexAlias: "directory-profiles",
    requestTimeout: 2000,
    rejectUnauthorized: true,
    caPath: ""
  });

  assert.deepEqual(readOpenSearchConfig({
    OPENSEARCH_NODE: "https://search.internal:9443",
    OPENSEARCH_USERNAME: "directory-reader",
    OPENSEARCH_INITIAL_ADMIN_PASSWORD: "initial-secret",
    OPENSEARCH_PASSWORD: "explicit-secret",
    OPENSEARCH_INDEX_ALIAS: "profiles-live",
    OPENSEARCH_REQUEST_TIMEOUT_MS: "4500",
    OPENSEARCH_TLS_REJECT_UNAUTHORIZED: "false",
    OPENSEARCH_CA_PATH: "/tmp/root-ca.pem"
  }), {
    node: "https://search.internal:9443",
    username: "directory-reader",
    password: "explicit-secret",
    indexAlias: "profiles-live",
    requestTimeout: 4500,
    rejectUnauthorized: false,
    caPath: "/tmp/root-ca.pem"
  });
});

test("createOpenSearchClient rejects missing credentials without leaking supplied secrets", async () => {
  const secret = "do-not-print-this";

  assert.throws(
    () => createOpenSearchClient({ env: { OPENSEARCH_USERNAME: "admin" } }),
    (error) => error.code === "OPENSEARCH_CONFIG_INVALID" && !error.message.includes(secret)
  );

  const client = createOpenSearchClient({
    env: {
      OPENSEARCH_NODE: "https://127.0.0.1:9200",
      OPENSEARCH_USERNAME: "admin",
      OPENSEARCH_PASSWORD: secret,
      OPENSEARCH_TLS_REJECT_UNAUTHORIZED: "false"
    }
  });
  assert.equal(typeof client.search, "function");
  await client.close();
});

test("OpenSearch config rejects invalid timeout and TLS values from env and direct overrides", () => {
  for (const requestTimeout of ["0", "-1", "NaN", "Infinity"]) {
    assert.throws(
      () => readOpenSearchConfig({ OPENSEARCH_REQUEST_TIMEOUT_MS: requestTimeout }),
      (error) => error.code === "OPENSEARCH_CONFIG_INVALID"
    );
  }
  for (const rejectUnauthorized of ["TRUE", "False", "yes", 1]) {
    assert.throws(
      () => readOpenSearchConfig({ OPENSEARCH_TLS_REJECT_UNAUTHORIZED: rejectUnauthorized }),
      (error) => error.code === "OPENSEARCH_CONFIG_INVALID"
    );
  }

  const validEnv = {
    OPENSEARCH_USERNAME: "admin",
    OPENSEARCH_PASSWORD: "config-secret"
  };
  for (const requestTimeout of [0, -1, Infinity, "not-a-number"]) {
    assert.throws(
      () => createOpenSearchClient({ env: validEnv, requestTimeout }),
      (error) => error.code === "OPENSEARCH_CONFIG_INVALID"
    );
  }
  const tlsSentinel = "tls-option-sentinel";
  assert.throws(
    () => createOpenSearchClient({ env: validEnv, rejectUnauthorized: tlsSentinel }),
    (error) => (
      error.code === "OPENSEARCH_CONFIG_INVALID" && !serializedError(error).includes(tlsSentinel)
    )
  );
});

test("OpenSearch config accepts booleans and exact boolean strings only", async () => {
  assert.equal(readOpenSearchConfig({ OPENSEARCH_TLS_REJECT_UNAUTHORIZED: true }).rejectUnauthorized, true);
  assert.equal(readOpenSearchConfig({ OPENSEARCH_TLS_REJECT_UNAUTHORIZED: false }).rejectUnauthorized, false);
  assert.equal(readOpenSearchConfig({ OPENSEARCH_TLS_REJECT_UNAUTHORIZED: "true" }).rejectUnauthorized, true);
  assert.equal(readOpenSearchConfig({ OPENSEARCH_TLS_REJECT_UNAUTHORIZED: "false" }).rejectUnauthorized, false);

  const client = createOpenSearchClient({
    env: { OPENSEARCH_USERNAME: "admin", OPENSEARCH_PASSWORD: "valid-secret" },
    requestTimeout: "3500",
    rejectUnauthorized: "false"
  });
  assert.equal(client.connectionPool.connections[0].ssl.rejectUnauthorized, false);
  await client.close();
});

test("bootstrap installs the template, checks every analyzer, then creates the first alias", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: false });
  const adapter = createOpenSearchSearchAdapter(store, {
    client,
    now: () => new Date("2026-09-03T12:34:56.000Z")
  });

  const result = await adapter.bootstrap();
  const lifecycle = calls.map(({ method }) => method);

  assert.equal(lifecycle[0], "indices.putIndexTemplate");
  assert.ok(lifecycle.indexOf("indices.create") > lifecycle.indexOf("indices.putIndexTemplate"));
  assert.ok(lifecycle.indexOf("indices.updateAliases") > lifecycle.lastIndexOf("indices.analyze"));
  assert.deepEqual(calls[0].args, { name: TEMPLATE_NAME, body: INDEX_TEMPLATE });
  assert.deepEqual(
    calls.filter(({ method }) => method === "indices.analyze").map(({ args }) => args),
    ANALYZE_CASES.map(({ analyzer, text }) => ({
      index: "directory-profiles-v1-20260903123456",
      body: { analyzer, text }
    }))
  );
  assert.deepEqual(calls.find(({ method }) => method === "indices.updateAliases").args, {
    body: { actions: [{ add: { index: "directory-profiles-v1-20260903123456", alias: "directory-profiles" } }] }
  });
  assert.equal(result.alias, "directory-profiles");
  assert.equal(result.physicalIndex, "directory-profiles-v1-20260903123456");
  assert.equal(result.analyzerChecks.length, ANALYZE_CASES.length);
});

test("bootstrap is idempotent and accepts direct client response bodies", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: true, directResponses: true });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  const result = await adapter.bootstrap();

  assert.equal(result.physicalIndex, OLD_INDEX);
  assert.equal(calls[0].method, "indices.putIndexTemplate");
  assert.equal(calls.filter(({ method }) => method === "indices.analyze").length, ANALYZE_CASES.length);
  assert.equal(calls.some(({ method }) => method === "indices.create"), false);
  assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
});

test("bootstrap reports an analyzer mismatch and never attaches the alias", async () => {
  const calls = [];
  const client = makeClientDouble(calls, {
    aliasExists: false,
    analyzerMismatch: "directory_description_index"
  });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  await assert.rejects(adapter.bootstrap(), (error) => {
    assert.equal(error.code, "OPENSEARCH_ANALYZER_MISMATCH");
    assert.match(error.message, /directory_description_index/);
    return true;
  });
  assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
});

test("bootstrap rejects an analyzer-compatible existing index with the wrong mapping", async (t) => {
  for (const scenario of [
    { name: "schema version", options: { schemaVersion: 2 } },
    { name: "dynamic mapping", options: { mappingDynamic: true, directResponses: true } }
  ]) {
    await t.test(scenario.name, async () => {
      const calls = [];
      const client = makeClientDouble(calls, { aliasExists: true, ...scenario.options });
      const adapter = createOpenSearchSearchAdapter(store, { client });

      await assert.rejects(adapter.bootstrap(), (error) => error.code === "OPENSEARCH_SCHEMA_MISMATCH");
      assert.equal(calls.filter(({ method }) => method === "indices.getMapping").length, 1);
      assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
    });
  }
});

test("reindex refuses to switch the alias after a reported bulk failure", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: true, bulkFailed: 1 });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  await assert.rejects(adapter.reindex(), /1 document.*failed/);
  assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
});

test("reindex refuses to switch the alias after the bulk helper drops a document", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: true, bulkDrop: "strict mapping rejected field" });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  await assert.rejects(adapter.reindex(), (error) => {
    assert.equal(error.code, "OPENSEARCH_BULK_FAILED");
    assert.match(error.message, /atelier-north-architecture/);
    assert.match(error.message, /strict mapping rejected field/);
    return true;
  });
  assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
});

test("reindex does not double-count a dropped document also included in the bulk failed total", async () => {
  const client = makeClientDouble([], {
    aliasExists: true,
    bulkFailed: 1,
    bulkDrop: "mapping rejected document"
  });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  await assert.rejects(adapter.reindex(), (error) => {
    assert.match(error.message, /^1 document\(s\) failed/);
    return true;
  });
});

test("reindex refuses to switch the alias when the indexed count is incomplete", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: true, count: store.listEntries().length - 1 });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  await assert.rejects(adapter.reindex(), (error) => error.code === "OPENSEARCH_COUNT_MISMATCH");
  assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
});

test("reindex projects every entry and switches all old targets in one atomic alias request", async () => {
  const calls = [];
  const oldTargets = [OLD_INDEX, "directory-profiles-v1-older"];
  const client = makeClientDouble(calls, { aliasExists: true, aliasTargets: oldTargets });
  const adapter = createOpenSearchSearchAdapter(store, {
    client,
    now: () => new Date("2026-09-03T13:14:15.000Z")
  });

  const result = await adapter.reindex();
  const physicalIndex = "directory-profiles-v1-20260903131415";
  const aliasCalls = calls.filter(({ method }) => method === "indices.updateAliases");

  assert.ok(calls.findIndex(({ method }) => method === "indices.putIndexTemplate") < calls.findIndex(({ method }) => method === "indices.create"));
  assert.ok(calls.findIndex(({ method }) => method === "indices.updateAliases") > calls.findIndex(({ method }) => method === "count"));
  assert.equal(client.bulkDocuments.length, store.listEntries().length);
  assert.deepEqual(client.bulkDocuments[0][0], { index: { _index: physicalIndex, _id: seed.entries[0].id } });
  assert.equal(client.bulkDocuments[0][1].profile.id, seed.entries[0].id);
  assert.equal(aliasCalls.length, 1);
  assert.deepEqual(aliasCalls[0].args.body.actions, [
    { remove: { index: OLD_INDEX, alias: "directory-profiles" } },
    { remove: { index: "directory-profiles-v1-older", alias: "directory-profiles" } },
    { add: { index: physicalIndex, alias: "directory-profiles" } }
  ]);
  assert.equal(result.physicalIndex, physicalIndex);
  assert.equal(result.indexed, store.listEntries().length);
  assert.equal(result.lastSuccessfulReindex, "2026-09-03T13:14:15.000Z");
  assert.equal(typeof client.indices.delete, "undefined");
});

test("shared adapter methods search, fetch profiles, list taxonomy, and close the client", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: true });
  const adapter = createOpenSearchSearchAdapter(store, { client });

  const searchResult = await adapter.search({ query: "architecture", limit: 4 });
  const entry = await adapter.getEntry(seed.entries[0].id);
  const categories = await adapter.listCategories();
  await adapter.close();

  assert.equal(adapter.name, "opensearch");
  assert.equal(searchResult.backend, "opensearch");
  assert.equal(searchResult.results[0].entry.id, seed.entries[0].id);
  assert.equal(entry.id, seed.entries[0].id);
  assert.deepEqual(categories, store.getTaxonomy().categories);
  assert.equal(calls.find(({ method }) => method === "search").args.index, "directory-profiles");
  assert.equal(calls.find(({ method }) => method === "get").args.id, seed.entries[0].id);
  assert.equal(calls.at(-1).method, "close");
});

test("adapter errors expose only normalized fields and redact wrapped transport secrets", async () => {
  const secret = "authorization-sentinel-secret";
  const caSecret = "ca-certificate-sentinel";
  const raw = Object.assign(new Error(`request failed with ${secret}`), {
    code: "ResponseError",
    statusCode: 503,
    meta: {
      statusCode: 503,
      body: { error: { type: "cluster_block_exception", reason: secret } },
      headers: { authorization: `Basic ${secret}` },
      connection: { ssl: { ca: caSecret } }
    },
    config: { auth: { password: secret }, ssl: { ca: caSecret } }
  });
  const adapter = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { searchError: raw })
  });

  await assert.rejects(adapter.search({ query: "architecture" }), (error) => {
    assert.equal(error.code, "OPENSEARCH_UNAVAILABLE");
    assert.equal(error.statusCode, 503);
    assert.equal(error.type, "cluster_block_exception");
    assert.equal(Object.prototype.hasOwnProperty.call(error, "meta"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(error, "config"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(error, "cause"), false);
    assert.equal(serializedError(error).includes(secret), false);
    assert.equal(serializedError(error).includes(caSecret), false);
    return true;
  });
});

test("lifecycle methods normalize raw client errors at the public boundary", async () => {
  const secret = "bootstrap-authorization-sentinel";
  const raw = Object.assign(new Error(secret), {
    statusCode: 403,
    body: { status: 403, error: { type: "security_exception", reason: secret } },
    meta: { headers: { authorization: secret } }
  });
  const adapter = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { putTemplateError: raw })
  });

  await assert.rejects(adapter.bootstrap(), (error) => {
    assert.equal(error.code, "OPENSEARCH_AUTHORIZATION_FAILED");
    assert.equal(error.statusCode, 403);
    assert.equal(serializedError(error).includes(secret), false);
    return true;
  });
});

test("getEntry returns null only for a 404 response", async () => {
  const missing = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], {
      getError: makeOpenSearchError({ statusCode: 404, type: "document_missing_exception" })
    })
  });
  assert.equal(await missing.getEntry("missing"), null);

  const foundFalse = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { getBody: { _index: OLD_INDEX, _id: "missing", found: false } })
  });
  assert.equal(await foundFalse.getEntry("missing"), null);

  const wrappedFoundFalseError = Object.assign(new Error("not found"), {
    meta: {
      statusCode: 404,
      body: { _index: OLD_INDEX, _id: "missing", found: false }
    }
  });
  const thrownFoundFalse = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { getError: wrappedFoundFalseError })
  });
  assert.equal(await thrownFoundFalse.getEntry("missing"), null);

  const forbidden = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { getError: makeError("forbidden", "FORBIDDEN", 403) })
  });
  await assert.rejects(forbidden.getEntry("hidden"), (error) => error.statusCode === 403);

  const malformed = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { getBody: { _source: { id: "malformed" } } })
  });
  await assert.rejects(malformed.getEntry("malformed"), (error) => error.code === "OPENSEARCH_DOCUMENT_INVALID");
});

test("search and getEntry preserve missing alias and index failures for fallback", async () => {
  const search = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], {
      searchError: makeOpenSearchError({ statusCode: 404, type: "index_not_found_exception" })
    })
  });
  await assert.rejects(search.search({ query: "architecture" }), (error) => (
    error.code === "OPENSEARCH_INDEX_MISSING" && error.statusCode === 404
  ));

  const getAliasMissing = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], {
      getError: makeOpenSearchError({ statusCode: 404, type: "alias_missing_exception", shape: "wrapped" })
    })
  });
  await assert.rejects(getAliasMissing.getEntry("profile"), (error) => (
    error.code === "OPENSEARCH_ALIAS_MISSING" && error.statusCode === 404
  ));

  const getIndexMissing = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], {
      getError: makeOpenSearchError({ statusCode: 404, type: "index_not_found_exception" })
    })
  });
  await assert.rejects(getIndexMissing.getEntry("profile"), (error) => error.code === "OPENSEARCH_INDEX_MISSING");
});

test("stats and verify expose index state without credentials", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: true, directResponses: true });
  const adapter = createOpenSearchSearchAdapter(store, {
    client,
    username: "admin",
    password: "stats-must-hide-me"
  });

  const stats = await adapter.stats();
  const verified = await adapter.verify();

  assert.deepEqual(stats, {
    adapter: "opensearch",
    alias: "directory-profiles",
    physicalIndexes: [OLD_INDEX],
    entries: store.listEntries().length,
    schemaVersion: 1,
    health: "yellow",
    lastSuccessfulReindex: null
  });
  assert.equal(verified.verified, true);
  assert.equal(JSON.stringify({ stats, verified }).includes("stats-must-hide-me"), false);
});

test("verify rejects aliases with the wrong target count, schema, or document count", async () => {
  const missingAlias = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { aliasExists: false, aliasTargets: [] })
  });
  await assert.rejects(missingAlias.verify(), (error) => error.code === "OPENSEARCH_ALIAS_MISSING");

  const multipleTargets = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { aliasExists: true, aliasTargets: [OLD_INDEX, "directory-profiles-v1-other"] })
  });
  await assert.rejects(multipleTargets.verify(), (error) => error.code === "OPENSEARCH_ALIAS_INVALID");

  const wrongSchema = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { aliasExists: true, schemaVersion: 2 })
  });
  await assert.rejects(wrongSchema.verify(), (error) => error.code === "OPENSEARCH_SCHEMA_MISMATCH");

  const wrongCount = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { aliasExists: true, count: 0 })
  });
  await assert.rejects(wrongCount.verify(), (error) => error.code === "OPENSEARCH_COUNT_MISMATCH");
});

test("waitForReady retries red health at 500ms intervals until the cluster is ready", async () => {
  const calls = [];
  const sleeps = [];
  let currentTime = 0;
  const client = makeClientDouble(calls, { healthStatuses: ["red", "yellow"] });
  const adapter = createOpenSearchSearchAdapter(store, {
    client,
    now: () => new Date(currentTime),
    readyTimeoutMs: 1000,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      currentTime += milliseconds;
    }
  });

  const result = await adapter.waitForReady();

  assert.equal(result.status, "yellow");
  assert.deepEqual(sleeps, [500]);
  assert.equal(calls.filter(({ method }) => method === "cluster.health").length, 2);
});

test("waitForReady retries only recoverable availability errors", async () => {
  const sleeps = [];
  let currentTime = 0;
  const transportError = makeError("socket unavailable", "ECONNREFUSED");
  const adapter = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble([], { healthOutcomes: [transportError, "green"] }),
    now: () => new Date(currentTime),
    readyTimeoutMs: 1000,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      currentTime += milliseconds;
    }
  });

  assert.equal((await adapter.waitForReady()).status, "green");
  assert.deepEqual(sleeps, [500]);
});

test("waitForReady immediately rejects safely normalized request and authorization failures", async (t) => {
  const secret = "wait-error-secret";
  const cases = [
    {
      statusCode: 400,
      type: "parsing_exception",
      code: "OPENSEARCH_BAD_REQUEST",
      shape: "direct",
      includeTopLevelStatus: false
    },
    { statusCode: 401, type: "security_exception", code: "OPENSEARCH_AUTHENTICATION_FAILED", shape: "wrapped" },
    {
      statusCode: 403,
      type: "security_exception",
      code: "OPENSEARCH_AUTHORIZATION_FAILED",
      shape: "direct",
      includeTopLevelStatus: false
    }
  ];

  for (const scenario of cases) {
    await t.test(String(scenario.statusCode), async () => {
      const sleeps = [];
      const error = makeOpenSearchError({ ...scenario, message: secret });
      const adapter = createOpenSearchSearchAdapter(store, {
        client: makeClientDouble([], { healthOutcomes: [error, "green"] }),
        readyTimeoutMs: 1000,
        sleep: async (milliseconds) => { sleeps.push(milliseconds); }
      });

      await assert.rejects(adapter.waitForReady(), (caught) => {
        assert.equal(caught.code, scenario.code);
        assert.equal(caught.statusCode, scenario.statusCode);
        assert.equal(caught.type, scenario.type);
        assert.equal(serializedError(caught).includes(secret), false);
        return true;
      });
      assert.deepEqual(sleeps, []);
    });
  }
});

test("waitForReady stops at its bounded deadline", async () => {
  let currentTime = 0;
  const sleeps = [];
  const client = makeClientDouble([], { healthStatuses: ["red", "red", "red"] });
  const adapter = createOpenSearchSearchAdapter(store, {
    client,
    now: () => new Date(currentTime),
    readyTimeoutMs: 900,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      currentTime += milliseconds;
    }
  });

  await assert.rejects(adapter.waitForReady(), (error) => error.code === "OPENSEARCH_NOT_READY");
  assert.deepEqual(sleeps, [500, 400]);
  assert.equal(currentTime, 900);
});

test("waitForReady with zero timeout performs one health check without sleeping", async () => {
  const sleeps = [];
  const calls = [];
  const adapter = createOpenSearchSearchAdapter(store, {
    client: makeClientDouble(calls, { healthStatuses: ["red"] }),
    readyTimeoutMs: 0,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); }
  });

  await assert.rejects(adapter.waitForReady(), (error) => error.code === "OPENSEARCH_NOT_READY");
  assert.equal(calls.filter(({ method }) => method === "cluster.health").length, 1);
  assert.deepEqual(sleeps, []);
});
