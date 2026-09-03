const test = require("node:test");
const assert = require("assert/strict");
const { close, createTestServer, request, seed } = require("../helpers");
const { createMemoryDirectoryStore } = require("../../src/server/directory/store");
const { createFallbackSearchAdapter } = require("../../src/server/search/fallbackSearchAdapter");
const { createAppServer } = require("../../src/server/http");

function listenForCloseTest(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

test("search API returns ranked records with match explanations", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "GET", "/api/search?query=modern%20residential%20architecture%20renovation&limit=3");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.results[0].id, "atelier-north-architecture");
    assert.ok(response.body.results[0].whyMatched);
    assert.equal(response.body.backend, "memory");
    assert.equal(response.body.fallback, false);
    assert.equal(response.body.fallbackReason, null);
  } finally {
    await close(server);
  }
});

test("search API preserves primary AND and global preference OR filters from repeated and comma-separated values", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(
      port,
      "GET",
      "/api/search?category=Architecture&businessType=Residential%20Architect&state=California&rooms=Bathroom&rooms=Kitchen%2CLiving%20Room&projectTypes=Hospitality%2CNew%20Build&styles=Eclectic%2CModern&services=Consultation&services=Full-service%20Design"
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.results.map(({ id }) => id), ["atelier-north-architecture"]);
    assert.deepEqual(response.body.results[0].matchLabels.map(({ label }) => label), [
      "Kitchen",
      "Living Room",
      "New Build",
      "Modern",
      "Consultation",
      "Full-service Design"
    ]);
    assert.equal(response.body.backend, "memory");
    assert.equal(response.body.fallback, false);
    assert.ok(Array.isArray(response.body.facets.styles));
  } finally {
    await close(server);
  }
});

test("search API keeps subcategory as a legacy fallback for businessType", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(
      port,
      "GET",
      "/api/search?category=Architecture&subcategory=Residential%20Architect&state=California"
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.results.map(({ id }) => id), ["atelier-north-architecture"]);
  } finally {
    await close(server);
  }
});

test("invalid controlled search filters return safe 400 errors before adapter calls", async () => {
  let searchCalls = 0;
  const server = createAppServer({
    store: createMemoryDirectoryStore(seed),
    searchAdapter: {
      async close() {},
      async search() {
        searchCalls += 1;
        return { results: [], total: 0 };
      }
    }
  });
  await listenForCloseTest(server);
  const port = server.address().port;
  const cases = [
    { query: "category=NotACategory", field: "category", value: "NotACategory" },
    { query: "businessType=NotABusiness", field: "businessType", value: "NotABusiness" },
    { query: "state=Atlantis", field: "state", value: "Atlantis" },
    { query: "rooms=Garage", field: "rooms", value: "Garage" },
    { query: "projectTypes=Extension", field: "projectTypes", value: "Extension" },
    { query: "styles=NotAStyle", field: "styles", value: "NotAStyle" },
    { query: "facet=styles:NotAStyle", field: "styles", value: "NotAStyle" },
    { query: "services=Procurement", field: "services", value: "Procurement" },
    {
      query: "category=Architecture&businessType=Kitchen%20Designer",
      field: "businessType",
      value: "Kitchen Designer"
    }
  ];

  try {
    for (const item of cases) {
      const response = await request(port, "GET", `/api/search?${item.query}`);
      assert.equal(response.statusCode, 400);
      assert.equal(response.body.code, "INVALID_SEARCH_FILTER");
      assert.match(response.body.error, new RegExp(item.field, "i"));
      assert.match(response.body.error, new RegExp(item.value, "i"));
    }
    assert.equal(searchCalls, 0);
  } finally {
    await close(server);
  }
});

test("agent API returns grounded references", async () => {
  const { server, port, store } = await createTestServer();
  try {
    const response = await request(port, "POST", "/api/agent", {
      question: "Find traditional kitchen consultation"
    });
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.references.length > 0);
    response.body.references.forEach((reference) => assert.ok(store.getEntry(reference.id)));
  } finally {
    await close(server);
  }
});

test("admin import flow upserts JSON entries and reindexes", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "POST", "/api/admin/import", {
      format: "json",
      mode: "upsert",
      content: JSON.stringify({
        entries: [{
          id: "integration-design-import",
          name: "Integration Design Import",
          description: "Imported through the admin API during tests.",
          category: "Architecture",
          businessType: "Residential Architect",
          state: "California",
          tags: ["integration", "import"]
        }]
      })
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.count, 1);

    const search = await request(port, "GET", "/api/search?query=integration%20import");
    assert.equal(search.body.results[0].id, "integration-design-import");
  } finally {
    await close(server);
  }
});

test("admin import response preserves degraded reindex metadata", async () => {
  const degraded = {
    adapter: "memory",
    entries: 7,
    backend: "memory",
    fallback: true,
    fallbackReason: "ECONNREFUSED"
  };
  const server = createAppServer({
    store: createMemoryDirectoryStore(seed),
    searchAdapter: {
      async close() {},
      async reindex() { return degraded; }
    }
  });
  await listenForCloseTest(server);
  const port = server.address().port;

  try {
    const response = await request(port, "POST", "/api/admin/import", {
      entries: [{
        id: "degraded-admin-import",
        name: "Degraded Admin Import",
        description: "Confirms reindex degradation remains visible to administrators.",
        category: "Architecture",
        businessType: "Residential Architect",
        state: "California"
      }]
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.stats, degraded);
  } finally {
    await close(server);
  }
});

test("mock MCP API calls the shared tool layer", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "POST", "/api/mcp", {
      tool: "search_directory",
      args: {
        query: "climate aware garden renewal",
        limit: 2
      }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.result.results[0].id, "wild-garden-design");
  } finally {
    await close(server);
  }
});

test("static app is served as first screen", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "GET", "/");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Search/);
    assert.match(response.body, /result-count/);
  } finally {
    await close(server);
  }
});

test("server close waits for adapter cleanup before completing", async () => {
  let releaseClose;
  const closeStarted = new Promise((resolve) => {
    releaseClose = resolve;
  });
  let primaryClosed = 0;
  let memoryClosed = 0;
  const searchAdapter = createFallbackSearchAdapter(
    { async close() { primaryClosed += 1; await closeStarted; } },
    { async close() { memoryClosed += 1; } }
  );
  const server = createAppServer({
    store: createMemoryDirectoryStore({ entries: [] }),
    searchAdapter
  });
  await listenForCloseTest(server);

  let callbackCalled = false;
  const completion = new Promise((resolve) => server.close((error) => {
    callbackCalled = true;
    resolve(error);
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(callbackCalled, false);

  releaseClose();
  assert.equal(await completion, undefined);
  assert.equal(primaryClosed, 1);
  assert.equal(memoryClosed, 1);
});

test("server close reports one safe aggregate adapter cleanup failure", async () => {
  const primarySecret = "server-primary-close-secret";
  const memorySecret = "server-memory-close-secret";
  const searchAdapter = createFallbackSearchAdapter(
    { async close() { throw new Error(primarySecret); } },
    { async close() { throw new Error(memorySecret); } }
  );
  const server = createAppServer({
    store: createMemoryDirectoryStore({ entries: [] }),
    searchAdapter
  });
  await listenForCloseTest(server);

  const error = await new Promise((resolve) => server.close(resolve));

  assert.equal(error.code, "SEARCH_ADAPTER_CLOSE_FAILED");
  assert.equal(error.failureCount, 2);
  assert.equal(JSON.stringify({ message: error.message, ...error }).includes(primarySecret), false);
  assert.equal(JSON.stringify({ message: error.message, ...error }).includes(memorySecret), false);
});

test("server close contains a throwing callback after cleanup", async () => {
  let closed = 0;
  const server = createAppServer({
    store: createMemoryDirectoryStore({ entries: [] }),
    searchAdapter: { async close() { closed += 1; } }
  });
  await listenForCloseTest(server);

  const unhandled = [];
  const onUnhandledRejection = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    await new Promise((resolve) => server.close(() => {
      resolve();
      throw new Error("callback-failure");
    }));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(closed, 1);
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener("unhandledRejection", onUnhandledRejection);
  }
});
