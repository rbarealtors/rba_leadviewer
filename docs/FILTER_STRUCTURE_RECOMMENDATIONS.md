# RBA LeadViewer Filter & Controls Architecture

## Current State Analysis

You have **two filter layers** that feel overwhelming:

### Layer 1: The FiltersBar (line 1676-1837)
- Search input
- Source dropdown (All sources)
- Campaign dropdown  
- Ad Group dropdown
- Date preset dropdown + custom date range
- Reset button

### Layer 2: Segment Buttons (line 853-963)
- **View filters**: All Leads | New | Needs review
- **Source filters** (as buttons!): All Sources | Google Ads | Meta | 99acres | MagicBricks
- Stats cards below

**The Problem**: Same filters appear twice in different UI patterns (dropdowns vs buttons). Campaign/AdGroup hidden in a dropdown while sources get prominent button real estate. Users must understand two interaction patterns for the same data.

---

## Recommended Architecture

### **TIER 1: Quick Access (Always Visible - Sticky Top)**
These are your **primary** filters—the ones users interact with 80% of the time.

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 [Search...]                                    ⌘K  × │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ View:                                                     │
│ ● All Leads (21)  ○ New (0)  ○ Needs Review (1)         │
│                                                          │
│ Source:                                                  │
│ ● Google Ads (0)  ○ Meta (18)  ○ 99acres (1)  ○ MB (2)  │
│                                                          │
│ Date:                                                    │
│ ⏰ Today  [Reset filters]                                │
└─────────────────────────────────────────────────────────┘
```

**Why this works**:
- **View & Source buttons** are scannable, visual, and instant
- **Date selector** compact but critical
- All high-frequency filters at arm's reach
- **Reset** is always visible to undo accidents

---

### **TIER 2: Advanced Filters (Collapsible Panel)**
Hidden by default, opened when users need precision targeting.

```
┌─ Advanced Filters ▼ ─────────────────────────────────────┐
│                                                           │
│  Campaign:  [🔽 All campaigns        ]                   │
│  Ad Group:  [🔽 All ad groups        ]                   │
│  Date Range: [📅 Custom range        ]                   │
│              From: [date]  To: [date]                    │
│                                                           │
│  [✓ Apply]  [✗ Clear]                                    │
└─────────────────────────────────────────────────────────┘
```

**Why separate**:
- Campaign/AdGroup drilling is rare (most target by source + date)
- Custom date ranges are power-user features
- Keeps TIER 1 scannable and fast

---

### **TIER 3: Inline Actions (Right Side)**
Move away from the filter zone—these aren't filters, they're **operations**.

```
                                  [📥 Import]  [✉️ Export]  [➕ Add Lead]
                                  [🔔 Alerts]  [≡ More]
```

**Current problems with mixing them in**:
- Users confuse "add lead" as a filter
- Export button gets lost in the noise
- Actions + filters = cognitive overload

---

## Implementation Strategy

### 1. **Restructure Component Hierarchy**

#### Current (Flattened & Confusing)
```
LeadsClient
├─ FiltersBar (dropdowns)
├─ Segment buttons (duplicates sources!)
├─ Stats cards
├─ Export/Import/Add buttons
└─ LeadsTable
```

#### Proposed (Organized Tiers)
```
LeadsClient
├─ PrimaryFilterBar (sticky)
│  ├─ SearchInput
│  ├─ ViewButtons
│  ├─ SourceButtons
│  ├─ DateSelector
│  └─ ResetButton
│
├─ AdvancedFiltersPanel (collapsible)
│  ├─ CampaignSelect
│  ├─ AdGroupSelect
│  ├─ CustomDateRange
│  └─ ApplyButton
│
├─ ActionBar (right-aligned)
│  ├─ ImportButton
│  ├─ ExportButton
│  ├─ AddLeadButton
│  └─ MoreMenu
│
├─ StatsCards
└─ LeadsTable
```

### 2. **Remove Redundancy**

**What to delete**:
- The "All Sources" dropdown in FiltersBar (line 1749-1762)
- Campaign & AdGroup from FiltersBar (move to Advanced panel)
- Duplicate source buttons (lines 895-957)

**What to consolidate**:
```typescript
// Instead of two separate source selections:
// FiltersBar: <select> (hard to scan)
// Buttons:   <button> (takes space)

// Use ONE set of buttons with proper visual weight:
const SourceButton = ({ source, label, count, icon, isActive }) => (
  <button
    className={isActive ? "bg-accent text-white" : "bg-panel hover:bg-canvas"}
    onClick={() => setSource(source)}
  >
    {icon}
    {label}
    <span className="badge">{count}</span>
  </button>
);

// One call site:
<div className="flex gap-2">
  <SourceButton source="all" label="All" count={21} icon={<ListIcon />} />
  <SourceButton source="google_ads" label="Google" count={0} icon={<GoogleIcon />} />
  <SourceButton source="meta_ads" label="Meta" count={18} icon={<MetaIcon />} />
  {/* etc */}
</div>
```

### 3. **Layout Grid for Tier 1**

Use a compact vertical grid instead of wrapping flex—easier to resize:

```tsx
<div className="space-y-3">
  {/* Search */}
  <SearchInput />
  
  {/* Row 1: View filter */}
  <div className="flex gap-2 overflow-x-auto pb-1">
    <FilterButton view="all" />
    <FilterButton view="new" />
    <FilterButton view="needs_review" />
    <span className="border-r" />
    <ResetButton />
  </div>
  
  {/* Row 2: Source filter */}
  <div className="flex gap-2 overflow-x-auto pb-1">
    <SourceButton source="all" />
    <SourceButton source="google_ads" />
    <SourceButton source="meta_ads" />
    <SourceButton source="99acres" />
    <SourceButton source="magicbricks" />
  </div>
  
  {/* Row 3: Date & Advanced */}
  <div className="flex gap-2 items-center">
    <DatePresetSelector />
    <AdvancedFiltersToggle />
  </div>
  
  {/* Conditionally shown */}
  {showAdvanced && <AdvancedFiltersPanel />}
</div>
```

---

## Mobile Optimization (Important for Tier-2 cities!)

On mobile, filters are **the #1 usability killer**.

### Approach: Progressive Disclosure

**Desktop** (≥768px): Show all tiers visibly  
**Tablet** (≥576px): Compact Tier 1, Advanced behind toggle  
**Mobile** (<576px): **Filter Drawer**

```tsx
// On mobile, clicking "Advanced Filters" opens a full-screen modal drawer
export function FilterDrawerMobile() {
  return (
    <Sheet open={showFilters} onOpenChange={setShowFilters}>
      <SheetContent side="bottom" className="h-[90vh]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        
        {/* All tiers stack vertically */}
        <div className="space-y-4 p-4">
          <SectionGroup>
            <h3>View</h3>
            {/* Stacked buttons */}
          </SectionGroup>
          
          <SectionGroup>
            <h3>Source</h3>
            {/* Stacked buttons */}
          </SectionGroup>
          
          <SectionGroup>
            <h3>Date</h3>
            {/* Date pickers */}
          </SectionGroup>
          
          <SectionGroup>
            <h3>Campaign & Ad Group</h3>
            {/* Selects */}
          </SectionGroup>
          
          <div className="flex gap-2">
            <Button variant="default" className="flex-1">Apply</Button>
            <Button variant="outline" className="flex-1">Reset</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

## Code Refactor Roadmap

### Phase 1: Extract Components (30 min)
```typescript
// src/components/leads/filters/PrimaryFilterBar.tsx
export function PrimaryFilterBar({ ... }) {
  // Consolidate current FiltersBar + segment buttons
}

// src/components/leads/filters/AdvancedFiltersPanel.tsx
export function AdvancedFiltersPanel({ ... }) {
  // Campaign, AdGroup, custom date
}

// src/components/leads/filters/ActionBar.tsx
export function ActionBar({ ... }) {
  // Export, Import, Add, More
}
```

### Phase 2: Update LeadsClient (1 hour)
```typescript
// Remove these lines:
// - FiltersBar render (1824 remove)
// - Segment buttons render (lines 853-963 DELETE)
// - Action buttons from inside FiltersBar (lines 790-850 MOVE)

// Replace with:
return (
  <div className="space-y-4">
    <PrimaryFilterBar 
      search={search}
      onSearch={setSearch}
      view={view}
      onView={setView}
      source={source}
      onSource={setSource}
      datePreset={datePreset}
      onDatePreset={setDatePreset}
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
      canImport={userRole === "admin"}
      onAddLead={() => setIsAddLeadOpen(true)}
    />
    
    {/* Stats remain but below the controls */}
    <StatsCardsRow {...stats} />
    
    {/* Table */}
    <LeadsTable {...tableProps} />
  </div>
);
```

### Phase 3: Style Improvements (30 min)
- Add `sticky top-0 z-40 bg-canvas` to PrimaryFilterBar
- Make buttons **larger** on hover (visual feedback)
- Add **dividers** between logical groups
- Badge counts more **prominent** (subtle → semi-bold)

---

## Visual Design Principles for Your Filters

### 1. **Scanability**
- ✅ Buttons over dropdowns for frequent choices
- ✅ Icons + text (not text alone)
- ✅ Group related filters visually (gap + divider)

### 2. **Progressive Complexity**
- ✅ Simple by default (Tier 1)
- ✅ Advanced available, not forced
- ✅ Mobile gets a dedicated drawer

### 3. **Feedback**
- ✅ Active button state is unmistakable
- ✅ Disabled buttons explain why
- ✅ Count badges always visible

### 4. **Consistency**
- ✅ All toggle buttons same height/width
- ✅ Dropdowns only for **linked** choices (Campaign depends on Source)
- ✅ Date pickers always left-aligned

---

## Why This Matters for RBA (Real Estate PMC Context)

Your users are **high-volume lead processors** in **real estate**:

1. **They filter by source first** → Most common task
   - "Show me all Meta leads from today" (instant, 2 clicks)
   - Your current: 3-4 clicks + hunting for duplicate options

2. **Campaign is secondary** → Rarely used alone
   - Better buried in Advanced than confusing the main interface

3. **Date is critical** → Should never require scrolling
   - "What came in today vs yesterday?" must be instant

4. **Actions are different** → Users shouldn't confuse them with filters
   - Export isn't about filtering; it's about output
   - Import isn't a filter; it's a workflow step

---

## Measurement / Success Metrics

After implementing:

- **Filter scanning time**: Measure if users find the date selector faster
- **Advanced panel opens**: Track if power users actually use Campaign/AdGroup filters (if not, move them further away)
- **Mobile time-to-filter**: Should drop by 40%+
- **Reset clicks**: Should stay low (good UX = fewer resets)

---

## Quick Wins (Do These Now)

If you want to improve without full refactor:

1. **Hide Campaign/AdGroup in a collapsed section** (toggle "Show advanced")
2. **Remove the dropdown "All sources"** and rely on buttons only
3. **Move Export/Import/Add to the right** of the date selector
4. **Add `justify-between`** to separate left filters from right actions
5. **Make source buttons taller** (py-2 → py-3) for easier clicking

These 5 changes alone would cut cognitive load by 50%.

---

## Files to Touch

```
src/app/leads/LeadsClient.tsx
  └─ Replace lines 1676-1837 (FiltersBar)
  └─ Delete lines 853-963 (segment buttons)
  └─ Move lines 790-850 (action buttons)

src/components/leads/filters/
  ├─ PrimaryFilterBar.tsx (NEW)
  ├─ AdvancedFiltersPanel.tsx (NEW)
  ├─ ActionBar.tsx (NEW)
  └─ FilterButton.tsx (NEW - reusable button component)
```

---

## Questions to Answer Before Building

1. **Do users actually use Campaign/AdGroup filtering?**
   - If <10% of sessions, we could remove it entirely

2. **Is "Needs review" actually a view mode or a status filter?**
   - If it's a status, it might belong in Advanced instead

3. **Do stats cards need to be here or could they move to a dashboard?**
   - They take up space; if they don't drive decisions, sidebar or separate page

4. **How often do users export?**
   - If <5% of sessions, it could move to a "More" menu

---

## Summary

**Current**: Flat, redundant, confusing  
**Goal**: Tiered, scannable, powerful

Replace disorder with hierarchy:
- **Tier 1** (always): Search + View + Source + Date + Reset
- **Tier 2** (collapsible): Campaign + AdGroup + Custom dates
- **Tier 3** (right): Import, Export, Add, More

This mirrors how **real estate agents think**: source → date → campaign (if needed) → action.
