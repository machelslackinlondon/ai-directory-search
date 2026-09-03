const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const canonicalSeed = require("../../src/data/seed-directory.json");

test("seed replaces invalid runtime data with the canonical design directory", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "directory-seed-"));
  const dataPath = path.join(directory, "directory.json");
  const seedPath = path.join(process.cwd(), "src", "data", "seed-directory.json");
  const sourceBefore = fs.readFileSync(seedPath, "utf8");
  fs.writeFileSync(dataPath, `${JSON.stringify({ entries: "legacy-runtime-data" })}\n`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "seed.js")], {
    cwd: process.cwd(),
    env: { ...process.env, DIRECTORY_DATA_PATH: dataPath },
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, `Seeded 6 directory entries at ${dataPath}\n`);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, "utf8")), {
    taxonomy: canonicalSeed.taxonomy,
    entries: canonicalSeed.entries.map((entry) => ({
      ...entry,
      location: `${entry.city}, ${entry.state}`
    }))
  });
  assert.equal(fs.readFileSync(seedPath, "utf8"), sourceBefore);
});
