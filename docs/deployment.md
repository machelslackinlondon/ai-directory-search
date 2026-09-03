# Deployment and operations

The included `compose.yml` is a secured single-node development stack, not a production OpenSearch topology. A deployment needs a persistent canonical store, a production OpenSearch cluster, restricted network access, monitored backups, and separate least-privilege credentials.

## Application settings

At minimum configure:

```bash
NODE_ENV=production
ADMIN_TOKEN=<strong-application-token>
DIRECTORY_DATA_PATH=/data/directory.json
PORT=3000
HOST=0.0.0.0
SEARCH_BACKEND=opensearch
OPENSEARCH_NODE=https://search.example.internal:9200
OPENSEARCH_USERNAME=<least-privilege-user>
OPENSEARCH_PASSWORD=<secret>
OPENSEARCH_INDEX_ALIAS=directory-profiles
OPENSEARCH_REQUEST_TIMEOUT_MS=2000
OPENSEARCH_FALLBACK_COOLDOWN_MS=30000
OPENSEARCH_TLS_REJECT_UNAUTHORIZED=true
OPENSEARCH_CA_PATH=/run/secrets/opensearch-ca.pem
```

Keep secrets in the deployment platform's secret manager. Mount the CA bundle read-only and keep certificate verification enabled. The local `.env.example` sets `OPENSEARCH_TLS_REJECT_UNAUTHORIZED=false` solely for the demo self-signed certificate; copying that value to production permits untrusted endpoints and is unsafe.

The configured OpenSearch user needs the cluster/index privileges required to install the versioned template, create physical indexes, analyze, bulk index, count, inspect mappings/aliases, and atomically update aliases. Runtime-only deployments may use a narrower read credential if bootstrap/reindex runs under a separate operations identity.

## Release sequence

1. Back up the canonical store and confirm the current alias target.
2. Deploy application code and install dependencies.
3. Run `npm run opensearch:bootstrap` to create or verify the versioned template, strict mapping, analyzer contract, and initial alias.
4. Run `npm run opensearch:reindex` to create and verify a new physical index and atomically switch the alias.
5. Run `npm run opensearch:verify`, `npm test`, `npm run opensearch:test`, and `npm run eval` in an environment allowed to reach the cluster.
6. Start the application and inspect `/api/stats` without exposing it publicly unless access controls are appropriate.

Old `directory-profiles-v1-*` physical indexes are retained intentionally. Add an operator-reviewed retention process only after backups and rollback requirements are defined.

## Health and degraded mode

Search responses include:

```json
{
  "backend": "opensearch",
  "fallback": false,
  "fallbackReason": null
}
```

During a recoverable availability failure they instead report `backend: "memory"`, `fallback: true`, and a stable reason such as `OPENSEARCH_UNAVAILABLE` or `OPENSEARCH_COOLDOWN`. `/api/stats` includes the fallback state, memory state, safe OpenSearch status/error data, and cooldown timing.

Connection failures, timeouts, a missing index/alias, HTTP 429, and HTTP 502/503/504 may use memory fallback. HTTP 400/401/403, malformed queries, authorization errors, mapping errors, and document validation failures do not fall back because they require an operator or code correction. After the cooldown, one request probes OpenSearch; success automatically restores the primary backend.

For the local stack:

```bash
npm run opensearch:logs
npm run opensearch:verify
```

The first command follows OpenSearch and Dashboards startup/password/health logs. The second verifies one alias target, mapping schema version `1`, and the canonical document count.

## Manual alias rollback

In OpenSearch Dashboards Dev Tools, inspect targets and retained indexes:

```http
GET /_alias/directory-profiles
GET /_cat/indices/directory-profiles-v1-*?v
```

After identifying the exact current and known-good physical indexes, move the alias atomically:

```http
POST /_aliases
{
  "actions": [
    { "remove": { "index": "directory-profiles-v1-CURRENT", "alias": "directory-profiles" } },
    { "add": { "index": "directory-profiles-v1-KNOWN-GOOD", "alias": "directory-profiles" } }
  ]
}
```

Run `npm run opensearch:verify` afterwards. Verification will intentionally fail if the rolled-back index's schema or document count no longer matches the canonical store; investigate before serving it.

## Shutdown and data removal

For local non-destructive shutdown:

```bash
npm run opensearch:down
```

This retains the named volume. `docker compose down -v` deletes the volume and all local physical indexes; use it only when you intend to rebuild from the canonical JSON store.
