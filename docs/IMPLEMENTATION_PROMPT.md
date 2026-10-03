# RBA LeadViewer Filter Refactor - Implementation Prompt

## Overview
Refactor the filter UI in RBA LeadViewer from a confusing dual-pattern (dropdowns + buttons) 
to a clean 3-tier architecture (Primary/Advanced/Actions).

## Documentation
All requirements, code examples, and implementation steps are in the `docs/` folder:
- docs/START_HERE.txt - Navigation guide
- docs/FILTER_STRUCTURE_RECOMMENDATIONS.md - Architecture details
- docs/FILTER_COMPONENTS_EXAMPLE.tsx - Code templates
- docs/QUICK_START_CHECKLIST.md - Implementation checklist

## What to Build

### 1. Create Filter Components
Create these files in `src/components/leads/filters/`:
- PrimaryFilterBar.tsx (copy from FILTER_COMPONENTS_EXAMPLE.tsx)
- AdvancedFiltersPanel.tsx (copy from FILTER_COMPONENTS_EXAMPLE.tsx)
- ActionBar.tsx (copy from FILTER_COMPONENTS_EXAMPLE.tsx)
- FilterButton.tsx (copy from FILTER_COMPONENTS_EXAMPLE.tsx)
- index.ts (barrel export)

### 2. Integrate into LeadsClient
Modify `src/app/leads/LeadsClient.tsx`:
- Remove FiltersBar function (lines ~1676-1837)
- Remove segment buttons section (lines ~853-963)
- Add new component imports
- Replace with new 3-tier structure (see QUICK_START_CHECKLIST.md Step 7)

### 3. Add Feature Flag
- Create `NEXT_PUBLIC_USE_NEW_FILTERS` environment variable
- Default to `false` for safe deployment
- Wrap new UI in conditional: `{USE_NEW_FILTERS ? <NewUI /> : <OldUI />}`

## Requirements Met
- ✅ No duplicate source filters
- ✅ Clear visual hierarchy (3 tiers)
- ✅ Mobile-responsive (vertical stack)
- ✅ Fully typed TypeScript
- ✅ All components memoized
- ✅ Feature flagged for safe rollout
- ✅ Backward compatible (old code still works)

## Testing
- [ ] All filter buttons respond to clicks
- [ ] Mobile layout stacks correctly
- [ ] Keyboard navigation works (Tab through all elements)
- [ ] Advanced panel opens/closes smoothly
- [ ] Feature flag toggles between old/new UI

## Acceptance Criteria
- New components are created and properly exported
- LeadsClient integrates new components with feature flag
- No console errors or warnings
- Old UI still works when flag is OFF
- Mobile responsive (tested on 375px viewport)

## Documentation References
See detailed implementation steps in: docs/QUICK_START_CHECKLIST.md
See code examples in: docs/FILTER_COMPONENTS_EXAMPLE.tsx
See architecture in: docs/FILTER_STRUCTURE_RECOMMENDATIONS.md