# Onboarding

## Prerequisites

- Node `16.19` or newer.
- npm.

No database, paid AI provider, or hosted vector service is required.

## Setup

```bash
npm install
npm run seed
npm run index
npm run dev
```

The app runs at `http://127.0.0.1:3000`.

## Run Checks

```bash
npm test
npm run eval
```

## Add a Directory Field

1. Add the field to `ENTRY_FIELDS` in `src/server/directory/schema.js`.
2. Normalize and validate it in the same file.
3. Add it to `getFieldTexts` in `src/server/search/memorySearchAdapter.js` if it should affect ranking.
4. Render it in `public/renderers.js` if users should see it.
5. Add a validation/search test.

## Add a Search Provider

1. Implement the adapter methods used by `createMemorySearchAdapter`.
2. Keep the result shape: `{ id, entry, score, matchedFields, reasons, whyMatched }`.
3. Select the adapter in `src/server/http.js` or a small provider factory.
4. Fail gracefully when credentials are missing.
5. Add unit tests and eval runs for the provider.

## Add an MCP Tool

1. Add the schema in `src/server/mcp/contracts.js`.
2. Add the handler in `src/server/mcp/tools.js`.
3. Reuse store/search/agent logic instead of duplicating behavior.
4. Guard mutations with `requireAdmin`.
5. Add unit and integration tests.

## Data Handling

Directory data is stored locally in JSON. Secrets are read from environment variables and are never logged. The app does not send user queries to external services unless a future external adapter is explicitly configured.
