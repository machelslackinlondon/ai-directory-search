# MCP and Mock MCP Guide

The app includes a mock MCP-compatible layer with explicit tool contracts. It uses the same directory store and search adapter as the API.

## List Tools

```bash
npm run mcp list
```

HTTP:

```bash
curl http://127.0.0.1:3000/api/mcp/tools
```

## Call a Tool

CLI:

```bash
npm run mcp search_directory '{"query":"AI vendor risk","limit":3}'
```

HTTP:

```bash
curl -X POST http://127.0.0.1:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"tool":"search_directory","args":{"query":"AI vendor risk","limit":3}}'
```

## Tools

- `search_directory`: search entries with query, filters, sort, limit, and mode.
- `get_directory_entry`: fetch a single entry by ID.
- `list_directory_categories`: list categories and subcategories.
- `upsert_directory_entry`: admin-only create/update.
- `delete_directory_entry`: admin-only delete.
- `reindex_directory`: admin-only reindex.
- `get_index_stats`: inspect index state.

## Guardrails

Mutating tools call the same admin guard as the app. Set `ADMIN_TOKEN` in production and pass `adminToken` in tool args. Search and lookup tools are read-only.

## Tool Contract Files

- Schemas: `src/server/mcp/contracts.js`
- Handlers: `src/server/mcp/tools.js`
- Tests: `tests/unit/mcp.test.js` and `tests/integration/api.test.js`
