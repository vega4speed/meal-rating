# Meal Rating

A mobile-first web app for tracking how a household rates prepared meals from a
meal-delivery service. Each person rates what they ate; the app shows both your own
score and the household's, so the coming week's menu can be picked from what everyone
actually liked.

- **Hosting:** GitHub Pages (static) — https://vega4speed.github.io/meal-rating
- **Backend:** Supabase (Postgres + email OTP auth + RLS)
- **Status:** planning. Nothing built yet.

See **[PLAN.md](PLAN.md)** for the full implementation plan: data model, RLS design,
screens, and the phased build order.

## Privacy

Ratings and household membership live in Supabase behind row-level security, not in
this repo. The Supabase URL and `anon` key ship in the client bundle (that's what
they're for); the `service_role` key never goes in this repo or in CI.
