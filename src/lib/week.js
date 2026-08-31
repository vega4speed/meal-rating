// The Monday (local time) of the week containing `d`, as a YYYY-MM-DD string.
export function mondayOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  return toDateStr(x)
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function addWeeks(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const x = new Date(y, m - 1, d)
  x.setDate(x.getDate() + n * 7)
  return toDateStr(x)
}

// The two menus in flight on the Clean Eatz cycle:
//  - `thisWeek`: the menu being picked up / eaten / rated now (its order window
//    was last Tue–Sun).
//  - `nextWeek`: the menu that just dropped, whose order window is open now
//    (Tue–Sun) and which is eaten next week.
// Both are Monday `YYYY-MM-DD` strings — a menu's `week_of` is the Monday of the
// week it is eaten.
export function menuWeeks(d = new Date()) {
  const thisWeek = mondayOf(d)
  return { thisWeek, nextWeek: addWeeks(thisWeek, 1) }
}

export function formatWeekOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const fmt = (dt) =>
    dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}
