const directoryFiltersSchema = {
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
};

const toolSchemas = {
  search_directory: {
    description: "Search directory entries using the active search adapter.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        filters: directoryFiltersSchema,
        sort: { type: "string", enum: ["relevance", "name", "newest", "updated", "category"] },
        limit: { type: "number", minimum: 1, maximum: 100 },
        mode: { type: "string", enum: ["keyword", "semantic", "hybrid"] }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  get_directory_entry: {
    description: "Return one directory entry by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  list_directory_categories: {
    description: "List directory categories and subcategories.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
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
      required: ["entry"],
      additionalProperties: false
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
      required: ["id"],
      additionalProperties: false
    }
  },
  reindex_directory: {
    description: "Rebuild the active index. Admin-only.",
    adminOnly: true,
    inputSchema: {
      type: "object",
      properties: {
        adminToken: { type: "string" }
      },
      additionalProperties: false
    }
  },
  get_index_stats: {
    description: "Return index and adapter statistics.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
};

module.exports = {
  directoryFiltersSchema,
  toolSchemas
};
