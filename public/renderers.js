(function attachRenderers(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DirectoryRenderers = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createRenderers() {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderTags(tags) {
    return (tags || []).slice(0, 6).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  }

  function renderState(message, tone) {
    return `<div class="state ${tone || ""}" role="status">${escapeHtml(message)}</div>`;
  }

  function renderResultList(results, selectedId) {
    if (!results || results.length === 0) {
      return renderState("No matching entries found.", "empty");
    }

    return results.map((result) => {
      const entry = result.entry || result;
      const active = entry.id === selectedId ? " active" : "";
      return `
        <button class="result-card${active}" data-entry-id="${escapeHtml(entry.id)}" type="button">
          <span class="result-card__top">
            <span>
              <strong>${escapeHtml(entry.name)}</strong>
              <small>${escapeHtml(entry.category)}${entry.location ? ` · ${escapeHtml(entry.location)}` : ""}</small>
            </span>
            <span class="score">${escapeHtml(Number(result.score || 0).toFixed(1))}</span>
          </span>
          <span class="result-card__description">${escapeHtml(entry.description)}</span>
          <span class="tag-row">${renderTags(entry.tags)}</span>
          <span class="why">${escapeHtml(result.whyMatched || "Matched by directory ranking.")}</span>
        </button>
      `;
    }).join("");
  }

  function renderDetail(entry) {
    if (!entry) {
      return renderState("Select a result to inspect its directory record.", "muted");
    }
    const taxonomy = entry.taxonomy || {};
    const facets = Object.entries(taxonomy.facets || {}).map(([key, values]) => `
      <div class="kv"><span>${escapeHtml(key)}</span><strong>${escapeHtml((values || []).join(", "))}</strong></div>
    `).join("");
    const metadata = Object.entries(entry.metadata || {}).map(([key, value]) => `
      <div class="kv"><span>${escapeHtml(key)}</span><strong>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</strong></div>
    `).join("");

    return `
      <article class="detail-record">
        <div>
          <p class="eyebrow">${escapeHtml(entry.category)}${taxonomy.subcategory ? ` / ${escapeHtml(taxonomy.subcategory)}` : ""}</p>
          <h2>${escapeHtml(entry.name)}</h2>
          <p>${escapeHtml(entry.description)}</p>
        </div>
        <div class="tag-row">${renderTags(entry.tags)}</div>
        <div class="detail-grid">
          <div class="kv"><span>ID</span><strong>${escapeHtml(entry.id)}</strong></div>
          <div class="kv"><span>Location</span><strong>${escapeHtml(entry.location || "N/A")}</strong></div>
          <div class="kv"><span>Contact</span><strong>${escapeHtml(entry.contact || "N/A")}</strong></div>
          <div class="kv"><span>Updated</span><strong>${escapeHtml(new Date(entry.updatedAt).toLocaleDateString())}</strong></div>
          ${facets}
          ${metadata}
        </div>
        ${entry.url ? `<a class="record-link" href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">Open record</a>` : ""}
      </article>
    `;
  }

  function renderAgentAnswer(agent) {
    if (!agent) return renderState("Ask a natural-language directory question.", "muted");
    const refs = (agent.references || []).map((reference) => `<span class="ref">${escapeHtml(reference.id)}</span>`).join("");
    return `
      <div class="agent-answer">
        <p>${escapeHtml(agent.answer)}</p>
        <div class="ref-row">${refs}</div>
      </div>
    `;
  }

  return {
    escapeHtml,
    renderAgentAnswer,
    renderDetail,
    renderResultList,
    renderState,
    renderTags
  };
}));
