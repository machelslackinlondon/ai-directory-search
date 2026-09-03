# OpenSearch Directory Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic directory taxonomy with a design-professional directory powered by a versioned OpenSearch index, with relevance-aware filters, match labels, Dashboards, and an automatic memory-search fallback.

**Architecture:** The JSON directory store remains canonical. A strict, versioned OpenSearch read index serves searches through a stable alias, while a fallback adapter keeps the memory index warm and serves recoverable OpenSearch outages. HTTP, MCP, agent, evaluation, and UI consumers share an asynchronous adapter contract and one normalized filter model.

**Tech Stack:** CommonJS Node.js 16.19+, Node test runner, `@opensearch-project/opensearch`, `dotenv`, OpenSearch 3.8.0, OpenSearch Dashboards 3.8.0, Docker Compose, vanilla HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-03-opensearch-directory-index-design.md`

## Global Constraints

- `data/directory.json` remains the canonical store; OpenSearch is a derived read index.
- OpenSearch is attempted first; memory fallback handles only recoverable availability failures.
- Seed exactly `Architecture`, `Interior Design + Decor`, and `Outdoor + Garden Design`; exclude `Builders + Contractors`.
- Preserve Category, Business Type, and State as exact AND filters.
- Rooms, Project Types, Styles, and Services use one global OR; at least one selection must match, and additional matches raise relevance.
- Every selected-option match returns a structured `matchLabels` item and appears as a result-card label.
- Install explicit `dynamic: strict` mappings and analysis settings before indexing documents.
- Configure native BM25 explicitly with `k1: 1.2`, `b: 0.75`, and `discount_overlaps: true`; test BM25, synonyms, aliases, fuzziness, and autocomplete as separate relevance signals.
- Pin OpenSearch and OpenSearch Dashboards images to `3.8.0`.
- Keep demo security enabled locally and require `OPENSEARCH_INITIAL_ADMIN_PASSWORD`; never commit a password.
- Do not add vectors, embeddings, scraping, or Architectural Digest data.
- Preserve the current uncommitted agent and directory-intelligence work. Review its baseline diff before each overlapping edit, never restore those files from `HEAD`, and stage only explicit paths.
- Use non-force Git operations. The existing remote is `https://github.com/machelslackinlondon/ai-directory-search.git`.

---

## File Structure

### New production files

- `src/server/directory/designTaxonomy.js`: controlled categories, Category/Business Type relationships, facets, states, and canonical-value lookup.
- `src/server/search/searchContract.js`: normalized search filters, preference matching, label encoding, and facet-count helpers shared by both adapters.
- `src/server/search/opensearch/client.js`: official client construction and environment parsing only.
- `src/server/search/opensearch/indexDefinition.js`: schema version, template/index names, analyzers, normalizer, settings, and strict mapping.
- `src/server/search/opensearch/document.js`: canonical entry-to-search-document projection.
- `src/server/search/opensearch/query.js`: OpenSearch request-body and sort construction.
- `src/server/search/opensearch/response.js`: hit, highlight, named-query, aggregation, and error-response parsing.
- `src/server/search/opensearchSearchAdapter.js`: search, stats, bootstrap, Analyze API checks, bulk rebuild, verification, and atomic alias switching.
- `src/server/search/fallbackSearchAdapter.js`: recoverable-error classification, cooldown, OpenSearch-first delegation, and memory fallback metadata.
- `src/server/search/createSearchAdapter.js`: composition root for memory, OpenSearch, and fallback adapters.
- `scripts/opensearch.js`: `wait`, `bootstrap`, `reindex`, and `verify` CLI commands.
- `compose.yml`: local secured OpenSearch and Dashboards services.

### New tests

- `tests/unit/design-taxonomy.test.js`
- `tests/unit/search-contract.test.js`
- `tests/unit/opensearch-index-definition.test.js`
- `tests/unit/opensearch-query.test.js`
- `tests/unit/opensearch-response.test.js`
- `tests/unit/opensearch-adapter.test.js`
- `tests/unit/fallback-search-adapter.test.js`
- `tests/unit/opensearch-compose.test.js`
- `tests/integration/opensearch-live.test.js`: skipped unless `OPENSEARCH_LIVE_TEST=1`.

### Existing files modified by responsibility

- Domain model/data: `src/server/directory/schema.js`, `src/server/directory/taxonomy.js`, `src/server/directory/store.js`, `src/data/seed-directory.json`, import fixtures, evaluation cases, domain-dependent tests.
- Memory parity/async contract: `src/server/search/memorySearchAdapter.js`, `src/server/http.js`, `src/server/mcp/tools.js`, `src/server/agent/agent.js`, `src/server/evals/runEvaluation.js`, `src/server/index.js`, `scripts/index.js`, `scripts/mcp-cli.js`, tests/helpers and direct adapter tests.
- API contracts: `src/server/mcp/contracts.js`, integration tests.
- UI: `public/index.html`, `public/styles.css`, `public/app.js`, `public/renderers.js`, UI-flow tests.
- Operations/config: `package.json`, `package-lock.json`, `.env.example`, `.gitignore` only if an exception is needed for a new example env file.
- Documentation: `README.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/environment.md`, `docs/onboarding.md`, `docs/testing.md`, `docs/taxonomy.md`, `docs/mcp.md`, `docs/evaluation.md`.

---

### Task 1: Replace the Generic Taxonomy and Fixtures

**Files:**
- Create: `src/server/directory/designTaxonomy.js`
- Create: `tests/unit/design-taxonomy.test.js`
- Modify: `src/server/directory/schema.js`
- Modify: `src/server/directory/taxonomy.js`
- Replace: `src/data/seed-directory.json`
- Modify: `tests/fixtures/import.json`
- Modify: `tests/fixtures/import.csv`
- Modify: `tests/unit/validation.test.js`
- Modify: `tests/unit/search-adapter.test.js`
- Modify: `tests/unit/mcp.test.js`
- Modify: `tests/unit/agent.test.js`
- Modify: `tests/unit/directory-intelligence.test.js`
- Modify: `tests/integration/api.test.js`
- Modify: `tests/e2e/search-ui.test.js`
- Modify: `tests/e2e/ask-button-ui.test.js`
- Replace: `evals/queries.json`

**Interfaces:**
- Produces: `DESIGN_CATEGORIES`, `DESIGN_FACETS`, `US_STATES`, `canonicalizeControlledValue(values, input)`, and `businessTypeBelongsToCategory(category, businessType)`.
- Produces canonical entries with `businessType`, `state`, `city`, `rooms`, `projectTypes`, `styles`, and `services` arrays while retaining `taxonomy.subcategory` and `taxonomy.facets` mirrors.
- Consumed by: Tasks 2, 3, 6, and 7.

- [ ] **Step 1: Write failing controlled-taxonomy and validation tests**

```js
// tests/unit/design-taxonomy.test.js
const test = require("node:test");
const assert = require("assert/strict");
const {
  DESIGN_CATEGORIES,
  DESIGN_FACETS,
  businessTypeBelongsToCategory,
  canonicalizeControlledValue
} = require("../../src/server/directory/designTaxonomy");

test("exposes only the three approved design categories", () => {
  assert.deepEqual(DESIGN_CATEGORIES.map(({ category }) => category), [
    "Architecture",
    "Interior Design + Decor",
    "Outdoor + Garden Design"
  ]);
});

test("validates business types against their parent category", () => {
  assert.equal(businessTypeBelongsToCategory("Architecture", "Residential Architect"), true);
  assert.equal(businessTypeBelongsToCategory("Outdoor + Garden Design", "Residential Architect"), false);
});

test("canonicalizes case and accent variations without changing display labels", () => {
  assert.equal(canonicalizeControlledValue(DESIGN_FACETS.services, " full-SERVICE design "), "Full-service Design");
});
```

Append to `tests/unit/validation.test.js`:

```js
test("normalizes a controlled design profile and mirrors taxonomy fields", () => {
  const result = validateAndNormalizeEntry({
    id: "studio-test",
    name: "Studio Test",
    description: "Residential renovation practice.",
    category: "Architecture",
    businessType: "Residential Architect",
    state: "California",
    city: "San Francisco",
    rooms: ["Kitchen"],
    projectTypes: ["Renovation"],
    styles: ["Modern"],
    services: ["Full-service Design"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.entry.location, "San Francisco, California");
  assert.equal(result.entry.taxonomy.subcategory, "Residential Architect");
  assert.deepEqual(result.entry.taxonomy.facets.rooms, ["Kitchen"]);
});

test("rejects a business type outside its category", () => {
  const result = validateAndNormalizeEntry({
    name: "Invalid Studio",
    description: "Invalid taxonomy pair.",
    category: "Outdoor + Garden Design",
    businessType: "Residential Architect",
    state: "Oregon"
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Residential Architect.*Outdoor \+ Garden Design/);
});
```

- [ ] **Step 2: Run the focused tests and verify the missing-module failure**

Run: `node --test tests/unit/design-taxonomy.test.js tests/unit/validation.test.js`

Expected: FAIL with `Cannot find module '../../src/server/directory/designTaxonomy'`.

- [ ] **Step 3: Implement the controlled taxonomy module**

```js
// src/server/directory/designTaxonomy.js
const { normalizeText } = require("../utils/text");

const DESIGN_CATEGORIES = [
  { category: "Architecture", subcategories: ["Building Architect", "Interior Architect", "Residential Architect"] },
  { category: "Interior Design + Decor", subcategories: ["Decorator", "Design Consultant", "Interior Design Consultant", "Interior Designer", "Kitchen Designer", "Stylist"] },
  { category: "Outdoor + Garden Design", subcategories: ["Landscape Architect", "Landscape Designer"] }
];

const DESIGN_FACETS = {
  rooms: ["Kitchen", "Living Room", "Bathroom"],
  projectTypes: ["Renovation", "New Build", "Hospitality"],
  styles: ["Modern", "Traditional", "Eclectic"],
  services: ["Full-service Design", "Consultation"]
};

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming"
];

function canonicalizeControlledValue(values, input) {
  const wanted = normalizeText(input);
  return values.find((value) => normalizeText(value) === wanted) || "";
}

function businessTypeBelongsToCategory(category, businessType) {
  const parent = DESIGN_CATEGORIES.find((item) => item.category === category);
  return Boolean(parent && parent.subcategories.includes(businessType));
}

module.exports = {
  DESIGN_CATEGORIES,
  DESIGN_FACETS,
  US_STATES,
  businessTypeBelongsToCategory,
  canonicalizeControlledValue
};
```

- [ ] **Step 4: Extend schema normalization and validation**

Add the seven new fields to `ENTRY_FIELDS`. Canonicalize Category, Business Type, State, and every facet value against `designTaxonomy.js`. Build `location` from non-empty City and State. Mirror the canonical values into `taxonomy.subcategory` and these exact facet keys:

```js
function normalizeControlledArray(input, allowed, field, errors) {
  return normalizeStringArray(input).map((value) => {
    const canonical = canonicalizeControlledValue(allowed, value);
    if (!canonical) errors.push(`${field} contains unsupported value: ${value}.`);
    return canonical;
  }).filter(Boolean);
}

const normalizedFacets = {
  rooms: normalizeControlledArray(base.rooms || taxonomy.facets?.rooms, DESIGN_FACETS.rooms, "rooms", errors),
  projectTypes: normalizeControlledArray(base.projectTypes || taxonomy.facets?.projectTypes, DESIGN_FACETS.projectTypes, "projectTypes", errors),
  styles: normalizeControlledArray(base.styles || taxonomy.facets?.styles, DESIGN_FACETS.styles, "styles", errors),
  services: normalizeControlledArray(base.services || taxonomy.facets?.services, DESIGN_FACETS.services, "services", errors)
};
```

Return validation errors before normalization for unknown categories, states, facet values, and invalid Category/Business Type pairs. Keep the existing partial-validation behavior for updates.

- [ ] **Step 5: Replace seed data with six project-owned profiles**

Use the existing JSON envelope with `taxonomy.categories`, `taxonomy.facets`, `taxonomy.synonyms`, `taxonomy.relatedTerms`, and `entries`. Seed these exact records and controlled values; descriptions may be used verbatim because they are project-authored:

| ID | Name / Alias | Category / Business Type | City, State | Rooms | Project Types | Styles | Services | Description |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `atelier-north-architecture` | Atelier North Architecture / Atelier North Architects | Architecture / Residential Architect | San Francisco, California | Kitchen; Living Room | Renovation; New Build | Modern; Traditional | Full-service Design; Consultation | Residential architects creating calm modern renovations and new-build homes with carefully detailed kitchens and living spaces. |
| `civic-form-architects` | Civic Form Architects / CFA Studio | Architecture / Building Architect | New York, New York | Living Room | New Build; Hospitality | Modern; Eclectic | Full-service Design | Building architects designing distinctive hospitality and cultural spaces with an adaptable contemporary approach. |
| `harbor-interiors` | Harbor Interiors / Harbor Design | Interior Design + Decor / Interior Designer | Brooklyn, New York | Kitchen; Living Room; Bathroom | Renovation; Hospitality | Modern; Eclectic | Full-service Design; Consultation | Full-service interior designers shaping expressive residential renovations and welcoming boutique hospitality spaces. |
| `hearth-kitchen-studio` | Hearth Kitchen Studio / Hearth Kitchen | Interior Design + Decor / Kitchen Designer | Chicago, Illinois | Kitchen | Renovation | Traditional | Consultation | Kitchen designers specializing in thoughtful traditional renovations, material selection, and practical consultation. |
| `wild-garden-design` | Wild Garden Design / Wild Garden | Outdoor + Garden Design / Landscape Designer | Portland, Oregon | empty | Renovation | Eclectic | Consultation | Landscape designers renewing established gardens with climate-aware planting and relaxed outdoor gathering spaces. |
| `terrain-landscape-architects` | Terrain Landscape Architects / TLA Studio | Outdoor + Garden Design / Landscape Architect | Austin, Texas | empty | New Build; Hospitality | Modern | Full-service Design | Landscape architects planning modern new-build estates and hospitality grounds from early site strategy through installation. |

Give every record tags, aliases, dates, a project-owned `example.com` URL/contact, and taxonomy mirrors. Use global synonym rules for the four synonym groups approved in the spec.

- [ ] **Step 6: Update fixtures, evaluations, and old-ID assertions**

Replace old generic queries with these stable expectations:

```json
[
  { "query": "modern residential architecture renovation", "expectedIds": ["atelier-north-architecture"] },
  { "query": "traditional kitchen consultation", "expectedIds": ["hearth-kitchen-studio"] },
  { "query": "eclectic hospitality interiors", "expectedIds": ["harbor-interiors"] },
  { "query": "modern hospitality landscape new construction", "expectedIds": ["terrain-landscape-architects"] },
  { "query": "climate aware garden renewal", "expectedIds": ["wild-garden-design"] }
]
```

Update API, MCP, agent, autocomplete, renderer, and search tests to use the six IDs above. For the existing autocomplete work, use `kit des chi` and assert a `Kitchen Designer` or `Chicago` suggestion. Do not remove its route-classification or formatting assertions.

- [ ] **Step 7: Run the full suite and evaluation**

Run: `npm test`

Expected: all tests PASS with no generic seed IDs.

Run: `npm run eval`

Expected: five cases, non-zero top-1/top-3 accuracy, and no thrown errors.

- [ ] **Step 8: Commit the taxonomy migration explicitly**

```bash
git add src/server/directory/designTaxonomy.js src/server/directory/schema.js src/server/directory/taxonomy.js src/data/seed-directory.json tests/fixtures/import.json tests/fixtures/import.csv tests/unit/design-taxonomy.test.js tests/unit/validation.test.js tests/unit/search-adapter.test.js tests/unit/mcp.test.js tests/unit/agent.test.js tests/unit/directory-intelligence.test.js tests/integration/api.test.js tests/e2e/search-ui.test.js tests/e2e/ask-button-ui.test.js evals/queries.json
git commit -m "feat: migrate directory to design professionals"
```

---

### Task 2: Define Search Semantics and Make the Memory Contract Asynchronous

**Files:**
- Create: `src/server/search/searchContract.js`
- Create: `tests/unit/search-contract.test.js`
- Modify: `src/server/search/memorySearchAdapter.js`
- Modify: `tests/unit/search-adapter.test.js`
- Modify: `src/server/http.js`
- Modify: `src/server/mcp/tools.js`
- Modify: `src/server/agent/agent.js`
- Modify: `src/server/evals/runEvaluation.js`
- Modify: `src/server/index.js`
- Modify: `scripts/index.js`
- Modify: `scripts/mcp-cli.js`
- Modify: `tests/helpers.js`
- Modify: every test that calls adapter methods directly

**Interfaces:**
- Produces: `PRIMARY_FILTER_FIELDS`, `PREFERENCE_FILTER_FIELDS`, `normalizeKeyword(value)`, `normalizeSearchFilters(filters)`, `entryMatchesPrimaryFilters(entry, filters)`, `entryMatchesAnyPreference(entry, filters)`, `buildMatchLabels(entry, filters)`, and `buildFacetCounts(entries, taxonomy)`.
- Changes adapter methods `search`, `getEntry`, `listCategories`, `reindex`, and `stats` to promise-returning methods.
- Consumed by: Tasks 3 through 9.

- [ ] **Step 1: Write failing OR-semantics and label tests**

```js
// tests/unit/search-contract.test.js
const test = require("node:test");
const assert = require("assert/strict");
const seed = require("../../src/data/seed-directory.json");
const {
  buildMatchLabels,
  entryMatchesAnyPreference,
  normalizeKeyword,
  normalizeSearchFilters
} = require("../../src/server/search/searchContract");

test("normalizes comma and array preference values", () => {
  const filters = normalizeSearchFilters({ rooms: "Kitchen,Bathroom", styles: ["Modern"] });
  assert.deepEqual(filters.rooms, ["Kitchen", "Bathroom"]);
  assert.deepEqual(filters.styles, ["Modern"]);
  assert.equal(normalizeKeyword(" Intérieur Design + Decor "), "interieur design + decor");
});

test("uses one global OR across preference groups", () => {
  const atelier = seed.entries.find(({ id }) => id === "atelier-north-architecture");
  assert.equal(entryMatchesAnyPreference(atelier, {
    rooms: ["Bathroom"],
    styles: ["Modern"]
  }), true);
});

test("returns structured labels only for selected values that matched", () => {
  const atelier = seed.entries.find(({ id }) => id === "atelier-north-architecture");
  assert.deepEqual(buildMatchLabels(atelier, {
    rooms: ["Kitchen", "Bathroom"],
    styles: ["Modern"]
  }), [
    { facet: "rooms", value: "kitchen", label: "Kitchen" },
    { facet: "styles", value: "modern", label: "Modern" }
  ]);
});
```

Append an async parity test to `tests/unit/search-adapter.test.js`:

```js
test("preference matches use OR, boost additional matches, and expose baseline counts", async () => {
  const { searchAdapter } = createTestContext();
  const response = await searchAdapter.search({
    query: "",
    filters: { rooms: ["Kitchen"], styles: ["Modern"] }
  });
  assert.ok(response.results.every(({ matchLabels }) => matchLabels.length >= 1));
  assert.equal(response.results[0].id, "atelier-north-architecture");
  assert.ok(response.facets.rooms.some(({ label, count }) => label === "Kitchen" && count > 0));
  assert.equal(response.backend, "memory");
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/unit/search-contract.test.js tests/unit/search-adapter.test.js`

Expected: FAIL because `searchContract.js` does not exist and adapter results do not contain `matchLabels` or `facets`.

- [ ] **Step 3: Implement the shared search contract**

```js
const { DESIGN_FACETS, US_STATES } = require("../directory/designTaxonomy");
const { normalizeText, unique } = require("../utils/text");

const PRIMARY_FILTER_FIELDS = ["category", "businessType", "state"];
const PREFERENCE_FILTER_FIELDS = ["rooms", "projectTypes", "styles", "services"];

function asValues(value) {
  return unique((Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean));
}

function normalizeKeyword(value) {
  return String(value || "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSearchFilters(filters = {}) {
  return {
    category: String(filters.category || ""),
    businessType: String(filters.businessType || filters.subcategory || ""),
    state: String(filters.state || ""),
    tags: asValues(filters.tags),
    rooms: asValues(filters.rooms),
    projectTypes: asValues(filters.projectTypes),
    styles: asValues(filters.styles),
    services: asValues(filters.services)
  };
}

function entryValues(entry, field) {
  const value = entry[field] || entry.taxonomy?.facets?.[field] || [];
  return asValues(value);
}

function selectedPreferences(filters) {
  const normalized = normalizeSearchFilters(filters);
  return PREFERENCE_FILTER_FIELDS.flatMap((facet) => normalized[facet].map((label) => ({ facet, label })));
}

function entryMatchesAnyPreference(entry, filters) {
  const selected = selectedPreferences(filters);
  if (selected.length === 0) return true;
  return selected.some(({ facet, label }) => entryValues(entry, facet).some((value) => normalizeText(value) === normalizeText(label)));
}

function buildMatchLabels(entry, filters) {
  return selectedPreferences(filters)
    .filter(({ facet, label }) => entryValues(entry, facet).some((value) => normalizeText(value) === normalizeText(label)))
    .map(({ facet, label }) => ({ facet, value: normalizeText(label).replace(/\s+/g, "-"), label }));
}

function entryScalar(entry, field) {
  if (field === "businessType") return entry.businessType || entry.taxonomy?.subcategory || "";
  return entry[field] || "";
}

function entryMatchesPrimaryFilters(entry, filters) {
  const normalized = normalizeSearchFilters(filters);
  const primaryMatch = PRIMARY_FILTER_FIELDS.every((field) =>
    !normalized[field] || normalizeText(entryScalar(entry, field)) === normalizeText(normalized[field])
  );
  const entryTags = entryValues(entry, "tags").map(normalizeText);
  return primaryMatch && normalized.tags.every((tag) => entryTags.includes(normalizeText(tag)));
}

function buildFacetCounts(entries, taxonomy = {}) {
  const labelsByField = {
    category: (taxonomy.categories || []).map(({ category }) => category),
    businessType: (taxonomy.categories || []).flatMap(({ subcategories }) => subcategories || []),
    state: US_STATES,
    ...DESIGN_FACETS
  };
  return Object.fromEntries(Object.entries(labelsByField).map(([field, labels]) => [
    field,
    unique(labels).map((label) => ({
      value: normalizeText(label).replace(/\s+/g, "-"),
      label,
      count: entries.filter((entry) => {
        const values = PRIMARY_FILTER_FIELDS.includes(field) ? [entryScalar(entry, field)] : entryValues(entry, field);
        return values.some((value) => normalizeText(value) === normalizeText(label));
      }).length
    }))
  ]));
}

module.exports = {
  PRIMARY_FILTER_FIELDS,
  PREFERENCE_FILTER_FIELDS,
  buildFacetCounts,
  buildMatchLabels,
  entryMatchesAnyPreference,
  entryMatchesPrimaryFilters,
  normalizeKeyword,
  normalizeSearchFilters
};
```

- [ ] **Step 4: Give the memory adapter domain parity**

Use shared normalization for primary fields and preference arrays. Apply Category, Business Type, State, and legacy tags before scoring; then exclude entries that match none of the selected preferences. Add `4 * matchLabels.length` to the score. Build facet counts from entries matching the free-text query and primary filters before applying preferences. Return this stable metadata:

```js
return {
  query,
  mode: semanticEnabled() ? mode : "keyword",
  filters,
  sort,
  total,
  tookMs,
  backend: "memory",
  fallback: false,
  facets,
  results
};
```

Keep a synchronous private `rebuildIndex()` for constructor initialization, but expose promise-returning public methods:

```js
async function reindex() {
  return rebuildIndex();
}

return {
  name: "memory",
  async getEntry(id) { return store.getEntry(id); },
  async listCategories() { return store.getTaxonomy().categories; },
  reindex,
  async search(params) { return runSearch(params); },
  async stats() { return makeStats(); }
};
```

- [ ] **Step 5: Await the adapter contract everywhere**

Make API route handlers, MCP handlers, agent direct searches/stats, evaluation searches, startup logging, index scripts, and tests await their calls. In the pre-existing `executeSearch` agent function, fix both promise-sensitive branches:

```js
return await context.searchAdapter.search(params);
```

and:

```js
const suggestedSearch = await context.searchAdapter.search({
  ...params,
  query: suggestions[0].label
});
```

Change `createTestContext` to remain synchronous but return an async adapter; callers await operations. Change the server listen callback to an async function with a caught logging error so a failed stats call cannot create an unhandled rejection.

- [ ] **Step 6: Run all tests and evaluation**

Run: `npm test`

Expected: all tests PASS, including the existing directory-intelligence tests.

Run: `npm run eval`

Expected: completes successfully and prints five rows.

- [ ] **Step 7: Commit the asynchronous memory contract**

```bash
git add src/server/search/searchContract.js src/server/search/memorySearchAdapter.js src/server/http.js src/server/mcp/tools.js src/server/agent/agent.js src/server/evals/runEvaluation.js src/server/index.js scripts/index.js scripts/mcp-cli.js tests/helpers.js tests/unit/search-contract.test.js tests/unit/search-adapter.test.js tests/unit/agent.test.js tests/unit/mcp.test.js tests/integration/api.test.js tests/e2e/search-ui.test.js tests/e2e/ask-button-ui.test.js
git commit -m "refactor: make search adapters asynchronous"
```

---

### Task 3: Define OpenSearch Mapping, Documents, Queries, and Responses

**Files:**
- Create: `src/server/search/opensearch/indexDefinition.js`
- Create: `src/server/search/opensearch/document.js`
- Create: `src/server/search/opensearch/query.js`
- Create: `src/server/search/opensearch/response.js`
- Create: `tests/unit/opensearch-index-definition.test.js`
- Create: `tests/unit/opensearch-query.test.js`
- Create: `tests/unit/opensearch-response.test.js`

**Interfaces:**
- Produces: `SCHEMA_VERSION`, `TEMPLATE_NAME`, `INDEX_PATTERN`, `DEFAULT_INDEX_ALIAS`, `INDEX_TEMPLATE`, `ANALYZE_CASES`, `makePhysicalIndexName(now)`.
- Produces: `toSearchDocument(entry)`.
- Produces: `buildSearchBody(params)` and `buildSort(sort)`.
- Produces: `parseSearchResponse(response, params, taxonomy, metadata)` and `decodePreferenceQueryName(name, taxonomy)`.
- Consumed by: Task 4.

- [ ] **Step 1: Write failing index-definition tests**

```js
const test = require("node:test");
const assert = require("assert/strict");
const {
  INDEX_TEMPLATE,
  SCHEMA_VERSION,
  makePhysicalIndexName
} = require("../../src/server/search/opensearch/indexDefinition");

test("defines strict mappings and the approved analysis components", () => {
  const template = INDEX_TEMPLATE.template;
  assert.equal(template.mappings.dynamic, "strict");
  assert.equal(template.mappings._meta.schema_version, SCHEMA_VERSION);
  assert.equal(template.settings.number_of_shards, 1);
  assert.equal(template.settings.number_of_replicas, 0);
  assert.deepEqual(template.settings.similarity.default, {
    type: "BM25", k1: 1.2, b: 0.75, discount_overlaps: true
  });
  assert.deepEqual(template.settings.analysis.analyzer.directory_text.filter, ["lowercase", "asciifolding"]);
  assert.equal(template.settings.analysis.filter.directory_synonyms.type, "synonym_graph");
  assert.equal(template.settings.analysis.tokenizer.directory_autocomplete.type, "edge_ngram");
  assert.equal(template.mappings.properties.profile.enabled, false);
});

test("creates deterministic versioned physical names", () => {
  assert.equal(makePhysicalIndexName(new Date("2026-09-03T12:34:56.000Z")), "directory-profiles-v1-20260903123456");
});
```

- [ ] **Step 2: Write failing query and response tests**

```js
// tests/unit/opensearch-query.test.js
const test = require("node:test");
const assert = require("assert/strict");
const { buildSearchBody } = require("../../src/server/search/opensearch/query");

test("builds BM25 fields, fuzzy and autocomplete clauses, primary AND filters, and one preference OR", () => {
  const body = buildSearchBody({
    query: "modern renovation",
    filters: {
      category: "Architecture",
      state: "California",
      rooms: ["Kitchen", "Bathroom"],
      services: ["Consultation"]
    },
    limit: 20,
    offset: 0,
    sort: "relevance"
  });

  assert.deepEqual(body.query.bool.filter, [
    { term: { category: "architecture" } },
    { term: { state: "california" } }
  ]);
  assert.equal(body.query.bool.should.length, 3);
  assert.equal(body.post_filter.bool.minimum_should_match, 1);
  assert.equal(body.post_filter.bool.should.length, 3);
  const lexical = body.query.bool.must[0].bool.should;
  const fuzzy = lexical.find((clause) => clause.multi_match?.fuzziness === "AUTO");
  const autocomplete = lexical.find((clause) => clause.multi_match?.fields?.includes("name.autocomplete^3"));
  assert.ok(fuzzy.multi_match.fields.includes("aliases^7"));
  assert.ok(fuzzy.multi_match.fields.includes("rooms.search^3"));
  assert.ok(autocomplete);
});
```

```js
// tests/unit/opensearch-response.test.js
const test = require("node:test");
const assert = require("assert/strict");
const seed = require("../../src/data/seed-directory.json");
const { collectTaxonomy } = require("../../src/server/directory/taxonomy");
const { parseSearchResponse } = require("../../src/server/search/opensearch/response");
const taxonomy = collectTaxonomy(seed.entries, seed.taxonomy);

test("parses matched queries into labels and normalized aggregations into display labels", () => {
  const parsed = parseSearchResponse({ body: {
    took: 7,
    hits: { total: { value: 1 }, hits: [{
      _id: "atelier-north-architecture",
      _score: 12.5,
      _source: { profile: seed.entries[0] },
      matched_queries: ["preference__rooms__kitchen", "preference__styles__modern"],
      highlight: { description: ["Residential <em>renovation</em> practice"] }
    }] },
    aggregations: { rooms: { buckets: [{ key: "kitchen", doc_count: 3 }] } }
  } }, { filters: { rooms: ["Kitchen"], styles: ["Modern"] } }, taxonomy, {
    backend: "opensearch", fallback: false
  });

  assert.deepEqual(parsed.results[0].matchLabels.map(({ label }) => label), ["Kitchen", "Modern"]);
  assert.equal(parsed.facets.rooms[0].label, "Kitchen");
  assert.equal(parsed.backend, "opensearch");
});
```

- [ ] **Step 3: Run the focused tests and verify missing-module failures**

Run: `node --test tests/unit/opensearch-index-definition.test.js tests/unit/opensearch-query.test.js tests/unit/opensearch-response.test.js`

Expected: FAIL because the four OpenSearch modules do not exist.

- [ ] **Step 4: Implement the versioned index template**

Define settings with these exact analysis names and responsibilities:

```js
const analysis = {
  char_filter: {},
  tokenizer: {
    directory_autocomplete: { type: "edge_ngram", min_gram: 2, max_gram: 20, token_chars: ["letter", "digit"] }
  },
  filter: {
    directory_light_stemmer: { type: "stemmer", language: "light_english" },
    directory_synonyms: {
      type: "synonym_graph",
      lenient: false,
      synonyms: [
        "remodel, remodeling, renovation",
        "new build, new construction",
        "outdoor design, garden design, landscape design",
        "full service design, full-service design"
      ]
    }
  },
  analyzer: {
    directory_text: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding"] },
    directory_description_index: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding", "directory_light_stemmer"] },
    directory_description_search: { type: "custom", tokenizer: "standard", filter: ["lowercase", "asciifolding", "directory_synonyms", "directory_light_stemmer"] },
    directory_autocomplete: { type: "custom", tokenizer: "directory_autocomplete", filter: ["lowercase", "asciifolding"] }
  },
  normalizer: {
    directory_keyword: { type: "custom", filter: ["trim", "lowercase", "asciifolding"] }
  }
};
```

Place the analyzers in settings with an explicit native BM25 default:

```js
const settings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  similarity: {
    default: { type: "BM25", k1: 1.2, b: 0.75, discount_overlaps: true }
  },
  analysis
};
```

Map all fields listed in the spec. Use reusable builders in this same file:

```js
const searchableKeyword = {
  type: "keyword",
  normalizer: "directory_keyword",
  fields: { search: { type: "text", analyzer: "directory_text" } }
};

const name = {
  type: "text",
  analyzer: "directory_text",
  fields: {
    sort: { type: "keyword", normalizer: "directory_keyword" },
    autocomplete: { type: "text", analyzer: "directory_autocomplete", search_analyzer: "directory_text" }
  }
};

const aliases = {
  type: "text",
  analyzer: "directory_text",
  fields: {
    autocomplete: { type: "text", analyzer: "directory_autocomplete", search_analyzer: "directory_text" }
  }
};

const description = {
  type: "text",
  analyzer: "directory_description_index",
  search_analyzer: "directory_description_search"
};
```

Use `searchableKeyword` for Category, Business Type, State, City, tags, Rooms, Project Types, Styles, and Services. Their primary value remains a normalized keyword for exact filters and aggregations while `.search` participates in BM25 full-text ranking.

Set `index_patterns: ["directory-profiles-v1-*"]`, `priority: 100`, one shard, zero replicas, strict mappings, `_meta.schema_version: 1`, and a non-indexed `profile` object. `ANALYZE_CASES` contains exact expected tokens for case/accents, stemming, synonym graphs, and prefixes.

- [ ] **Step 5: Implement document projection**

```js
function toSearchDocument(entry) {
  const taxonomy = entry.taxonomy || {};
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    businessType: entry.businessType || taxonomy.subcategory || "",
    state: entry.state || "",
    city: entry.city || "",
    tags: entry.tags || [],
    rooms: entry.rooms || taxonomy.facets?.rooms || [],
    projectTypes: entry.projectTypes || taxonomy.facets?.projectTypes || [],
    styles: entry.styles || taxonomy.facets?.styles || [],
    services: entry.services || taxonomy.facets?.services || [],
    aliases: taxonomy.aliases || [],
    synonyms: taxonomy.synonyms || [],
    relatedTerms: taxonomy.relatedTerms || [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    profile: entry
  };
}
```

- [ ] **Step 6: Implement query construction**

Use normalized filters and `normalizeKeyword` from `searchContract.js`. Pass every exact term filter and aggregation selection through `normalizeKeyword` so it matches the field normalizer while retaining punctuation such as the `+` in `Interior Design + Decor`. For non-empty text, build a Boolean `must` containing a nested `should` with a high-boost `match_phrase` on `name` and this multi-match:

```js
{
  multi_match: {
    query,
    type: "best_fields",
    tie_breaker: 0.3,
    fuzziness: "AUTO",
    prefix_length: 1,
    fields: [
      "name^8", "aliases^7", "businessType.search^6", "category.search^5",
      "tags.search^5", "description^3", "rooms.search^3", "projectTypes.search^3",
      "styles.search^3", "services.search^3", "synonyms^2", "relatedTerms"
    ]
  }
}
```

Add a lower-boost autocomplete clause beside the phrase and fuzzy clauses:

```js
{
  multi_match: {
    query,
    type: "best_fields",
    fields: ["name.autocomplete^3", "aliases.autocomplete^2"]
  }
}
```

Set `minimum_should_match: 1` on this nested lexical Boolean. For each selected preference, add a named constant-score term clause to `query.bool.should`, with `_name` encoded as `preference__<facet>__<slug>` and boost `4`. Copy equivalent term clauses to `post_filter.bool.should` with `minimum_should_match: 1`. If no preference is selected, omit `post_filter`. Add terms aggregations for all seven primary/preference dimensions with sufficient size for controlled values.

Implement sorts exactly as `relevance -> _score desc, name.sort asc`, `name -> name.sort asc`, `newest -> createdAt desc`, `updated -> updatedAt desc`, and `category -> category asc, name.sort asc`.

- [ ] **Step 7: Implement response parsing**

Support both `client.search()` wrappers (`response.body`) and plain test bodies. Parse exact total values, hit profile payloads, scores, highlights, and `matched_queries`. Decode only names beginning `preference__`; map slugs and aggregation keys back to canonical taxonomy labels. Return the existing result envelope plus `backend`, `fallback`, `fallbackReason`, `facets`, and structured `matchLabels`.

- [ ] **Step 8: Run focused and full tests**

Run: `node --test tests/unit/opensearch-index-definition.test.js tests/unit/opensearch-query.test.js tests/unit/opensearch-response.test.js`

Expected: all focused tests PASS.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 9: Commit the OpenSearch primitives**

```bash
git add src/server/search/opensearch/indexDefinition.js src/server/search/opensearch/document.js src/server/search/opensearch/query.js src/server/search/opensearch/response.js tests/unit/opensearch-index-definition.test.js tests/unit/opensearch-query.test.js tests/unit/opensearch-response.test.js
git commit -m "feat: define OpenSearch directory index"
```

---

### Task 4: Add the OpenSearch Client, Bootstrap, and Versioned Reindex Adapter

**Files:**
- Create: `src/server/search/opensearch/client.js`
- Create: `src/server/search/opensearchSearchAdapter.js`
- Create: `tests/unit/opensearch-adapter.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes all Task 3 exports.
- Produces: `createOpenSearchClient(options)`, `readOpenSearchConfig(env)`, `createOpenSearchSearchAdapter(store, options)`.
- Adapter adds operational methods `waitForReady()`, `bootstrap()`, and `verify()` while retaining the five shared adapter methods.
- Consumed by: Tasks 5 and 8.

- [ ] **Step 1: Install runtime dependencies**

Run: `npm install @opensearch-project/opensearch dotenv`

Expected: `package.json` and `package-lock.json` record both production dependencies with integrity hashes.

- [ ] **Step 2: Write a failing lifecycle test with a controlled client**

Create a fake client that records `indices.putIndexTemplate`, `indices.create`, `indices.analyze`, `helpers.bulk`, `count`, and `indices.updateAliases` calls. Add this central test:

```js
const test = require("node:test");
const assert = require("assert/strict");
const seed = require("../../src/data/seed-directory.json");
const { createMemoryDirectoryStore } = require("../../src/server/directory/store");
const { ANALYZE_CASES } = require("../../src/server/search/opensearch/indexDefinition");
const { createOpenSearchSearchAdapter } = require("../../src/server/search/opensearchSearchAdapter");

const store = createMemoryDirectoryStore(seed);

function makeClientDouble(calls, options = {}) {
  function record(method, result) {
    return async (args) => {
      calls.push({ method, args });
      return typeof result === "function" ? result(args) : result;
    };
  }

  return {
    cluster: { health: record("cluster.health", { body: { status: "yellow" } }) },
    indices: {
      putIndexTemplate: record("indices.putIndexTemplate", { body: { acknowledged: true } }),
      existsAlias: record("indices.existsAlias", { body: Boolean(options.aliasExists) }),
      create: record("indices.create", { body: { acknowledged: true } }),
      analyze: record("indices.analyze", ({ body }) => {
        const sample = ANALYZE_CASES.find(({ analyzer, text }) => analyzer === body.analyzer && text === body.text);
        return { body: { tokens: (sample?.expected || []).map((token) => ({ token })) } };
      }),
      getAlias: record("indices.getAlias", { body: options.aliasExists ? { "directory-profiles-v1-old": { aliases: { "directory-profiles": {} } } } : {} }),
      updateAliases: record("indices.updateAliases", { body: { acknowledged: true } }),
      getMapping: record("indices.getMapping", { body: { "directory-profiles-v1-old": { mappings: { _meta: { schema_version: 1 } } } } })
    },
    helpers: {
      bulk: record("helpers.bulk", {
        successful: store.listEntries().length - (options.bulkFailed || 0),
        failed: options.bulkFailed || 0
      })
    },
    count: record("count", { body: { count: store.listEntries().length } }),
    search: record("search", { body: { took: 1, hits: { total: { value: 0 }, hits: [] }, aggregations: {} } }),
    close: record("close", undefined)
  };
}

test("bootstrap installs the template before creating the first physical index", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { aliasExists: false });
  const adapter = createOpenSearchSearchAdapter(store, {
    client,
    now: () => new Date("2026-09-03T12:34:56.000Z")
  });

  const result = await adapter.bootstrap();

  assert.deepEqual(calls.filter(({ method }) => ["indices.putIndexTemplate", "indices.create"].includes(method)).map(({ method }) => method), [
    "indices.putIndexTemplate",
    "indices.create"
  ]);
  assert.equal(result.alias, "directory-profiles");
  assert.equal(result.physicalIndex, "directory-profiles-v1-20260903123456");
});

test("reindex refuses to switch the alias after a bulk drop", async () => {
  const calls = [];
  const client = makeClientDouble(calls, { bulkFailed: 1 });
  const adapter = createOpenSearchSearchAdapter(store, { client });
  await assert.rejects(adapter.reindex(), /1 document.*failed/);
  assert.equal(calls.some(({ method }) => method === "indices.updateAliases"), false);
});
```

- [ ] **Step 3: Run the lifecycle test and verify failure**

Run: `node --test tests/unit/opensearch-adapter.test.js`

Expected: FAIL because `opensearchSearchAdapter.js` does not exist.

- [ ] **Step 4: Implement client configuration**

```js
const fs = require("fs");
const { Client } = require("@opensearch-project/opensearch");

function readOpenSearchConfig(env = process.env) {
  return {
    node: env.OPENSEARCH_NODE || "https://127.0.0.1:9200",
    username: env.OPENSEARCH_USERNAME || "admin",
    password: env.OPENSEARCH_PASSWORD || env.OPENSEARCH_INITIAL_ADMIN_PASSWORD || "",
    indexAlias: env.OPENSEARCH_INDEX_ALIAS || "directory-profiles",
    requestTimeout: Number(env.OPENSEARCH_REQUEST_TIMEOUT_MS) || 2000,
    rejectUnauthorized: env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED !== "false",
    caPath: env.OPENSEARCH_CA_PATH || ""
  };
}

function createOpenSearchClient(options = {}) {
  const config = { ...readOpenSearchConfig(options.env), ...options };
  return new Client({
    node: config.node,
    auth: { username: config.username, password: config.password },
    requestTimeout: config.requestTimeout,
    ssl: {
      rejectUnauthorized: config.rejectUnauthorized,
      ...(config.caPath ? { ca: fs.readFileSync(config.caPath) } : {})
    }
  });
}
```

Throw a configuration error if a username is present without a password. Never include the supplied password in error text or stats.

- [ ] **Step 5: Implement bootstrap and analyzer verification**

`bootstrap()` must call `indices.putIndexTemplate` first, create the first physical index only when the alias is absent, then analyze every `ANALYZE_CASES` case against that physical index. Compare returned tokens to exact expectations and throw `OPENSEARCH_ANALYZER_MISMATCH` on a mismatch. Attach the stable alias only after all analyzer checks pass.

Use client response unwrapping compatible with `response.body` and direct bodies:

```js
function bodyOf(response) {
  return response && response.body !== undefined ? response.body : response;
}
```

- [ ] **Step 6: Implement versioned full reindex**

Create the new physical index, project every canonical entry through `toSearchDocument`, and bulk index with stable `_id` values:

```js
const dropped = [];
const bulk = await client.helpers.bulk({
  datasource: store.listEntries(),
  refreshOnCompletion: true,
  onDocument(entry) {
    return [{ index: { _index: physicalIndex, _id: entry.id } }, toSearchDocument(entry)];
  },
  onDrop(document) {
    dropped.push({ id: document.document?.id || "unknown", error: document.error?.reason || "bulk drop" });
  }
});
```

Treat `bulk.failed > 0` or `dropped.length > 0` as failure. Verify `client.count({index: physicalIndex})` equals `store.listEntries().length`. Read current alias targets, then call one atomic `indices.updateAliases` request containing remove actions for old targets and one add action for the new index. Retain old physical indexes.

- [ ] **Step 7: Implement search, stats, and verification**

- `search(params)` calls `client.search({index: alias, body: buildSearchBody(params)})` and parses it with Task 3.
- `getEntry(id)` reads `_source.profile` through the alias and returns `null` only for a 404.
- `listCategories()` returns canonical store taxonomy.
- `stats()` combines cluster health, alias targets, count, schema version, and last successful reindex without credentials.
- `verify()` asserts the alias has one target, mapping schema version is `1`, and count matches the canonical store.
- `waitForReady()` retries cluster health until a bounded deadline with 500 ms intervals.
- `close()` invokes `client.close()` when supplied by the client.

- [ ] **Step 8: Run lifecycle and full tests**

Run: `node --test tests/unit/opensearch-adapter.test.js`

Expected: all lifecycle tests PASS, including ordering, analyzer failure, bulk failure, count mismatch, and atomic alias actions.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 9: Commit the OpenSearch adapter**

```bash
git add package.json package-lock.json src/server/search/opensearch/client.js src/server/search/opensearchSearchAdapter.js tests/unit/opensearch-adapter.test.js
git commit -m "feat: add versioned OpenSearch adapter"
```

---

### Task 5: Add Recoverable Fallback and Default OpenSearch Composition

**Files:**
- Create: `src/server/search/fallbackSearchAdapter.js`
- Create: `src/server/search/createSearchAdapter.js`
- Create: `tests/unit/fallback-search-adapter.test.js`
- Modify: `src/server/http.js`
- Modify: `tests/helpers.js`

**Interfaces:**
- Produces: `isRecoverableOpenSearchError(error)` and `createFallbackSearchAdapter(primary, memory, options)`.
- Produces: `createSearchAdapter(store, options)` with OpenSearch-first default and explicit `backend: "memory"` support for tests.
- Consumed by: all application entry points and Task 6.

- [ ] **Step 1: Write failing fallback classification and cooldown tests**

```js
const test = require("node:test");
const assert = require("assert/strict");
const { createFallbackSearchAdapter } = require("../../src/server/search/fallbackSearchAdapter");

function makeAdapter(overrides = {}) {
  return {
    async search() { return { backend: "memory", fallback: false, results: [], total: 0 }; },
    async getEntry() { return null; },
    async listCategories() { return []; },
    async reindex() { return { entries: 0 }; },
    async stats() { return { entries: 0 }; },
    async close() {},
    ...overrides
  };
}

test("falls back on transport failure and probes after cooldown", async () => {
  let now = 1_000;
  let primaryCalls = 0;
  const primary = makeAdapter({
    async search() {
      primaryCalls += 1;
      if (primaryCalls === 1) throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      return { backend: "opensearch", fallback: false, results: [], total: 0 };
    }
  });
  const memory = makeAdapter({
    async search() { return { backend: "memory", fallback: false, results: [], total: 0 }; }
  });
  const adapter = createFallbackSearchAdapter(primary, memory, { now: () => now, cooldownMs: 30_000 });

  const first = await adapter.search({ query: "modern" });
  const second = await adapter.search({ query: "modern" });
  now += 30_001;
  const third = await adapter.search({ query: "modern" });

  assert.equal(first.fallback, true);
  assert.equal(second.backend, "memory");
  assert.equal(primaryCalls, 2);
  assert.equal(third.backend, "opensearch");
});

test("does not hide authentication or malformed-query errors", async () => {
  for (const statusCode of [400, 401, 403]) {
    const adapter = createFallbackSearchAdapter(
      makeAdapter({ async search() { throw Object.assign(new Error("bad request"), { statusCode }); } }),
      makeAdapter()
    );
    await assert.rejects(adapter.search({ query: "x" }), /bad request/);
  }
});
```

- [ ] **Step 2: Run the fallback tests and verify failure**

Run: `node --test tests/unit/fallback-search-adapter.test.js`

Expected: FAIL because `fallbackSearchAdapter.js` does not exist.

- [ ] **Step 3: Implement recoverable classification and cooldown**

Treat these as recoverable:

```js
const RECOVERABLE_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT",
  "OPENSEARCH_INDEX_MISSING", "OPENSEARCH_ALIAS_MISSING"
]);
const RECOVERABLE_STATUS = new Set([429, 502, 503, 504]);
```

Extract status from `error.statusCode`, `error.meta?.statusCode`, or `error.meta?.body?.status`. On fallback, copy the memory result and overwrite only:

```js
{
  ...memoryResult,
  backend: "memory",
  fallback: true,
  fallbackReason: stableReasonCode(error)
}
```

During cooldown, use `OPENSEARCH_COOLDOWN` as the stable reason. Re-probe once the injected clock reaches `unavailableUntil`.

- [ ] **Step 4: Make reindex preserve a warm memory backend**

`fallback.reindex()` awaits memory reindex first. It then attempts OpenSearch. A recoverable OpenSearch error returns memory stats with degraded metadata; a validation, mapping, or authentication error is thrown. `stats()` always returns memory state and best-effort primary state plus cooldown metadata.

- [ ] **Step 5: Add the adapter composition root**

```js
function createSearchAdapter(store, options = {}) {
  const memory = options.memoryAdapter || createMemorySearchAdapter(store, options.memoryOptions);
  const backend = options.backend || process.env.SEARCH_BACKEND || "opensearch";
  if (backend === "memory") return memory;
  if (backend !== "opensearch") throw new Error(`Unsupported SEARCH_BACKEND: ${backend}`);
  const primary = options.openSearchAdapter || createOpenSearchSearchAdapter(store, {
    client: options.openSearchClient,
    ...options.openSearchOptions
  });
  return createFallbackSearchAdapter(primary, memory, {
    cooldownMs: options.cooldownMs || Number(process.env.OPENSEARCH_FALLBACK_COOLDOWN_MS) || 30_000,
    now: options.now
  });
}
```

Change `createContext` to use this factory by default. Tests continue to inject `backend: "memory"` through `createTestContext`, so normal tests never contact localhost.

- [ ] **Step 6: Run focused, integration, and full tests**

Run: `node --test tests/unit/fallback-search-adapter.test.js tests/integration/api.test.js`

Expected: all focused tests PASS and the test API reports `backend: "memory"`, `fallback: false`.

Run: `npm test`

Expected: all tests PASS without OpenSearch running.

- [ ] **Step 7: Commit fallback composition**

```bash
git add src/server/search/fallbackSearchAdapter.js src/server/search/createSearchAdapter.js src/server/http.js tests/helpers.js tests/unit/fallback-search-adapter.test.js tests/integration/api.test.js
git commit -m "feat: add OpenSearch memory fallback"
```

---

### Task 6: Expose the Domain Filters Through HTTP, MCP, Agent, and Admin Flows

**Files:**
- Modify: `src/server/http.js`
- Modify: `src/server/mcp/contracts.js`
- Modify: `src/server/mcp/tools.js`
- Modify: `src/server/agent/agent.js`
- Modify: `src/server/agent/directoryIntelligence.js`
- Modify: `tests/integration/api.test.js`
- Modify: `tests/unit/mcp.test.js`
- Modify: `tests/unit/agent.test.js`
- Modify: `tests/unit/directory-intelligence.test.js`

**Interfaces:**
- Consumes Task 2 canonical filter names and asynchronous adapters.
- Produces GET query support for `businessType`, `state`, `rooms`, `projectTypes`, `styles`, and `services`.
- Produces MCP filter schemas for the same names and returns backend/fallback/facets/matchLabels unchanged.

- [ ] **Step 1: Write failing HTTP filter and degraded-reindex tests**

```js
test("search API preserves primary AND and preference OR filters", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "GET",
      "/api/search?category=Architecture&state=California&rooms=Bathroom&styles=Modern");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.results.map(({ id }) => id), ["atelier-north-architecture"]);
    assert.deepEqual(response.body.results[0].matchLabels.map(({ label }) => label), ["Modern"]);
  } finally {
    await close(server);
  }
});

test("invalid controlled filters return 400", async () => {
  const { server, port } = await createTestServer();
  try {
    const response = await request(port, "GET", "/api/search?styles=NotAStyle");
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, "INVALID_SEARCH_FILTER");
  } finally {
    await close(server);
  }
});
```

- [ ] **Step 2: Run the focused integration tests and verify failure**

Run: `node --test tests/integration/api.test.js tests/unit/mcp.test.js tests/unit/agent.test.js tests/unit/directory-intelligence.test.js`

Expected: FAIL because HTTP parsing ignores the new preference fields and invalid values.

- [ ] **Step 3: Extend and validate HTTP query parsing**

Use one helper for repeatable or comma-separated arrays:

```js
function getMany(searchParams, key) {
  return searchParams.getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}
```

Parse `businessType` with legacy `subcategory` fallback, parse exact `state`, and parse all four preference names. Validate each value against the taxonomy before invoking the adapter. Assign `error.code = "INVALID_SEARCH_FILTER"` and `error.statusCode = 400` with a message naming the invalid field and value.

- [ ] **Step 4: Publish explicit MCP filter contracts**

Replace the generic filters property with this reusable schema fragment:

```js
const directoryFiltersSchema = {
  type: "object",
  properties: {
    category: { type: "string" },
    businessType: { type: "string" },
    state: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    rooms: { type: "array", items: { type: "string" } },
    projectTypes: { type: "array", items: { type: "string" } },
    styles: { type: "array", items: { type: "string" } },
    services: { type: "array", items: { type: "string" } }
  },
  additionalProperties: false
};
```

Await search, stats, and reindex calls in every MCP tool. Return degraded reindex metadata from recoverable OpenSearch outages, but preserve thrown schema/authentication errors.

- [ ] **Step 5: Adapt the existing agent work without replacing it**

Before editing, run `git diff c64752e -- src/server/agent/agent.js src/server/agent/directoryIntelligence.js` and retain every routing/autocomplete/result-formatting behavior. Extend `inferFilters` to recognize canonical Business Type, State, and controlled preference labels in the question. Await `searchAdapter.stats()` and use keyword mode for OpenSearch; preserve local-hash hybrid mode only when stats explicitly reports it.

Avoid applying the existing fixed score `< 10` guard to OpenSearch BM25 scores:

```js
function applyLowConfidenceGuard(question, searchResponse) {
  if (searchResponse.backend === "memory" && question && searchResponse.results[0]?.score < 10) {
    return { ...searchResponse, results: [], total: 0 };
  }
  return searchResponse;
}
```

Include `matchLabels` in mapped agent results and explanations. Keep autocomplete local and deterministic.

- [ ] **Step 6: Run backend contract tests**

Run: `node --test tests/integration/api.test.js tests/unit/mcp.test.js tests/unit/agent.test.js tests/unit/directory-intelligence.test.js`

Expected: all focused tests PASS, including route classification, autocomplete, grounded references, canonical filters, invalid-filter 400s, and match labels.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit API/MCP/agent integration explicitly**

```bash
git add src/server/http.js src/server/mcp/contracts.js src/server/mcp/tools.js src/server/agent/agent.js src/server/agent/directoryIntelligence.js tests/integration/api.test.js tests/unit/mcp.test.js tests/unit/agent.test.js tests/unit/directory-intelligence.test.js
git commit -m "feat: expose design directory filters"
```

---

### Task 7: Build the Three-Filter and More-Filters UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`
- Modify: `public/renderers.js`
- Modify: `tests/e2e/search-ui.test.js`
- Modify: `tests/e2e/ask-button-ui.test.js`

**Interfaces:**
- Consumes `/api/categories` taxonomy and `/api/search` facets/results.
- Produces DOM controls `#business-type-filter`, `#category-filter`, `#state-filter`, `#more-filters-toggle`, `#more-filters-panel`, four named checkbox groups, `#apply-filters`, and `#clear-filters`.
- Produces `renderMatchLabels(labels)` and result cards that display only selected-option matches.

- [ ] **Step 1: Write failing renderer and UI request tests**

Append to `tests/e2e/search-ui.test.js`:

```js
const seed = require("../../src/data/seed-directory.json");

test("result cards render safe relevance labels", () => {
  const html = renderers.renderResultList([{
    id: "atelier-north-architecture",
    entry: seed.entries.find(({ id }) => id === "atelier-north-architecture"),
    score: 12,
    matchLabels: [
      { facet: "rooms", value: "kitchen", label: "Kitchen" },
      { facet: "styles", value: "modern", label: "<Modern>" }
    ]
  }]);
  assert.match(html, /Kitchen/);
  assert.match(html, /&lt;Modern&gt;/);
  assert.doesNotMatch(html, /<Modern>/);
});
```

Extend the VM UI test with the new selectors and a search-response fixture. Apply Kitchen and Modern, then assert the request contains both parameters and no request occurred before clicking Apply:

```js
assert.match(searchRequest.url, /rooms=Kitchen/);
assert.match(searchRequest.url, /styles=Modern/);
```

- [ ] **Step 2: Run UI tests and verify missing-selector/rendering failures**

Run: `node --test tests/e2e/search-ui.test.js tests/e2e/ask-button-ui.test.js`

Expected: FAIL because match labels and new filter controls are absent.

- [ ] **Step 3: Replace the main filter markup**

In `public/index.html`, render one labelled row containing Business Type, Category, State, and Search. Add an accessible disclosure button and a hidden panel with four `fieldset` elements. Each group gets a legend, count placeholders, checkbox containers, Clear All, and Apply Filters. Use canonical form names matching API keys.

The initial markup must remain usable before JavaScript loads:

```html
<button id="more-filters-toggle" type="button" aria-expanded="false" aria-controls="more-filters-panel">
  More filters <span>Rooms, project type, style and services</span>
</button>
<section id="more-filters-panel" hidden>
  <fieldset><legend>Rooms</legend><div data-facet-options="rooms"></div></fieldset>
  <fieldset><legend>Project Type</legend><div data-facet-options="projectTypes"></div></fieldset>
  <fieldset><legend>Style</legend><div data-facet-options="styles"></div></fieldset>
  <fieldset><legend>Services</legend><div data-facet-options="services"></div></fieldset>
</section>
```

- [ ] **Step 4: Implement pending versus applied filter state**

Extend state with:

```js
pendingPreferences: { rooms: [], projectTypes: [], styles: [], services: [] },
appliedPreferences: { rooms: [], projectTypes: [], styles: [], services: [] },
facets: {}
```

Populate Category, Business Type, and State from `/api/categories`. Category changes restrict Business Type options to the selected category. Checkbox changes update only `pendingPreferences`; Apply copies pending to applied and runs search. Clear All empties both sets and runs search. `searchUrl()` appends every applied value with `params.append(field, value)`. Render counts from `response.facets` without discarding pending selections.

- [ ] **Step 5: Render match labels and applied chips**

```js
function renderMatchLabels(labels) {
  return (labels || []).map(({ facet, label }) =>
    `<span class="match-label" data-facet="${escapeHtml(facet)}">${escapeHtml(label)}</span>`
  ).join("");
}
```

Call it in each result card after the category/location line. Add removable applied-filter chips whose button updates both preference state objects and reruns search. Keep `whyMatched` text and regular tags separate from selected-option labels.

- [ ] **Step 6: Style desktop and mobile states accessibly**

Add focused styles for the primary filter row, disclosure, four-column checkbox grid, counts, Apply button, active chips, and result labels. At the existing mobile breakpoint, stack the primary controls and make facet groups one column. Preserve visible focus rings, disabled state contrast, `hidden` semantics, and `aria-live` result count.

- [ ] **Step 7: Run UI and full tests**

Run: `node --test tests/e2e/search-ui.test.js tests/e2e/ask-button-ui.test.js`

Expected: all UI tests PASS, including delayed Apply behavior and escaped match labels.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 8: Commit the UI**

```bash
git add public/index.html public/styles.css public/app.js public/renderers.js tests/e2e/search-ui.test.js tests/e2e/ask-button-ui.test.js
git commit -m "feat: add design directory filter experience"
```

---

### Task 8: Add Secured Local Compose, Operations CLI, and Live Verification

**Files:**
- Create: `compose.yml`
- Create: `scripts/opensearch.js`
- Create: `tests/unit/opensearch-compose.test.js`
- Create: `tests/integration/opensearch-live.test.js`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/server/index.js`

**Interfaces:**
- Consumes Task 4 adapter operational methods.
- Produces package commands `opensearch:up`, `opensearch:down`, `opensearch:logs`, `opensearch:wait`, `opensearch:bootstrap`, `opensearch:reindex`, `opensearch:verify`, `opensearch:test`, and `setup:opensearch`.
- Produces local endpoints `https://127.0.0.1:9200` and `http://127.0.0.1:5601`.

- [ ] **Step 1: Write a failing Compose contract test**

```js
const fs = require("fs");
const test = require("node:test");
const assert = require("assert/strict");

test("compose pins matching secured OpenSearch services", () => {
  const compose = fs.readFileSync("compose.yml", "utf8");
  assert.match(compose, /opensearchproject\/opensearch:3\.8\.0/);
  assert.match(compose, /opensearchproject\/opensearch-dashboards:3\.8\.0/);
  assert.match(compose, /OPENSEARCH_INITIAL_ADMIN_PASSWORD/);
  assert.match(compose, /discovery\.type=single-node/);
  assert.match(compose, /healthcheck:/);
  assert.doesNotMatch(compose, /DISABLE_SECURITY_PLUGIN=true/);
});
```

- [ ] **Step 2: Run the Compose contract test and verify failure**

Run: `node --test tests/unit/opensearch-compose.test.js`

Expected: FAIL with `ENOENT: no such file or directory, open 'compose.yml'`.

- [ ] **Step 3: Create the local Compose topology**

Use this service contract:

```yaml
services:
  opensearch:
    image: opensearchproject/opensearch:3.8.0
    environment:
      - discovery.type=single-node
      - bootstrap.memory_lock=true
      - OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD:?set OPENSEARCH_INITIAL_ADMIN_PASSWORD in .env}
    ports:
      - "127.0.0.1:9200:9200"
      - "127.0.0.1:9600:9600"
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    volumes:
      - opensearch-data:/usr/share/opensearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fk -u admin:$${OPENSEARCH_INITIAL_ADMIN_PASSWORD} https://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:3.8.0
    depends_on:
      opensearch: { condition: service_healthy }
    environment:
      OPENSEARCH_HOSTS: '["https://opensearch:9200"]'
    ports:
      - "127.0.0.1:5601:5601"

volumes:
  opensearch-data:
```

Add a bridge network only if Compose does not create the default network correctly; do not create a multi-node local cluster.

- [ ] **Step 4: Add environment examples and load them**

At the start of executable entry points call `require("dotenv").config()`. Extend `.env.example` with all spec variables and safe local defaults:

```dotenv
SEARCH_BACKEND=opensearch
OPENSEARCH_NODE=https://127.0.0.1:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_INITIAL_ADMIN_PASSWORD=
OPENSEARCH_PASSWORD=
OPENSEARCH_INDEX_ALIAS=directory-profiles
OPENSEARCH_REQUEST_TIMEOUT_MS=2000
OPENSEARCH_FALLBACK_COOLDOWN_MS=30000
OPENSEARCH_TLS_REJECT_UNAUTHORIZED=false
```

The blank values prevent an accidental weak default. Onboarding tells the user to generate one strong local password and place the same value in both variables before Compose startup.

- [ ] **Step 5: Implement the operations CLI**

```js
require("dotenv").config();
const { createDirectoryStore } = require("../src/server/directory/store");
const { createOpenSearchClient } = require("../src/server/search/opensearch/client");
const { createOpenSearchSearchAdapter } = require("../src/server/search/opensearchSearchAdapter");

async function main(command = process.argv[2]) {
  const store = createDirectoryStore();
  const adapter = createOpenSearchSearchAdapter(store, { client: createOpenSearchClient() });
  try {
    if (command === "wait") return console.log(JSON.stringify(await adapter.waitForReady(), null, 2));
    if (command === "bootstrap") return console.log(JSON.stringify(await adapter.bootstrap(), null, 2));
    if (command === "reindex") return console.log(JSON.stringify(await adapter.reindex(), null, 2));
    if (command === "verify") return console.log(JSON.stringify(await adapter.verify(), null, 2));
    throw Object.assign(new Error("Usage: node scripts/opensearch.js <wait|bootstrap|reindex|verify>"), { code: "BAD_COMMAND" });
  } finally {
    await adapter.close();
  }
}

main().catch((error) => {
  console.error(`${error.code || "OPENSEARCH_COMMAND_FAILED"}: ${error.message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Add package commands**

```json
{
  "opensearch:up": "docker compose up -d opensearch opensearch-dashboards",
  "opensearch:down": "docker compose down",
  "opensearch:logs": "docker compose logs -f opensearch opensearch-dashboards",
  "opensearch:wait": "node scripts/opensearch.js wait",
  "opensearch:bootstrap": "node scripts/opensearch.js bootstrap",
  "opensearch:reindex": "node scripts/opensearch.js reindex",
  "opensearch:verify": "node scripts/opensearch.js verify",
  "opensearch:test": "OPENSEARCH_LIVE_TEST=1 node --test tests/integration/opensearch-live.test.js",
  "setup:opensearch": "npm run opensearch:up && npm run opensearch:wait && npm run opensearch:bootstrap && npm run seed && npm run opensearch:reindex && npm run opensearch:verify"
}
```

- [ ] **Step 7: Add opt-in live integration coverage**

Guard the suite:

```js
const liveTest = process.env.OPENSEARCH_LIVE_TEST === "1" ? test : test.skip;
```

Use the real store, client, and adapter. Verify bootstrap, Analyze API results, explicit BM25 settings, strict mapping metadata, six indexed documents, the `directory-profiles` alias, free text, alias retrieval (`Atelier North Architects`), synonym retrieval (`remodeling`), fuzzy retrieval (`Atellier North`), autocomplete retrieval (`Atel`), California/Architecture filters, Kitchen-or-Modern selection, match labels, and facet counts. Use a unique timestamped physical index through the production reindex path; do not delete retained indexes in the test.

- [ ] **Step 8: Run fast tests, then the live cluster workflow**

Run: `npm test`

Expected: all tests PASS and the live test is reported skipped.

Run after creating a strong local `.env`: `npm run setup:opensearch`

Expected: both services healthy, schema version `1`, alias present, and six documents verified.

Run: `npm run opensearch:test`

Expected: all live OpenSearch assertions PASS.

- [ ] **Step 9: Commit local infrastructure and operations**

```bash
git add compose.yml scripts/opensearch.js tests/unit/opensearch-compose.test.js tests/integration/opensearch-live.test.js package.json package-lock.json .env.example src/server/index.js
git commit -m "build: add local OpenSearch stack"
```

---

### Task 9: Complete Documentation, Evaluation, and End-to-End QA

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `docs/environment.md`
- Modify: `docs/onboarding.md`
- Modify: `docs/testing.md`
- Modify: `docs/taxonomy.md`
- Modify: `docs/mcp.md`
- Modify: `docs/evaluation.md`
- Modify: `evals/queries.json`
- Modify: tests only for defects exposed by verification

**Interfaces:**
- Documents every command and environment variable created in Tasks 1–8.
- Produces a reproducible first-run path and a separate non-destructive shutdown path.

- [ ] **Step 1: Write a documentation contract checklist test or shell audit**

Run this read-only audit before editing:

```bash
rg -n "setup:opensearch|opensearch:bootstrap|OPENSEARCH_INITIAL_ADMIN_PASSWORD|5601|BM25|synonym|alias|fuzz|autocomplete|matchLabels|Business Type|Rooms|Project Types|Styles|Services" README.md docs
```

Expected: missing matches across onboarding, environment, testing, taxonomy, MCP, and architecture documentation.

- [ ] **Step 2: Rewrite the onboarding path in exact order**

Document these commands, each with its expected outcome:

```bash
cp .env.example .env
npm install
docker compose config
npm run setup:opensearch
npm test
npm run opensearch:test
npm run eval
npm run dev
```

Tell the reader to replace both password example values with the same strong random password before Compose. Include Docker Desktop memory guidance, Linux `vm.max_map_count=262144`, URLs for the app and Dashboards, `admin` login, how to inspect the `directory-profiles` alias, and a sample search.

- [ ] **Step 3: Document operations and safe failure behavior**

Cover:

- `npm run opensearch:logs` for startup/password/health failures;
- `npm run opensearch:verify` for template/mapping/alias/count checks;
- how `backend`, `fallback`, and `fallbackReason` appear in API/stats responses;
- automatic cooldown recovery;
- why 400/401/403 and mapping errors do not fall back;
- `npm run opensearch:down` as non-destructive shutdown;
- `docker compose down -v` as explicitly destructive local-data removal;
- retained old physical indexes and manual alias rollback in Dashboards Dev Tools;
- production TLS CA configuration and why local certificate bypass must not be copied to production.

- [ ] **Step 4: Update architecture, taxonomy, MCP, and evaluation examples**

Use domain queries consistently, for example:

```bash
curl "http://127.0.0.1:3000/api/search?query=modern%20renovation&category=Architecture&rooms=Kitchen&styles=Modern"
```

```bash
npm run mcp search_directory '{"query":"hospitality landscape","filters":{"projectTypes":["Hospitality"],"styles":["Modern"]},"limit":3}'
```

Explain global preference OR separately from primary-filter AND and show the structured `matchLabels` shape.

Document the relevance stack as five independently testable signals: native BM25 for lexical scoring; search-time `synonym_graph` expansion for conservative multiword equivalents; indexed profile aliases for alternate firm names; bounded query-time `AUTO` fuzziness for typing errors; and edge-n-gram name/alias subfields for autocomplete. Explain why proper names use lowercase plus ASCII folding without stemming, why descriptions use light English stemming, why synonyms run only at search time, and why fuzzy expansion is bounded instead of indexed into every field.

- [ ] **Step 5: Run every non-destructive verification command**

Run: `npm test`

Expected: all fast tests PASS; live suite skipped.

Run: `npm run eval`

Expected: five domain cases complete, top-3 accuracy is `1`, and grounded answer rate is `1`.

Run: `npm run opensearch:verify`

Expected: schema version `1`, stable alias, and six indexed documents.

Run: `npm run opensearch:test`

Expected: live suite PASS.

- [ ] **Step 6: Start the app and perform visual/browser verification**

Run: `npm run dev`

Expected: server reports the OpenSearch-backed index at `http://127.0.0.1:3000`.

Because a dev server is running, invoke the available browser-verification skill. Verify desktop and mobile layouts, all three primary controls, More Filters disclosure, counts, Apply/Clear behavior, removable chips, match labels, result/detail navigation, agent answer, admin stats, and no browser console errors. Capture any visual defect as a failing UI test before fixing it.

- [ ] **Step 7: Re-run documentation audit and diff checks**

Run:

```bash
rg -n "setup:opensearch|opensearch:bootstrap|OPENSEARCH_INITIAL_ADMIN_PASSWORD|5601|BM25|synonym|alias|fuzz|autocomplete|matchLabels|Business Type|Rooms|Project Types|Styles|Services" README.md docs
git diff --check
```

Expected: required terms appear in the relevant guides and `git diff --check` prints nothing.

- [ ] **Step 8: Commit documentation and verified corrections**

```bash
git add README.md docs/architecture.md docs/deployment.md docs/environment.md docs/onboarding.md docs/testing.md docs/taxonomy.md docs/mcp.md docs/evaluation.md evals/queries.json
git commit -m "docs: add OpenSearch onboarding and operations"
```

If verification required code/test corrections, stage those exact files in a separate preceding `fix:` commit rather than hiding them in the documentation commit.

---

### Task 10: Final Verification and Publish to GitHub

**Files:**
- Review: all tracked changes and commit history
- External destination: `machelslackinlondon/ai-directory-search` on GitHub

**Interfaces:**
- Consumes the completed repository from Tasks 1–9.
- Produces a non-force update of `origin/main` only after verification and remote-divergence checks.

- [ ] **Step 1: Invoke completion and branch-finishing skills**

Use `superpowers:verification-before-completion` before making any completion claim. After all checks pass, use `superpowers:finishing-a-development-branch` to inspect the branch and choose the user-approved publish path. The user has already requested publication to the existing GitHub remote, so do not create a second repository.

- [ ] **Step 2: Verify the repository state and destination**

Run:

```bash
git status --short
git branch --show-current
git remote -v
git log --oneline --decorate -12
```

Expected: branch is `main`; remote fetch/push URLs are `https://github.com/machelslackinlondon/ai-directory-search.git`; no uncommitted implementation files remain. If unrelated user files remain dirty, leave them uncommitted and report them before publishing.

- [ ] **Step 3: Re-run the complete evidence set**

Run:

```bash
npm test
npm run eval
npm run opensearch:verify
npm run opensearch:test
git diff --check c64752e..HEAD
```

Expected: every test and evaluation passes, live OpenSearch verification passes, and the diff check prints nothing. Record exact pass counts and evaluation metrics for the handoff.

- [ ] **Step 4: Verify authentication and remote safety**

Run: `gh auth status`

Expected: authenticated to GitHub with permission to push to `machelslackinlondon`.

Run: `git fetch origin main`

Expected: fetch succeeds.

Run: `git rev-list --left-right --count origin/main...main`

Expected: the left count is `0`; local `main` is not behind the remote. If the left count is non-zero, stop and reconcile without force-pushing.

- [ ] **Step 5: Publish without force**

Run: `git push origin main`

Expected: GitHub accepts the new commits and reports `main -> main`. Never use `--force` or `--force-with-lease`.

- [ ] **Step 6: Verify the published branch**

Run: `git ls-remote --heads origin main`

Expected: the remote `main` hash equals `git rev-parse HEAD`.

Provide the repository link, final commit hash, pass counts, evaluation metrics, OpenSearch/Dashboards versions, local URLs, and any intentionally uncommitted user files in the final handoff.
