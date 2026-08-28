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

## Name normalization applied

- `PREMIUM:` / `SALAD:` prefixes dropped; `premium` / `salad` become tags.
- Buckeyes / Energy Bites: "(per 1 …)" moved from the name into `description`.
