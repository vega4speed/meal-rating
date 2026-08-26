# meal-rating

Mobile-first web app for rating prepared meals from a meal-delivery service (Clean
Eats), hosted on GitHub Pages with a Supabase backend. Public repo — the private
context for this project lives in `vega4speed/claude-personal` under `MealRating/`.

**Read `PLAN.md` before doing any work here.** It is the canonical spec: data model,
RLS design, screen inventory, and the phased build order. Keep it updated as the
design changes — it should never drift from what's actually built.

## Files

- `PLAN.md` — the full implementation plan. Read first, every time.
- `README.md` — short public-facing intro.

## Standing constraints

- **Static hosting.** No server. `base: '/meal-rating/'` in the Vite config,
  `HashRouter` for routing, and auth is **email OTP codes — never magic links**
  (no redirect to handle on a static host).
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
