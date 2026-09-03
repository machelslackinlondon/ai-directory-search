require("dotenv").config({ quiet: true });
const { createDirectoryStore } = require("../src/server/directory/store");
const { createOpenSearchClient } = require("../src/server/search/opensearch/client");
const { createOpenSearchSearchAdapter } = require("../src/server/search/opensearchSearchAdapter");
const canonicalSeed = require("../src/data/seed-directory.json");

function createStoreForCommand(command, storeOptions = {}) {
  if (command === "wait" || command === "bootstrap") {
    return createDirectoryStore({
      ...storeOptions,
      data: canonicalSeed,
      memoryOnly: true
    });
  }
  return createDirectoryStore(storeOptions);
}

async function main(command = process.argv[2]) {
  if (!["wait", "bootstrap", "reindex", "verify"].includes(command)) {
    throw Object.assign(new Error("Usage: node scripts/opensearch.js <wait|bootstrap|reindex|verify>"), { code: "BAD_COMMAND" });
  }
  const store = createStoreForCommand(command);
  const adapter = createOpenSearchSearchAdapter(store, { client: createOpenSearchClient() });
  try {
    if (command === "wait") return console.log(JSON.stringify(await adapter.waitForReady(), null, 2));
    if (command === "bootstrap") return console.log(JSON.stringify(await adapter.bootstrap(), null, 2));
    if (command === "reindex") return console.log(JSON.stringify(await adapter.reindex(), null, 2));
    if (command === "verify") return console.log(JSON.stringify(await adapter.verify(), null, 2));
  } finally {
    await adapter.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${error.code || "OPENSEARCH_COMMAND_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createStoreForCommand, main };
