const fs = require("node:fs");
const os = require("node:os");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const canonicalSeed = require("../../src/data/seed-directory.json");
const { createStoreForCommand } = require("../../scripts/opensearch");

function invalidRuntimeFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opensearch-cli-store-"));
  const dataPath = path.join(directory, "directory.json");
  const contents = `${JSON.stringify({ entries: "legacy-runtime-data" })}\n`;
  fs.writeFileSync(dataPath, contents);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { contents, dataPath };
}

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

test("operations CLI can be imported without executing a command", () => {
  const env = { ...process.env };
  delete env.OPENSEARCH_PASSWORD;
  delete env.OPENSEARCH_INITIAL_ADMIN_PASSWORD;

  const result = spawnSync(process.execPath, ["-e", `
    const assert = require("node:assert/strict");
    const operations = require("./scripts/opensearch");
    assert.equal(typeof operations.main, "function");
    process.stdout.write("imported");
  `], {
    cwd: process.cwd(),
    env,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, "imported");
  assert.equal(result.stderr, "");
});

test("wait and bootstrap use the canonical seed in a memory-only store", (t) => {
  const { contents, dataPath } = invalidRuntimeFixture(t);
  const expectedIds = canonicalSeed.entries.map(({ id }) => id);

  for (const command of ["wait", "bootstrap"]) {
    const store = createStoreForCommand(command, { dataPath });
    assert.deepEqual(store.listEntries().map(({ id }) => id), expectedIds);
    store.save();
    assert.equal(fs.readFileSync(dataPath, "utf8"), contents);
  }
});

test("wait and bootstrap dispatch without loading an invalid runtime directory", (t) => {
  const { dataPath } = invalidRuntimeFixture(t);

  for (const command of ["wait", "bootstrap"]) {
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "opensearch.js"), command], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DIRECTORY_DATA_PATH: dataPath,
        OPENSEARCH_INITIAL_ADMIN_PASSWORD: "",
        OPENSEARCH_PASSWORD: "",
        OPENSEARCH_USERNAME: "admin"
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^OPENSEARCH_CONFIG_INVALID: OpenSearch password is required/);
    assert.doesNotMatch(result.stderr, /Invalid directory data|legacy-runtime-data/);
  }
});

test("reindex and verify load and validate the runtime directory", (t) => {
  const { dataPath } = invalidRuntimeFixture(t);

  for (const command of ["reindex", "verify"]) {
    assert.throws(
      () => createStoreForCommand(command, { dataPath }),
      /Payload must be an object with an entries array/
    );
  }
});
