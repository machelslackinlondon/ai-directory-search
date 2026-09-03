# Architecture

## System shape

The project is one Node.js application with a static browser UI. `data/directory.json` is the canonical writable store. OpenSearch is a derived read index; losing it never loses directory records.

```text
browser / HTTP / MCP / agent
              |
       async search contract
              |
  OpenSearch-first fallback adapter
        /                 \
versioned OpenSearch    warm memory index
        \                 /
       canonical JSON store
```

The main boundaries are:

- `src/server/http.js`: HTTP API and static-file server.
- `src/server/directory/`: schema validation, design taxonomy, CSV import, and file store.
- `src/server/search/`: memory, OpenSearch, and fallback adapters plus the shared filter contract.
- `src/server/agent/`: deterministic, directory-grounded agent.
- `src/server/mcp/`: tool schemas and handlers that reuse the same store and adapter.
- `public/`: accessible search, filters, cards, detail view, agent answer, and admin tools.

All adapter operations are promise-based. Tests inject the memory adapter unless they explicitly opt into the live OpenSearch suite.

## Index lifecycle and mapping

`npm run opensearch:bootstrap` installs `directory-profiles-template-v1` before any documents are written. The template applies to `directory-profiles-v1-*`, uses `dynamic: strict`, records `_meta.schema_version: 1`, and creates one shard with no replicas for the single-node development stack.

Applications read through the stable `directory-profiles` alias. Reindexing creates a timestamped physical index, analyzes representative input, bulk-indexes the full canonical snapshot, refreshes and verifies its count, then moves the alias in one atomic operation. A failed bulk or count check leaves the current alias untouched. Previous physical indexes are retained for manual rollback.

The indexed document flattens controlled searchable fields while retaining the normalized profile in a non-indexed `profile` object. Exact primary/facet fields are normalized `keyword` values with text subfields where free-text discovery is useful. This prevents mapping explosion while preserving the API payload in `_source`.

## Analysis and relevance

Five signals are intentionally independent and live-tested:

1. Native BM25 (`k1: 1.2`, `b: 0.75`, `discount_overlaps: true`) supplies lexical term-frequency and field-length scoring.
2. A search-time `synonym_graph` expands conservative, multiword design equivalents such as `new build` and `new construction`.
3. Indexed profile aliases find alternate firm names such as `CFA Studio`.
4. Query-time `AUTO` fuzziness tolerates bounded ordinary spelling errors.
5. Edge n-gram `name.autocomplete` and `aliases.autocomplete` fields support partial firm-name input.

Names, aliases, and taxonomy text use lowercase plus ASCII folding without stemming because stemming can corrupt proper names. Descriptions use light English stemming for useful inflection matching. Synonyms run only at search time so multiword alternatives remain graph-aware and stored postings do not multiply. Fuzziness is bounded to a query clause rather than indexed into every field, limiting broad expansions and index growth. Autocomplete edge n-grams are likewise limited to names and aliases.

## Search semantics

The three primary filters—Category, Business Type, and State—are exact filters combined with AND. Category values are exactly `Architecture`, `Interior Design + Decor`, and `Outdoor + Garden Design`.

Rooms, Project Types, Styles, and Services form one global preference OR. A profile must match at least one selected value across all four groups, and each additional selected-value match adds a score boost. Their `post_filter` does not narrow aggregations, so option counts continue to reflect the free-text query plus primary filters.

Named clauses are decoded into structured result metadata:

```json
{
  "matchLabels": [
    { "facet": "rooms", "value": "kitchen", "label": "Kitchen" },
    { "facet": "styles", "value": "modern", "label": "Modern" }
  ]
}
```

The UI renders those labels separately from free-text `whyMatched` explanations.

## Failure behavior

The fallback adapter always attempts OpenSearch first. Connection failures, timeouts, a missing alias/index, HTTP 429, and HTTP 502/503/504 open a 30-second cooldown by default and return memory results with `backend: "memory"`, `fallback: true`, and a stable `fallbackReason`. The first request after the cooldown probes OpenSearch; success closes degraded mode automatically.

Malformed requests, mapping failures, and HTTP 400/401/403 are not availability failures. They remain visible instead of silently returning potentially misleading memory results. Both indexes are refreshed after canonical mutations, and recoverable OpenSearch reindex failure is reported as degraded metadata without discarding the canonical write.

## API routes

- `GET /api/search`
- `GET /api/entries/:id`
- `GET /api/categories`
- `GET /api/stats`
- `POST /api/agent`
- `POST /api/admin/import`
- `POST /api/admin/reindex`
- `GET /api/mcp/tools`
- `POST /api/mcp`

`/api/stats` exposes memory and OpenSearch state, alias/index information when available, cooldown state, and safe error codes. It never exposes credentials.
