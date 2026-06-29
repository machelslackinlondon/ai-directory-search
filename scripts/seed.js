const { createDirectoryStore, DEFAULT_SEED_PATH } = require("../src/server/directory/store");

const store = createDirectoryStore({
  seedPath: DEFAULT_SEED_PATH
});

const seed = require("../src/data/seed-directory.json");
store.replaceEntries(seed.entries, seed.taxonomy);

console.log(`Seeded ${seed.entries.length} directory entries at ${store.dataPath}`);
