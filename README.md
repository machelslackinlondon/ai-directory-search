# AI Directory Search

A lightweight, local-first web app for searching structured directory entries with keyword search and a deterministic AI-assisted question-answering layer.

The app helps users find relevant people, companies, services, documents, tools, and vendors without manually browsing long lists. Results are ranked, filterable, and include "why this matched" explanations. The agent answers natural-language questions only from returned directory records and includes entry IDs as references.

## Architecture Decision

This is a single Node project rather than a monorepo. The app is intentionally small: a static browser UI, Node HTTP API, directory store, memory search adapter, deterministic agent runtime, mock MCP tool layer, tests, and evals all share one codebase. A monorepo would only add overhead here; the adapter and MCP boundaries are already explicit enough to split later if deployment needs change.

## Quick Start

```bash
npm install
npm run seed
npm run index
npm run dev
```

Open `http://127.0.0.1:3000`.

Run the checks:

```bash
npm test
npm run eval
```

## Features

- Search-first web UI with filters, sort controls, result list, detail view, empty/loading/error states, and admin import.
- Flexible directory entries with taxonomy fields for category, subcategory, tags, facets, synonyms, related terms, and aliases.
- Local memory search adapter with keyword ranking, filters, and optional no-cost `local-hash` semantic-style mode.
- Server-side deterministic agent that plans tool use, searches the directory, summarizes results, and refuses to invent missing entries.
- Mock MCP-compatible tool layer exposed through `/api/mcp` and `npm run mcp`.
- JSON and CSV imports through guarded admin routes.
- Unit, integration, and UI-flow tests using Node's built-in test runner.
- Evaluation harness with top-k accuracy, precision, recall, MRR, latency, empty result rate, and grounded-answer rate.

## Environment

Copy `.env.example` if you want local overrides. No paid services are required.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `HOST` | `127.0.0.1` | HTTP host. |
| `DIRECTORY_DATA_PATH` | `data/directory.json` | Writable directory data file. |
| `ADMIN_TOKEN` | empty | Required for admin mutations in production. |
| `SEMANTIC_PROVIDER` | empty | Set `local-hash` for deterministic local hybrid/semantic ranking. |
| `AI_PROVIDER`, `AI_API_KEY`, `VECTOR_PROVIDER`, `VECTOR_API_KEY` | empty | Reserved for optional external adapters; disabled by default. |

## Main Commands

```bash
npm run dev      # start the web app
npm run seed     # write seeded data to data/directory.json
npm run index    # rebuild local index stats
npm test         # run unit, integration, and UI-flow tests
npm run eval     # run search/agent evaluation
npm run mcp list # list mock MCP tool contracts
```

## Guides

- [Architecture](docs/architecture.md)
- [Usage](docs/usage.md)
- [Onboarding](docs/onboarding.md)
- [Environment](docs/environment.md)
- [Testing](docs/testing.md)
- [Evaluation](docs/evaluation.md)
- [MCP](docs/mcp.md)
- [Taxonomy](docs/taxonomy.md)
- [Deployment](docs/deployment.md)
