# Design-professional taxonomy

`src/server/directory/designTaxonomy.js` is the controlled source for visible filter values. The canonical JSON file mirrors those values into each normalized profile and its legacy `taxonomy` object.

## Three categories

Only these top-level categories are valid:

1. `Architecture`
2. `Interior Design + Decor`
3. `Outdoor + Garden Design`

Builders and contractors are intentionally excluded. Business Type is the professional discipline and must belong to its selected Category:

| Category | Business Types |
| --- | --- |
| Architecture | Building Architect; Interior Architect; Residential Architect |
| Interior Design + Decor | Decorator; Design Consultant; Interior Design Consultant; Interior Designer; Kitchen Designer; Stylist |
| Outdoor + Garden Design | Landscape Architect; Landscape Designer |

State is a canonical full US state name or `District of Columbia`. `All States` is only a UI sentinel and is never stored or indexed.

Category, Business Type, and State are the three primary filters. A profile must satisfy every selected primary filter (AND semantics).

## Multi-select preferences

The four controlled groups are:

- Rooms: `Kitchen`, `Living Room`, `Bathroom`
- Project Types: `Renovation`, `New Build`, `Hospitality`
- Styles: `Modern`, `Traditional`, `Eclectic`
- Services: `Full-service Design`, `Consultation`

Selections across all groups create one global OR. At least one selected value must match; each additional matching value boosts the result. Aggregation counts are computed before this preference post-filter so the UI can show options available under the current free-text and primary filters.

Matches are returned with display-safe canonical labels:

```json
{
  "facet": "services",
  "value": "full-service-design",
  "label": "Full-service Design"
}
```

Every item in a result's `matchLabels` corresponds to a currently selected preference and is rendered on its profile card.

## Canonical profile fields

```json
{
  "id": "atelier-north-architecture",
  "name": "Atelier North Architecture",
  "category": "Architecture",
  "businessType": "Residential Architect",
  "state": "California",
  "city": "San Francisco",
  "rooms": ["Kitchen", "Living Room"],
  "projectTypes": ["Renovation", "New Build"],
  "styles": ["Modern", "Traditional"],
  "services": ["Full-service Design", "Consultation"],
  "taxonomy": {
    "subcategory": "Residential Architect",
    "facets": {
      "rooms": ["Kitchen", "Living Room"],
      "projectTypes": ["Renovation", "New Build"],
      "styles": ["Modern", "Traditional"],
      "services": ["Full-service Design", "Consultation"]
    },
    "aliases": ["Atelier North Architects"]
  }
}
```

Validation canonicalizes case, whitespace, and accents for controlled values, rejects unknown facet keys and values and invalid Category/Business Type pairs, and derives the display `location` from City and State when needed. Imported top-level taxonomy cannot add categories, business types, facets, or State values to the canonical public contract.

## Synonyms, aliases, and governance

- Global synonyms represent conservative domain equivalents such as `new build` and `new construction`; OpenSearch applies them with `synonym_graph` only at search time.
- Profile synonyms improve recall for language specific to one record.
- Aliases are alternate names for one profile, indexed as a strongly boosted text field and an autocomplete field.
- Related terms are lower-weight discovery language, not replacements for canonical filters.

Changing controlled values or analyzer synonym rules requires validation updates, evaluation cases, and a schema/index review. Because existing field mappings cannot safely change in place, incompatible mapping or analysis changes require a new versioned template/index and an alias switch.
