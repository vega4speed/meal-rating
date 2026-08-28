import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const VARIATION_LABELS = {
  'low carb': 'Low Carb',
  'extra protein': 'Extra Protein',
  'extra protein low carb': 'Extra Protein + Low Carb',
}

// name + 4 trailing integers (calories, fat, protein, carbs)
const ROW_RE = /^(.+?)\s+(\d{2,4})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/

const KEEP_UPPER = new Set(['PB&J', 'BBQ', 'XP', 'BBQ,'])

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w) =>
      KEEP_UPPER.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ')
}

// Reconstruct visual rows from positioned text items.
async function extractLines(doc) {
  const lines = []
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
      lines.push(row.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim())
    }
  }
  return lines
}

function parseLines(lines) {
  const meals = []
  let current = null

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || /calories\s+fat\s+protein/i.test(line)) continue

    const m = line.match(ROW_RE)
    if (!m) continue
    const [, labelPart, cal, fat, pro, carb] = m
    const macros = { cal: +cal, fat: +fat, pro: +pro, carb: +carb }
    const key = labelPart
      .toLowerCase()
      .replace(/[^a-z ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (VARIATION_LABELS[key] && current) {
      current.variations.push({ label: VARIATION_LABELS[key], ...macros })
      continue
    }

    let name = labelPart.trim()
    const tags = []
    let description = null

    const prefix = name.match(/^(PREMIUM|SALAD)\s*:\s*(.+)$/i)
    if (prefix) {
      tags.push(prefix[1].toLowerCase())
      name = prefix[2].trim()
    }
    const per = name.match(/^(.+?)\s*\((PER [^)]+)\)\s*$/i)
    if (per) {
      description = `Macros ${per[2].toLowerCase()}.`
      name = per[1].trim()
    }

    current = {
      name: titleCase(name),
      tags,
      description,
      variations: [{ label: 'Standard', ...macros }],
    }
    meals.push(current)
  }

  // Drop variations whose macros duplicate an earlier kept one.
  for (const meal of meals) {
    const kept = []
    for (const v of meal.variations) {
      const dup = kept.some(
        (k) =>
          k.cal === v.cal &&
          k.fat === v.fat &&
          k.pro === v.pro &&
          k.carb === v.carb,
      )
      if (!dup) kept.push(v)
    }
    meal.variations = kept
  }

  return meals
}

export async function parsePdfMenu(file) {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const lines = await extractLines(doc)
  return { meals: parseLines(lines), rawLines: lines }
}
