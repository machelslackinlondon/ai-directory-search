# Evaluation Guide

Run:

```bash
npm run eval
```

The harness loads `evals/queries.json`, searches the local memory index, calls the deterministic agent, and prints metrics.

## Metrics

- Top-1 accuracy.
- Top-3 accuracy.
- Precision@3.
- Recall@3.
- Mean reciprocal rank.
- Average latency.
- Empty result rate.
- Grounded-answer rate.

## Add Evaluation Cases

Edit `evals/queries.json`:

```json
{
  "query": "AI vendor risk procurement guide",
  "expectedIds": ["document-responsible-ai-procurement"]
}
```

Keep expected IDs grounded in seed or imported data. Good eval sets include exact-name lookups, synonym queries, broad category queries, filtered-intent queries, and no-result probes.

## Interpreting Results

Low top-k accuracy usually means ranking weights, synonyms, or taxonomy tags need attention. High empty-result rate means user language is not represented well in descriptions, tags, aliases, synonyms, or related terms.
