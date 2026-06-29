const fs = require("fs");
const path = require("path");
const { createDirectoryStore } = require("../src/server/directory/store");
const { createMemorySearchAdapter } = require("../src/server/search/memorySearchAdapter");

const store = createDirectoryStore();
const adapter = createMemorySearchAdapter(store);
const stats = adapter.reindex();
const outputPath = path.join(process.cwd(), "data", "index-stats.json");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(stats, null, 2)}\n`);

console.log(`Indexed ${stats.entries} entries with ${stats.adapter} adapter.`);
console.log(`Wrote ${outputPath}`);
