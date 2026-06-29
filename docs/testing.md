# Testing Guide

Run all tests:

```bash
npm test
```

The suite uses Node's built-in test runner and no external services.

## Coverage Areas

Unit tests:

- Directory data validation.
- CSV parsing.
- Search adapter ranking.
- Filter logic.
- Optional local semantic mode.
- Agent fallback behavior.
- MCP tool schemas and admin guards.

Integration tests:

- Search API.
- Agent API.
- Import/reindex flow.
- Mock MCP calls.
- Static app serving.

UI-flow test:

- Runs a search through the API.
- Renders result cards with `public/renderers.js`.
- Renders a detail view.
- Renders the no-result state.

## Fixtures

Fixtures live in `tests/fixtures/`. Add small JSON or CSV files when testing import behavior.
