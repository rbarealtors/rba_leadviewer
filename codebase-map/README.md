# RBA Lead Viewer — Codebase Map & Atlas

An interactive, self-contained architecture map and structural index of the RBA Realtors Lead Viewer codebase.

## Generated Artifacts

- **Map HTML**: `codebase-map/rba-leadviewer-map.html` (74 KB, fully offline, no CDN dependencies, supports light/dark mode)
- **Scan Data**: `codebase-map/codebase-data.json` (Hierarchical file tree, line counts, module dependency graph)
- **Configuration**: `codebase-map/map-config.json` (Module definitions, layer pins, exclusions)
- **Metadata**: `codebase-map/meta.json` (Runtime narrative, 6-step ingestion/auth/disposition flow, module purposes)
- **Facets**: `codebase-map/facets.json` (API endpoints & routes, PostgreSQL schema & RLS policies, ingestion libraries)
- **Facet Extractor**: `codebase-map/extract-facets.mjs` (Script to regenerate facet metrics)

## How to Refresh

To rebuild the map after making codebase changes:

```bash
# 1. Update facet counts if routes or schema changed
node codebase-map/extract-facets.mjs

# 2. Re-scan and assemble the HTML viewer
node "C:/Users/User 5/.agents/skills/codebase-map/scripts/build.mjs" codebase-map/map-config.json
```

