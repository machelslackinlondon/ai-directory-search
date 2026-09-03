# Testing guide

## Fast suite

```bash
npm test
```

The default suite uses Node's test runner. It covers validation, the controlled taxonomy, shared AND/global-OR filter behavior, memory parity, OpenSearch mapping/query/response construction, adapter lifecycle, recoverable fallback, HTTP/MCP/agent contracts, Compose configuration, and UI flows. The Docker-backed file is loaded but skipped unless `OPENSEARCH_LIVE_TEST=1`.

## Live OpenSearch suite

After `npm run setup:opensearch`:

```bash
npm run opensearch:verify
npm run opensearch:test
```

`opensearch:verify` fetches `directory-profiles-template-v1` and checks its index pattern, strict mapping, and schema version. It also checks the `directory-profiles` alias has exactly one physical target, that target's effective mapping is `dynamic: strict` with schema version `1`, and the alias contains the same six documents as the canonical store.

The live suite uses the real store, official client, and production adapter path. It independently proves:

1. Native BM25 lexical ranking.
2. Search-time `synonym_graph` retrieval.
3. Indexed profile-alias retrieval.
4. Positive bounded fuzzy matching and an over-bound negative case.
5. Edge n-gram name/alias autocomplete.

It also verifies analyzer tokens, template/mapping metadata, filters, global preference OR, extra-match boosting, structured `matchLabels`, facet counts, and versioned reindex behavior. Live test indexes are retained, matching the rollback-friendly production lifecycle.

## Evaluation

```bash
npm run eval
```

The five project-owned design queries run against the deterministic memory adapter so evaluation stays repeatable and does not hide a primary-backend outage behind fallback. Expected completion metrics include top-3 accuracy `1` and grounded-answer rate `1`. See [Evaluation](evaluation.md).

## Browser QA

Start the OpenSearch-backed app with `npm run dev`, then check desktop and mobile widths:

- Business Type, Category, and State remain visible and combine with AND.
- More Filters reveals Rooms, Project Types, Styles, and Services with counts.
- Checkbox changes remain pending until Apply Filters; Clear All resets primary and preference filters.
- Applied filters produce removable chips and result-card `matchLabels`.
- The live result count uses the API `total`, not just the current page length.
- Result/detail navigation, agent answer, and admin stats work.
- No error overlay or browser console error appears.

## Fixtures and test isolation

Fixtures live in `tests/fixtures/`. Fast tests should inject the memory adapter or a focused client double; only `tests/integration/opensearch-live.test.js` may depend on the local service. Never add a real password to fixtures, commands, screenshots, or reports.
