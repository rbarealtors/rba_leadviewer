# RBA LeadViewer Filter Refactor - Quick Start Checklist

## Executive Summary

**Current**: Confusing dual-pattern filters (dropdowns + buttons)  
**Goal**: Clear, tiered, organized filter architecture  
**Effort**: 4-6 hours implementation + testing  
**Risk**: Low (feature-flagged, easy rollback)  

---

## Pre-Implementation (1 hour)

- [ ] Review `/FILTER_STRUCTURE_RECOMMENDATIONS.md` 
- [ ] Review `/BEFORE_AFTER_COMPARISON.md`
- [ ] Answer these questions:
  - [ ] Is Campaign/AdGroup filtering actually used? (Check analytics)
  - [ ] Should "Needs review" be a view or a status filter?
  - [ ] Mobile priority: drawer or inline?
- [ ] Get sign-off on visual direction from stakeholders
- [ ] Create feature flag: `LEADVIEWER_NEW_FILTERS`

---

## Implementation Checklist

### Step 1: Create Component Scaffold (30 min)

```bash
# Create directory structure
mkdir -p src/components/leads/filters

# Copy template from FILTER_COMPONENTS_EXAMPLE.tsx
# Create these files:
touch src/components/leads/filters/PrimaryFilterBar.tsx
touch src/components/leads/filters/AdvancedFiltersPanel.tsx
touch src/components/leads/filters/ActionBar.tsx
touch src/components/leads/filters/FilterButton.tsx
touch src/components/leads/filters/index.ts
```

### Step 2: Implement PrimaryFilterBar (60 min)

**File**: `src/components/leads/filters/PrimaryFilterBar.tsx`

```typescript
// START HERE - Copy from FILTER_COMPONENTS_EXAMPLE.tsx
// Export function PrimaryFilterBar() {...}

// Key requirements:
✓ Search input with clear button
✓ View filter buttons (All/New/Needs review)
✓ Source filter buttons (All/Google/Meta/99acres/MB)
✓ Date preset selector
✓ Advanced toggle + Reset button
✓ Sticky positioning (top-0 z-40)
✓ Responsive layout

// Test with:
- Clicking each button (state updates)
- Responsive on mobile/tablet/desktop
- Keyboard navigation (Tab through all elements)
```

### Step 3: Implement AdvancedFiltersPanel (45 min)

**File**: `src/components/leads/filters/AdvancedFiltersPanel.tsx`

```typescript
// Copy from FILTER_COMPONENTS_EXAMPLE.tsx
// Export function AdvancedFiltersPanel() {...}

// Key requirements:
✓ Campaign dropdown
✓ Ad Group dropdown
✓ Custom date range (From/To)
✓ Collapse/expand animation
✓ Only render when `open={true}`

// Test with:
- Opening/closing panel
- Selecting options updates state
- Custom dates work correctly
```

### Step 4: Implement ActionBar (30 min)

**File**: `src/components/leads/filters/ActionBar.tsx`

```typescript
// Copy from FILTER_COMPONENTS_EXAMPLE.tsx
// Export function ActionBar() {...}

// Key requirements:
✓ Export button (right-aligned)
✓ Import button (if admin)
✓ Add Lead button (primary action)
✓ More menu (optional, for future actions)

// Test with:
- Export disabled/enabled states
- Import visibility based on role
- Hover effects
```

### Step 5: Extract Reusable Components (30 min)

**File**: `src/components/leads/filters/FilterButton.tsx`

```typescript
// Copy from FILTER_COMPONENTS_EXAMPLE.tsx
// Export function FilterButton() {...}
// Export function FilterGroup() {...}
// Export function Divider() {...}
// Export function SearchInput() {...}
// Export function DatePresetSelector() {...}

// These will be used by PrimaryFilterBar and AdvancedFiltersPanel
```

### Step 6: Create Barrel Export (5 min)

**File**: `src/components/leads/filters/index.ts`

```typescript
export { PrimaryFilterBar } from './PrimaryFilterBar';
export { AdvancedFiltersPanel } from './AdvancedFiltersPanel';
export { ActionBar } from './ActionBar';
export { FilterButton, FilterGroup } from './FilterButton';
```

### Step 7: Integrate Into LeadsClient (90 min)

**File**: `src/app/leads/LeadsClient.tsx`

**Before** (~1943 lines):
```typescript
// Lines 1676-1837: FiltersBar function
// Lines 853-963: Segment buttons
// Lines 790-850: Action buttons inside FiltersBar
// Total: 300+ lines of mixed UI
```

**After** (replace with ~60 lines):
```typescript
import { 
  PrimaryFilterBar, 
  AdvancedFiltersPanel, 
  ActionBar 
} from '@/components/leads/filters';

// In return statement:
return (
  <div className="space-y-4">
    {/* Feature flag for safety */}
    {USE_NEW_FILTERS ? (
      <>
        <PrimaryFilterBar
          search={search}
          onSearch={setSearch}
          view={view}
          onView={setView}
          source={source}
          onSource={setSource}
          sourceOptions={[...]}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
          onReset={handleResetFilters}
        />

        <AdvancedFiltersPanel
          open={showAdvanced}
          campaign={campaign}
          onCampaign={setCampaign}
          campaignOptions={availableCampaigns}
          adGroup={adGroup}
          onAdGroup={setAdGroup}
          adGroupOptions={adGroupOptions}
          customFrom={customFrom}
          onCustomFrom={setCustomFrom}
          customTo={customTo}
          onCustomTo={setCustomTo}
        />

        <ActionBar
          onExport={handleExport}
          isExportDisabled={isExportDisabled}
          exportLabel={exportButtonLabel}
          canImport={canExport}
          onAddLead={() => setIsAddLeadOpen(true)}
        />
      </>
    ) : (
      // OLD UI - kept for rollback
      <FiltersBar {...oldProps} />
    )}

    {/* Rest unchanged */}
    <StatsCardsRow {...stats} />
    <LeadsTable {...tableProps} />
  </div>
);
```

**Deletion checklist**:
- [ ] Delete `function FiltersBar()` (lines ~1676-1837)
- [ ] Delete segment button JSX (lines ~853-963)
- [ ] Remove duplicate source handling logic

---

## Testing Checklist

### Unit Tests (30 min)

```bash
# Create test files
touch src/components/leads/filters/__tests__/PrimaryFilterBar.test.tsx
touch src/components/leads/filters/__tests__/AdvancedFiltersPanel.test.tsx
touch src/components/leads/filters/__tests__/ActionBar.test.tsx
```

```typescript
// Example tests:
describe('PrimaryFilterBar', () => {
  it('renders all source buttons', () => {
    const { getByText } = render(<PrimaryFilterBar {...props} />);
    expect(getByText('Google')).toBeInTheDocument();
  });

  it('calls onSource when button clicked', () => {
    const onSource = jest.fn();
    const { getByText } = render(<PrimaryFilterBar onSource={onSource} {...props} />);
    fireEvent.click(getByText('Meta'));
    expect(onSource).toHaveBeenCalledWith('meta_ads');
  });

  it('shows advanced panel when toggled', () => {
    const { getByText, rerender } = render(
      <PrimaryFilterBar showAdvanced={false} {...props} />
    );
    expect(queryByText('Advanced')).not.toBeInTheDocument();
    
    rerender(<PrimaryFilterBar showAdvanced={true} {...props} />);
    expect(getByText('Advanced')).toBeInTheDocument();
  });
});
```

### Integration Tests (30 min)

```bash
# Test entire flow in LeadsClient
npx vitest src/app/leads/__tests__/LeadsClient.filter-flow.test.tsx
```

```typescript
describe('LeadsClient - Filter Flow', () => {
  it('filters leads when source button clicked', async () => {
    render(<LeadsClient />);
    const metaButton = screen.getByText('Meta');
    fireEvent.click(metaButton);
    // Wait for data fetch
    await waitFor(() => {
      expect(screen.getAllByText('Meta Ads')).toHaveLength(18);
    });
  });

  it('shows advanced panel and filters by campaign', async () => {
    render(<LeadsClient />);
    fireEvent.click(screen.getByText('Show advanced'));
    const campaignSelect = screen.getByDisplayValue('All campaigns');
    fireEvent.change(campaignSelect, { target: { value: 'Summer Campaign' } });
    await waitFor(() => {
      expect(screen.getByText('Filtered by campaign')).toBeInTheDocument();
    });
  });
});
```

### Manual Testing Checklist (45 min)

#### Desktop (Chrome, 1440px)
- [ ] Search input clears properly
- [ ] All filter buttons respond to click
- [ ] Source button selection is visually clear
- [ ] Date selector shows all presets
- [ ] Advanced panel opens/closes smoothly
- [ ] Action buttons are right-aligned and usable
- [ ] Stats update when filters change
- [ ] Table filters correctly
- [ ] Tab navigation works through all elements

#### Tablet (iPad, 768px)
- [ ] All elements fit without overflow
- [ ] Buttons don't wrap awkwardly
- [ ] Date picker touch targets are large enough (>44px)
- [ ] Advanced panel is readable

#### Mobile (iPhone, 375px)
- [ ] Vertical stack layout
- [ ] No horizontal scroll needed
- [ ] Search is tappable
- [ ] Buttons stack nicely
- [ ] Advanced panel opens full-screen
- [ ] Each control is >40px for touch targets

#### Accessibility
- [ ] Keyboard navigation flows logically
- [ ] Tab order follows visual order
- [ ] ARIA labels present on button groups
- [ ] Screen reader announces active states
- [ ] Color not sole indicator of state

---

## Deployment Strategy

### Option A: Feature Flag (Recommended)

```typescript
// In env or config:
const USE_NEW_FILTERS = process.env.NEXT_PUBLIC_USE_NEW_FILTERS === 'true';

// In LeadsClient:
return USE_NEW_FILTERS ? <NewFilterUI /> : <OldFilterUI />;
```

**Rollout**:
1. Deploy with flag OFF
2. QA tests with flag ON
3. Enable for 10% of users
4. Monitor metrics
5. Increase to 50%, then 100%
6. Keep for 2 weeks
7. Remove old code and flag

### Option B: Direct Replacement (If low risk)

1. Deploy new components
2. Integrate into LeadsClient
3. Remove old UI code
4. No rollback possible (but easier to maintain)

### Recommended: Option A

Why?
- If issues arise, instant rollback to working state
- Users won't see partially migrated UI
- Confidence in quality before full commit
- Easy A/B testing of metrics

---

## Rollback Plan

If something breaks in production:

```bash
# Option 1: Flip feature flag (instant)
NEXT_PUBLIC_USE_NEW_FILTERS=false
# Deploy config change (no code change needed)

# Option 2: Revert to previous commit (30 sec downtime)
git revert <merge-commit-hash>
git push production

# Monitor:
- Error rates
- User session duration
- Filter interaction metrics
```

---

## Files to Update

### New Files (Create)
- [ ] `src/components/leads/filters/PrimaryFilterBar.tsx` (~150 lines)
- [ ] `src/components/leads/filters/AdvancedFiltersPanel.tsx` (~100 lines)
- [ ] `src/components/leads/filters/ActionBar.tsx` (~80 lines)
- [ ] `src/components/leads/filters/FilterButton.tsx` (~100 lines)
- [ ] `src/components/leads/filters/index.ts` (~10 lines)
- [ ] `src/components/leads/filters/__tests__/*.test.tsx` (~300 lines)

### Files to Modify
- [ ] `src/app/leads/LeadsClient.tsx`
  - Remove: ~300 lines (FiltersBar + segment buttons)
  - Add: ~80 lines (new component calls + feature flag)
  - Net: -220 lines ✅

### Files NOT Changed
- [ ] `src/lib/leads/filters-url.ts` (data layer unchanged)
- [ ] `src/app/leads/actions.ts` (mutations unchanged)
- [ ] `src/app/leads/LeadsTable.tsx` (table unchanged)

---

## Timeline

| Time | Task | Owner |
|------|------|-------|
| 0h | Read documentation | You |
| 1h | Answer pre-impl questions | You |
| 1.5h | Create component scaffold | Frontend dev |
| 3h | Implement components | Frontend dev |
| 1.5h | Integrate into LeadsClient | Frontend dev |
| 1h | Write tests | Frontend dev |
| 1h | Manual testing | QA |
| 0.5h | Code review | Code reviewer |
| 0.5h | Deploy with feature flag OFF | DevOps |
| 1h | QA final smoke test | QA |
| 0.5h | Enable flag for 10% users | DevOps |
| Ongoing | Monitor metrics | Analytics |
| 2h | Iterate on issues | Frontend dev |
| 0.5h | Full rollout | DevOps |
| **~13h total** | **Full implementation** | |

---

## Success Criteria

### Must-Have
- [ ] Filters work identically to old version
- [ ] No data loss or corruption
- [ ] Mobile doesn't break
- [ ] Accessibility maintained (WCAG AA)
- [ ] Performance doesn't degrade

### Should-Have
- [ ] Click count to filter reduced
- [ ] Users prefer new UI (survey)
- [ ] Advanced panel actually used (tracking)
- [ ] Mobile experience improved

### Nice-to-Have
- [ ] Support tickets about filters decrease
- [ ] User session time increases
- [ ] Filter abandonment decreases

---

## Documentation

After launching, update:

- [ ] README: Filter architecture section
- [ ] ADR (Architecture Decision Record) explaining tiered approach
- [ ] Component Storybook stories for each filter component
- [ ] User guide: Screenshots showing new filter UI

---

## Common Questions

### Q: What if users don't like the new UI?
**A**: With feature flag, can rollback in 5 minutes. Collect feedback, iterate, redeploy.

### Q: Will this break existing workflows?
**A**: No, functionality is identical. Only UI changed. Same filters, same results.

### Q: How do I know if the migration was successful?
**A**: Track these metrics for 2 weeks:
- Filter interaction count (should stay same or increase)
- Click count to filter (should decrease)
- Mobile bounce rate (should decrease)
- Support tickets mentioning filters (should decrease)

### Q: Can I do this incrementally?
**A**: Yes! Feature flag lets you rollout to 10% users, measure, then expand.

### Q: What about existing bookmarks/deep links?
**A**: No change! URL query params are unchanged. Deep links still work.

---

## Before You Start

**Confirm:**
- [ ] You have read all 3 documentation files
- [ ] Your team has agreed on the approach
- [ ] You have feature flag infrastructure ready
- [ ] QA knows the acceptance criteria
- [ ] You have rollback procedure ready
- [ ] You have monitoring/metrics setup

**Then:**
1. Start with Step 1 (Component Scaffold)
2. Follow checklist sequentially
3. Test thoroughly before integration
4. Integrate with feature flag OFF
5. QA with flag ON
6. Deploy and monitor

---

## Quick Wins (If You Want to Ship Faster)

Implement without full refactor:

1. **Just add collapsible "Advanced" section** (hide Campaign/AdGroup)
   - ~20 min work
   - 50% improvement in primary filter clarity
   - Start with this if low confidence

2. **Remove dropdown "All sources" entirely**
   - Buttons alone are clearer
   - ~5 min work
   - Zero risk

3. **Move actions to the right**
   - Separate filters from operations
   - ~10 min work
   - Immediate improvement

**These 3 changes = 35 min work, massive UX improvement**

---

## Get Help

If stuck on:
- **Component architecture**: See `FILTER_COMPONENTS_EXAMPLE.tsx`
- **Visual design**: See `BEFORE_AFTER_COMPARISON.md`
- **Interaction flow**: See `FILTER_STRUCTURE_RECOMMENDATIONS.md`
- **Testing**: Check existing tests in codebase for pattern

---

## Final Checklist Before Launch

- [ ] All tests pass locally
- [ ] No console errors or warnings
- [ ] Accessibility audit passes
- [ ] Mobile testing on real device (not just browser)
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Rollback plan tested
- [ ] Metrics dashboards setup
- [ ] Team notified of changes
- [ ] Launch checklist completed
- [ ] Monitoring active for first 24h

**Ready to ship!** 🚀
