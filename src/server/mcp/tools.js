const { toolSchemas } = require("./contracts");

function requireAdmin(args = {}) {
  const expected = process.env.ADMIN_TOKEN;
  if (expected) {
    if (args.adminToken !== expected) {
      const error = new Error("Admin token is required for this MCP tool.");
      error.code = "ADMIN_REQUIRED";
      throw error;
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    const error = new Error("Set ADMIN_TOKEN before using mutating MCP tools in production.");
    error.code = "ADMIN_REQUIRED";
    throw error;
  }
}

function assertTool(name) {
  if (!toolSchemas[name]) {
    const error = new Error(`Unknown MCP tool: ${name}`);
    error.code = "UNKNOWN_TOOL";
    throw error;
  }
}

async function callMcpTool(name, args = {}, context) {
  assertTool(name);
  const store = context.store;
  const searchAdapter = context.searchAdapter;

  if (name === "search_directory") {
    return searchAdapter.search({
      query: args.query || "",
      filters: args.filters || {},
      sort: args.sort || "relevance",
      limit: args.limit || 20,
      mode: args.mode || "keyword"
    });
  }

  if (name === "get_directory_entry") {
    const entry = store.getEntry(args.id);
    if (!entry) {
      const error = new Error(`Directory entry not found: ${args.id}`);
      error.code = "NOT_FOUND";
      throw error;
    }
    return entry;
  }

  if (name === "list_directory_categories") {
    return store.getTaxonomy().categories;
  }

  if (name === "upsert_directory_entry") {
    requireAdmin(args);
    const entry = store.upsertEntry(args.entry);
    searchAdapter.reindex();
    return entry;
  }

  if (name === "delete_directory_entry") {
    requireAdmin(args);
    const deleted = store.deleteEntry(args.id);
    searchAdapter.reindex();
    return { deleted, id: args.id };
  }

  if (name === "reindex_directory") {
    requireAdmin(args);
    return searchAdapter.reindex();
  }

  if (name === "get_index_stats") {
    return searchAdapter.stats();
  }

  throw new Error(`Unhandled MCP tool: ${name}`);
}

function listMcpTools() {
  return Object.entries(toolSchemas).map(([name, schema]) => ({ name, ...schema }));
}

module.exports = {
  callMcpTool,
  listMcpTools,
  requireAdmin
};
