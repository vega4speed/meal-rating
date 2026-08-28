# Meal Rating — Implementation Plan

A mobile-first web app for tracking how a household rates prepared meals from a
meal-delivery service (Clean Eats today, any provider in principle). Hosted free on
GitHub Pages, backed by Supabase.

---

## Honest Assessment

This is a smaller, more forgiving build than something like SHIASA — there are no
secrets to protect, no real-time race conditions, and no game rules to enforce. It's
a CRUD app with an aggregation layer and a permissions model. The whole thing is
buildable without a single serverless function.

**Rough effort estimate:** a working, genuinely useful app in 1–2 weeks of part-time
sessions. Phases 1–4 alone (auth → household → catalog → ratings) is already the app
you actually want; menus and prioritization are what make it *good*.

**The three hardest parts — in order:**

1. **Meal identity across weeks.** This is the whole ballgame. If the same meal gets
   re-entered as a fresh row every week the provider offers it, ratings never
   accumulate and the app is worthless by design. Everything in the schema below is
   shaped around one canonical meal row that new weeks *match into* rather than
   duplicate.
2. **Household-scoped RLS without recursion.** Postgres policies on a membership
   table that themselves query that membership table cause infinite recursion — the
   classic Supabase footgun. Solved once with a `SECURITY DEFINER` helper function
   (see below), then reused everywhere.
3. **Weekly menu entry on a phone.** Typing 15 meal names into a form every Sunday
   will kill the habit in three weeks. The bulk-paste importer with fuzzy matching
   isn't polish — it's what makes the app survive contact with real life.

---

## Tech Stack

| Layer | Tool | Cost |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Free |
| Hosting | GitHub Pages (deployed via GitHub Actions) | Free |
| Auth | Supabase — email OTP (6-digit code) | Free tier |
| Database | Supabase Postgres — a **`meals` schema inside the existing `oil-tracker` project**, not a project of its own (see below) | Free tier |
| Server logic | Postgres functions (RPC), **no Edge Functions in v1** | Free tier |
| Real-time (optional) | Supabase Realtime | Free tier |

**Why React and not vanilla JS** (Farkle's convention in the personal repo): this app
has authenticated sessions, client-side routing, and shared state across a half-dozen
screens. That's the point where hand-rolled DOM code starts costing more than it saves.
Farkle is a single-screen calculator; this isn't.

**Why no Edge Functions:** SHIASA needs them because roles are secrets the client must
never see. Here, nothing is secret from the people allowed to read it — RLS alone is
sufficient. The two places that need elevated privilege (accepting an invite, joining
by code) are a few lines of `SECURITY DEFINER` SQL, not a deployed function. Fewer
moving parts, no deploy step, no cold starts.

---

## Where the Database Lives

**This app does not get its own Supabase project.** It lives as a `meals` schema
inside the existing **`oil-tracker`** project. That's a deliberate decision with real
consequences, so it's written down here rather than discovered later.

### Why

Supabase's free plan allows **two active projects, counted per account across every
organization** where you're an Owner or Admin — creating a second free organization
does *not* raise the ceiling, which is the workaround most search results will hand
you. Both slots are already spent (`SHIASA React`, `oil-tracker`). The alternatives
were a $25/mo Pro organization, or a non-Supabase backend that costs a rewrite
(Firebase means porting the relational model to NoSQL; Neon means building the auth
and API layers by hand). Neither buys enough to be worth it at household scale.

### What that actually means

| Aspect | Consequence |
|---|---|
| Tables | All app tables live in `meals`, never `public`. `oil-tracker` owns `public`. |
| Auth | **Shared.** One `auth.users` for both apps — this cannot be partitioned. Someone with an oil-tracker account exists in this app's user table too. |
| Data isolation | Fine. RLS means a stray user sees nothing here without a household membership. |
| Email | Shared sender and shared rate limit. Login codes arrive branded as the host project. |
| Quotas | Shared 500 MB database, 1 GB Storage, 5 GB egress. Meal text is negligible; meal photos would eat shared Storage. |
| Pausing | Shared — and that's a *benefit*. One keep-alive job covers both apps instead of two. |
| Redirect URLs | Not an issue, and this is why OTP matters more than it first appeared: magic links would need per-app redirect allowlists on a config that both apps share. Code entry needs none. |

### Exposing the schema

One-time setup, per the Supabase custom-schema docs:

1. Add `meals` to **Exposed schemas** in the project's Data API settings.
2. Run the grants:

```sql
create schema if not exists meals;

grant usage on schema meals to anon, authenticated, service_role;
grant all on all tables     in schema meals to anon, authenticated, service_role;
grant all on all routines   in schema meals to anon, authenticated, service_role;
grant all on all sequences  in schema meals to anon, authenticated, service_role;

alter default privileges for role postgres in schema meals
  grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema meals
  grant all on routines  to anon, authenticated, service_role;
alter default privileges for role postgres in schema meals
  grant all on sequences to anon, authenticated, service_role;
```

3. Point the client at it, once, at construction:

```js
export const supabase = createClient(URL, ANON_KEY, {
  db: { schema: 'meals' },
})
```

After that every `.from('meals')`, `.from('ratings')`, `.rpc(...)` resolves inside the
schema with no per-query ceremony. (`supabase.schema('public')` is the escape hatch if
something ever needs to reach out, which it shouldn't.)

### Migration discipline — the part that matters

Every migration this app runs now executes against a database holding another app's
real, curated data (hundreds of products, a price history, physical inventory). The
rules:

- **Every DDL statement is schema-qualified.** `create table meals.ratings`, never
  `create table ratings` with a hopeful `search_path`.
- **Never `drop schema public`, never `alter default privileges` outside `meals`,
  never touch a table you didn't create.**
- Helper functions are schema-qualified too, and pin `set search_path = meals, public`
  so a `SECURITY DEFINER` function can't be hijacked by a caller's search path.
- Read every migration twice before running it. The isolation a separate project would
  have bought is being replaced by this habit — that's the whole trade.

### Getting out later

If this ever needs its own project, the exit is cheaper than usual: a
`pg_dump --schema=meals` and restore, plus re-creating a handful of users. **Because
auth is OTP, there are no password hashes to migrate** — the only real work is
preserving or remapping the `auth.users` UUIDs that ratings hang off. At three or four
users, having everyone sign in again is a legitimate migration strategy.

---

## GitHub Pages Specifics

Static hosting has three sharp edges. All are one-time fixes:

1. **Base path.** The site lives at `https://vega4speed.github.io/meal-rating/`, not at
   a domain root. Set `base: '/meal-rating/'` in `vite.config.js` or every asset 404s.
2. **Routing.** GitHub Pages has no server-side rewrite, so a deep link like
   `/meal-rating/menu/2026-09-07` returns a real 404. Use **`HashRouter`**
   (`/#/menu/...`). The usual `404.html` copy trick works too, but hash routing is
   simpler and this app has no SEO requirement.
3. **Auth redirects.** This is why the plan specifies **OTP code entry, not magic
   links.** A magic link has to redirect back to an allowlisted URL and then have the
   app parse tokens out of the URL — fiddly on a static host, and worse inside an
   email client's in-app browser. With `signInWithOtp()` → `verifyOtp()`, the user
   types a 6-digit code into the app they already have open and there is no redirect
   at all. Same UX as SHIASA, less machinery.

**Secrets:** the Supabase URL and `anon` key ship in the client bundle in plain text.
That is correct and by design — the anon key is a public identifier, and RLS is what
actually protects the data. The `service_role` key must **never** appear in this repo
or in any GitHub Actions step that builds the site.

**Deploy:** a GitHub Actions workflow on push to `main` — build, then
`actions/deploy-pages`. The Supabase URL/anon key go in as repository variables so the
values live in one place.

### Mobile-first details that matter

- OTP input: `inputmode="numeric"` + `autocomplete="one-time-code"` so iOS offers the
  code from the mail notification without switching apps.
- `manifest.json` + `apple-touch-icon` + `display: standalone` so it installs to the
  home screen and stops looking like a web page.
- Bottom tab bar (This Week · Meals · Household), 44px minimum touch targets,
  `env(safe-area-inset-bottom)` padding so the nav clears the iPhone home indicator.
- Rating has to be reachable in two taps from app open. That constraint drives the
  whole navigation design.

---

## Data Model

Every table below lives in the **`meals` schema**, never `public` — see *Where the
Database Lives*. Table names are written unqualified for readability; in migrations
they are always `meals.<table>`.

### Core idea

```
providers → meals → meal_variations → ratings
                          ↑
              weekly_menus → weekly_menu_items → menu_selections
```

A **meal** is the durable thing you rate over time ("Chimichurri Steak Bowl"). A
**variation** is a version of it the provider actually shipped ("with sweet potato",
"spicy"). Ratings attach to the **variation**, because that's what you actually ate —
but the app rolls variations up to the meal level for display, so "we like the steak
bowl" survives the provider fiddling with the sides.

If a meal has never had a distinguishable variant, it gets exactly one variation
labeled `Standard` created automatically. Users never have to think about variations
until they need them.

### Tables

#### `profiles`
Extends Supabase's `auth.users`.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | matches `auth.users.id` |
| handle | citext (unique) | searchable, e.g. `chip` — how other users find you |
| display_name | text | shown everywhere in the UI |
| created_at | timestamptz | |

No email column. Email lives in `auth.users` and is never exposed to other users —
that's what makes user search safe (see RLS below).

#### `households`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g. "Home" |
| created_by | uuid (FK → profiles) | |
| join_code | text (unique) | short shared code, rotatable by the owner |
| created_at | timestamptz | |

#### `household_members`

| Column | Type | Notes |
|---|---|---|
| household_id | uuid (FK → households) | PK part |
| user_id | uuid (FK → profiles) | PK part |
| role | enum | `owner`, `member` |
| joined_at | timestamptz | |

A user may belong to more than one household (kids at two houses, a roommate group).
The UI keeps one "active household" in local state with a switcher — most people will
only ever have one and never see the switcher.

#### `household_invites`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| household_id | uuid (FK → households) | |
| inviter_id | uuid (FK → profiles) | |
| invitee_id | uuid (FK → profiles) | resolved from user search — invites go to accounts, not email addresses |
| status | enum | `pending`, `accepted`, `declined`, `canceled` |
| created_at / responded_at | timestamptz | |

Partial unique index on `(household_id, invitee_id) WHERE status = 'pending'` so you
can't spam someone with five pending invites to the same household.

**Two ways in, deliberately:** search-and-invite (the flow you asked for) covers
people who already have an account; the household `join_code` covers "just get my wife
on here right now" without either person hunting for a handle. Same destination.

#### `providers`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text (unique) | `Clean Eats` |

Trivial table, but it keeps "Clean Eats" from being hardcoded and makes the meal-name
uniqueness constraint correct if a second service is ever added.

#### `meals`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| provider_id | uuid (FK → providers) | |
| name | text | as printed on the menu |
| normalized_name | text | lowercased, punctuation stripped — the dedupe key |
| description | text | nullable |
| image_url | text | nullable (Supabase Storage, later) |
| tags | text[] | `beef`, `chicken`, `breakfast` — for filtering |
| created_by | uuid (FK → profiles) | |
| created_at | timestamptz | |

Unique on `(provider_id, normalized_name)`. `normalized_name` is maintained by a
trigger, never by the client.

#### `meal_variations`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| meal_id | uuid (FK → meals) | |
| label | text | `Standard` by default |
| notes | text | what's different about this one |
| created_at | timestamptz | |

Unique on `(meal_id, label)`.

#### `ratings`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles) | |
| variation_id | uuid (FK → meal_variations) | |
| score | int | 1–5, checked |
| would_reorder | boolean | nullable |
| notes | text | nullable |
| created_at / updated_at | timestamptz | |

Unique on `(user_id, variation_id)` — one live rating per person per variation, edited
in place. Re-rating over time (a meal that got worse) is real but goes in the backlog;
`updated_at` preserves the option, and a `rating_history` table can be added later
without migrating anything.

**`would_reorder` earns its place.** A 1–5 score compresses badly in a household of
two — everything lands on 3 or 4. "Would you get this again?" is the question the
weekly menu actually asks, and a household reorder percentage is a sharper sort key
than an average of four opinions.

#### `weekly_menus`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| household_id | uuid (FK → households) | |
| week_of | date | the Monday |
| status | enum | `draft`, `published` |
| created_by | uuid (FK → profiles) | |
| published_at | timestamptz | nullable |

Unique on `(household_id, week_of)`. Draft state exists so whoever enters the week's
options can finish the list before everyone gets notified of a half-entered menu.

#### `weekly_menu_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| menu_id | uuid (FK → weekly_menus) | |
| variation_id | uuid (FK → meal_variations) | |
| position | int | display order |

Unique on `(menu_id, variation_id)`.

#### `menu_selections`
Who picked what from this week's options.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| menu_item_id | uuid (FK → weekly_menu_items) | |
| user_id | uuid (FK → profiles) | |
| qty | int | default 1 |
| created_at | timestamptz | |

Unique on `(menu_item_id, user_id)`.

### The aggregation layer

Two numbers appear next to every meal: **yours** and **your household's**. Both come
from views, not from client-side math over a pile of rows.

```sql
create view meals.v_variation_household_stats
  with (security_invoker = true) as
select
  hm.household_id,
  r.variation_id,
  round(avg(r.score)::numeric, 1)                       as avg_score,
  count(*)                                              as rating_count,
  avg((r.would_reorder)::int) filter (
    where r.would_reorder is not null)                  as reorder_rate
from meals.ratings r
join meals.household_members hm on hm.user_id = r.user_id
group by hm.household_id, r.variation_id;
```

**`security_invoker = true` is load-bearing.** Without it (the pre-PG15 default) a view
runs with the *owner's* privileges and quietly bypasses RLS — every household would see
every other household's ratings. Set it explicitly on every view in this app.

A companion `v_meal_household_stats` rolls variations up to the meal.

A **global** cross-household average ("everyone who uses this app rates this 4.2") is
deliberately *not* in v1: RLS stops you reading other households' rating rows, so a
global average has to come from a `SECURITY DEFINER` function or a trigger-maintained
aggregate table that exposes counts only, never rows. Real work, no value at a
household of two. Backlogged with the approach written down.

---

## Row-Level Security

Every table gets RLS enabled. The whole model reduces to one predicate: *does this row
belong to a household I'm in?*

### The helper that prevents recursion

```sql
create function meals.shares_household(target uuid)
returns boolean
language sql stable security definer set search_path = meals, public as $$
  select exists (
    select 1
    from meals.household_members a
    join meals.household_members b using (household_id)
    where a.user_id = auth.uid() and b.user_id = target
  );
$$;
```

The pinned `search_path` is not decoration — a `SECURITY DEFINER` function without one
can be hijacked by whatever search path the caller happens to have set, and this
database has another app's schema sitting next to ours.

`SECURITY DEFINER` here isn't a shortcut — it's required. A policy on
`household_members` that queries `household_members` recurses infinitely; the function
runs outside RLS and breaks the cycle. Same pattern for `is_household_member(hid uuid)`.
Both are `stable` so the planner calls them once per query, not once per row.

### Policies

| Table | Read | Write |
|---|---|---|
| `profiles` | any authenticated user (no email column, so this is safe — it's what makes search work) | own row only |
| `households` | members | owner may update; anyone may insert (creating one) |
| `household_members` | `is_household_member(household_id)` | owner may remove; a member may remove themselves; **inserts only via RPC** |
| `household_invites` | invitee, inviter, or any member of the household | members may insert; only the invitee may set `accepted`/`declined` |
| `providers`, `meals`, `meal_variations` | any authenticated user — the catalog is shared | any authenticated user may insert; creator may update |
| `ratings` | own rows, or `shares_household(user_id)` | own rows only, always |
| `weekly_menus`, `weekly_menu_items` | `is_household_member(household_id)` | members |
| `menu_selections` | members of the item's household | own rows only |

**Why the catalog is global and the ratings aren't:** meal names carry nothing private,
and a shared catalog means the second household to ever use the app benefits from the
first one's data entry. Ratings are opinions about people's tastes and stay inside the
household.

### The two RPCs that need elevated privilege

```
accept_invite(invite_id uuid)
```
The invitee is not yet a member, so RLS correctly forbids them from inserting into
`household_members`. This function validates that `auth.uid()` is the invitee and the
invite is `pending`, then inserts the membership and marks the invite accepted —
atomically.

```
join_household_by_code(code text)
```
Same shape. You can't `select` a household by its join code when the read policy
requires membership, so lookup and insert both happen inside the function. Rate-limit
by counting recent failed attempts per user.

Everything else in the app is a plain PostgREST query.

---

## Screens

| Area | Screens |
|---|---|
| Auth | Sign In (email → 6-digit code), Set Handle & Display Name (first run only) |
| This Week | Week View (menu with ratings shown), Pick Meals, Rate a Meal |
| Meals | Meal List (search/filter/sort), Meal Detail (your + household ratings, variations, history), Add Meal, Add Variation |
| Menus | Build This Week's Menu, Bulk Paste Import + match review, Past Weeks |
| Household | Household Home (members), Find People (handle search), Invites (sent/received), Join by Code, Create Household |
| Profile | Edit display name/handle, switch household, sign out |

### The screen that justifies the app

**Week View** is the payoff. Each of the provider's meals for the coming week, sorted
by household rating, each row showing:

- your score, as stars
- the household average, and how many people it's from
- a badge: `NEW` (nobody's tried it), `YOUR FAVORITE` (you rated 5), `LOVED` (household
  avg ≥ 4.5), `SKIP` (household avg ≤ 2), `NOT IN 6 MONTHS` (liked, but stale)
- who has already picked it this week

`NOT IN 6 MONTHS` matters more than it sounds. Sorting purely by rating means ordering
the same four meals forever and burning out on them — the exact variety-vs-repetition
tension already written into the household's home-cooking meal library. Surfacing
"you liked this and haven't had it in a while" is what keeps a rating app from
narrowing the rotation instead of improving it.

---

## Build Phases

### Phase 0 — Skeleton & Deploy
- [ ] Vite + React + Tailwind project, `base: '/meal-rating/'`
- [ ] `HashRouter`, bottom-nav shell, PWA manifest + icons
- [ ] `meals` schema created in the `oil-tracker` project, added to Exposed schemas,
      grants + default privileges applied (see *Where the Database Lives*)
- [ ] Client constructed with `db: { schema: 'meals' }`; URL + anon key wired in via env
- [ ] Confirm the shared project's keep-alive cron exists (or add one)
- [ ] GitHub Actions workflow → GitHub Pages, publishing on push to `main`

**Deliverable:** `vega4speed.github.io/meal-rating` loads a styled empty shell on a phone.

---

### Phase 1 — Auth & Profiles
- [x] Email OTP sign-in (`signInWithOtp` → `verifyOtp`), long session duration
- [x] `meals.profiles` table + RLS. **No `auth.users` signup trigger** — because
      `auth.users` is shared with oil-tracker, a trigger cannot reliably tell whose
      signup it is. The profile row is instead created app-side during first-run
      onboarding (`insert` gated by `id = auth.uid()`), and "no profile row yet" is
      what the router uses to show onboarding. Idempotent by construction.
- [x] First-run screen: pick a handle (uniqueness checked live) and display name
- [x] Session persistence + auth-guarded routes; sign out

Profiles RLS: `select` open to any `authenticated` (no email column, so safe — this
is what makes handle search work in Phase 2); `insert`/`update` gated to own row.
`citext` extension installed into `extensions` schema for case-insensitive handles.

**Deliverable:** Sign in with an emailed code on a phone, close the app, come back a
week later still signed in.

---

### Phase 2 — Households
- [ ] `households`, `household_members`, `household_invites` + RLS + helper functions
- [ ] Create a household; auto-join creator as `owner`
- [ ] Find People — search by handle, send invite
- [ ] Invites screen — accept/decline via `accept_invite()`
- [ ] Join by code via `join_household_by_code()`; owner can rotate the code
- [ ] Member list; leave household; owner can remove a member
- [ ] Active-household switcher (hidden when you're only in one)

**Deliverable:** Two people on two phones end up in the same household by both routes.

---

### Phase 3 — Meal Catalog
- [ ] `providers`, `meals`, `meal_variations` + `normalized_name` trigger
- [ ] Add a meal (auto-creates a `Standard` variation)
- [ ] Add a variation to an existing meal
- [ ] Meal list with search + tag filter
- [ ] Meal detail page

**Deliverable:** The catalog holds real Clean Eats meals and doesn't accept obvious
duplicates.

---

### Phase 4 — Ratings ← *the app becomes useful here*
- [ ] `ratings` table + RLS
- [ ] Rate flow: 1–5 stars, would-reorder toggle, optional note — two taps from open
- [ ] Edit/delete your own rating
- [ ] `v_variation_household_stats` + `v_meal_household_stats` (both `security_invoker`)
- [ ] Meal detail shows your rating, household average, and per-member breakdown
- [ ] Meal list sortable by household rating / your rating / never tried

**Deliverable:** Both people rate meals independently and see each other's scores and
the household average.

---

### Phase 5 — Weekly Menus
- [ ] `weekly_menus`, `weekly_menu_items`, `menu_selections` + RLS
- [ ] Build a week: search the catalog, add items, publish
- [ ] **Bulk paste import** — paste the provider's list, one meal per line; the app
      fuzzy-matches each line against existing meals (`pg_trgm` similarity) and shows
      a review screen: *matched* (tap to confirm), *new* (tap to create), *ambiguous*
      (pick from candidates). Nothing is written until the review is confirmed.
- [ ] Week View with ratings, badges, and sorting
- [ ] Pick meals — selections visible to the whole household
- [ ] Past weeks archive

**Deliverable:** Sunday's menu gets entered in under two minutes and everyone picks
from their own phone.

---

### Phase 6 — Prioritization & Insights
- [ ] Badges: `NEW`, `LOVED`, `SKIP`, `YOUR FAVORITE`, `NOT IN 6 MONTHS`
- [ ] "Reorder list" — top household-rated meals not ordered recently
- [ ] Agreement view — where your ratings and your spouse's diverge most
- [ ] Per-person stats: meals rated, average score, most-ordered

**Deliverable:** Opening the app on menu day answers "what should we get?" without
scrolling.

---

### Phase 7 — Polish & Edge Cases
- [ ] Realtime on `menu_selections` (watch picks land live) and on invites
- [ ] Meal photos via Supabase Storage
- [ ] Empty states, loading skeletons, offline-read caching
- [ ] iOS Safari + Android Chrome testing, home-screen install check
- [ ] **Keep-alive:** a scheduled GitHub Action pinging the database weekly (see below)

**Deliverable:** Stable enough to stop thinking about.

---

## Two Free-Tier Gotchas

Both are now **shared with `oil-tracker`**, which changes them in opposite directions.

**1. Supabase pauses inactive free projects.** A free project with no activity for ~7
days gets paused and has to be restored by hand from the dashboard. A household app
used hard on Sunday and ignored Monday–Saturday is squarely in the danger zone, and the
failure mode is "app is broken" on the one day you need it. Sharing a project *helps*
here: one keep-alive covers both apps, and the busier of the two keeps the other awake.
Fix if it's not already in place: a cron GitHub Action hitting a trivial endpoint every
couple of days — the same pattern as the 6-hourly YNAB sync workflow already running in
the personal repo.

**2. The built-in email sender is rate-limited** (a few messages per hour, shared
infrastructure, explicitly not for production). Sharing *hurts* here: both apps' login
codes draw on the same budget, and the templates are per-project, so this app's codes
arrive branded as the host project. Fine for a handful of logins across a household
with long-lived sessions. If codes start arriving slowly, or the branding gets
confusing once both apps have real users, wire up custom SMTP (Resend's free tier is
3,000/month) — a settings change, not a code change, but one that lands on both apps at
once.

**A third, specific to sharing:** `auth.users` triggers fire for *every* signup in
*either* app. If `oil-tracker` creates a profile row on signup and this app adds its
own trigger, both run every time. Make this app's trigger idempotent and scoped so it
never assumes a new user is a meal-rating user.

---

## Open Questions

1. **App name.** "Meal Rating" is the repo name, not necessarily the product name.
2. **Rating scale.** 1–5 stars assumed. Half-stars, or a 1–10 scale, would spread a
   two-person household's scores out more — but every extra point of granularity is a
   decision to make while standing at the counter. Worth one conversation before
   Phase 4 locks it in.
3. **Does a household rating weight everyone equally?** If one person eats a meal
   twice as often, should their opinion count more? Assumed no.
4. **Kids / non-account members.** Does everyone in the household need their own login
   and phone, or should there be "profiles without accounts" that a parent rates on
   behalf of? Materially changes the `ratings.user_id` foreign key. Decide before
   Phase 4.
5. **Getting the weekly menu in.** Bulk paste is the assumption. If Clean Eats has a
   stable public menu page, a scraper could pre-fill it — but a static GitHub Pages
   site can't fetch a third-party page (CORS), so that would mean a scheduled Action
   or an Edge Function, and it depends on their terms of service. Manual first.
6. **Does the meal catalog stay global?** Fine while this is one household. If it's
   ever shared more widely, a moderation story is needed for bad or duplicate entries.

---

## Backlog

Deliberately deferred, not forgotten.

- **Rating history over time** — re-rate a meal that changed. Schema is ready
  (`rating_history` alongside the current-value row); no migration needed to add it.
- **Global cross-household averages** — needs a trigger-maintained aggregate table
  exposing counts only, never rows. Worthless at one household.
- **Cost tracking** — price per meal, spend per week, cost-per-rating-point.
- **Nutrition fields** — protein/fat/carbs per meal, to check a week's picks against
  the household's dietary targets. Real overlap with the personal repo's food
  planning, and the reason `tags` exists on `meals` from the start.
- **Push notifications** — "this week's menu is up." Needs a service worker and Web
  Push; iOS only supports it for home-screen-installed PWAs.
- **Export** — CSV of every rating, so the data outlives the app.
- **Split into its own Supabase project** — worth revisiting if a free slot opens up
  (a paused or retired project frees one), if the shared email rate limit or branding
  starts causing real confusion, or if this app ever gets users beyond the household.
  The exit path is in *Where the Database Lives*; it's cheap precisely because auth is
  OTP.

---

## How We'd Work Together

Same rhythm as SHIASA: each phase is a focused session — I write the SQL migrations and
the React, you test on your actual phone with actual meals, feedback shapes the next
phase. The phases are ordered so each one leaves something usable behind. Phase 4 is
the point where the app starts earning its keep; everything after that is making it
fast enough to use without thinking.
