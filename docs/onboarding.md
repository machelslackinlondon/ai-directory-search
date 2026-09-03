# Onboarding

## Prerequisites

- Node.js 16.19 or newer and npm.
- Docker Desktop or Docker Engine with Compose.
- At least 4 GB of memory available to Docker Desktop; the local OpenSearch JVM uses a 512 MB minimum and maximum heap.

On Linux, set the required virtual-memory map count before starting OpenSearch:

```bash
sudo sysctl -w vm.max_map_count=262144
```

Persist that host setting according to your Linux distribution if you use the stack regularly.

## First run, in order

1. Create the uncommitted local environment file.

   ```bash
   cp .env.example .env
   ```

   Replace the empty `OPENSEARCH_INITIAL_ADMIN_PASSWORD` and `OPENSEARCH_PASSWORD` values with the **same strong random password**. The first configures the secured container; the second configures the Node client. Do not commit or paste this password into logs.

2. Install the locked Node dependencies.

   ```bash
   npm install
   ```

   Expected: npm installs the application, official OpenSearch JavaScript client, and dotenv dependencies.

3. Validate environment interpolation and Compose syntax.

   ```bash
   docker compose config
   ```

   Expected: a resolved configuration with OpenSearch and OpenSearch Dashboards 3.8.0 and no missing-variable error. Because resolved output can contain the password, do not publish or paste it into tickets.

4. Build the read index.

   ```bash
   npm run setup:opensearch
   ```

   Expected: both containers start, OpenSearch becomes healthy, the versioned template/mappings/analyzers are installed before indexing, six seed profiles are written to the canonical JSON store, a new physical index is populated, and the `directory-profiles` alias verifies with schema version `1`.

5. Run the fast suite.

   ```bash
   npm test
   ```

   Expected: unit, integration, and UI-flow tests pass; the opt-in live OpenSearch suite is reported as skipped.

6. Run the live search suite.

   ```bash
   npm run opensearch:test
   ```

   Expected: Docker-backed analyzer, BM25, synonym, alias, fuzzy, autocomplete, filter, `matchLabels`, aggregation, and lifecycle checks pass.

7. Run the deterministic evaluation.

   ```bash
   npm run eval
   ```

   Expected: five domain cases, top-3 accuracy `1`, and grounded-answer rate `1`.

8. Start the application.

   ```bash
   npm run dev
   ```

   Expected: the server listens at `http://127.0.0.1:3000`; `/api/stats` reports `backend: "opensearch"` when the primary index is available.

## First checks

Open:

- App: `http://127.0.0.1:3000`
- OpenSearch Dashboards: `http://127.0.0.1:5601`

Sign into Dashboards as `admin` with the password in `.env`. In Dashboards Dev Tools, inspect the stable alias and its current physical target:

```http
GET /_alias/directory-profiles
GET /directory-profiles/_mapping
GET /directory-profiles/_count
```

Try a filtered search from another terminal:

```bash
curl "http://127.0.0.1:3000/api/search?query=modern%20renovation&category=Architecture&rooms=Kitchen&styles=Modern"
```

The response should use OpenSearch, return Architecture profiles matching at least one selected preference, and include `matchLabels` for the selected options each profile matched.

## Normal shutdown and restart

Stop the app with Ctrl-C, then stop the search services without deleting data:

```bash
npm run opensearch:down
```

The named volume and retained physical indexes remain available for the next `npm run opensearch:up`. By contrast, `docker compose down -v` deletes local indexed data and is intentionally destructive; the canonical JSON store remains and can be reindexed.

## Troubleshooting

- Use `npm run opensearch:logs` for password bootstrap, startup, certificate, or health-check failures.
- Use `npm run opensearch:verify` to recheck the versioned template, stable alias, effective strict mapping/schema version, and six-document count.
- A password change in `.env` does not rewrite credentials in an existing OpenSearch volume. Restore the original local password or deliberately recreate the local volume and reindex from canonical data.
- `OPENSEARCH_TLS_REJECT_UNAUTHORIZED=false` accepts only the demo self-signed certificate for local development. Never copy that bypass into production; see [Deployment](deployment.md).
