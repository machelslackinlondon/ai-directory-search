# Evaluation guide

Run the deterministic domain evaluation:

```bash
npm run eval
```

The harness loads the five project-owned cases in `evals/queries.json`, searches an explicitly constructed memory adapter, invokes the grounded agent, and prints per-query results plus aggregate metrics. Using memory directly keeps the check repeatable and distinct from `npm run opensearch:test`, which independently proves live OpenSearch relevance.

The current cases cover residential architecture/renovation, traditional kitchen consultation, eclectic hospitality interiors, modern hospitality landscape/new-construction language, and climate-aware garden renewal. Expected IDs all refer to the six seed profiles.

## Completion thresholds

Task verification requires:

- `cases: 5`
- `top3Accuracy: 1`
- `groundedAnswerRate: 1`

Also inspect top-1 accuracy, precision@3, recall@3, mean reciprocal rank, average latency, and empty-result rate. A grounded answer cites only records returned by search or present in the canonical store.

## Relevance coverage

Evaluation is a broad regression signal. The Docker-backed live suite separately tests the five OpenSearch signals in isolation:

1. Native BM25 lexical ranking.
2. Search-time `synonym_graph` expansion.
3. Indexed aliases.
4. Bounded query-time `AUTO` fuzzy matching.
5. Edge n-gram name/alias autocomplete.

Run both after taxonomy, analyzer, mapping, query-boost, or seed-data changes:

```bash
npm run eval
npm run opensearch:test
```

## Adding a case

Add a hand-checked object to `evals/queries.json`:

```json
{
  "query": "traditional kitchen consultation",
  "expectedIds": ["hearth-kitchen-studio"]
}
```

Keep expected IDs grounded in seed or imported data. Use natural design-professional language, and prefer cases that would detect an unintended taxonomy, synonym, alias, or ranking regression. Do not derive expected IDs from current search output.

Low top-k accuracy usually indicates weak field weights or missing domain language. A high empty-result rate suggests descriptions, profile aliases, synonyms, or related terms do not represent how users search. Inspect `matchLabels` separately when evaluating Rooms, Project Types, Styles, or Services, because those labels explain selected preference matches rather than free-text terms.
