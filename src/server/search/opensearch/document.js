function toSearchDocument(entry) {
  const taxonomy = entry.taxonomy || {};
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    businessType: entry.businessType || taxonomy.subcategory || "",
    state: entry.state || "",
    city: entry.city || "",
    tags: entry.tags || [],
    rooms: entry.rooms || taxonomy.facets?.rooms || [],
    projectTypes: entry.projectTypes || taxonomy.facets?.projectTypes || [],
    styles: entry.styles || taxonomy.facets?.styles || [],
    services: entry.services || taxonomy.facets?.services || [],
    aliases: taxonomy.aliases || [],
    synonyms: taxonomy.synonyms || [],
    relatedTerms: taxonomy.relatedTerms || [],
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    profile: entry
  };
}

module.exports = { toSearchDocument };
