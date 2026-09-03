const renderers = window.DirectoryRenderers;
const PREFERENCE_FIELDS = ["rooms", "projectTypes", "styles", "services"];

function emptyPreferences() {
  return Object.fromEntries(PREFERENCE_FIELDS.map((field) => [field, []]));
}

function copyPreferences(preferences) {
  return Object.fromEntries(PREFERENCE_FIELDS.map((field) => [field, [...(preferences[field] || [])]]));
}

const state = {
  categories: [],
  selectedId: null,
  results: [],
  detail: null,
  agent: null,
  agentLoading: false,
  activityLog: [],
  pendingPreferences: emptyPreferences(),
  appliedPreferences: emptyPreferences(),
  facets: {},
  loading: false,
  error: null,
  view: "search"
};

const elements = {
  searchInput: document.querySelector("#search-input"),
  searchButton: document.querySelector("#search-button"),
  agentInput: document.querySelector("#agent-input"),
  agentButton: document.querySelector("#agent-button"),
  agentInlineAnswer: document.querySelector("#agent-inline-answer"),
  businessTypeFilter: document.querySelector("#business-type-filter"),
  categoryFilter: document.querySelector("#category-filter"),
  stateFilter: document.querySelector("#state-filter"),
  moreFiltersToggle: document.querySelector("#more-filters-toggle"),
  moreFiltersPanel: document.querySelector("#more-filters-panel"),
  facetOptions: document.querySelectorAll("[data-facet-options]"),
  appliedFilterChips: document.querySelector("#applied-filter-chips"),
  applyFilters: document.querySelector("#apply-filters"),
  clearFilters: document.querySelector("#clear-filters"),
  sortControl: document.querySelector("#sort-control"),
  modeControl: document.querySelector("#mode-control"),
  resultCount: document.querySelector("#result-count"),
  results: document.querySelector("#results"),
  detail: document.querySelector("#detail"),
  agentAnswer: document.querySelector("#agent-answer"),
  clearButton: document.querySelector("#clear-button"),
  clearLogButton: document.querySelector("#clear-log-button"),
  activityLog: document.querySelector("#activity-log"),
  tabs: document.querySelectorAll(".tab"),
  searchView: document.querySelector("#search-view"),
  adminView: document.querySelector("#admin-view"),
  importButton: document.querySelector("#import-button"),
  reindexButton: document.querySelector("#reindex-button"),
  importContent: document.querySelector("#import-content"),
  importFormat: document.querySelector("#import-format"),
  importMode: document.querySelector("#import-mode"),
  importFile: document.querySelector("#import-file"),
  adminToken: document.querySelector("#admin-token"),
  adminStatus: document.querySelector("#admin-status"),
  statsOutput: document.querySelector("#stats-output")
};

function compactDetails(details) {
  return Object.entries(details || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length ? value.join(", ") : "none"}`;
      if (typeof value === "object") return `${key}: ${JSON.stringify(value)}`;
      return `${key}: ${value}`;
    })
    .join(" · ");
}

function renderActivityLog() {
  if (!elements.activityLog) return;
  if (state.activityLog.length === 0) {
    elements.activityLog.innerHTML = '<li class="activity-empty">No activity yet</li>';
    return;
  }

  elements.activityLog.innerHTML = state.activityLog.map((item) => `
    <li class="activity-item ${item.level}">
      <span class="activity-time">${renderers.escapeHtml(item.time)}</span>
      <strong>${renderers.escapeHtml(item.action)}</strong>
      ${item.details ? `<span>${renderers.escapeHtml(item.details)}</span>` : ""}
    </li>
  `).join("");
}

function activityLogSnapshot() {
  return state.activityLog.map((item) => ({
    time: item.time,
    level: item.level,
    action: item.action,
    details: item.details
  }));
}

function logActivityLogToConsole() {
  if (typeof console === "undefined" || !console.info) return;
  console.info("[directory] activity log", activityLogSnapshot());
}

function logInteraction(action, details = {}, level = "info") {
  const entry = {
    action,
    details: compactDetails(details),
    level,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  };
  state.activityLog = [entry, ...state.activityLog].slice(0, 30);
  if (typeof console !== "undefined" && console.info) {
    console.info(`[directory] ${action}`, entry);
  }
  logActivityLogToConsole();
  renderActivityLog();
}

function debounce(fn, delay) {
  let timer;
  return function debounced() {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

async function api(path, options) {
  const method = (options && options.method) || "GET";
  logInteraction("API request", { method, path });
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options && options.headers ? options.headers : {})
    },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    logInteraction("API error", { method, path, status: response.status }, "error");
    throw new Error(payload.error || "Request failed.");
  }
  logInteraction("API response", { method, path, status: response.status || 200 });
  return payload;
}

function getFilters() {
  return {
    category: elements.categoryFilter.value,
    businessType: elements.businessTypeFilter.value,
    state: elements.stateFilter.value,
    ...copyPreferences(state.appliedPreferences)
  };
}

function searchUrl() {
  const params = new URLSearchParams();
  params.set("query", elements.searchInput.value);
  params.set("sort", elements.sortControl.value);
  params.set("mode", elements.modeControl.value);
  const filters = getFilters();
  if (filters.category) params.set("category", filters.category);
  if (filters.businessType) params.set("businessType", filters.businessType);
  if (filters.state) params.set("state", filters.state);
  PREFERENCE_FIELDS.forEach((field) => {
    filters[field].forEach((value) => params.append(field, value));
  });
  return `/api/search?${params.toString()}`;
}

function renderPrimaryOptions() {
  const selectedCategory = elements.categoryFilter.value;
  const selectedBusinessType = elements.businessTypeFilter.value;
  const selectedState = elements.stateFilter.value;
  const categories = state.categories || [];
  const businessTypes = selectedCategory
    ? (categories.find((item) => item.category === selectedCategory)?.subcategories || [])
    : categories.flatMap((item) => item.subcategories || []);
  const states = state.facets.state || state.states || [];

  elements.categoryFilter.innerHTML = '<option value="">All categories</option>' + categories
    .map((item) => `<option value="${renderers.escapeHtml(item.category)}">${renderers.escapeHtml(item.category)}</option>`)
    .join("");
  elements.categoryFilter.value = selectedCategory;
  elements.businessTypeFilter.innerHTML = '<option value="">All business types</option>' + businessTypes
    .map((item) => `<option value="${renderers.escapeHtml(item)}">${renderers.escapeHtml(item)}</option>`)
    .join("");
  elements.businessTypeFilter.value = businessTypes.includes(selectedBusinessType) ? selectedBusinessType : "";
  elements.stateFilter.innerHTML = '<option value="">All states</option>' + states
    .map((item) => {
      const label = typeof item === "string" ? item : item.label;
      return `<option value="${renderers.escapeHtml(label)}">${renderers.escapeHtml(label)}</option>`;
    })
    .join("");
  elements.stateFilter.value = selectedState;
}

function facetLabels(field) {
  const taxonomyLabels = state.taxonomyFacets?.[field] || [];
  const responseLabels = (state.facets[field] || []).map((item) => typeof item === "string" ? item : item.label);
  return [...new Set([...taxonomyLabels, ...responseLabels])];
}

function renderFacetOptions() {
  elements.facetOptions.forEach((container) => {
    const field = container.dataset.facetOptions || container.selector?.match(/"(.+)"/)?.[1];
    const counts = new Map((state.facets[field] || []).map((item) => [typeof item === "string" ? item : item.label, typeof item === "string" ? 0 : item.count]));
    container.innerHTML = facetLabels(field).map((label) => {
      const checked = state.pendingPreferences[field].includes(label) ? " checked" : "";
      return `<label class="facet-option"><input type="checkbox" name="${renderers.escapeHtml(field)}" value="${renderers.escapeHtml(label)}"${checked}><span>${renderers.escapeHtml(label)}</span><strong>${renderers.escapeHtml(counts.get(label) || 0)}</strong></label>`;
    }).join("");
  });
}

function appliedFilterEntries() {
  const primary = [
    ["category", elements.categoryFilter.value],
    ["businessType", elements.businessTypeFilter.value],
    ["state", elements.stateFilter.value]
  ].filter(([, value]) => value);
  const preferences = PREFERENCE_FIELDS.flatMap((field) => state.appliedPreferences[field].map((value) => [field, value]));
  return [...primary, ...preferences];
}

function renderAppliedFilterChips() {
  elements.appliedFilterChips.innerHTML = appliedFilterEntries().map(([field, value]) =>
    `<span class="filter-chip">${renderers.escapeHtml(value)}<button class="filter-chip__remove" type="button" data-chip-field="${renderers.escapeHtml(field)}" data-chip-value="${renderers.escapeHtml(value)}" aria-label="Remove ${renderers.escapeHtml(value)} filter">×</button></span>`
  ).join("");
}

function renderFilterControls() {
  renderPrimaryOptions();
  renderFacetOptions();
  renderAppliedFilterChips();
}

function render() {
  renderActivityLog();
  renderFilterControls();
  elements.resultCount.textContent = `${state.results.length} ${state.results.length === 1 ? "entry" : "entries"}`;
  if (state.loading) {
    elements.results.innerHTML = renderers.renderState("Searching directory...", "loading");
  } else if (state.error) {
    elements.results.innerHTML = renderers.renderState(state.error, "error");
  } else {
    elements.results.innerHTML = renderers.renderResultList(state.results, state.selectedId);
  }
  elements.detail.innerHTML = renderers.renderDetail(state.detail);
  const agentMarkup = state.agentLoading
    ? renderers.renderState("Answering from directory records...", "loading")
    : renderers.renderAgentAnswer(state.agent);
  elements.agentAnswer.innerHTML = agentMarkup;
  elements.agentInlineAnswer.innerHTML = agentMarkup;
  elements.agentButton.disabled = state.agentLoading;
  elements.agentButton.textContent = state.agentLoading ? "Asking..." : "Ask";

  document.querySelectorAll(".result-card").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.entryId));
  });
}

async function loadCategories() {
  logInteraction("Load taxonomy", {});
  const taxonomy = await api("/api/categories");
  state.categories = taxonomy.categories || [];
  state.taxonomyFacets = taxonomy.facets || {};
  state.states = taxonomy.states || [];
  logInteraction("Taxonomy loaded", { categories: state.categories.length });
  renderFilterControls();
}

async function loadStats() {
  logInteraction("Load index stats", {});
  const stats = await api("/api/stats");
  elements.statsOutput.textContent = JSON.stringify(stats, null, 2);
  logInteraction("Index stats loaded", { entries: stats.entries, adapter: stats.adapter });
}

async function runSearch() {
  const filters = getFilters();
  logInteraction("Search started", {
    query: elements.searchInput.value || "(empty)",
    category: filters.category || "all",
    businessType: filters.businessType || "all",
    state: filters.state || "all",
    preferences: state.appliedPreferences,
    sort: elements.sortControl.value,
    mode: elements.modeControl.value
  });
  state.loading = true;
  state.error = null;
  render();
  try {
    const response = await api(searchUrl());
    state.results = response.results || [];
    state.facets = response.facets || {};
    state.selectedId = state.results[0] ? state.results[0].id : null;
    state.detail = state.results[0] ? state.results[0].entry : null;
    logInteraction("Search completed", {
      results: state.results.length,
      selected: state.selectedId || "none",
      tookMs: response.tookMs
    }, state.results.length ? "success" : "warn");
  } catch (error) {
    state.error = error.message;
    state.results = [];
    state.detail = null;
    logInteraction("Search failed", { error: error.message }, "error");
  } finally {
    state.loading = false;
    render();
  }
}

async function openDetail(id) {
  logInteraction("Detail requested", { id });
  state.selectedId = id;
  try {
    state.detail = await api(`/api/entries/${encodeURIComponent(id)}`);
    logInteraction("Detail opened", { id, name: state.detail.name }, "success");
  } catch (error) {
    logInteraction("Detail failed", { id, error: error.message }, "error");
  } finally {
    render();
  }
}

async function askAgent() {
  const question = elements.agentInput.value || elements.searchInput.value;
  if (!question.trim()) {
    logInteraction("Ask skipped", { reason: "empty question" }, "warn");
    return;
  }
  logInteraction("Ask started", { question, filters: getFilters() });
  state.agentLoading = true;
  state.agent = null;
  render();
  try {
    state.agent = await api("/api/agent", {
      method: "POST",
      body: JSON.stringify({
        question,
        filters: getFilters(),
        sort: elements.sortControl.value,
        limit: 5
      })
    });
    logInteraction("Ask completed", {
      references: (state.agent.references || []).map((reference) => reference.id),
      tools: state.agent.tools || []
    }, state.agent.references && state.agent.references.length ? "success" : "warn");
  } catch (error) {
    state.agent = { answer: error.message, references: [] };
    logInteraction("Ask failed", { error: error.message }, "error");
  } finally {
    state.agentLoading = false;
  }
  render();
}

async function importEntries() {
  logInteraction("Import started", {
    format: elements.importFormat.value,
    mode: elements.importMode.value,
    hasFileOrContent: Boolean(elements.importFile.files[0] || elements.importContent.value)
  });
  elements.adminStatus.innerHTML = renderers.renderState("Importing entries...", "loading");
  try {
    const token = elements.adminToken.value;
    const payload = {
      format: elements.importFormat.value,
      mode: elements.importMode.value,
      content: elements.importContent.value
    };
    const result = await api("/api/admin/import", {
      method: "POST",
      headers: token ? { "x-admin-token": token } : {},
      body: JSON.stringify(payload)
    });
    elements.adminStatus.innerHTML = renderers.renderState(`Imported ${result.count} entries.`, "success");
    logInteraction("Import completed", { count: result.count, entries: result.entries }, "success");
    await Promise.all([loadCategories(), loadStats(), runSearch()]);
  } catch (error) {
    elements.adminStatus.innerHTML = renderers.renderState(error.message, "error");
    logInteraction("Import failed", { error: error.message }, "error");
  }
}

async function reindex() {
  logInteraction("Reindex started", {});
  elements.adminStatus.innerHTML = renderers.renderState("Rebuilding index...", "loading");
  try {
    const token = elements.adminToken.value;
    const result = await api("/api/admin/reindex", {
      method: "POST",
      headers: token ? { "x-admin-token": token } : {},
      body: JSON.stringify({})
    });
    elements.adminStatus.innerHTML = renderers.renderState(`Indexed ${result.entries} entries.`, "success");
    logInteraction("Reindex completed", { entries: result.entries, adapter: result.adapter }, "success");
    await loadStats();
  } catch (error) {
    elements.adminStatus.innerHTML = renderers.renderState(error.message, "error");
    logInteraction("Reindex failed", { error: error.message }, "error");
  }
}

function switchView(view) {
  logInteraction("View switched", { view });
  state.view = view;
  elements.searchView.classList.toggle("hidden", view !== "search");
  elements.adminView.classList.toggle("hidden", view !== "admin");
  elements.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  if (view === "admin") loadStats();
}

function clearDirectoryFilters() {
  elements.categoryFilter.value = "";
  elements.businessTypeFilter.value = "";
  elements.stateFilter.value = "";
  state.pendingPreferences = emptyPreferences();
  state.appliedPreferences = emptyPreferences();
}

function removeAppliedFilter(field, value) {
  if (PREFERENCE_FIELDS.includes(field)) {
    state.pendingPreferences[field] = state.pendingPreferences[field].filter((item) => item !== value);
    state.appliedPreferences[field] = state.appliedPreferences[field].filter((item) => item !== value);
  } else if (field === "category") {
    elements.categoryFilter.value = "";
    elements.businessTypeFilter.value = "";
  } else if (field === "businessType") {
    elements.businessTypeFilter.value = "";
  } else if (field === "state") {
    elements.stateFilter.value = "";
  }
  runSearch();
}

elements.searchButton.addEventListener("click", () => {
  logInteraction("Search button clicked", {});
  runSearch();
});
elements.searchInput.addEventListener("input", debounce(() => {
  logInteraction("Search input changed", { query: elements.searchInput.value || "(empty)" });
  runSearch();
}, 250));
elements.categoryFilter.addEventListener("change", () => {
  logInteraction("Category filter changed", { category: elements.categoryFilter.value || "all" });
  renderPrimaryOptions();
  runSearch();
});
elements.businessTypeFilter.addEventListener("change", () => {
  logInteraction("Business type filter changed", { businessType: elements.businessTypeFilter.value || "all" });
  runSearch();
});
elements.stateFilter.addEventListener("change", () => {
  logInteraction("State filter changed", { state: elements.stateFilter.value || "all" });
  runSearch();
});
elements.moreFiltersToggle.addEventListener("click", () => {
  elements.moreFiltersPanel.hidden = !elements.moreFiltersPanel.hidden;
  elements.moreFiltersToggle.setAttribute("aria-expanded", String(!elements.moreFiltersPanel.hidden));
});
elements.facetOptions.forEach((container) => container.addEventListener("change", (event) => {
  const input = event.target;
  if (!input || input.type !== "checkbox" || !PREFERENCE_FIELDS.includes(input.name)) return;
  const selected = state.pendingPreferences[input.name];
  state.pendingPreferences[input.name] = input.checked
    ? [...new Set([...selected, input.value])]
    : selected.filter((value) => value !== input.value);
  renderFacetOptions();
}));
elements.applyFilters.addEventListener("click", () => {
  state.appliedPreferences = copyPreferences(state.pendingPreferences);
  logInteraction("Preference filters applied", { preferences: state.appliedPreferences });
  runSearch();
});
elements.clearFilters.addEventListener("click", () => {
  logInteraction("Filters cleared", {});
  clearDirectoryFilters();
  runSearch();
});
elements.appliedFilterChips.addEventListener("click", (event) => {
  const button = event.target;
  if (!button?.dataset?.chipField) return;
  logInteraction("Applied filter removed", { field: button.dataset.chipField, value: button.dataset.chipValue });
  removeAppliedFilter(button.dataset.chipField, button.dataset.chipValue);
});
elements.sortControl.addEventListener("change", () => {
  logInteraction("Sort changed", { sort: elements.sortControl.value });
  runSearch();
});
elements.modeControl.addEventListener("change", () => {
  logInteraction("Mode changed", { mode: elements.modeControl.value });
  runSearch();
});
elements.agentButton.addEventListener("click", askAgent);
elements.agentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    logInteraction("Ask submitted with Enter", {});
    askAgent();
  }
});
elements.clearButton.addEventListener("click", () => {
  logInteraction("Search cleared", {});
  elements.searchInput.value = "";
  clearDirectoryFilters();
  elements.sortControl.value = "relevance";
  elements.modeControl.value = "keyword";
  state.agent = null;
  runSearch();
});
elements.clearLogButton.addEventListener("click", () => {
  state.activityLog = [];
  renderActivityLog();
  logInteraction("Activity log cleared", {});
});
elements.tabs.forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
elements.importButton.addEventListener("click", importEntries);
elements.reindexButton.addEventListener("click", reindex);
elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files[0];
  if (!file) return;
  logInteraction("Import file selected", { name: file.name, size: file.size || 0 });
  elements.importContent.value = await file.text();
  elements.importFormat.value = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
  logInteraction("Import file loaded", { format: elements.importFormat.value });
});

logInteraction("App initialized", {});

loadCategories()
  .then(runSearch)
  .then(loadStats)
  .catch((error) => {
    state.error = error.message;
    render();
  });

render();
