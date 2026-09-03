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
  assert.equal(compose.match(/healthcheck:/g).length, 2);
  assert.doesNotMatch(compose, /DISABLE_SECURITY_PLUGIN=true/);
});

test("compose persists data and publishes local services only on loopback", () => {
  const compose = fs.readFileSync("compose.yml", "utf8");
  assert.match(compose, /127\.0\.0\.1:9200:9200/);
  assert.match(compose, /127\.0\.0\.1:9600:9600/);
  assert.match(compose, /127\.0\.0\.1:5601:5601/);
  assert.match(compose, /opensearch-data:\/usr\/share\/opensearch\/data/);
  assert.match(compose, /curl -fk -u \\"admin:\$\$\{OPENSEARCH_INITIAL_ADMIN_PASSWORD\}\\"/);
  assert.match(compose, /condition: service_healthy/);
  assert.doesNotMatch(compose, /docker\.io\/library|latest/);
});

test("secured health commands quote credentials and whitelist meaningful Dashboards readiness codes", () => {
  const compose = fs.readFileSync("compose.yml", "utf8");
  const healthCommands = [...compose.matchAll(/test: \["CMD-SHELL", "([^"]*(?:\\"[^"]*)*)"\]/g)]
    .map((match) => match[1]);
  assert.equal(healthCommands.length, 2);
  assert.match(healthCommands[0], /-u \\"admin:\$\$\{OPENSEARCH_INITIAL_ADMIN_PASSWORD\}\\"/);
  assert.match(healthCommands[1], /%\{http_code\}/);
  assert.match(healthCommands[1], /200/);
  assert.match(healthCommands[1], /401/);
  assert.doesNotMatch(healthCommands[1], /curl -sS -o \/dev\/null http:\/\/localhost:5601/);

  const completeGate = /case \\"\$\$status\\" in ([0-9|]+)\) exit 0 ;; \*\) exit 1 ;; esac$/;
  const completeGateMatch = completeGate.exec(healthCommands[1]);
  assert.ok(completeGateMatch);
  const allowlist = completeGateMatch[1].split("|").map(Number);
  assert.deepEqual(allowlist, [200, 401]);
  assert.equal(allowlist.includes(500), false);
  assert.equal(allowlist.includes(503), false);

  const laterSuccess = healthCommands[1].replace("*) exit 1", "500|503) exit 0 ;; *) exit 1");
  const wildcardSuccess = healthCommands[1].replace("*) exit 1", "*) exit 0");
  assert.equal(completeGate.test(laterSuccess), false);
  assert.equal(completeGate.test(wildcardSuccess), false);
});

test("operations commands validate Compose before startup and keep live tests opt-in", () => {
  const { scripts } = require("../../package.json");
  assert.match(scripts["opensearch:up"], /^docker compose config --quiet && docker compose up -d /);
  assert.equal(scripts["opensearch:down"], "docker compose down");
  assert.equal(scripts["opensearch:logs"], "docker compose logs -f opensearch opensearch-dashboards");
  assert.equal(scripts["opensearch:wait"], "node scripts/opensearch.js wait");
  assert.equal(scripts["opensearch:bootstrap"], "node scripts/opensearch.js bootstrap");
  assert.equal(scripts["opensearch:reindex"], "node scripts/opensearch.js reindex");
  assert.equal(scripts["opensearch:verify"], "node scripts/opensearch.js verify");
  assert.equal(scripts["opensearch:test"], "OPENSEARCH_LIVE_TEST=1 node --test tests/integration/opensearch-live.test.js");
  assert.match(scripts["setup:opensearch"], /^npm run opensearch:up && npm run opensearch:wait/);
});

test("local environment example documents secured OpenSearch defaults without a password", () => {
  const example = fs.readFileSync(".env.example", "utf8");
  for (const setting of [
    "SEARCH_BACKEND=opensearch",
    "OPENSEARCH_NODE=https://127.0.0.1:9200",
    "OPENSEARCH_USERNAME=admin",
    "OPENSEARCH_INITIAL_ADMIN_PASSWORD=",
    "OPENSEARCH_PASSWORD=",
    "OPENSEARCH_INDEX_ALIAS=directory-profiles",
    "OPENSEARCH_REQUEST_TIMEOUT_MS=2000",
    "OPENSEARCH_FALLBACK_COOLDOWN_MS=30000",
    "OPENSEARCH_TLS_REJECT_UNAUTHORIZED=false"
  ]) {
    assert.match(example, new RegExp(`^${setting}$`, "m"));
  }
});

test("server and operations CLI load dotenv at executable entry", () => {
  const server = fs.readFileSync("src/server/index.js", "utf8");
  const cli = fs.readFileSync("scripts/opensearch.js", "utf8");
  assert.match(server, /^require\("dotenv"\)\.config\(/);
  assert.match(cli, /^require\("dotenv"\)\.config\(/);
  assert.match(cli, /wait\|bootstrap\|reindex\|verify/);
  assert.match(cli, /finally\s*{\s*await adapter\.close\(\)/);
});
