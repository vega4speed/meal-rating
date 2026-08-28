# meal-rating

Mobile-first web app for rating prepared meals from a meal-delivery service (Clean
Eatz), hosted on GitHub Pages with a Supabase backend. Public repo — the private
context for this project lives in `vega4speed/claude-personal` under `MealRating/`.

**Read `PLAN.md` before doing any work here.** It is the canonical spec: data model,
RLS design, screen inventory, and the phased build order. Keep it updated as the
design changes — it should never drift from what's actually built.

## Files

- `PLAN.md` — the full implementation plan. Read first, every time.
- `README.md` — short public-facing intro.

## Standing constraints

- **This app shares a Supabase project.** Its tables live in a **`meals` schema inside
  the `oil-tracker` project** — it does not have a project of its own (the free plan
  allows two per *account*, and both slots were spent). Consequences, in full, in
  `PLAN.md` → *Where the Database Lives*. The non-negotiables:
  - **Every DDL statement is schema-qualified** (`create table meals.ratings`), never
    bare with a hopeful `search_path`.
  - **Never touch `public`** — it belongs to the other app, which holds real curated
    data. No `drop schema`, no `alter default privileges` outside `meals`, no edits to
    a table you didn't create.
  - `SECURITY DEFINER` functions pin `set search_path = meals, public`.
  - `auth.users` is **shared**. A signup trigger fires for the other app's users too —
    keep it idempotent and never assume a new user belongs to this app.
  - Read every migration twice. That habit replaces the isolation a separate project
    would have provided.
- **Static hosting.** No server. `base: '/meal-rating/'` in the Vite config,
  `HashRouter` for routing, and auth is **email OTP codes — never magic links**
  (no redirect to handle on a static host, and the shared project makes per-app
  redirect allowlists worse).
- **Never commit the Supabase `service_role` key** — not to the repo, not to a
  workflow. The `anon` key in the client bundle is fine and expected; RLS is the
  actual security boundary.
- **No personal data in this repo.** Real ratings, names, and household data live in
  Supabase. Examples in docs stay generic.
- **`security_invoker = true` on every view** that reads RLS-protected tables, or the
  view silently bypasses RLS.
- Household-scoped RLS goes through the `shares_household()` / `is_household_member()`
  `SECURITY DEFINER` helpers — policies that query the membership table directly
  recurse infinitely.
