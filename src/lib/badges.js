// Week View badges.
export function mealBadges({ householdAvg, ratingCount, myScore, lastHadWeek }) {
  const out = []
  if (!ratingCount) out.push({ label: 'NEW', tone: 'sky' })
  if (myScore === 5) out.push({ label: 'YOUR FAVORITE', tone: 'amber' })
  if (householdAvg != null && householdAvg >= 4.5)
    out.push({ label: 'LOVED', tone: 'emerald' })
  if (householdAvg != null && householdAvg <= 2 && ratingCount)
    out.push({ label: 'SKIP', tone: 'rose' })
  if (
    householdAvg != null &&
    householdAvg >= 4 &&
    lastHadWeek &&
    monthsSince(lastHadWeek) >= 6
  )
    out.push({ label: 'NOT IN 6 MONTHS', tone: 'violet' })
  return out
}

export function monthsSince(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const now = new Date()
  return (
    (now.getFullYear() - then.getFullYear()) * 12 +
    (now.getMonth() - then.getMonth())
  )
}

export function relativeWeek(dateStr) {
  if (!dateStr) return 'never'
  const [y, m, d] = dateStr.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const weeks = Math.round((Date.now() - then) / (7 * 864e5))
  if (weeks <= 0) return 'this week'
  if (weeks === 1) return '1 week ago'
  if (weeks < 9) return `${weeks} weeks ago`
  const months = monthsSince(dateStr)
  return months <= 1 ? 'about a month ago' : `${months} months ago`
}

export const BADGE_CLASSES = {
  sky: 'bg-sky-500/20 text-sky-300',
  amber: 'bg-amber-500/20 text-amber-300',
  emerald: 'bg-emerald-500/20 text-emerald-300',
  rose: 'bg-rose-500/20 text-rose-300',
  violet: 'bg-violet-500/20 text-violet-300',
}
