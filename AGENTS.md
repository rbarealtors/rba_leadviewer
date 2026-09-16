# Repository Guide & Agent Instructions

This repository is **RBA Realtors Lead Viewer**, an internal web application for ingesting, managing, and dispositioning real estate leads.

## 1. Context & Navigation Layer (`codebase-map/`)

To minimize context and token usage, **do not begin tasks with broad recursive searches or blind repository scanning**. A pre-computed structural index lives in `codebase-map/`. Use it as your first-pass navigation layer:

1. **Architecture & Flow**: Read [`codebase-map/meta.json`](file:///codebase-map/meta.json) for the high-level system narrative, 6-step request/lead flow, module roles, and key area directories.
2. **Routes, Schema & Handlers**: Read [`codebase-map/facets.json`](file:///codebase-map/facets.json) to locate:
   - Ingestion webhooks (`/api/webhooks/*`) & internal endpoints (`/api/*`) with HTTP verbs, authentication types, and LOC.
   - Server Actions categorized by domain (`leads`, `sales`, `login`, `users`).
   - PostgreSQL schema for `public.leads` and `public.campaign_mappings`, table columns, migrations, triggers (`leads_protect_submitted_fields`), and RPC functions (`get_lead_kpis`).
   - Row Level Security (RLS) policies and lead status/disposition workflows.
3. **File Index & Sizing**: Consult [`codebase-map/codebase-data.json`](file:///codebase-map/codebase-data.json) as a file tree and LOC index before exploring directories.
4. **Targeted Inspection**: Follow the module dependencies (`app → components → lib → database`) to pinpoint the minimal set of files needed, then inspect the actual source code. The map is a structural index, not authoritative implementation code.

### Required Navigation Workflow
```
AGENTS.md → meta.json / facets.json / codebase-data.json → targeted source files → implementation
```
*(Avoid: `AGENTS.md → blindly scan the entire repository`)*

## 2. Critical Architectural Constraints

Always uphold the following project constraints:

- **Next.js App Router**: Uses Next.js 15 App Router (`src/app/`) with React 18 client/server components and Server Actions. Do not introduce legacy Pages router patterns.
- **Cloudflare Workers / OpenNext**: Deployed to Cloudflare Workers via `@opennextjs/cloudflare`. Webhook endpoints, edge handlers, and middleware must remain compatible with Cloudflare Workers runtime (no unsupported Node-native APIs in edge paths).
- **Supabase & PostgreSQL**: Database queries and mutations use `@supabase/ssr` on the server/client and `@supabase/supabase-js` service role client for privileged background routes.
- **Three-Tier Role Matrix**:
  - `admin`: Full system access, user management (`/users`), PIN provisioning, campaign mapping configuration (`/settings/campaign-mappings`).
  - `staff`: Full lead table access (`/leads`), lead name editing, sales rep assignment, KPI viewing.
  - `sales`: Mobile sales feed (`/sales`) protected by role check and 4-digit PIN verification.
- **Strict RLS Boundaries**: Sales reps **must only ever access, select, or update leads assigned to them** (`assigned_to = auth.uid()`). Respect the database triggers defending immutable submitted lead fields (`source`, `phone_number`, `raw_payload`, etc.).
- **Ingestion Pipeline Integrity**: Ingestion routes (`/api/webhooks/google-ads`, `meta`, `google-sheets`, `portal-email`) must authenticate via platform secrets or HMAC SHA256 signatures, deduplicate on `(source, external_lead_id)`, and write via the service-role client.

## 3. Maintaining the Codebase Map

The codebase map must stay accurate as the system evolves:

- **When to Refresh**: If you add, remove, or rename routes, Server Actions, database migrations, ingestion pipelines, modules, or major architectural boundaries, update the map.
- **When NOT to Refresh**: Do not regenerate the map for trivial implementation edits, UI styling tweaks, bug fixes, or minor refactors that do not change structural boundaries.
- **How to Refresh**:
  ```bash
  # 1. Refresh stack facets (routes, schema, LOC counts)
  node codebase-map/extract-facets.mjs

  # 2. Rebuild structural scan and HTML atlas
  node "C:/Users/User 5/.agents/skills/codebase-map/scripts/build.mjs" codebase-map/map-config.json
  ```

