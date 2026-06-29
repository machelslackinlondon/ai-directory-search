# Architecture

## Overview

The project is a single local-first Node app:

- `public/`: static browser UI.
- `src/server/http.js`: HTTP API and static file server.
- `src/server/directory/`: schema validation, taxonomy helpers, CSV import, and file-backed store.
- `src/server/search/`: swappable search adapter interface with a memory implementation.
- `src/server/agent/`: deterministic server-side agent runtime.
- `src/server/mcp/`: mock MCP-compatible tool contracts and handlers.
- `src/server/evals/`: evaluation harness.
- `tests/`: unit, integration, and UI-flow tests.
- `docs/`: project guides.

## UI

The first screen is the usable search experience. It includes keyword search, natural-language agent questions, filters, sort controls, ranked result cards, match explanations, detail view, and admin import/reindex controls.

The browser calls API routes directly and uses `public/renderers.js` for result, detail, empty, loading, and agent answer rendering. The renderer is also imported by the UI-flow test.

## API Routes

- `GET /api/search`
- `GET /api/entries/:id`
- `GET /api/categories`
- `GET /api/stats`
- `POST /api/agent`
- `POST /api/admin/import`
- `POST /api/admin/reindex`
- `GET /api/mcp/tools`
- `POST /api/mcp`

Admin routes require `ADMIN_TOKEN` in production. In local development with no token configured, mutations are allowed for easy setup.

## Directory Store

The default store loads `data/directory.json` when present and falls back to `src/data/seed-directory.json`. `npm run seed` writes the seed into the writable data file.

Entries are validated and normalized through `src/server/directory/schema.js`.

## Search Adapter

Search is behind an adapter object with:

- `search(params)`
- `getEntry(id)`
- `listCategories()`
- `reindex()`
- `stats()`

The default `memory` adapter ranks keyword matches using weighted fields. It supports category, subcategory, tag, location, facet, and metadata filters. `SEMANTIC_PROVIDER=local-hash` enables a deterministic vector-style rank boost without external services.

## Agent Runtime

The agent is intentionally small:

1. Infer intent from the question.
2. Infer category/tag filters from taxonomy.
3. Use lookup, category listing, or search tools.
4. Summarize only returned records.
5. Include entry IDs as references.
6. Refuse to invent entries when no records match.

## MCP Layer

The mock MCP layer exposes the same search and mutation logic through explicit tool contracts. This keeps API and MCP behavior aligned while avoiding a separate server process.

## Optional External Services

External AI, embedding, or vector providers are disabled by default. Environment variables are reserved so future adapters can be added without changing UI or agent contracts.
