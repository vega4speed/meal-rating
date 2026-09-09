// One-shot: backfill the 3 Clean Eatz weeks (Aug 3 / 10 / 17 2026) that the
// original menu-history scrape missed because that week's matrix PDF was
// re-uploaded under a "-(1)" filename. Parses each matrix PDF and POSTs to the
// token-gated meals.import_weekly_menu RPC (same path as the weekly importer).
//
//   node scripts/backfill-aug-gap.mjs        # dry run, prints payloads
//   node scripts/backfill-aug-gap.mjs --post # actually import

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'

const POST = process.argv.includes('--post')

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')]),
)
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const TOKEN = 'ce-weekly-import-2026'

// Every Monday from 2026-03-23 through the arg range; try both the bare
// `M_D.pdf` and the re-upload `M_D-(1).pdf` filename. import_weekly_menu is
// idempotent, so re-hitting weeks already in the catalog costs nothing.
const FIRST = new Date(Date.UTC(2026, 2, 23))
const LAST = new Date(Date.UTC(2026, 8, 7))
const WEEKS = []
for (let d = new Date(FIRST); d <= LAST; d.setUTCDate(d.getUTCDate() + 7)) {
  const week_of = d.toISOString().slice(0, 10)
  const tag = `${d.getUTCMonth() + 1}_${d.getUTCDate()}`
  WEEKS.push({
    week_of,
    files: [
      `master-template-macros-matrix-2026.xlsx-${tag}.pdf`,
      `master-template-macros-matrix-2026.xlsx-${tag}-(1).pdf`,
    ],
  })
}

// ---- tag inference (mirrors weekly-menu-import.mjs) ----
const TAG_RULES = [
  [/\bbeef|brisket|steak|burger|bison|short rib|pot roast|ragu|salisbury|tri tip|meatball|cheeseburger|burnt end|shepherd\b/i, 'beef'],
  [/\bchicken|buffalo|rotisserie|tso|potstick|tempura|bang bang|aussie\b/i, 'chicken'],
  [/\bpork|sausage|chorizo|bacon|carnitas|cuban|ham|pepperoni|tenderloin|birria\b/i, 'pork'],
  [/\bsalmon|shrimp|lobster|fish|crab|tuna|baja\b/i, 'seafood'],
  [/\bbreakfast|omelette|scrambl|waffle|pancake|egg bite|french toast|hashbrown|oatz|biscuit|\bhash\b/i, 'breakfast'],
  [/\bpasta|mac & cheese|mac and cheese|alfredo|spaghetti|gnocchi|tortellini|lasagna|shells|penne|bolognese|carbonara\b/i, 'pasta'],
  [/\bpizza\b/i, 'pizza'],
  [/\bhot honey|buffalo|spicy|cajun|chili crisp|sriracha|jalapeno\b/i, 'spicy'],
]
function inferTags(name, prefixTag) {
  const t = new Set()
  if (prefixTag) t.add(prefixTag)
  for (const [re, tag] of TAG_RULES) if (re.test(name)) t.add(tag)
  return [...t]
}
const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\bBbq\b/g, 'BBQ')
    .replace(/\bPb&j\b/gi, 'PB&J')
const displayName = (s) => (/[a-z]/.test(s) ? s : titleCase(s))

// ---- PDF parsing (copied from weekly-menu-import.mjs) ----
const VAR_LABELS = {
  'low carb': 'Low Carb',
  'extra protein': 'Extra Protein',
  'extra protein low carb': 'Extra Protein + Low Carb',
}
const ROW_RE = /^(.+?)\s+(\d{2,4})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/

async function pdfLines(buf) {
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const out = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const rows = []
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue
      const y = item.transform[5]
      let row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
      if (!row) {
        row = { y, items: [] }
        rows.push(row)
      }
      row.items.push({ x: item.transform[4], s: item.str })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      out.push(row.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim())
    }
  }
  return out
}

function parseMatrix(lines) {
  const meals = []
  let cur = null
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || /calories\s+fat\s+protein/i.test(line)) continue
    const m = line.match(ROW_RE)
    if (!m) continue
    const [, labelPart, cal, fat, pro, carb] = m
    const macro = [+cal, +fat, +pro, +carb]
    const key = labelPart
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (VAR_LABELS[key] && cur) {
      cur.vars[VAR_LABELS[key]] = macro
      continue
    }
    let name = labelPart.replace(/^\d+\.\s*/, '').trim()
    if (/^low crab$/i.test(name)) continue
    let prefixTag = null
    const pf = name.match(/^(PREMIUM|SALAD)\s*:\s*(.+)$/i)
    if (pf) {
      prefixTag = pf[1].toLowerCase()
      name = pf[2].trim()
    }
    let description = null
    const per = name.match(/^(.+?)\s*\((PER [^)]+)\)\s*$/i)
    if (per) {
      description = `Macros ${per[2].toLowerCase()}.`
      name = per[1].trim()
    }
    name = name.replace(/\s*\(EGG BITES[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim()
    cur = { name, prefixTag, description, std: macro, vars: {} }
    meals.push(cur)
  }
  return meals
}

// ---- run ----
for (const wk of WEEKS) {
  let buf = null
  for (const f of wk.files) {
    const res = await fetch(`https://assets.cleaneatz.com/macros-matrix/${f}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (res.ok) {
      buf = new Uint8Array(await res.arrayBuffer())
      break
    }
  }
  if (!buf) {
    console.error(`${wk.week_of}: no PDF`)
    continue
  }
  const parsed = parseMatrix(await pdfLines(buf))

  const meals = parsed.map((p) => {
    const name = displayName(p.name)
    const vars = {}
    for (const [label, mac] of Object.entries(p.vars))
      if (mac.join() !== p.std.join()) vars[label] = mac
    return {
      name,
      tags: inferTags(name, p.prefixTag),
      description: p.description,
      std: p.std,
      vars,
    }
  })

  console.log(`\n=== ${wk.week_of} — ${meals.length} meals ===`)
  for (const m of meals)
    console.log(
      `  ${m.name}  [${m.tags.join(',')}]  std=${m.std.join('/')}  vars=${Object.keys(m.vars).join('|') || '-'}`,
    )

  if (!POST) continue
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/import_weekly_menu`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'meals',
    },
    body: JSON.stringify({ p_token: TOKEN, p_payload: { week_of: wk.week_of, meals } }),
  })
  console.log(`  POST ${r.status}: ${await r.text()}`)
}
