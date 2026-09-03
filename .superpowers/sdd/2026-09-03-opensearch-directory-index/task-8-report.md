# Task 8 Report: Secured Local Compose, Operations CLI, and Live Verification

## Status

Implemented and live-verified. The local OpenSearch and Dashboards services are currently running healthy on loopback with the named data volume retained. No volume or physical index was deleted.

## RED / GREEN evidence

### Initial contract and cooldown RED

- `node --test tests/unit/opensearch-compose.test.js`
  - RED: 0 passed, 5 failed.
  - The required first failure was `ENOENT: no such file or directory, open 'compose.yml'`; the other contract failures identified the missing scripts, environment values, and CLI.
- `node --test --test-name-pattern='empty fallback cooldown' tests/unit/fallback-search-adapter.test.js`
  - RED: expected `{ active: true, unavailableUntil: 31000, remainingMs: 30000 }`, received a zero-length cooldown ending at `1000`.
  - Root cause: JavaScript converts `Number("")` to `0`, so an empty environment value was treated as an explicit zero.

### Focused fast GREEN

- `node --test tests/unit/opensearch-compose.test.js`
  - GREEN: 5 passed, 0 failed.
- `node --test --test-name-pattern='empty fallback cooldown' tests/unit/fallback-search-adapter.test.js`
  - GREEN: 1 passed, 0 failed.
- `node --test tests/integration/opensearch-live.test.js`
  - GREEN for the ordinary-test contract: all 9 live assertions were skipped without `OPENSEARCH_LIVE_TEST=1`.

### Live-discovered analyzer RED / GREEN

OpenSearch 3.8.0 returned `directory_description_search` tokens `remodel`, `renovate`, `remodel`. The previous client-double expectation incorrectly expected the unstemmed synonym forms even though the configured light-English stemmer follows the synonym graph.

- The first secured `npm run setup:opensearch` reached a green one-node cluster and then safely failed bootstrap with `OPENSEARCH_ANALYZER_MISMATCH`.
- A direct credential-safe Analyze API check confirmed the actual tokens without printing the active credential.
- The corrected hand-checked unit expectation was captured RED before changing `ANALYZE_CASES`, then GREEN after the minimal correction.
- Analyzer behavior itself was not changed; only the verifier's expected output was corrected to match the real configured pipeline.

### Final fast and live GREEN

- `npm test`
  - 141 tests total: 132 passed, 9 live tests skipped, 0 failed.
  - The suite needed permission only for its existing ephemeral loopback HTTP tests; it made no OpenSearch request.
- `npm run opensearch:test`
  - 9 passed, 0 failed, 0 skipped.
- Final `docker ps` status:
  - OpenSearch: healthy, `127.0.0.1:9200` and `127.0.0.1:9600` only.
  - Dashboards: healthy, `127.0.0.1:5601` only.

## Exact versions and image identities

- OpenSearch server image: `opensearchproject/opensearch:3.8.0`
  - Image ID/digest: `sha256:bcc1797519726ceb6d651d4a3e60b7c30da91793914a8dfe75fd441d4f641509`
- OpenSearch Dashboards image: `opensearchproject/opensearch-dashboards:3.8.0`
  - Image ID/digest: `sha256:ca28e40a095f7f03c5c02b4aa159fbf09638bc4b3af16f9d556bf6721a0783b1`
- Installed JavaScript client: `@opensearch-project/opensearch@3.6.0` from the existing lockfile.
- Dotenv: `dotenv@17.4.2`.
- Docker CLI: `29.6.0`; daemon: `29.5.2`; Docker Compose: `v2.15.1`.

## Compose and security choices

- Single-node topology only; no explicit custom network is needed because the Compose default network connected both services successfully.
- Both service images are pinned exactly to `3.8.0`; no floating tag is used.
- The security plugin remains enabled. No `DISABLE_SECURITY_PLUGIN` setting is present.
- `OPENSEARCH_INITIAL_ADMIN_PASSWORD` is a required Compose interpolation with no default. `.env.example` keeps both password variables blank.
- Live verification used a high-entropy ephemeral password with uppercase, lowercase, numeric, and special-character classes. It was not committed or intentionally echoed.
- OpenSearch authenticates its HTTPS health probe against cluster health. Dashboards' secured `/api/status` returns 401 without credentials, so its liveness probe treats a successful HTTP exchange as healthy rather than using `curl -f` and incorrectly marking the secured service unhealthy.
- OpenSearch data persists in `opensearch-data`; no `down -v`, volume deletion, or index deletion was used.
- Published ports are bound only to `127.0.0.1`.
- Memory locking, `nofile` limits, a 512 MiB JVM heap, dependency-on-healthy ordering, and bounded health-check intervals/timeouts/retries are configured.

## Operations CLI and commands

The CLI loads dotenv before application modules, creates the real store/client/adapter, exposes only `wait`, `bootstrap`, `reindex`, and `verify`, prints formatted JSON for success, prints only normalized code/message failures, and closes the adapter in `finally`.

Added package commands:

- `opensearch:up`, including `docker compose config --quiet` before `docker compose up`
- `opensearch:down`
- `opensearch:logs`
- `opensearch:wait`
- `opensearch:bootstrap`
- `opensearch:reindex`
- `opensearch:verify`
- `opensearch:test`
- `setup:opensearch`

Safe workflow evidence:

- `docker compose config --quiet`: exit 0 with no output, run before startup as required by Ruling 3 and repeated inside `opensearch:up`.
- `npm run setup:opensearch`:
  - wait: one node, cluster health `green`;
  - bootstrap: template `directory-profiles-template-v1`, schema version `1`, all four analyzer checks passed;
  - seed: 6 directory entries;
  - reindex: 6 indexed documents and atomic alias switch;
  - verify: alias `directory-profiles`, exactly one physical target, 6 entries, schema version `1`, health `green`, `verified: true`.

## Live assertions

The opt-in suite uses the real store, official client, and production adapter, creates a unique timestamped retained physical index through `adapter.reindex()`, and always closes its client through the adapter.

It separately verifies:

1. Native explicit BM25 settings (`type`, `k1`, `b`, and overlap behavior) plus positive scored lexical retrieval.
2. Analyze API search-time synonym expansion and `remodeling` retrieval of a renovation profile.
3. Indexed alias retrieval for `Atelier North Architects`.
4. Bounded fuzzy retrieval for `Atellier North`.
5. Name and alias autocomplete using separate `Atel` and `CF` partial prefixes.

It also verifies:

- repeated bootstrap idempotence;
- strict mapping and schema-version metadata;
- all six canonical document IDs and the count of six;
- one stable `directory-profiles` alias target;
- California AND Architecture primary filters;
- global Kitchen OR Modern preference selection, additive boost ordering, and exact canonical match labels;
- canonical facet counts for category, room, style, and service.

## Cooldown fix

`createSearchAdapter` now treats an undefined or whitespace-empty `OPENSEARCH_FALLBACK_COOLDOWN_MS` as absent, selecting the existing 30,000 ms default. Explicit finite numeric values, including intentional zero, retain their prior behavior.

## Files

Created:

- `compose.yml`
- `scripts/opensearch.js`
- `tests/unit/opensearch-compose.test.js`
- `tests/integration/opensearch-live.test.js`

Modified:

- `.env.example`
- `package.json`
- `src/server/index.js`
- `src/server/search/createSearchAdapter.js`
- `src/server/search/opensearch/indexDefinition.js`
- `tests/unit/fallback-search-adapter.test.js`
- `tests/unit/opensearch-index-definition.test.js`

`package-lock.json` was inspected but did not need a change because both required runtime packages were already locked.

## Self-review

- `git diff --check` is clean.
- No active password appears in tracked or staged content; password examples remain blank.
- Ordinary tests are still external-service-free and the live suite is opt-in only.
- Compose startup validates rendered configuration before creating services.
- The CLI delegates lifecycle behavior to the reviewed adapter and has one close path in `finally`.
- Live tests assert outcomes from the real service, not client doubles.
- No destructive Docker or OpenSearch operation was run. Failed-bootstrap and prior reindex physical indexes remain retained by design.

## Concerns / operational notes

- The first generated ephemeral password was high entropy but lacked all OpenSearch character classes and was rejected before startup. OpenSearch's upstream installer includes rejected values in its own daemon validation log; that rejected value was discarded and was never committed. The successful credential satisfies all required classes and was not printed.
- The currently running verification stack retains its ephemeral credential only in container configuration, not in the repository. A user should place their own strong value in both password variables in an ignored `.env` before their first personal stack startup. This verification stack and its named volume were deliberately not removed.
- The server images are 3.8.0 while the already-reviewed JavaScript client is 3.6.0. The complete lifecycle and query suite passed against that exact combination.
- Dashboards health is a secured HTTP liveness check, while authenticated data-plane readiness is proven by the OpenSearch health check and CLI/live workflow.
