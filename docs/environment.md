# Environment Variables

The default app works without environment variables.

## Server

- `PORT`: HTTP port. Default `3000`.
- `HOST`: HTTP host. Default `127.0.0.1`.
- `NODE_ENV`: Runtime mode. Production admin mutations require `ADMIN_TOKEN`.

## Storage

- `DIRECTORY_DATA_PATH`: file path for writable directory data. Default `data/directory.json`.

## Admin

- `ADMIN_TOKEN`: required for admin import, upsert, delete, and reindex in production.

Local development allows admin mutations when `ADMIN_TOKEN` is empty. This keeps setup simple while still making production behavior guarded.

## Optional AI and Search Providers

- `SEMANTIC_PROVIDER=local-hash`: enables deterministic local semantic-style ranking with no paid service.
- `AI_PROVIDER`, `AI_API_KEY`: reserved for future optional LLM adapters.
- `VECTOR_PROVIDER`, `VECTOR_API_KEY`: reserved for future optional vector search adapters.

External services should remain disabled by default and must fail gracefully when credentials are missing.
