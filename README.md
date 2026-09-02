# RBA Realtors — Lead Viewer

A tiny internal tool: receive Google Ads and Meta (Facebook/Instagram) lead-form
submissions via webhook, store them, and let staff view/search/filter them and
mark them viewed. **Not a CRM** — see `MASTER_PROMPT.md`-style scope notes below
if you're tempted to add features.

## Tech stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS
- Supabase Postgres + Supabase Auth (`@supabase/ssr`, email + password)
- Deployed to Cloudflare Workers via the [OpenNext adapter](https://opennext.js.org/cloudflare)
  (`@opennextjs/cloudflare` + `wrangler`)

### A note on the Cloudflare deployment path

Cloudflare's current default recommendation for new Next.js apps is **vinext**
(a Vite-based Next.js runtime, currently in beta, requires Next.js 16). This
project uses the **OpenNext adapter** instead: it reached GA in Feb 2026, is
fully documented as a supported path for exactly this kind of app (server
routes, webhooks, cookie auth), and doesn't require betting a production
internal tool on a beta toolchain. If you want to move to vinext later,
Cloudflare's migration path is `npx vinext init` from the project root — see
https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values, see below
npm run dev
```

## Environment variables

See `.env.example` for the full list with explanations. Summary:

| Variable | Where it's used | Safe for browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | everywhere | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser client, server client (RLS-scoped) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook routes only (bypasses RLS) | **No — server only** |
| `GOOGLE_WEBHOOK_SECRET` | `/api/webhooks/google-ads` | **No — server only** |
| `META_APP_SECRET` | `/api/webhooks/meta` (HMAC verification) | **No — server only** |
| `META_VERIFY_TOKEN` | `/api/webhooks/meta` (subscription handshake) | **No — server only** |
| `META_ACCESS_TOKEN` | `/api/webhooks/meta` (Graph API lead fetch) | **No — server only** |
| `META_PAGE_ID` | reference only / future validation | No |

Check your Supabase project's API settings page for the current name of the
public key — Supabase has used both "anon key" and "publishable key" as the
label over time; whichever it's called, that's what goes in
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Supabase setup

1. Create a Supabase project.
2. Run the migration in `supabase/migrations/0001_init.sql` — either:
   - `supabase link` + `supabase db push` (recommended, keeps it version controlled), or
   - paste the file into the SQL editor in the Supabase dashboard once.
3. Create staff accounts: **Authentication → Users → Add user** (email + password).
   This app deliberately has no self-serve signup page — it's an internal tool
   for a small team, so accounts are provisioned by hand.
4. Confirm Row Level Security is enabled on `public.leads` (the migration
   enables it and creates the policies described in the schema comments).

## Database schema

Single table, `public.leads` — see `supabase/migrations/0001_init.sql` for the
authoritative version. Highlights:

- `UNIQUE (source, external_lead_id)` is the deduplication boundary. Same
  platform lead delivered twice → one row. Same person, two different
  platform-issued lead IDs → two rows (by design, see prompt spec §7).
- `raw_payload JSONB` preserves the original webhook/API payload for
  debugging. Not shown in the UI.
- Only `viewed_at` is mutable after insert — enforced three ways: the app
  only ever sends `{ viewed_at }` in its update call, the `authenticated`
  role is only granted `UPDATE` on that one column, and a trigger
  (`leads_protect_submitted_fields_trigger`) rejects any update that
  touches another column, as a backstop.

## Google Ads webhook setup

1. In Google Ads: **Campaigns → Assets → Lead form asset → Edit → Export
   leads → Webhook integration**.
2. Webhook URL: `https://<your-domain>/api/webhooks/google-ads`
3. Webhook key: generate one and put the same value in `GOOGLE_WEBHOOK_SECRET`.
4. Send a test lead from the Google Ads UI and confirm it shows up in `/leads`.

Reference: https://developers.google.com/google-ads/webhook/docs/implementation

**Known limitation (Google's API, not this app):** Google's lead-form webhook
payload only includes numeric `campaign_id` / `adgroup_id` / `form_id` — it
does not include human-readable campaign or ad group names. This app displays
`Campaign {id}` / `Ad Group {id}` as a readable fallback and stores the raw
IDs in `raw_payload`. If you need the actual names, you'd have to cross-
reference them via the Google Ads UI/API separately — out of scope for this
tool (see "not a CRM").

## Meta (Facebook/Instagram) webhook setup

1. Create/use a Meta App in the [App Dashboard](https://developers.facebook.com/apps).
2. Add the **Webhooks** product, subscribe to the `leadgen` field on your Page.
3. Webhook URL: `https://<your-domain>/api/webhooks/meta`
4. Verify token: any string you choose, set as `META_VERIFY_TOKEN`.
5. App Secret (App Dashboard → Settings → Basic) → `META_APP_SECRET`.
6. Generate a Page Access Token (or System User token) with `leads_retrieval`
   permission → `META_ACCESS_TOKEN`. Required permissions for this flow:
   `leads_retrieval`, `pages_manage_metadata`, `pages_show_list`,
   `pages_read_engagement`, `ads_management`. Your app will need App Review
   for these in production.
7. Note: Meta only retains lead data for 90 days — the webhook + immediate
   Graph API fetch pattern this app uses (fetch full lead detail as soon as
   the notification arrives) is what makes that a non-issue.
8. Graph API version currently pinned in
   `src/app/api/webhooks/meta/route.ts` (`GRAPH_API_VERSION`) — Meta ships
   new versions periodically and deprecates old ones; bump this when needed.

Reference: https://developers.facebook.com/docs/graph-api/webhooks

## Running tests

```bash
npm run test
```

Covers: Google/Meta payload normalization (including missing-field handling
and forward-compatibility with unrecognized fields), phone number
normalization, the dedupe-key logic, and search/filter matching.

Two test files (`tests/dedup.test.ts`, `tests/viewed-state-and-auth.test.ts`)
include a `describe.skip` block documenting how to verify the database-level
idempotency constraint and the auth-gated behavior (viewed-state mutation,
protected routes, webhook signature rejection) end-to-end against a real
Supabase project — those specific guarantees live in Postgres/RLS/session
cookies and can't be meaningfully unit-tested in isolation.

## Building locally

```bash
npm run typecheck
npm run build
```

## Cloudflare deployment

```bash
npm install -D @opennextjs/cloudflare wrangler   # already in devDependencies
npx wrangler login
npm run deploy   # runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy`
```

Set the same environment variables from `.env.example` as Worker secrets
(never as plain `vars` for the sensitive ones):

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GOOGLE_WEBHOOK_SECRET
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put META_ACCESS_TOKEN
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can go
in `wrangler.jsonc` under `vars` (they're client-safe) or also as secrets —
either works.

## GitHub deployment workflow

1. `git init && git add . && git commit -m "Initial commit"`
2. Push to a new GitHub repo.
3. In the Cloudflare dashboard: **Workers & Pages → Create → Workers Builds**,
   connect the GitHub repo, set the build command to `npm run deploy` (or use
   `npx wrangler deploy` after a CI build step — either is fine), and set the
   Worker secrets listed above in the Cloudflare dashboard.
4. Every push to your default branch redeploys automatically.

## What was intentionally left out

See the scope limits in the original product spec — no CRM features
(contacts, deals, pipelines, tasks, notes, WhatsApp, invoicing, analytics
dashboards, lead scoring, bulk editing, pagination, virtualization). If a
feature isn't "receive, store, view, search/filter, contact, mark viewed,"
it doesn't belong here.
