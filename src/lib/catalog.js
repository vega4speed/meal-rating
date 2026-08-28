export const MEAL_TAGS = [
  'beef',
  'chicken',
  'pork',
  'seafood',
  'vegetarian',
  'breakfast',
  'pasta',
  'spicy',
  'low-carb',
]

// Mirrors the DB trigger: lowercase, non-alphanumerics collapse to single spaces.
export function normalizeMealName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
