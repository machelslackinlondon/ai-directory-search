const { createDirectoryStore } = require("../src/server/directory/store");
const seed = require("../src/data/seed-directory.json");

const store = createDirectoryStore({
  data: seed
});

store.replaceEntries(seed.entries, seed.taxonomy);

console.log(`Seeded ${seed.entries.length} directory entries at ${store.dataPath}`);
