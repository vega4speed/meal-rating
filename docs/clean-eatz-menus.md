# Clean Eatz weekly menus — seed reference

Source: Clean Eatz "master template macros matrix 2026" PDFs. Catalog seeded by
migration `meals_seed_cleaneatz_aug2026`. This file records which meals belonged to
which week so Phase 5 can create the `weekly_menus` rows without re-deriving them.

Macros in the matrix are per **variation** and live on `meals.meal_variations`
(`calories`, `fat_g`, `protein_g`, `carbs_g`). Variation set per main:
`Standard`, `Low Carb`, `Extra Protein`, `Extra Protein + Low Carb` — collapsed
where the provider's numbers are identical to Standard (noted below).

## Week of 2026-08-24

**Mains (4 variations):** Cowboy Shepherds Bowl, Grilled Chicken Parmesan,
Thai Peanut Chicken Bowl, Verde Chicken Rice Bowl
**Mains (Standard + Extra Protein only):** Cheeseburger Loaded Tots (LC = Standard),
Sunrise Burger Omelette
**Single:** Bacon Chicken Ranch Pizza, Green Chili Bison Bowl (premium),
Caprese Chicken Salad, BBQ Chicken Salad

## Week of 2026-08-31

**Mains (4 variations):** Sweet Chili Chicken Mac & Cheese, Pub Chicken,
Bacon Chicken Ranch Fries, Skinny Burrito Bowl
**Mains (Standard + Extra Protein only):** Homestyle Beef BBQ Plate (LC = Standard),
Hot Honey Sausage Breakfast Bowl
**Single:** Queso Chorizo Pizza, Prime Rib Stuffed Potatoes (premium), Taco Salad,
BBQ Chicken Salad *(repeat from 8/24 — same catalog row)*

## Staples (both weeks, and presumably every week)

Grape PB&J, Strawberry PB&J, Beef & Cheese Empanada, Pepperoni Pizza Empanada,
Blueberry Waffle & Sausage Breakfast Sammiez, Chicken & Waffle Breakfast Sammiez,
Sausage Egg & Cheese Breakfast Sammiez, Dark Chocolate Peanut Butter Buckeyes
(per-piece macros), Energy Bites (per-piece macros)

## 2026 menu-history backfill (2026-08-31)

Clean Eatz keeps every week's **macros-matrix PDF** live on its CDN
(`assets.cleaneatz.com/macros-matrix/master-template-macros-matrix-2026.xlsx-<M>_<D>.pdf`).
Scraped and parsed **22 weekly menus** (Mar–Sep 2026) client-side with pdf.js;
after dedup/typo-fix/tag-inference, imported **167 meals** (catalog 34 → 172) with
Standard + variation macros. No photos — only the current week publishes those.

Two new columns on `meals.meals`:
- `menu_appearances int` — distinct weekly menus the meal has been on
- `menu_last_seen date` — most recent such week (2026 order-by-Sunday date)

Future weekly imports should bump these. Meals list has filters: **2+ menus**
toggle and a **Seen: last 30/60/90 days** select. The one-shot importer RPC
(`bulk_import_menu_history`, token-gated SECURITY DEFINER) was dropped right after use.

## Freezer-label meals (migration `meals_seed_cleaneatz_freezer_new`)

Six meals seen on real container labels, not on either weekly matrix. Seeded with an
`Extra Protein` variation only (every container this household buys is XP); the
auto-created `Standard` row is left without macros.

Buffalo Chicken Dip Bowl · Teriyaki Chicken Bro Meal (premium) · Green Chili Chicken
Mac · Buffalo Chicken Mac & Cheese · Braised Beef Pot Roast · Southern Chicken Dinner

## Freezer backfill (migration `backfill_cardens_freezer_picks`)

The 10 meals from the freezer photos were seeded as a **published** `weekly_menu`
for the Cardens household, week of **2026-08-17**, each item the `Extra Protein`
variation and each **picked by @chip** (`menu_selections`). This lets the Meals-list
"Picked · not rated" filter surface meals eaten but not yet scored. Meals list filter
= meal in `v_meal_household_last_had` for the active household AND no rating by the
current user.

## Label vs matrix macro discrepancies (unresolved — source-of-truth TBD)

Container labels sometimes disagree with the weekly matrix. Not yet reconciled:

| Meal (Extra Protein) | Matrix | Container label |
|---|---|---|
| Thai Peanut Chicken Bowl | 411 / 7 / 43 / 44 | 411 / 7 / 43 / 44 — match |
| Verde Chicken Rice Bowl | 410 / 10 / 46 / 34 | 410 / 10 / 46 / 34 — match |
| Cowboy Shepherds Bowl | 443 / 15 / 36 / 41 | **456** / 15 / 36 / 41 |
| Grilled Chicken Parmesan | 437 / 13 / 41 / 39 | **391 / 7 / 39 / 43** |

(cal / fat / protein / carb). Clean Eatz revises recipes between weeks; the freezer
items span Freeze-By dates 08/20 and 08/27. This is the "meals change over time"
problem — see *Backlog → Rating history over time* in PLAN.md.

**Decision (2026-08-27): keep the matrix numbers.** The catalog holds one set of
macros per variation and is allowed to drift from any given week's batch until
rating-history / per-batch versioning is built. Don't overwrite catalog macros from
container labels case-by-case.

## Name normalization applied

- `PREMIUM:` / `SALAD:` prefixes dropped; `premium` / `salad` become tags.
- Buckeyes / Energy Bites: "(per 1 …)" moved from the name into `description`.
