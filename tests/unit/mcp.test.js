const test = require("node:test");
const assert = require("assert/strict");
const { toolSchemas } = require("../../src/server/mcp/contracts");
const { callMcpTool, listMcpTools } = require("../../src/server/mcp/tools");
const { createTestContext } = require("../helpers");
const { DESIGN_CATEGORIES } = require("../../src/server/directory/designTaxonomy");

test("MCP tool schemas include required contracts", () => {
  const names = listMcpTools().map((tool) => tool.name);
  assert.ok(names.includes("search_directory"));
  assert.ok(names.includes("get_directory_entry"));
  assert.ok(names.includes("upsert_directory_entry"));
  assert.deepEqual(toolSchemas.search_directory.inputSchema.required, ["query"]);
  assert.equal(toolSchemas.search_directory.inputSchema.additionalProperties, false);
  assert.deepEqual(toolSchemas.search_directory.inputSchema.properties.filters, {
    type: "object",
    properties: {
      category: { type: "string" },
      businessType: { type: "string" },
      state: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      rooms: { type: "array", items: { type: "string" } },
      projectTypes: { type: "array", items: { type: "string" } },
      styles: { type: "array", items: { type: "string" } },
      services: { type: "array", items: { type: "string" } }
    },
    additionalProperties: false
  });
});

test("MCP search and lookup tools share directory logic", async () => {
  const context = createTestContext();
  const search = await callMcpTool("search_directory", { query: "traditional kitchen consultation", limit: 2 }, context);
  assert.equal(search.results[0].id, "hearth-kitchen-studio");

  const entry = await callMcpTool("get_directory_entry", { id: search.results[0].id }, context);
  assert.equal(entry.id, "hearth-kitchen-studio");
});

test("MCP detail and category tools await adapter methods", async () => {
  const base = createTestContext();
  const adapterEntry = { ...base.store.getEntry("hearth-kitchen-studio"), name: "Adapter MCP Detail" };
  let getEntryCalls = 0;
  let listCategoryCalls = 0;
  const context = {
    ...base,
    searchAdapter: {
      async getEntry(id) {
        getEntryCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return id === adapterEntry.id ? adapterEntry : null;
      },
      async listCategories() {
        listCategoryCalls += 1;
        await new Promise((resolve) => setImmediate(resolve));
        return DESIGN_CATEGORIES;
      }
    }
  };

  const entry = await callMcpTool("get_directory_entry", { id: adapterEntry.id }, context);
  const categories = await callMcpTool("list_directory_categories", {}, context);

  assert.equal(entry.name, "Adapter MCP Detail");
  assert.deepEqual(categories, DESIGN_CATEGORIES);
  assert.equal(getEntryCalls, 1);
  assert.equal(listCategoryCalls, 1);
});

test("MCP upsert rejects imported nested taxonomy that hides builders and industrial facets", async () => {
  const context = createTestContext();

  await assert.rejects(() => callMcpTool("upsert_directory_entry", {
    entry: {
      id: "invalid-mcp-taxonomy",
      name: "Invalid MCP Taxonomy",
      description: "Must not hide uncontrolled values in nested taxonomy.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California",
      taxonomy: {
        category: "Builders + Contractors",
        subcategory: "General Contractor",
        facets: { industry: ["Industrial"] }
      }
    }
  }, context), (error) => {
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.match(error.message, /Builders \+ Contractors/);
    assert.match(error.message, /Industrial|industry/);
    return true;
  });
});

test("MCP search preserves backend, fallback, facets, and match labels", async () => {
  const search = await callMcpTool("search_directory", {
    query: "",
    filters: {
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California",
      rooms: ["Bathroom", "Kitchen"],
      styles: ["Eclectic", "Modern"]
    }
  }, createTestContext());

  assert.equal(search.backend, "memory");
  assert.equal(search.fallback, false);
  assert.equal(search.fallbackReason, null);
  assert.ok(Array.isArray(search.facets.styles));
  assert.deepEqual(search.results.map(({ id }) => id), ["atelier-north-architecture"]);
  assert.deepEqual(search.results[0].matchLabels.map(({ label }) => label), ["Kitchen", "Modern"]);
});

test("MCP mutating tools preserve degraded reindex results", async () => {
  const degraded = {
    adapter: "memory",
    entries: 6,
    backend: "memory",
    fallback: true,
    fallbackReason: "ECONNREFUSED"
  };
  const base = createTestContext();
  const context = {
    ...base,
    searchAdapter: {
      async reindex() { return degraded; }
    }
  };

  const upserted = await callMcpTool("upsert_directory_entry", {
    entry: {
      id: "mcp-degraded-entry",
      name: "MCP Degraded Entry",
      description: "Tests mutation response metadata.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }
  }, context);
  assert.equal(upserted.id, "mcp-degraded-entry");
  assert.deepEqual(upserted.reindex, degraded);

  const deleted = await callMcpTool("delete_directory_entry", { id: "mcp-degraded-entry" }, context);
  assert.deepEqual(deleted, {
    deleted: true,
    id: "mcp-degraded-entry",
    reindex: degraded
  });

  assert.deepEqual(await callMcpTool("reindex_directory", {}, context), degraded);
});

test("MCP mutating tools propagate nonrecoverable reindex errors", async () => {
  const authenticationError = Object.assign(new Error("Authentication failed."), {
    code: "OPENSEARCH_AUTHENTICATION_FAILED"
  });
  const base = createTestContext();
  const context = {
    ...base,
    searchAdapter: {
      async reindex() { throw authenticationError; }
    }
  };

  await assert.rejects(() => callMcpTool("upsert_directory_entry", {
    entry: {
      id: "mcp-auth-failure",
      name: "MCP Auth Failure",
      description: "Confirms nonrecoverable failures remain visible.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }
  }, context), (error) => error === authenticationError);
  await assert.rejects(
    () => callMcpTool("delete_directory_entry", { id: "hearth-kitchen-studio" }, context),
    (error) => error === authenticationError
  );
  await assert.rejects(
    () => callMcpTool("reindex_directory", {}, context),
    (error) => error === authenticationError
  );
});

test("MCP mutating tools are admin guarded when ADMIN_TOKEN is set", async () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "secret";
  const context = createTestContext();

  await assert.rejects(() => callMcpTool("upsert_directory_entry", {
    entry: {
      id: "admin-design-test",
      name: "Admin Design Test",
      description: "Guarded write.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }
  }, context), /Admin token/);

  const entry = await callMcpTool("upsert_directory_entry", {
    adminToken: "secret",
    entry: {
      id: "admin-design-test",
      name: "Admin Design Test",
      description: "Guarded write.",
      category: "Architecture",
      businessType: "Residential Architect",
      state: "California"
    }
  }, context);
  assert.equal(entry.id, "admin-design-test");
  process.env.ADMIN_TOKEN = original;
});

test("MCP returns index stats", async () => {
  const stats = await callMcpTool("get_index_stats", {}, createTestContext());
  assert.equal(stats.adapter, "memory");
  assert.ok(stats.entries > 0);
});
