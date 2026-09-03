const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("operations CLI rejects an unknown command before requiring credentials", () => {
  const env = { ...process.env };
  delete env.OPENSEARCH_PASSWORD;
  delete env.OPENSEARCH_INITIAL_ADMIN_PASSWORD;

  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "opensearch.js"), "nonsense"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^BAD_COMMAND: Usage:/);
  assert.doesNotMatch(result.stderr, /OPENSEARCH_CONFIG_INVALID/);
});
