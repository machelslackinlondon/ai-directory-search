# Taxonomy Guide

Taxonomy makes directory entries easier to classify, filter, rank, and explain.

## Concepts

- Category: the broad entry type, such as `people`, `companies`, `services`, `documents`, `tools`, or `vendors`.
- Subcategory: a narrower grouping inside a category, such as `guides`, `evaluation`, or `support`.
- Tags: concise labels that describe reusable topics, capabilities, domains, or technologies.
- Facets: controlled filter dimensions with known values, such as `audience`, `maturity`, and `availability`.
- Synonyms: terms users may type that should map to canonical language, such as `supplier` for `vendor`.
- Related terms: neighboring concepts that help broaden discovery without changing the canonical tag.
- Aliases: alternate names for a specific entry.

## Example

```json
{
  "taxonomy": {
    "category": "documents",
    "subcategory": "guides",
    "tags": ["ai", "procurement", "security", "vendor"],
    "facets": {
      "audience": ["procurement", "legal"],
      "maturity": ["production"]
    },
    "synonyms": ["ai supplier checklist"],
    "relatedTerms": ["compliance", "evaluation"],
    "aliases": ["AI Procurement Guide"]
  }
}
```

## Governance Rules

- Use one primary category per entry.
- Prefer stable tags over one-off labels.
- Keep facet values controlled and reusable.
- Add synonyms only when users actually search with alternate language.
- Use aliases for names, abbreviations, and common shorthand.
- Review taxonomy changes with search evaluation results.

## How Taxonomy Improves Search

The memory search adapter uses taxonomy fields in ranking. Tags, aliases, subcategories, facets, synonyms, and related terms can all contribute to match explanations. Better taxonomy means better recall for natural-language questions and more transparent "why this matched" output.

## Evaluate Taxonomy Quality

Use `npm run eval` after taxonomy changes. Watch:

- Top-1 and top-3 accuracy.
- Empty result rate.
- Queries where expected entries only appear below rank 3.
- Results whose explanation mentions weak fields instead of strong taxonomy signals.

Add eval cases when introducing new categories, tags, facets, or synonyms.
