const test = require("node:test");
const assert = require("assert/strict");
const { toolSchemas } = require("../../src/server/mcp/contracts");
const { callMcpTool, listMcpTools } = require("../../src/server/mcp/tools");
const { createTestContext } = require("../helpers");

test("MCP tool schemas include required contracts", () => {
  const names = listMcpTools().map((tool) => tool.name);
  assert.ok(names.includes("search_directory"));
  assert.ok(names.includes("get_directory_entry"));
  assert.ok(names.includes("upsert_directory_entry"));
  assert.deepEqual(toolSchemas.search_directory.inputSchema.required, ["query"]);
});

test("MCP search and lookup tools share directory logic", async () => {
  const context = createTestContext();
  const search = await callMcpTool("search_directory", { query: "taxonomy governance", limit: 2 }, context);
  assert.equal(search.results[0].id, "document-taxonomy-governance-playbook");

  const entry = await callMcpTool("get_directory_entry", { id: search.results[0].id }, context);
  assert.equal(entry.id, "document-taxonomy-governance-playbook");
});

test("MCP mutating tools are admin guarded when ADMIN_TOKEN is set", async () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "secret";
  const context = createTestContext();

  await assert.rejects(() => callMcpTool("upsert_directory_entry", {
    entry: {
      id: "tool-admin-test",
      name: "Admin Test",
      description: "Guarded write.",
      category: "tools"
    }
  }, context), /Admin token/);

  const entry = await callMcpTool("upsert_directory_entry", {
    adminToken: "secret",
    entry: {
      id: "tool-admin-test",
      name: "Admin Test",
      description: "Guarded write.",
      category: "tools"
    }
  }, context);
  assert.equal(entry.id, "tool-admin-test");
  process.env.ADMIN_TOKEN = original;
});

test("MCP returns index stats", async () => {
  const stats = await callMcpTool("get_index_stats", {}, createTestContext());
  assert.equal(stats.adapter, "memory");
  assert.ok(stats.entries > 0);
});
