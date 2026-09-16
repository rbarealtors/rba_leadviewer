import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(workDir, '..');

function countLines(relPath) {
  try {
    return fs.readFileSync(path.join(repoDir, relPath), 'utf8').split('\n').length;
  } catch {
    return 0;
  }
}

const routes = [
  { path: '/api/webhooks/google-ads', type: 'webhook', methods: ['POST'], auth: 'Secret Header', file: 'src/app/api/webhooks/google-ads/route.ts' },
  { path: '/api/webhooks/meta', type: 'webhook', methods: ['GET', 'POST'], auth: 'HMAC SHA256 / Token', file: 'src/app/api/webhooks/meta/route.ts' },
  { path: '/api/webhooks/google-sheets', type: 'webhook', methods: ['POST'], auth: 'Secret Header', file: 'src/app/api/webhooks/google-sheets/route.ts' },
  { path: '/api/webhooks/portal-email', type: 'webhook', methods: ['POST'], auth: 'Secret Header', file: 'src/app/api/webhooks/portal-email/route.ts' },
  { path: '/api/leads/assigned-to-me', type: 'internal', methods: ['GET'], auth: 'Sales Session (RLS)', file: 'src/app/api/leads/assigned-to-me/route.ts' },
  { path: '/api/leads/[id]', type: 'internal', methods: ['PATCH'], auth: 'Staff / Sales (RLS)', file: 'src/app/api/leads/[id]/route.ts' },
  { path: '/api/leads/[id]/assign', type: 'internal', methods: ['PATCH'], auth: 'Staff / Admin', file: 'src/app/api/leads/[id]/assign/route.ts' },
  { path: '/api/auth/verify-pin', type: 'auth', methods: ['POST'], auth: 'Authenticated Rep', file: 'src/app/api/auth/verify-pin/route.ts' },
  { path: '/api/settings/campaign-mappings', type: 'admin', methods: ['GET', 'POST', 'DELETE'], auth: 'Staff / Admin', file: 'src/app/api/settings/campaign-mappings/route.ts' },
];

routes.forEach(r => { r.loc = countLines(r.file); });

const serverActions = [
  { domain: 'Lead Management', file: 'src/app/leads/actions.ts', actions: ['markAsViewed', 'updateLeadName'] },
  { domain: 'Lead Assignment', file: 'src/app/leads/assignment-actions.ts', actions: ['assignLeadAction', 'getAssignableSalesRepsAction'] },
  { domain: 'Sales Dispositions', file: 'src/app/sales/sales-actions.ts', actions: ['updateLeadStatusAndDispositionAction', 'transferLeadAction'] },
  { domain: 'Authentication', file: 'src/app/login/actions.ts', actions: ['loginAction', 'logoutAction'] },
  { domain: 'User & PIN Admin', file: 'src/app/users/actions.ts', actions: ['createUserAction', 'updateUserRoleAction', 'setSalesPinAction', 'deleteUserAction'] },
];

const migDir = path.join(repoDir, 'supabase/migrations');
const migrations = fs.existsSync(migDir) ? fs.readdirSync(migDir)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => ({ name: f, loc: countLines(path.join('supabase/migrations', f)) })) : [];

const facets = {
  facets: [
    {
      id: 'routes',
      nav: 'Routes & Endpoints',
      title: 'Application Routes & Webhooks',
      headline: '9 route handlers · 6 App Router pages · 11 server actions',
      sub: 'Next.js App Router routing & ingestion surface',
      hero: { v: '15', l: 'Total Routes', s: '9 API · 6 Pages' },
      columns: 2,
      sections: [
        {
          kind: 'tree',
          title: 'Route Tree & Handlers',
          sub: 'src/app hierarchy',
          items: [
            {
              label: 'webhooks (inbound ingestion)',
              badge: 'webhook',
              children: [
                { label: 'google-ads — POST (Secret Header)', badge: 'webhook' },
                { label: 'meta — GET (Verify) · POST (HMAC)', badge: 'webhook' },
                { label: 'google-sheets — POST (Bridge Ingestion)', badge: 'webhook' },
                { label: 'portal-email — POST (99acres & Magicbricks)', badge: 'webhook' }
              ]
            },
            {
              label: 'api (internal endpoints)',
              badge: 'internal',
              children: [
                { label: 'leads/assigned-to-me — GET', badge: 'sales' },
                { label: 'leads/[id] — PATCH', badge: 'internal' },
                { label: 'leads/[id]/assign — PATCH', badge: 'staff' },
                { label: 'auth/verify-pin — POST', badge: 'auth' },
                { label: 'settings/campaign-mappings — GET · POST · DELETE', badge: 'admin' }
              ]
            },
            {
              label: 'pages (UI routes)',
              badge: 'page',
              children: [
                { label: '/ — Root Redirect (/leads or /sales)', badge: 'page' },
                { label: '/login — Staff & Sales Authentication', badge: 'page' },
                { label: '/leads — Full Lead Viewer & Drawer (Staff/Admin)', badge: 'page' },
                { label: '/sales — PIN Guard & Mobile Feed (Sales)', badge: 'page' },
                { label: '/users — User & Role Administration (Admin)', badge: 'page' },
                { label: '/settings/campaign-mappings — Campaign Alias Mapping (Admin)', badge: 'page' }
              ]
            }
          ]
        },
        {
          kind: 'barlist',
          title: 'API Routes by Code Complexity (LOC)',
          note: 'Hover for implementation file',
          series: [{ k: 'loc', label: 'Lines of Code' }],
          rows: routes.sort((a,b) => b.loc - a.loc).map(r => ({
            label: r.path.replace('/api/', ''),
            values: { loc: r.loc },
            meta: r.methods.join(', ') + ' · ' + r.loc + ' LOC',
            tip: r.file + ' · Auth: ' + r.auth
          }))
        },
        {
          kind: 'groups',
          title: 'Server Actions (RPCs)',
          groups: serverActions.map(sa => ({
            title: sa.domain + ' (' + path.basename(sa.file) + ')',
            chips: sa.actions,
            accent: sa.domain.includes('Admin') || sa.domain.includes('Sales')
          }))
        }
      ]
    },
    {
      id: 'database',
      nav: 'Database & Security',
      title: 'PostgreSQL Schema & Security Architecture',
      headline: '2 tables · 8 migrations · 4 RLS policies · 1 trigger · 1 RPC',
      sub: 'Supabase Postgres with Row Level Security',
      hero: { v: '4', l: 'RLS Policies', s: 'Admin/Staff/Sales' },
      columns: 2,
      sections: [
        {
          kind: 'tiles',
          tiles: [
            { v: '2', l: 'Postgres Tables', s: 'leads · campaign_mappings' },
            { v: '8', l: 'Migrations', s: '0001 to 0008' },
            { v: '5', l: 'Lead Sources', s: 'Google · Meta · Sheets · 99acres · Magicbricks' },
            { v: '4', l: 'RLS Policies', s: 'Staff full · Rep assigned' }
          ]
        },
        {
          kind: 'groups',
          title: 'Database Schema & Constraints',
          groups: [
            {
              title: 'public.leads (Core Lead Entity)',
              chips: [
                'id (uuid pk)', 'source (check constraint)', 'external_lead_id', 'full_name', 'phone_number',
                'email', 'campaign_name', 'ad_group_name', 'ad_name', 'budget_range', 'bhk_configuration',
                'planning_timeline', 'platform', 'source_submitted_at', 'created_at', 'viewed_at',
                'assigned_to (uuid)', 'assigned_at', 'lead_status', 'disposition', 'disposition_details',
                'next_follow_up', 'raw_payload (jsonb)'
              ]
            },
            {
              title: 'public.campaign_mappings (Aliases)',
              chips: [
                'id (text pk)', 'type (campaign|adgroup|property)', 'display_name', 'created_at', 'updated_at'
              ]
            },
            {
              title: 'Database Indices & Uniqueness',
              chips: [
                'unique (source, external_lead_id)', 'leads_source_submitted_at_desc_idx',
                'leads_source_idx', 'leads_campaign_name_idx', 'leads_ad_group_name_idx', 'leads_viewed_at_idx'
              ]
            },
            {
              title: 'Row Level Security (RLS) Policies',
              accent: true,
              chips: [
                'Admin and staff full access (FOR ALL on leads)',
                'Sales reps assigned leads select (FOR SELECT where assigned_to = auth.uid())',
                'Sales reps assigned leads update (FOR UPDATE where assigned_to = auth.uid())',
                'allow select campaign_mappings (FOR SELECT to public/staff)'
              ]
            },
            {
              title: 'Security Triggers & Stored Procedures',
              chips: [
                'leads_protect_submitted_fields() — Prevents mutations to submitted data (source, phone, raw_payload)',
                'get_lead_kpis() — SECURITY DEFINER JSON aggregator for total, new, viewed & source stats'
              ]
            }
          ]
        },
        {
          kind: 'loclist',
          title: 'PostgreSQL Migration History',
          sub: 'supabase/migrations',
          rows: migrations.map(m => ({
            label: m.name,
            meta: m.loc + ' LOC',
            bar: m.loc
          }))
        }
      ]
    },
    {
      id: 'pipelines',
      nav: 'Pipelines & Lib',
      title: 'Lead Ingestion Pipelines & Utilities',
      headline: '4 ingestion pipelines · 2 email parsers · RBAC & Auth helpers',
      sub: 'src/lib modular business logic',
      hero: { v: '4', l: 'Ingestion Pipelines', s: 'Google · Meta · 99acres · MB' },
      columns: 2,
      sections: [
        {
          kind: 'loclist',
          title: 'Lead Processing & Parsing Libraries',
          sub: 'src/lib/leads',
          rows: [
            { label: 'email-parser-99acres.ts (HTML & plain-text regex parser)', meta: countLines('src/lib/leads/email-parser-99acres.ts') + ' LOC', bar: countLines('src/lib/leads/email-parser-99acres.ts') },
            { label: 'email-parser-magicbricks.ts (Multi-format portal parser)', meta: countLines('src/lib/leads/email-parser-magicbricks.ts') + ' LOC', bar: countLines('src/lib/leads/email-parser-magicbricks.ts') },
            { label: 'formatters.ts (Date, phone, badge & payload formatters)', meta: countLines('src/lib/leads/formatters.ts') + ' LOC', bar: countLines('src/lib/leads/formatters.ts') },
            { label: 'google-ads-map.ts (Dynamic alias resolution cache)', meta: countLines('src/lib/leads/google-ads-map.ts') + ' LOC', bar: countLines('src/lib/leads/google-ads-map.ts') },
            { label: 'normalize-meta.ts (Graph API leadgen payload adapter)', meta: countLines('src/lib/leads/normalize-meta.ts') + ' LOC', bar: countLines('src/lib/leads/normalize-meta.ts') },
            { label: 'normalize-google.ts (Google Ads webhook field mapper)', meta: countLines('src/lib/leads/normalize-google.ts') + ' LOC', bar: countLines('src/lib/leads/normalize-google.ts') },
            { label: 'search.ts (Client-side lead filtering & search predicate)', meta: countLines('src/lib/leads/search.ts') + ' LOC', bar: countLines('src/lib/leads/search.ts') },
            { label: 'phone.ts (E.164 phone sanitization & formatting)', meta: countLines('src/lib/leads/phone.ts') + ' LOC', bar: countLines('src/lib/leads/phone.ts') },
            { section: 'Authentication & Client Infrastructure' },
            { label: 'user-management-logic.ts (User CRUD & PIN management)', meta: countLines('src/lib/auth/user-management-logic.ts') + ' LOC', bar: countLines('src/lib/auth/user-management-logic.ts') },
            { label: 'time.ts (IST timezone conversions & formatting)', meta: countLines('src/lib/time.ts') + ' LOC', bar: countLines('src/lib/time.ts') },
            { label: 'verify-signature.ts (Meta HMAC SHA256 verification)', meta: countLines('src/lib/verify-signature.ts') + ' LOC', bar: countLines('src/lib/verify-signature.ts') },
            { label: 'supabase/server.ts (Server-side Supabase SSR client)', meta: countLines('src/lib/supabase/server.ts') + ' LOC', bar: countLines('src/lib/supabase/server.ts') },
            { label: 'supabase/admin.ts (Service role client for webhooks)', meta: countLines('src/lib/supabase/admin.ts') + ' LOC', bar: countLines('src/lib/supabase/admin.ts') }
          ]
        },
        {
          kind: 'groups',
          title: 'Lead Lifecycle States & Data Normalization',
          groups: [
            {
              title: 'Ingestion Sources',
              chips: ['Google Ads Webhook', 'Meta Lead Ads (Graph API)', 'Facebook Sheets Bridge', '99acres Portal Email', 'Magicbricks Portal Email']
            },
            {
              title: 'Lead Status Workflow',
              chips: ['NEW (Unviewed)', 'VIEWED', 'CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'NOT_INTERESTED', 'INVALID / SPAM']
            },
            {
              title: 'Sales Dispositions',
              accent: true,
              chips: ['Connected - Follow Up', 'Connected - Site Visit', 'Connected - Not Interested', 'RNR (Ring No Response)', 'Busy / Call Later', 'Switch Off / Unreachable', 'Wrong Number']
            },
            {
              title: 'User Roles & Access Control',
              chips: ['admin (Full user/mapping/lead access)', 'staff (Lead triage, name edit, assignment)', 'sales (Assigned leads only, PIN gated)']
            }
          ]
        }
      ]
    }
  ]
};

fs.writeFileSync(path.join(workDir, 'facets.json'), JSON.stringify(facets, null, 2), 'utf8');
console.log('facets.json generated successfully.');
