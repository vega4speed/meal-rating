// Clean Eatz meal-plan pricing. Tier price is per tier-eligible meal and depends
// on how many are in the order; add-ons (empanadas, sammiez, premiums, salads,
// PB&J) have a fixed per-item price and don't count toward the tiers.
// Source: the pricing block on cleaneatz.com/healthy-meal-plans.

export const MEAL_TIERS = [
  { upTo: 9, cents: 899 },
  { upTo: 14, cents: 829 },
  { upTo: 20, cents: 799 },
  { upTo: Infinity, cents: 739 },
]

// $1.75 per meal, added when the order is placed Extra Protein.
export const EXTRA_PROTEIN_CENTS = 175

export function tierPriceCents(mainCount) {
  return (MEAL_TIERS.find((t) => mainCount <= t.upTo) ?? MEAL_TIERS.at(-1)).cents
}

export function usd(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

// items: [{ price_cents: number|null, qty: number }]
export function orderTotalCents(items, { extraProtein = false } = {}) {
  let mainCount = 0
  let addonCents = 0
  for (const it of items) {
    if (it.price_cents == null) mainCount += it.qty
    else addonCents += it.price_cents * it.qty
  }
  const perMain = tierPriceCents(mainCount) + (extraProtein ? EXTRA_PROTEIN_CENTS : 0)
  return {
    mainCount,
    subtotalCents: mainCount * perMain + addonCents,
    perMainCents: perMain,
  }
}
