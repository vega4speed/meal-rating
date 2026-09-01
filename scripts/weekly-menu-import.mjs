// Weekly Clean Eatz menu import — runs Tuesday mornings via GitHub Actions.
// Scrapes the live menu (photos + descriptions) for the configured cafe, parses
// the "This Week" macros-matrix PDF (names + full variation macros), and POSTs a
// merged payload to the token-gated meals.import_weekly_menu RPC.
//
// Env: CE_IMPORT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

import { chromium } from 'playwright'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const CAFE = { state: 'Tennessee', cafe: 'Murfreesboro' }
const MENU_URL = 'https://cleaneatz.com/healthy-meal-plans'

function required(name) {
  const v = process.env[name]
  if (!v && !process.env.DRY_RUN) {
    console.error(`Missing env ${name}`)
    process.exit(1)
  }
  return v
}

const TOKEN = required('CE_IMPORT_TOKEN')
const SUPABASE_URL = required('SUPABASE_URL')
const ANON = required('SUPABASE_ANON_KEY')

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const tokenSet = (s) => new Set(norm(s).split(' ').filter(Boolean))
function jaccard(a, b) {
  const A = tokenSet(a)
  const B = tokenSet(b)
  if (!A.size || !B.size) return 0
  const inter = [...A].filter((x) => B.has(x)).length
  return inter / (A.size + B.size - inter)
}

// A live meal-photo `alt` is either an ALL-CAPS display name (a main) or a
// lowercase-hyphen slug (premium / salad / add-on / bundle).
const isSlug = (s) => /^[a-z0-9][a-z0-9-]*$/.test(s || '')
const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/\bBbq\b/g, 'BBQ')
    .replace(/\bPb&j\b/gi, 'PB&J')
// Clean Eatz's matrix PDF is inconsistently ALL-CAPS some weeks; normalise.
const displayName = (s) => (/[a-z]/.test(s) ? s : titleCase(s))

// Monday (UTC) of *next* week — the week_of a menu that goes live this Tuesday.
function nextWeekMonday() {
  const d = new Date()
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 7)
  return x.toISOString().slice(0, 10)
}

// ---------- tag inference (mirrors the historical backfill) ----------
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

// ---------- PDF parsing ----------
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

// ---------- run ----------
const browser = await chromium.launch()

// Soft-exit (0, not a CI failure) when the menu just isn't there yet — e.g. a
// run that fires while Clean Eatz is mid-swap on a Tuesday morning.
async function notReady(msg) {
  console.log(`Menu not ready — ${msg}. Exiting cleanly.`)
  await browser.close()
  process.exit(0)
}

try {
  const page = await browser.newPage()
  await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' })

  await page.selectOption('select[name="location"]', { label: CAFE.state })
  await page.waitForTimeout(1500)
  await page.selectOption('select[name="cafe"]', { label: CAFE.cafe })
  await page
    .waitForSelector('img[src*="meal-photos"]', { timeout: 25000 })
    .catch(() => notReady('no meal photos on the page'))

  // Scroll through the page so every lazy-loaded meal photo (incl. add-ons) mounts.
  for (let y = 0; y < 12; y++) {
    await page.evaluate((n) => window.scrollTo(0, (n + 1) * window.innerHeight), y)
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(1500)
  const photoCount = await page.evaluate(
    () =>
      [...document.querySelectorAll('img')].filter((i) =>
        /meal-photos/.test(i.currentSrc || i.src),
      ).length,
  )
  console.log(`${photoCount} meal photos in DOM`)

  const { cards, pdfUrl, nearest } = await page.evaluate(() => {
    const cards = []
    const imgs = [...document.querySelectorAll('img')].filter((i) =>
      /meal-photos/.test(i.currentSrc || i.src),
    )
    for (const img of imgs) {
      if (!img.alt) continue
      let card = img.parentElement
      for (
        let k = 0;
        k < 8 &&
        card &&
        !/(CALORIES:|\bCALS?\s|\bFAT\b|\beach\b|FLAVOR|QUANTITY)/i.test(
          card.innerText || '',
        );
        k++
      )
        card = card.parentElement
      const text = (card?.innerText || '').replace(/\r/g, '')
      const name = img.alt
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const priceM = text.match(/\$\s?(\d+)\.(\d{2})\s*(?:each|\/)/i)
      const price_cents = priceM ? +priceM[1] * 100 + +priceM[2] : null
      // Newer main cards carry Standard macros inline:
      //   CALORIES: 437 FAT: 13g   CARBS: 49g PROTEIN: 31g
      const mc = (re) => {
        const m = text.match(re)
        return m ? +m[1] : null
      }
      const cal = mc(/CALORIES:\s*(\d+)/i)
      const macros = cal
        ? [
            cal,
            mc(/FAT:\s*(\d+)/i),
            mc(/PROTEIN:\s*(\d+)/i),
            mc(/CARBS:\s*(\d+)/i),
          ]
        : null
      const desc = lines
        .filter(
          (l) =>
            !/^\$/.test(l) &&
            !/each$/i.test(l) &&
            !/^(CALORIES|CALS|CARBS|PROTEIN|FAT)\b/i.test(l) &&
            !/(CALORIES|CALS|CARBS|PROTEIN|FAT)\s*:?\s*\d+\s*g?\b/i.test(l) &&
            !/^(QUANTITY|FLAVOR|HIGH PROTEIN)$/i.test(l) &&
            !/^REMINDER:/i.test(l) &&
            l.toUpperCase() !== name.toUpperCase() &&
            !/^(PREMIUM|SALAD):/i.test(l),
        )
        .join(' ')
        .replace(
          /\s*(CALORIES|CALS|CARBS|PROTEIN|FAT)\s*:?\s*\d.*$/i,
          '',
        )
        .trim()
      cards.push({
        name,
        photo: img.currentSrc || img.src,
        price_cents,
        macros,
        description: desc || null,
        lines,
      })
    }
    const links = [...document.querySelectorAll('a')]
    const tw =
      links.find((a) => /this week/i.test(a.textContent)) ||
      links.find((a) => /macros-matrix/.test(a.href))
    const nearest = document.body.innerText.match(
      /YOUR NEAREST CAFE IS:\s*([^\n]+)/i,
    )?.[1]
    return { cards, pdfUrl: tw?.href, nearest }
  })

  const cardByKey = {}
  for (const c of cards) {
    const key = norm(c.name)
    if (!cardByKey[key]) cardByKey[key] = c
  }
  function matchCard(name) {
    if (cardByKey[norm(name)]) return cardByKey[norm(name)]
    let best = null
    let score = 0
    for (const c of cards) {
      const s = jaccard(name, c.name)
      if (s > score) {
        score = s
        best = c
      }
    }
    return score >= 0.6 ? best : null
  }

  if (!pdfUrl) await notReady('no "This Week" macros-matrix link')
  console.log('cafe:', nearest)
  console.log('matrix:', pdfUrl)

  // Clean Eatz's filenames vary: `…-2026.xlsx-8_31.pdf`, `…-2026.xlsx-9_7.pdf`
  // (1-digit day), sometimes with a re-upload suffix `…-2026.xlsx-9_7-(2).pdf`.
  const mDate = pdfUrl.match(/-(\d{4})\.xlsx-(\d{1,2})_(\d{1,2})\b/)
  const pdfWeekOf = mDate
    ? `${mDate[1]}-${mDate[2].padStart(2, '0')}-${mDate[3].padStart(2, '0')}`
    : nextWeekMonday()
  if (!mDate)
    console.warn(`odd matrix filename ${pdfUrl} — assuming week_of ${pdfWeekOf}`)

  const pdfBuf = new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer())
  const parsed = parseMatrix(await pdfLines(pdfBuf))

  // The matrix carries a *static* add-on block that Clean Eatz never updates;
  // the live cards are authoritative for add-on identity, so drop those rows.
  const ADDON_RE = /\b(pb ?& ?j|empanada|sammiez|buckeye|energy bite|overnight oat)/i

  // keyed by normalized image alt; every add-on flavor carries the 'add-on' tag
  // (inferTags layers on beef/chicken/breakfast/etc. from the flavor name)
  const ADDON_CATS = {
    'protein pbj sandwiches': { suffix: 'PB&J' },
    empanadas: { suffix: 'Empanada' },
    'overnight oatz': { suffix: 'Overnight Oatz' },
    'breakfast sammiez': { suffix: 'Breakfast Sammiez' },
    'dark chocolate peanut butter buckeyes': {
      single: 'Dark Chocolate Peanut Butter Buckeyes',
    },
    'energy bites': { single: 'Energy Bites' },
  }

  function parseAddonCard(card) {
    const L = card.lines
    const idx = (re) => L.findIndex((l) => re.test(l))
    const priceIdx = idx(/\$\s?\d/)
    const flavorIdx = idx(/^FLAVOR$/i)
    const qtyIdx = idx(/^QUANTITY$/i)
    const end = flavorIdx >= 0 ? flavorIdx : qtyIdx >= 0 ? qtyIdx : L.length
    const blurb = L.slice(priceIdx + 1, end)
      .filter(
        (l) =>
          !/^(CAL|CALS|CALORIES)\b/i.test(l) &&
          !/\(PER /i.test(l) &&
          !/^HIGH PROTEIN$/i.test(l),
      )
      .join(' ')
      .replace(/\s*(CAL|CALS)\s*\d.*$/i, '')
      .trim()
    const flavors =
      qtyIdx >= 0
        ? L.slice(qtyIdx + 1).filter(
            (l) =>
              l.length >= 2 &&
              l.length <= 40 &&
              !/^\$/.test(l) &&
              !/^(ADD TO|SELECT|CHOOSE|QUANTITY)/i.test(l),
          )
        : []
    return { blurb: blurb || null, flavors }
  }

  // Every matrix row's macros, keyed by normalized name.
  const matrixByNorm = {}
  for (const p of parsed) {
    const vars = {}
    for (const [label, mac] of Object.entries(p.vars))
      if (mac.join() !== p.std.join()) vars[label] = mac
    matrixByNorm[norm(p.name)] = { std: p.std, vars }
  }

  // ---- is the PDF the current week's, or is it lagging the live page? ----
  // Clean Eatz flips the on-page menu (Tue 8am ET) sometimes hours/days before
  // publishing the matching macros-matrix PDF. When the PDF's mains don't line
  // up with what's on the page, take names/photos/blurbs from the page now and
  // let a later run fill in macros once the real PDF lands.
  const liveMainNames = [
    ...new Set(cards.map((c) => c.name).filter((n) => !isSlug(n))),
  ]
  const pdfMainNames = parsed
    .filter((p) => !p.prefixTag && !ADDON_RE.test(p.name))
    .map((p) => p.name)
  const matchedLive = liveMainNames.filter((lm) =>
    pdfMainNames.some((pm) => jaccard(lm, pm) >= 0.55),
  ).length
  const pdfIsStale =
    liveMainNames.length >= 3 && matchedLive / liveMainNames.length < 0.5

  const weekOf = pdfIsStale ? nextWeekMonday() : pdfWeekOf
  console.log(
    pdfIsStale
      ? `matrix ${pdfWeekOf} is stale (${matchedLive}/${liveMainNames.length} mains match) — importing week_of ${weekOf} from the live page`
      : `week_of ${weekOf} — ${parsed.length} rows from matrix`,
  )

  const stripHeading = (b) => {
    if (!b) return null
    const s = b.replace(/^[A-Z0-9&'./:\- ]{4,}?(?=[A-Z][a-z])/, '').trim()
    return s.length >= 25 ? s : null
  }

  let mainMeals
  if (pdfIsStale) {
    mainMeals = cards
      .filter((c) => {
        if (!isSlug(c.name)) return true // ALL-CAPS main
        if (/bundle/.test(c.name)) return false // meal-plan bundles, not meals
        if (ADDON_CATS[norm(c.name)]) return false // handled below as add-ons
        return /^premium-/.test(c.name) || /salad/.test(c.name)
      })
      .map((c) => {
        const prefixTag = /^premium-/.test(c.name)
          ? 'premium'
          : /salad/.test(c.name)
            ? 'salad'
            : null
        const name = isSlug(c.name)
          ? titleCase(c.name.replace(/^premium-/, '').replace(/-/g, ' '))
          : titleCase(c.name)
        return {
          name,
          tags: inferTags(name, prefixTag),
          description: stripHeading(c.description),
          image_url: c.photo,
          price_cents: c.price_cents,
          std: c.macros ?? [], // Standard macros off the card, if present
          vars: {}, // LC / EP variations come from the PDF on a later run
        }
      })
    if (mainMeals.length < 3)
      await notReady('live page has no recognisable main meals')
  } else {
    mainMeals = parsed
      .filter((p) => !ADDON_RE.test(p.name))
      .map((p) => {
        const card = matchCard(p.name)
        const { std, vars } =
          matrixByNorm[norm(p.name)] ?? { std: p.std, vars: {} }
        return {
          name: displayName(p.name),
          tags: inferTags(p.name, p.prefixTag),
          description: stripHeading(card?.description) ?? p.description ?? null,
          image_url: card?.photo ?? null,
          price_cents: card?.price_cents ?? null,
          std,
          vars,
        }
      })
  }

  const addonMeals = []
  for (const card of cards) {
    const cat = ADDON_CATS[norm(card.name)]
    if (!cat) continue
    const { blurb, flavors } = parseAddonCard(card)
    const names = cat.single
      ? [cat.single]
      : flavors.map((f) => `${f} ${cat.suffix}`)
    for (const nm of names) {
      const mx = matrixByNorm[norm(nm)]
      addonMeals.push({
        name: nm,
        tags: [...new Set(['add-on', ...inferTags(nm, null)])],
        description: blurb,
        image_url: card.photo,
        price_cents: card.price_cents,
        std: mx?.std ?? [],
        vars: mx?.vars ?? {},
      })
    }
  }

  const seen = new Set()
  const meals = [...mainMeals, ...addonMeals].filter((m) => {
    const k = norm(m.name)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })

  const withPhoto = meals.filter((m) => m.image_url).length
  const withBlurb = meals.filter((m) => m.description).length
  const withPrice = meals.filter((m) => m.price_cents != null).length
  console.log(
    `${mainMeals.length} mains · ${addonMeals.length} add-on flavors · ` +
      `${withPhoto} photos · ${withBlurb} blurbs · ${withPrice} priced`,
  )

  if (process.env.DRY_RUN) {
    console.log(JSON.stringify({ week_of: weekOf, meals }, null, 2))
    console.log('DRY_RUN — not posting')
    await browser.close()
    process.exit(0)
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/import_weekly_menu`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'meals',
    },
    body: JSON.stringify({
      p_token: TOKEN,
      p_payload: { week_of: weekOf, meals },
    }),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`RPC ${res.status}: ${body}`)
    process.exit(1)
  }
  console.log('imported:', body)
} catch (err) {
  console.error('IMPORT FAILED:', err?.stack || String(err))
  process.exitCode = 1
} finally {
  await browser.close()
}
