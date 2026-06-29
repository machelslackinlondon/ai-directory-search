const toolSchemas = {
  search_directory: {
    description: "Search directory entries using the active search adapter.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        filters: { type: "object" },
        sort: { type: "string", enum: ["relevance", "name", "newest", "updated", "category"] },
        limit: { type: "number", minimum: 1, maximum: 100 },
        mode: { type: "string", enum: ["keyword", "semantic", "hybrid"] }
      },
      required: ["query"]
    }
  },
  get_directory_entry: {
    description: "Return one directory entry by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"]
    }
  },
  list_directory_categories: {
    description: "List directory categories and subcategories.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  upsert_directory_entry: {
    description: "Create or update a directory entry. Admin-only.",
    adminOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        adminToken: { type: "string" },
        entry: { type: "object" }
      },
      required: ["entry"]
    }
  },
  delete_directory_entry: {
    description: "Delete a directory entry by id. Admin-only.",
    adminOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        adminToken: { type: "string" },
        id: { type: "string" }
      },
      required: ["id"]
    }
  },
  reindex_directory: {
    description: "Rebuild the active index. Admin-only.",
    adminOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        adminToken: { type: "string" }
      }
    }
  },
  get_index_stats: {
    description: "Return index and adapter statistics.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
};

module.exports = {
  toolSchemas
};
