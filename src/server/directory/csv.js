function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseCsv(text) {
  const rows = parseCsvRows(String(text || ""));
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      const value = row[index] == null ? "" : row[index].trim();
      if (header === "tags") {
        entry.tags = value ? value.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean) : [];
      } else if (header === "metadata" || header === "taxonomy") {
        try {
          entry[header] = value ? JSON.parse(value) : {};
        } catch (error) {
          entry[header] = {};
        }
      } else {
        entry[header] = value;
      }
    });
    return entry;
  });
}

function csvEscape(value) {
  const string = String(value == null ? "" : value);
  if (/[",\n\r]/.test(string)) return `"${string.replace(/"/g, '""')}"`;
  return string;
}

function toCsv(entries) {
  const headers = ["id", "name", "description", "category", "tags", "location", "url", "contact", "metadata", "taxonomy", "createdAt", "updatedAt"];
  const lines = [headers.join(",")];
  entries.forEach((entry) => {
    lines.push(headers.map((header) => {
      if (header === "tags") return csvEscape((entry.tags || []).join("|"));
      if (header === "metadata" || header === "taxonomy") return csvEscape(JSON.stringify(entry[header] || {}));
      return csvEscape(entry[header]);
    }).join(","));
  });
  return lines.join("\n");
}

module.exports = {
  parseCsv,
  parseCsvRows,
  toCsv
};
