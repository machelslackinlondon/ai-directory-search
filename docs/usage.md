# Usage Guide

## Search

Start the app:

```bash
npm run dev
```

Use the search input to find entries by name, description, category, tags, location, aliases, facets, or metadata. Result cards show score, tags, and why each entry matched.

## Filters and Sorting

Filters are applied before ranking:

- Category
- Tags
- Location

Sort options:

- Relevance
- Name
- Newest
- Recently updated
- Category

## AI-Assisted Questions

Use the `Ask` input for natural-language questions such as:

```text
Who handles AI vendor security review?
Find local search evaluation tools.
List categories.
```

The deterministic agent uses directory tools and returns only grounded references. If no entries match, it says so instead of inventing a record.

## Detail View

Selecting a result opens the full record with ID, category, subcategory, tags, facets, metadata, contact, location, update date, and URL.

## Admin Import

Open the Admin tab to import JSON or CSV.

JSON shape:

```json
{
  "entries": [
    {
      "id": "tool-example",
      "name": "Example Tool",
      "description": "A searchable directory entry.",
      "category": "tools",
      "tags": ["search"]
    }
  ]
}
```

CSV headers:

```csv
id,name,description,category,tags,location,url,contact
tool-example,Example Tool,A searchable entry,tools,search,Remote,https://example.com,owner@example.com
```

In production, set `ADMIN_TOKEN` and send it through the Admin token field.
