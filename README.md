# AI Directory Search

A local-first directory for design professionals. OpenSearch is the primary read index; the JSON directory remains canonical, and an in-memory adapter takes over only for recoverable OpenSearch availability failures.

## Search experience

- Free-text ranking combines native BM25, search-time synonyms, indexed firm aliases, bounded fuzzy matching, and name/alias autocomplete.
- The three primary filters are **Business Type**, **Category**, and **State**. They combine with AND semantics.
- **Rooms**, **Project Types**, **Styles**, and **Services** are multi-select preferences. They form one global OR, while profiles matching more selections receive a relevance boost.
- Result cards display structured `matchLabels` that explain which selected preferences matched.
- The deterministic agent answers only from returned directory records and includes profile IDs as references.

The only top-level categories are:

1. `Architecture`
2. `Interior Design + Decor`
3. `Outdoor + Garden Design`

## Local onboarding

Run every command from the repository root—the directory containing `package.json` and `compose.yml`.

### Prerequisites

- Node.js 16.19 or newer and npm.
- Docker Desktop or Docker Engine with the Compose plugin.
- At least 4 GB of memory available to Docker Desktop. The local OpenSearch JVM uses a 512 MB heap.

On Linux, OpenSearch also requires a larger virtual-memory map limit:

```bash
sudo sysctl -w vm.max_map_count=262144
```

### 1. Create the local environment

Copy the template:

```bash
cp .env.example .env
```

Generate a strong local password:

```bash
printf 'DirSearch-%s!Aa9\n' "$(openssl rand -hex 24)"
```

Copy the generated value into both of these entries in `.env`:

```dotenv
OPENSEARCH_INITIAL_ADMIN_PASSWORD=your-generated-password
OPENSEARCH_PASSWORD=your-generated-password
```

The first value initializes the secured Docker node; the second authenticates the application client. They must match. `.env` is ignored by Git—never commit it, paste it into tickets, or include it in screenshots.

### 2. Install dependencies

```bash
npm install
```

### 3. Validate Docker Compose

```bash
docker compose config --quiet
```

No output means the Compose file and environment interpolation are valid. The `--quiet` option avoids printing the resolved configuration, which can contain the password.

### 4. Start OpenSearch and build the index

```bash
npm run setup:opensearch
```

This command starts OpenSearch and Dashboards, waits for cluster readiness, installs the versioned template and strict mapping, checks the analyzers, writes the canonical seed data, creates a physical index, moves the stable `directory-profiles` alias, and verifies the indexed document count.

The first Docker pull and OpenSearch startup can take several minutes. Check progress in another terminal with:

```bash
docker compose ps
npm run opensearch:logs
```

Stop log streaming with Ctrl-C; this does not stop the containers.

### 5. Verify search behavior

```bash
npm test
npm run opensearch:test
npm run eval
```

`npm test` runs the normal suite with live checks skipped. `npm run opensearch:test` exercises the running cluster, including BM25, synonyms, aliases, fuzzy matching, autocomplete, filters, facets, and match labels. `npm run eval` runs the deterministic grounded-search evaluation.

### 6. Run the application

```bash
npm run dev
```

Open:

- Application: `http://127.0.0.1:3000`
- OpenSearch Dashboards: `http://127.0.0.1:5601`

Confirm that the application is using OpenSearch:

```bash
curl --silent 'http://127.0.0.1:3000/api/stats'
```

The response should report `"backend":"opensearch"` and `"fallback":false`. Try a representative filtered search:

```bash
curl --get --silent 'http://127.0.0.1:3000/api/search' \
  --data-urlencode 'query=modern renovation' \
  --data-urlencode 'category=Architecture' \
  --data-urlencode 'rooms=Kitchen' \
  --data-urlencode 'styles=Modern'
```

## Inspect OpenSearch

### OpenSearch Dashboards

Sign in at `http://127.0.0.1:5601` with username `admin` and the password stored in `.env`. Open **Dev Tools** and run:

```http
GET /_cluster/health
GET /_cat/indices/directory-profiles-v1-*?v
GET /_alias/directory-profiles
GET /_index_template/directory-profiles-template-v1
GET /directory-profiles/_mapping
GET /directory-profiles/_count
```

These requests show cluster health, versioned physical indexes, the stable alias, the ahead-of-time template and analyzers, the effective strict mapping, and the indexed profile count.

Inspect analyzer behavior:

```http
POST /directory-profiles/_analyze
{
  "analyzer": "directory_description_search",
  "text": "remodel"
}

POST /directory-profiles/_analyze
{
  "analyzer": "directory_autocomplete",
  "text": "Arch"
}
```

Inspect a scored search directly:

```http
GET /directory-profiles/_search
{
  "size": 5,
  "_source": ["id", "name", "category", "businessType", "state", "rooms", "styles"],
  "query": {
    "multi_match": {
      "query": "modern renovation",
      "fields": ["name^8", "aliases^7", "businessType.search^6", "category.search^5", "description^3"],
      "fuzziness": "AUTO"
    }
  }
}
```

### Direct HTTPS API

You can inspect the local API without putting the password in the command or process list. Each command prompts for the `admin` password from `.env`:

```bash
curl --insecure --user admin 'https://127.0.0.1:9200/_cluster/health?pretty'
curl --insecure --user admin 'https://127.0.0.1:9200/_cat/indices/directory-profiles-v1-*?v'
curl --insecure --user admin 'https://127.0.0.1:9200/_alias/directory-profiles?pretty'
```

`--insecure` is appropriate only for this loopback development node with its self-signed demo certificate. Do not disable certificate verification in production.

## Main commands

```bash
npm run dev                   # start the app; OpenSearch is attempted first
npm run setup:opensearch      # start, bootstrap, seed, reindex, and verify
npm run opensearch:up         # validate Compose and start both local services
npm run opensearch:wait       # wait until cluster health is yellow or green
npm run opensearch:bootstrap  # install/verify mappings and analyzers before indexing
npm run opensearch:reindex    # build a versioned index and atomically move the alias
npm run opensearch:verify     # verify template, alias, effective strict mapping, and count
npm run opensearch:logs       # follow local OpenSearch and Dashboards logs
npm run opensearch:down       # stop containers but retain indexed local data
npm test                      # fast suite; Docker-backed tests are skipped
npm run opensearch:test       # opt-in live OpenSearch suite
npm run eval                  # five grounded domain-search evaluations
npm run mcp list              # list MCP-compatible tool contracts
```

## Shutdown, restart, and troubleshooting

Stop the application with Ctrl-C. Stop the Docker services while retaining indexed data with:

```bash
npm run opensearch:down
```

Restart retained services with `npm run opensearch:up`, or rerun `npm run setup:opensearch` to bootstrap, seed, reindex, and verify the complete local state.

- `no configuration file provided`: change to the repository root and confirm that `compose.yml` exists.
- Missing-password interpolation error: set both OpenSearch password entries in `.env` to the same non-empty value.
- Unhealthy containers or connection failures: run `docker compose ps` and `npm run opensearch:logs`; also check Docker memory and Linux `vm.max_map_count`.
- Mapping, alias, or document-count concerns: run `npm run opensearch:verify`.
- Memory fallback: check `/api/stats`; recoverable OpenSearch availability failures use the in-memory adapter until the primary recovers.
- Changed password with an existing volume: OpenSearch retains the original initialized password. Restore it or deliberately rebuild the local index.

`docker compose down -v` deletes the OpenSearch volume and every local physical index. It is intentionally destructive; use it only when you intend to rebuild from canonical JSON with `npm run setup:opensearch`.

## Guides

- [Onboarding](docs/onboarding.md)
- [Architecture](docs/architecture.md)
- [Environment](docs/environment.md)
- [Deployment and operations](docs/deployment.md)
- [Testing](docs/testing.md)
- [Evaluation](docs/evaluation.md)
- [MCP](docs/mcp.md)
- [Taxonomy](docs/taxonomy.md)
- [Usage](docs/usage.md)
