export const MEAL_TAGS = [
  'beef',
  'chicken',
  'pork',
  'seafood',
  'vegetarian',
  'breakfast',
  'pasta',
  'pizza',
  'salad',
  'spicy',
  'premium',
]

export function macroLine(v) {
  if (v.calories == null) return null
  return `${v.calories} cal · ${v.protein_g}p / ${v.carbs_g}c / ${v.fat_g}f`
}

// Mirrors the DB trigger: lowercase, non-alphanumerics collapse to single spaces.
export function normalizeMealName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
