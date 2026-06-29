const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./csv");
const { collectTaxonomy } = require("./taxonomy");
const {
  normalizeEntry,
  validateAndNormalizeEntry,
  validateDirectoryPayload
} = require("./schema");

const DEFAULT_SEED_PATH = path.join(process.cwd(), "src", "data", "seed-directory.json");
const DEFAULT_DATA_PATH = path.join(process.cwd(), "data", "directory.json");

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDataShape(payload) {
  const validation = validateDirectoryPayload(payload);
  if (!validation.ok) {
    throw new Error(`Invalid directory data: ${validation.errors.join(" ")}`);
  }
  return {
    entries: validation.entries,
    taxonomy: validation.taxonomy || {}
  };
}

function loadInitialData(options = {}) {
  if (options.data) return ensureDataShape(options.data);
  const dataPath = options.dataPath || process.env.DIRECTORY_DATA_PATH || DEFAULT_DATA_PATH;
  const seedPath = options.seedPath || DEFAULT_SEED_PATH;
  const filePath = fs.existsSync(dataPath) ? dataPath : seedPath;
  return ensureDataShape(readJsonFile(filePath));
}

function createDirectoryStore(options = {}) {
  const dataPath = options.dataPath || process.env.DIRECTORY_DATA_PATH || DEFAULT_DATA_PATH;
  let state = loadInitialData(options);

  function save() {
    if (options.memoryOnly) return;
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, `${JSON.stringify(state, null, 2)}\n`);
  }

  function listEntries() {
    return state.entries.map((entry) => ({ ...entry }));
  }

  function getEntry(id) {
    const entry = state.entries.find((item) => item.id === id);
    return entry ? { ...entry } : null;
  }

  function upsertEntry(input) {
    const validation = validateAndNormalizeEntry(input);
    if (!validation.ok) {
      const error = new Error(validation.errors.join(" "));
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    const entry = {
      ...validation.entry,
      updatedAt: new Date().toISOString()
    };
    const index = state.entries.findIndex((item) => item.id === entry.id);
    if (index === -1) {
      state.entries.push(entry);
    } else {
      state.entries[index] = {
        ...state.entries[index],
        ...entry,
        createdAt: state.entries[index].createdAt || entry.createdAt
      };
    }
    save();
    return getEntry(entry.id);
  }

  function deleteEntry(id) {
    const before = state.entries.length;
    state.entries = state.entries.filter((entry) => entry.id !== id);
    if (state.entries.length !== before) save();
    return before !== state.entries.length;
  }

  function replaceEntries(entries, taxonomy = state.taxonomy) {
    const payload = ensureDataShape({ entries, taxonomy });
    state = payload;
    save();
    return listEntries();
  }

  function importEntries(input, options = {}) {
    const mode = options.mode || "upsert";
    let entries;
    let taxonomy = state.taxonomy;

    if (typeof input === "string") {
      if (options.format === "csv") {
        entries = parseCsv(input);
      } else {
        const parsed = JSON.parse(input);
        entries = Array.isArray(parsed) ? parsed : parsed.entries;
        taxonomy = parsed.taxonomy || taxonomy;
      }
    } else if (Array.isArray(input)) {
      entries = input;
    } else {
      entries = input.entries;
      taxonomy = input.taxonomy || taxonomy;
    }

    const validation = validateDirectoryPayload({ entries, taxonomy });
    if (!validation.ok) {
      const error = new Error(validation.errors.join(" "));
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    if (mode === "replace") {
      state = { entries: validation.entries, taxonomy: validation.taxonomy };
    } else {
      validation.entries.forEach((entry) => {
        const normalized = normalizeEntry(entry);
        const index = state.entries.findIndex((item) => item.id === normalized.id);
        if (index === -1) state.entries.push(normalized);
        else state.entries[index] = { ...state.entries[index], ...normalized, updatedAt: new Date().toISOString() };
      });
      state.taxonomy = { ...state.taxonomy, ...validation.taxonomy };
    }
    save();

    return {
      count: validation.entries.length,
      entries: validation.entries.map((entry) => entry.id)
    };
  }

  function getTaxonomy() {
    return collectTaxonomy(state.entries, state.taxonomy);
  }

  function getRawData() {
    return {
      entries: listEntries(),
      taxonomy: state.taxonomy
    };
  }

  return {
    dataPath,
    deleteEntry,
    getEntry,
    getRawData,
    getTaxonomy,
    importEntries,
    listEntries,
    replaceEntries,
    save,
    upsertEntry
  };
}

function createMemoryDirectoryStore(data) {
  return createDirectoryStore({ data, memoryOnly: true });
}

module.exports = {
  DEFAULT_DATA_PATH,
  DEFAULT_SEED_PATH,
  createDirectoryStore,
  createMemoryDirectoryStore,
  loadInitialData
};
