# MCP-compatible directory tools

The local MCP-compatible layer uses the same canonical store and OpenSearch-first adapter as HTTP and the agent.

## Discover tools

```bash
npm run mcp list
curl http://127.0.0.1:3000/api/mcp/tools
```

## Search

```bash
npm run mcp search_directory '{"query":"hospitality landscape","filters":{"projectTypes":["Hospitality"],"styles":["Modern"]},"limit":3}'
```

Equivalent HTTP call:

```bash
curl -X POST http://127.0.0.1:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"tool":"search_directory","args":{"query":"hospitality landscape","filters":{"projectTypes":["Hospitality"],"styles":["Modern"]},"limit":3}}'
```

Canonical filters are:

- Primary AND: `category`, `businessType`, `state`
- Global preference OR: arrays `rooms`, `projectTypes`, `styles`, `services`
- Compatibility/search fields: `tags`; HTTP also accepts legacy `subcategory` as an alias for Business Type

Selected preferences are one global OR even when they come from different arrays. Matching more selected values raises relevance. Search responses preserve `backend`, `fallback`, `fallbackReason`, `facets`, total, and structured labels:

```json
{
  "backend": "opensearch",
  "fallback": false,
  "fallbackReason": null,
  "results": [
    {
      "id": "terrain-landscape-architects",
      "matchLabels": [
        { "facet": "projectTypes", "value": "hospitality", "label": "Hospitality" },
        { "facet": "styles", "value": "modern", "label": "Modern" }
      ]
    }
  ]
}
```

During a recoverable OpenSearch failure the same call returns equivalent memory results with `backend: "memory"`, `fallback: true`, and a stable reason. Authentication, authorization, malformed query, validation, and mapping failures remain visible.

## Tools

- `search_directory`: query, filter, sort, and limit profiles.
- `get_directory_entry`: fetch one profile by ID.
- `list_directory_categories`: list the three Categories and their Business Types.
- `upsert_directory_entry`: validate/write canonical data and reindex (admin-only).
- `delete_directory_entry`: delete canonical data and reindex (admin-only).
- `reindex_directory`: rebuild memory and a versioned OpenSearch index (admin-only).
- `get_index_stats`: inspect backend, fallback/cooldown, alias, schema, and count state.

Mutation responses include their reindex result. If the canonical write succeeds but OpenSearch has a recoverable outage, the result explicitly reports memory/degraded indexing. Non-recoverable indexing errors are returned so operators can correct the schema or data rather than accepting a silent divergence.

## Guardrails

Set `ADMIN_TOKEN` in production and pass `adminToken` in mutation tool arguments. Read-only tools need no token. Schemas are in `src/server/mcp/contracts.js`; handlers are in `src/server/mcp/tools.js`.
