# Environment variables

Copy the example before first run:

```bash
cp .env.example .env
```

Replace both empty password values with the same strong random password. `.env` is ignored and must never be committed.

## Server and storage

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `HOST` | `127.0.0.1` | HTTP bind address. |
| `NODE_ENV` | `development` | Runtime mode; production requires an admin token for mutations. |
| `DIRECTORY_DATA_PATH` | `data/directory.json` | Canonical writable JSON store. |
| `ADMIN_TOKEN` | empty | Guards HTTP and MCP mutations; required in production. |

## OpenSearch

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `SEARCH_BACKEND` | `opensearch` | Primary backend; set `memory` only for an explicit memory-only run. |
| `OPENSEARCH_NODE` | `https://127.0.0.1:9200` | OpenSearch endpoint. Credentials must not be embedded in this URL. |
| `OPENSEARCH_USERNAME` | `admin` | Basic-auth username. |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | no default | Required by the secured local OpenSearch container at first start. |
| `OPENSEARCH_PASSWORD` | no default | Password used by the Node client; locally it must equal the initial admin password. |
| `OPENSEARCH_INDEX_ALIAS` | `directory-profiles` | Stable read alias. |
| `OPENSEARCH_REQUEST_TIMEOUT_MS` | `2000` | Positive request timeout in milliseconds. |
| `OPENSEARCH_FALLBACK_COOLDOWN_MS` | `30000` | Memory-fallback cooldown before an OpenSearch recovery probe. |
| `OPENSEARCH_TLS_REJECT_UNAUTHORIZED` | `true` in code; `false` in the local example | Whether to verify the server certificate. `false` is only for the demo self-signed local certificate. |
| `OPENSEARCH_CA_PATH` | empty | Path to a trusted CA bundle for production TLS verification. |

Production must use `OPENSEARCH_TLS_REJECT_UNAUTHORIZED=true` and an appropriate `OPENSEARCH_CA_PATH` (or a platform-trusted certificate). Do not copy the local TLS bypass into deployed settings.

## Optional providers

- `SEMANTIC_PROVIDER=local-hash` enables deterministic memory-only semantic-style ranking. OpenSearch uses keyword/BM25 mode.
- `AI_PROVIDER`, `AI_API_KEY`, `VECTOR_PROVIDER`, and `VECTOR_API_KEY` are reserved for future adapters and are disabled by default.

The application does not require a paid AI, embedding, or vector service.
