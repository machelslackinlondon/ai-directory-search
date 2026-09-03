require("dotenv").config({ quiet: true });
const { createDirectoryStore } = require("../src/server/directory/store");
const { createOpenSearchClient } = require("../src/server/search/opensearch/client");
const { createOpenSearchSearchAdapter } = require("../src/server/search/opensearchSearchAdapter");

async function main(command = process.argv[2]) {
  const store = createDirectoryStore();
  const adapter = createOpenSearchSearchAdapter(store, { client: createOpenSearchClient() });
  try {
    if (command === "wait") return console.log(JSON.stringify(await adapter.waitForReady(), null, 2));
    if (command === "bootstrap") return console.log(JSON.stringify(await adapter.bootstrap(), null, 2));
    if (command === "reindex") return console.log(JSON.stringify(await adapter.reindex(), null, 2));
    if (command === "verify") return console.log(JSON.stringify(await adapter.verify(), null, 2));
    throw Object.assign(new Error("Usage: node scripts/opensearch.js <wait|bootstrap|reindex|verify>"), { code: "BAD_COMMAND" });
  } finally {
    await adapter.close();
  }
}

main().catch((error) => {
  console.error(`${error.code || "OPENSEARCH_COMMAND_FAILED"}: ${error.message}`);
  process.exitCode = 1;
});
