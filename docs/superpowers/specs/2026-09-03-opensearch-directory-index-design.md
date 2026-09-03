# OpenSearch Directory Index Design

**Status:** Approved design  
**Date:** 2026-09-03

## Summary

The project will use OpenSearch as its primary search engine and retain the in-memory adapter as an automatic availability fallback. The file-backed directory store remains the canonical data source. OpenSearch is a derived, versioned read index that supports free-text search, three primary filters, four relevance-aware multi-select groups, facet counts, and match labels.

The implementation will replace the generic sample taxonomy with a design-professional taxonomy inspired by the AD PRO Directory while using project-owned example records. Local development will include matching OpenSearch and OpenSearch Dashboards 3.8.0 containers, secure demo configuration, bootstrap and reindex commands, and end-to-end onboarding instructions.

## Goals

- Make OpenSearch the first-choice backend for API, MCP, and agent searches.
- Fall back transparently to the memory adapter during recoverable OpenSearch availability failures.
- Install mappings and analysis settings before any profile documents are indexed.
- Support free-text relevance across profile names, descriptions, taxonomy, and controlled attributes.
- Preserve three primary filters: Category, Business Type, and State.
- Support Rooms, Project Types, Styles, and Services as OR-based multi-select filters and relevance signals.
- Return per-profile labels explaining which selected options matched.
- Return aggregation counts for filter controls.
- Provide a versioned, rollback-friendly index lifecycle.
- Provide local OpenSearch Dashboards and complete onboarding, operation, testing, and troubleshooting documentation.

## Non-goals

- OpenSearch will not become the canonical record store.
- The first release will not add vector search or require an embedding provider.
- The implementation will not ingest or scrape Architectural Digest content.
- The Docker Compose environment is for local development and testing, not a production security topology.
- The implementation will not retain the generic `people`, `companies`, `services`, `documents`, `tools`, and `vendors` seed taxonomy.

## Existing System and Constraints

The current app has an explicit search-adapter boundary with `search`, `getEntry`, `listCategories`, `reindex`, and `stats` operations. HTTP, MCP, the deterministic agent, tests, and evaluation code share that boundary. The current adapter is synchronous and file-backed; OpenSearch requires asynchronous client calls, so adapter consumers will be migrated to await the common interface.

The working tree already contains user changes in the agent and directory-intelligence code. The implementation must preserve those changes and make only the compatibility edits needed for asynchronous adapter calls and the new taxonomy.

## Domain Taxonomy

### Categories

Only these three top-level design-professional categories are seeded and exposed:

1. `Architecture`
2. `Interior Design + Decor`
3. `Outdoor + Garden Design`

`Builders + Contractors` is intentionally excluded.

### Business types

Business Type is the profile profession and replaces the generic subcategory in the user experience. The initial controlled values are:

- Architecture: `Building Architect`, `Interior Architect`, `Residential Architect`
- Interior Design + Decor: `Decorator`, `Design Consultant`, `Interior Design Consultant`, `Interior Designer`, `Kitchen Designer`, `Stylist`
- Outdoor + Garden Design: `Landscape Architect`, `Landscape Designer`

The taxonomy validator will require every Business Type to belong to the selected Category.

### States

State values use canonical full US state names plus `District of Columbia`. `All States` is a UI sentinel and is never indexed. City and a display-oriented location string remain available on a profile, but State is the exact filter field.

### Additional controlled fields

Each field is a multi-value array. The initial controlled options reproduce the supplied design:

- Rooms: `Kitchen`, `Living Room`, `Bathroom`
- Project Types: `Renovation`, `New Build`, `Hospitality`
- Styles: `Modern`, `Traditional`, `Eclectic`
- Services: `Full-service Design`, `Consultation`

The taxonomy file is the canonical source for UI labels and allowed values. New values require a taxonomy and schema-version review rather than relying on dynamic mapping.

## Canonical Profile Shape

The directory schema will add normalized top-level fields for `businessType`, `state`, `city`, `rooms`, `projectTypes`, `styles`, and `services`. It will retain the existing common fields such as `id`, `name`, `description`, `category`, `tags`, `location`, `url`, `contact`, `metadata`, timestamps, and `taxonomy` so API, MCP, agent, and renderer contracts remain recognizable.

Normalization will mirror the new controlled fields into the existing taxonomy representation:

- `businessType` corresponds to `taxonomy.subcategory`.
- Rooms, Project Types, Styles, and Services correspond to fixed keys in `taxonomy.facets`.
- `location` is a display value derived from City and State when not supplied.

Validation rejects unknown categories, invalid Category/Business Type pairs, non-array facet values after normalization, and facet values absent from the controlled taxonomy.

## Architecture

### Canonical store

`data/directory.json` remains authoritative. Imports and MCP mutations validate and write this store first. Both search backends are then reindexed from the same normalized snapshot, keeping the fallback index ready even while OpenSearch is unavailable.

### Search adapters

The implementation will add three focused units:

1. `opensearchClient`: creates the official JavaScript client from environment configuration.
2. `opensearchSearchAdapter`: builds queries, executes searches, parses hits and aggregations, and manages versioned reindexing.
3. `fallbackSearchAdapter`: invokes OpenSearch first and delegates to the memory adapter during recoverable failures.

All search-adapter operations return promises. The memory adapter may perform work synchronously internally but exposes the same asynchronous contract. HTTP, MCP, agent, evaluation, scripts, and tests will await adapter operations.

### Fallback state

The fallback adapter records a recoverable OpenSearch failure and opens a short cooldown, defaulting to 30 seconds. Requests use memory during the cooldown. The first request after the cooldown probes OpenSearch again; a success closes the fallback state.

Each response reports:

- `backend`: `opensearch` or `memory`
- `fallback`: a boolean
- `fallbackReason`: a stable reason code when fallback was used

Recoverable failures include transport errors, connection refusal, timeouts, HTTP 429, HTTP 502/503/504, and a missing alias or index. Authentication failures, authorization failures, invalid mappings, document validation errors, and malformed query errors remain visible and do not silently fall back.

## OpenSearch Topology and Index Lifecycle

### Local services

Docker Compose runs:

- `opensearchproject/opensearch:3.8.0` as one development node
- `opensearchproject/opensearch-dashboards:3.8.0`

The node uses one shard, zero replicas, a persistent named volume, a memory limit appropriate for local development, and health checks. OpenSearch and Dashboards use matching versions as required by the installation guidance.

Demo security stays enabled. `OPENSEARCH_INITIAL_ADMIN_PASSWORD` is required in an uncommitted local environment file. The Node client connects over HTTPS with basic authentication. Trusting the demo self-signed certificate is allowed only when an explicit local-development TLS option is disabled; production configuration defaults to certificate verification.

### Names

- Index template: `directory-profiles-template-v1`
- Physical index pattern: `directory-profiles-v1-*`
- Stable application alias: `directory-profiles`
- Mapping metadata: `_meta.schema_version = 1`

### Bootstrap

The bootstrap operation is idempotent:

1. Wait for the cluster to become available.
2. create or update the versioned index template containing settings and strict mappings.
3. Verify representative analyzer output with the Analyze API.
4. If the application alias is absent, create an empty physical v1 index and attach the alias.
5. Report the cluster, template, physical index, alias, mapping version, and analyzer checks.

The app does not create ad hoc mappings on first document write.

### Reindex

A rebuild creates a new timestamped physical index, bulk-indexes the full normalized store, refreshes it, verifies the expected document count, and atomically moves the application alias. If indexing or verification fails, the alias stays on the prior index. The prior index is retained for rollback and is never deleted automatically.

## Search Document

The derived document contains indexable flat fields plus the canonical profile payload:

| Field | Mapping | Purpose |
| --- | --- | --- |
| `id` | `keyword` | Stable document identity and exact lookup |
| `name` | `text` with `sort` and `autocomplete` subfields | Full-text name relevance, deterministic sorting, partial-name matching |
| `description` | `text` | Stemmed free-text relevance |
| `category` | normalized `keyword` with a `search` text subfield | Exact primary filter plus free-text matching |
| `businessType` | normalized `keyword` with a `search` text subfield | Exact primary filter plus profession matching |
| `state` | normalized `keyword` with a `search` text subfield | Exact primary filter plus location matching |
| `city` | normalized `keyword` with a `search` text subfield | Location search and optional aggregation |
| `tags` | normalized `keyword` with a `search` text subfield | Exact attributes plus free-text relevance |
| `rooms` | normalized `keyword` | Multi-select exact preference matching |
| `projectTypes` | normalized `keyword` | Multi-select exact preference matching |
| `styles` | normalized `keyword` | Multi-select exact preference matching |
| `services` | normalized `keyword` | Multi-select exact preference matching |
| `aliases` | `text` with an `autocomplete` subfield | Alternate-name and partial-name search |
| `synonyms` | `text` | Profile-specific recall terms |
| `relatedTerms` | `text` | Lower-weight discovery terms |
| `createdAt`, `updatedAt` | `date` | Date sorting and diagnostics |
| `profile` | object with indexing disabled | Canonical normalized API payload retained in `_source` |

The top-level mapping uses `dynamic: strict`. Arbitrary metadata is available only inside the non-indexed `profile` payload, preventing mapping explosion.

## Analysis Settings

### `directory_text`

The general text analyzer uses the standard tokenizer followed by lowercase and ASCII-folding filters. It applies to names, aliases, and taxonomy text. The standard tokenizer handles word boundaries and punctuation, lowercase makes matching case-insensitive, and ASCII folding makes searches such as accented and unaccented names equivalent. It deliberately avoids stemming proper names.

### `directory_description_index`

Descriptions use the standard tokenizer, lowercase, ASCII folding, and a light English stemmer. Stemming is limited to narrative text so inflections such as `renovate`, `renovating`, and `renovation` improve recall without distorting business names or exact facets.

### `directory_description_search`

The description search analyzer uses lowercase and ASCII folding, a conservative `synonym_graph` filter, and the same light English stemming behavior. `synonym_graph` runs only at query time so multiword domain equivalents are interpreted as phrases without multiplying stored postings. Initial rules cover conservative equivalents such as:

- `remodel`, `remodeling`, `renovation`
- `new build`, `new construction`
- `outdoor design`, `garden design`, `landscape design`
- `full service design`, `full-service design`

Synonym rules are versioned with index settings. Changing them creates a new schema/index revision and alias switch.

### `directory_autocomplete`

The autocomplete analyzer uses edge n-grams from 2 to 20 characters plus lowercase and ASCII folding. It is applied only to name and alias subfields to support partial firm-name queries while containing index growth. Search input uses `directory_text`, not edge n-grams.

### `directory_keyword`

Exact filter fields use a custom normalizer with trim, lowercase, and ASCII folding filters. A normalizer preserves one token, which is appropriate for terms filters, sorting, and aggregations. `_source` retains original display capitalization; response parsing maps normalized bucket keys back to canonical taxonomy labels.

### Deliberately omitted analysis

Stop-word removal is not used. Directory categories and professional phrases are short, and preserving every term makes matching and explanations easier to reason about. Aggressive phonetic or fuzzy indexing is also omitted; typo tolerance belongs in a bounded query clause, not every stored token.

Bootstrap and integration tests call the Analyze API with representative names, accented text, inflections, multiword synonyms, and prefixes to lock down expected token behavior.

## Query Semantics

### Free text

An empty query uses `match_all`. A non-empty query uses a Boolean relevance query containing:

- a high-boost name phrase match;
- a boosted `multi_match` across name, aliases, business type, category, tags, description, controlled attributes, synonyms, and related terms;
- bounded `AUTO` fuzziness on the general multi-match clause for ordinary typing errors.

The approximate field-weight order is:

1. name
2. aliases
3. Business Type
4. Category and tags
5. description and controlled attributes
6. synonyms and related terms

Exact boosts will be constants in the query-builder module and covered by ranking tests.

### Primary filters

Category, Business Type, and State are exact term filters combined with AND semantics. The server validates and normalizes their values before constructing the query.

### Additional selections

Every selected Room, Project Type, Style, or Service creates a named exact-match `should` clause. All selected values participate in a global OR:

- the hit must match at least one selected value;
- a hit matching more selected values receives more boost;
- selections never use AND semantics with each other.

The same global OR is enforced in `post_filter`, while the named query clauses remain in the main query for scoring. OpenSearch `matched_queries` values are decoded into stable labels of this shape:

```json
{
  "facet": "rooms",
  "value": "kitchen",
  "label": "Kitchen"
}
```

Each result returns `matchLabels`, and the UI renders the canonical labels as chips. `whyMatched` combines selected-option labels with available free-text highlight information.

### Aggregations

Terms aggregations are returned for Category, Business Type, State, Rooms, Project Types, Styles, and Services. Counts reflect the current free-text query and three primary filters but are not reduced by the additional OR post-filter. This lets users see the available options before applying or changing preference selections.

### Sorting and pagination

Relevance remains the default. Name uses the normalized keyword subfield; newest and updated use date fields; category uses normalized Category then Name. Offset and limit remain bounded by the existing API rules.

## API and Adapter Response

The current result envelope is preserved and extended. A search response includes:

```json
{
  "query": "modern kitchen renovation",
  "filters": {},
  "sort": "relevance",
  "total": 12,
  "tookMs": 8.4,
  "backend": "opensearch",
  "fallback": false,
  "facets": {},
  "results": [
    {
      "id": "studio-example",
      "entry": {},
      "score": 18.2,
      "matchLabels": [],
      "whyMatched": "..."
    }
  ]
}
```

The search endpoint accepts `businessType` and `state`, plus repeated or comma-separated values for `rooms`, `projectTypes`, `styles`, and `services`. Existing `subcategory` can be accepted as a compatibility alias for Business Type during the migration. MCP filter objects use the canonical camelCase names.

`/api/stats` reports both backend states, alias and physical index information when available, document counts, mapping version, last successful reindex, fallback status, and the last recoverable failure code. It must not expose credentials.

## UI Design

The search page will replace generic Category/Tags/Location controls with:

- Business Type select
- Category select
- State select
- Search action
- expandable More Filters panel

The More Filters panel contains checkbox groups for Rooms, Project Type, Style, and Services, per-option counts, Clear All, and Apply Filters. Pending checkbox changes do not issue a search until applied. Applied values render as removable filter chips.

Result cards render only the `matchLabels` relevant to the current selected options. The existing loading, empty, error, detail, activity-log, sorting, admin import, and reindex behaviors remain available. Filter controls are accessible by label, fieldset/legend grouping, keyboard interaction, and live result-count announcements.

## Mutation and Reindex Flow

1. Validate and normalize the incoming profile or import.
2. Write the canonical file store.
3. Reindex the memory adapter from the new store snapshot.
4. Attempt the versioned OpenSearch rebuild and alias switch.
5. If OpenSearch is unavailable, return successful canonical mutation details with explicit degraded-index status; searches continue through memory.
6. If OpenSearch rejects data because of validation or mapping errors, return a visible indexing error so the schema problem is corrected.

The full rebuild approach is appropriate for the current small file-backed directory and guarantees that deletions and replacements cannot leave orphaned OpenSearch documents.

## Configuration

The environment contract will include:

- `SEARCH_BACKEND=opensearch`
- `OPENSEARCH_NODE=https://127.0.0.1:9200`
- `OPENSEARCH_USERNAME=admin`
- `OPENSEARCH_PASSWORD`
- `OPENSEARCH_INDEX_ALIAS=directory-profiles`
- `OPENSEARCH_REQUEST_TIMEOUT_MS`
- `OPENSEARCH_FALLBACK_COOLDOWN_MS`
- `OPENSEARCH_TLS_REJECT_UNAUTHORIZED`

OpenSearch remains the default application backend. Tests explicitly inject the memory adapter unless they are OpenSearch integration tests, avoiding accidental external dependencies and timeout delays.

## Commands and Onboarding

Package scripts will provide discoverable operations equivalent to:

- start OpenSearch and Dashboards;
- wait for cluster health;
- bootstrap template, mappings, analyzers, first index, and alias;
- seed canonical data;
- perform a versioned reindex;
- run the app;
- verify the live OpenSearch flow;
- inspect Compose status and logs;
- stop services without deleting data.

Documentation will explain prerequisites, Docker memory and Linux `vm.max_map_count` requirements, password creation, environment setup, first-run order, Dashboards login, index inspection, application startup, sample searches, test commands, fallback demonstration, common failures, rollback, shutdown, and the separate destructive command needed to remove local volumes.

## Error Handling

- Client and cluster errors are converted into stable internal error codes without leaking credentials.
- Requests use a short configured timeout so fallback is responsive.
- Partial bulk failures abort alias switching and report failed document IDs and reasons.
- A document-count mismatch aborts alias switching.
- Missing bootstrap state can fall back to memory while `/api/stats` and logs clearly instruct the operator to bootstrap.
- Invalid user filters return HTTP 400 rather than an empty or silently broadened query.
- Authentication and mapping failures remain visible because silently falling back would conceal configuration or schema defects.
- Shutdown closes HTTP and OpenSearch client resources cleanly.

## Testing

### Unit tests

- canonical domain validation and normalization;
- explicit mapping and analyzer definitions;
- query construction, boosts, primary AND filters, global additional-filter OR, and named clauses;
- response hit, highlight, aggregation, and match-label parsing;
- memory-adapter parity for domain filters and OR behavior;
- recoverable versus non-recoverable failure classification;
- fallback cooldown and recovery;
- async agent, MCP, HTTP, evaluation, and script call sites.

### Controlled integration tests

An injected client double will cover bootstrap idempotency, bulk failures, count verification, atomic alias actions, stats, and fallback without requiring Docker during the normal fast test suite.

### Docker-backed end-to-end verification

A separate command will verify against the Compose cluster:

1. health and authenticated connectivity;
2. template, strict mapping, mapping version, and alias creation;
3. analyzer output;
4. full seed reindex and document count;
5. name/description free-text ranking;
6. Category, Business Type, and State filtering;
7. global OR selection, additional-match boosting, and `matchLabels`;
8. aggregation counts;
9. HTTP API and MCP search behavior;
10. memory fallback when the OpenSearch client is deliberately made unavailable through test injection;
11. recovery to OpenSearch after the cooldown.

The existing evaluation fixture will be replaced with domain-relevant queries and expected profile IDs. Existing UI-flow tests will be updated for the new controls and labels.

## Documentation Changes

The implementation updates:

- `README.md` for the first-run path and commands;
- `docs/onboarding.md` for complete local setup;
- `docs/architecture.md` for adapter, index, and fallback boundaries;
- `docs/deployment.md` for production OpenSearch configuration and security distinctions;
- `docs/environment.md` for every new variable;
- `docs/taxonomy.md` for the design-professional taxonomy and controlled filters;
- `docs/testing.md` for fast and Docker-backed suites;
- `docs/mcp.md` for asynchronous OpenSearch-backed tools and canonical filters.

## Acceptance Criteria

The work is complete when:

1. A new developer can follow the onboarding guide from prerequisites to a working app and Dashboards session.
2. Bootstrap creates analysis settings and strict mappings before profile indexing.
3. The seed data contains only the three approved design-professional categories.
4. Free-text search ranks representative name, description, synonym, and controlled-field matches correctly.
5. Category, Business Type, and State work as exact primary filters.
6. Additional selected options use global OR, matching more options improves ranking, and profile cards show matching labels.
7. Aggregation counts populate every required control.
8. API, MCP, agent, evaluation, and admin reindex flows use the asynchronous shared adapter contract.
9. Recoverable OpenSearch failure serves equivalent searches from memory and reports degraded status.
10. OpenSearch automatically resumes after the cooldown when service recovers.
11. Versioned reindexing changes the alias only after successful bulk indexing and count verification.
12. Unit, integration, UI-flow, evaluation, and Docker-backed OpenSearch verification pass.

## Source Guidance

- [OpenSearch mappings](https://docs.opensearch.org/latest/mappings/): explicit mappings and immutable existing field types.
- [OpenSearch text analysis](https://docs.opensearch.org/latest/analyzers/): tokenizers, filters, normalization, stemming, and index/search analysis.
- [Synonym graph token filter](https://docs.opensearch.org/latest/analyzers/token-filters/synonym-graph/): multiword synonym handling.
- [Normalizer mapping parameter](https://docs.opensearch.org/latest/mappings/mapping-parameters/normalizer/): single-token keyword normalization.
- [Multi-match query](https://docs.opensearch.org/latest/query-dsl/full-text/multi-match/): boosted multi-field relevance.
- [Boolean query](https://docs.opensearch.org/latest/query-dsl/compound/bool/): filters, should clauses, minimum matches, and named queries.
- [Filtering search results](https://docs.opensearch.org/latest/search-plugins/filter-search/): query filters, post-filters, and aggregation visibility.
- [JavaScript client](https://docs.opensearch.org/latest/clients/javascript/index/): server-side client, index creation, document indexing, and search.
- [JavaScript bulk helper](https://docs.opensearch.org/latest/clients/javascript/helpers/): controlled bulk indexing.
- [Docker installation](https://docs.opensearch.org/latest/install-and-configure/install-opensearch/docker/): matching services, strong initial password, host settings, and local Compose guidance.
- [OpenSearch 3.8 artifacts](https://opensearch.org/artifacts/by-version/): pinned OpenSearch and Dashboards release.

