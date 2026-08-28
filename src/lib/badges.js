// Week View badges. NOT IN 6 MONTHS needs order history (Phase 6) and is omitted.
export function mealBadges({ householdAvg, ratingCount, myScore }) {
  const out = []
  if (!ratingCount) out.push({ label: 'NEW', tone: 'sky' })
  if (myScore === 5) out.push({ label: 'YOUR FAVORITE', tone: 'amber' })
  if (householdAvg != null && householdAvg >= 4.5)
    out.push({ label: 'LOVED', tone: 'emerald' })
  if (householdAvg != null && householdAvg <= 2 && ratingCount)
    out.push({ label: 'SKIP', tone: 'rose' })
  return out
}

export const BADGE_CLASSES = {
  sky: 'bg-sky-500/20 text-sky-300',
  amber: 'bg-amber-500/20 text-amber-300',
  emerald: 'bg-emerald-500/20 text-emerald-300',
  rose: 'bg-rose-500/20 text-rose-300',
}
