const { normalizeText } = require("../utils/text");

const DESIGN_CATEGORIES = [
  { category: "Architecture", subcategories: ["Building Architect", "Interior Architect", "Residential Architect"] },
  { category: "Interior Design + Decor", subcategories: ["Decorator", "Design Consultant", "Interior Design Consultant", "Interior Designer", "Kitchen Designer", "Stylist"] },
  { category: "Outdoor + Garden Design", subcategories: ["Landscape Architect", "Landscape Designer"] }
];

const DESIGN_FACETS = {
  rooms: ["Kitchen", "Living Room", "Bathroom"],
  projectTypes: ["Renovation", "New Build", "Hospitality"],
  styles: ["Modern", "Traditional", "Eclectic"],
  services: ["Full-service Design", "Consultation"]
};

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming"
];

function canonicalizeControlledValue(values, input) {
  const wanted = normalizeText(input);
  return values.find((value) => normalizeText(value) === wanted) || "";
}

function businessTypeBelongsToCategory(category, businessType) {
  const parent = DESIGN_CATEGORIES.find((item) => item.category === category);
  return Boolean(parent && parent.subcategories.includes(businessType));
}

module.exports = {
  DESIGN_CATEGORIES,
  DESIGN_FACETS,
  US_STATES,
  businessTypeBelongsToCategory,
  canonicalizeControlledValue
};
