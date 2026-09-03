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

## First run

Prerequisites: Node.js 16.19+, npm, Docker with Compose, and at least 4 GB of memory available to Docker Desktop.

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

Before running Compose, replace both empty password values in `.env`—`OPENSEARCH_INITIAL_ADMIN_PASSWORD` and `OPENSEARCH_PASSWORD`—with the same strong random password. Never commit `.env`. See [Onboarding](docs/onboarding.md) for Linux host setup, expected output, Dashboards access, and a first search.

Open the app at `http://127.0.0.1:3000` and OpenSearch Dashboards at `http://127.0.0.1:5601` (user `admin`, password from `.env`).

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

`docker compose down -v` also deletes the local OpenSearch volume and is intentionally destructive.

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
