const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(filePath);
    return entry.isFile() && entry.name.endsWith(".test.js") ? [filePath] : [];
  });
}

const tests = walk(path.join(process.cwd(), "tests")).sort();
if (tests.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test"
  }
});

process.exit(result.status == null ? 1 : result.status);
