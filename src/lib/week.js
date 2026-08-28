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

export function formatWeekOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const fmt = (dt) =>
    dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}
