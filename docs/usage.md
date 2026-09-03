# Usage guide

Start the configured OpenSearch stack and app by following [Onboarding](onboarding.md), then open `http://127.0.0.1:3000`.

## Search and filters

Enter a profile name, alias, professional discipline, location, project language, or description term. Native BM25 ranks full text; synonyms, aliases, bounded fuzziness, and autocomplete improve recall.

The three always-visible controls are Business Type, Category, and State. They combine with AND semantics. The only Categories are Architecture, Interior Design + Decor, and Outdoor + Garden Design.

Open More Filters for Rooms, Project Types, Styles, and Services. Checkbox edits remain pending until Apply Filters. All applied preference selections form one global OR, and profiles matching more selections rank higher. Clear All removes the preference selections; every applied chip can also be removed individually. Result cards show `matchLabels` for the selected options that profile matched.

Sort by Relevance, Name, Newest, Recently updated, or Category. Selecting a result opens its full profile.

## Agent questions

The Ask input accepts grounded design-directory questions, for example:

```text
Who can help with traditional kitchen consultation?
Find hospitality landscape designers with a modern style.
List categories.
```

The deterministic agent uses directory tools and returns profile IDs as references. If no profile satisfies the inferred constraints, it refuses to invent one and suggests broadening the query.

## Admin and stats

Open Admin to inspect index stats, rebuild the derived index, or import JSON/CSV. In production, set `ADMIN_TOKEN` and provide it in the Admin token field.

A JSON profile includes controlled top-level fields:

```json
{
  "entries": [
    {
      "id": "example-residential-architect",
      "name": "Example Residential Architect",
      "description": "Modern residential renovations.",
      "category": "Architecture",
      "businessType": "Residential Architect",
      "state": "California",
      "city": "Los Angeles",
      "rooms": ["Kitchen"],
      "projectTypes": ["Renovation"],
      "styles": ["Modern"],
      "services": ["Full-service Design"]
    }
  ]
}
```

Imports write the canonical JSON store first and reindex both search adapters. A recoverable OpenSearch outage returns explicit degraded reindex metadata; validation or mapping errors remain visible.
