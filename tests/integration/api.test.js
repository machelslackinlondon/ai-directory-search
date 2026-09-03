const test = require("node:test");
const assert = require("assert/strict");
const { close, createTestServer, request } = require("../helpers");

test("search API returns ranked records with match explanations", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "GET", "/api/search?query=modern%20residential%20architecture%20renovation&limit=3");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.results[0].id, "atelier-north-architecture");
    assert.ok(response.body.results[0].whyMatched);
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
