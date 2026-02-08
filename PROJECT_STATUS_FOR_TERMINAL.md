# REEFER STOWAGE PLANNER - PROJECT STATUS

**Updated:** 2026-02-08 | **Version:** 0.7.0 | **Completion:** ~68%

---

## WHAT IS THIS

A Next.js shore-based planning tool for shipping agencies to manage refrigerated cargo stowage on reefer vessels. Planners create cargo placement plans, validate temperature zones, check overstow, and email PDF plans to ship captains for approval.

**Key Users:** Shipping Planner (main), Captain (email only), Stevedores, Checkers, Exporters  
**Reference Vessel:** ACONCAGUA BAY (IMO 9019652) - 4 holds, 19 compartments, 8 cooling sections, 4840 pallets

### CRITICAL CONCEPT - Temperature Zones & Cooling Sections

**Physical Structure (Fixed):**
- ACONCAGUA BAY has **8 cooling sections** (physical cooling circuits): `1AB`, `1CD`, `2UPDAB`, `2CD`, `3UPDAB`, `3CD`, `4UPDAB`, `4CD`
- Each cooling section contains specific compartments that **cannot be changed**:
  - `1AB` -> H1-A, H1-B
  - `1CD` -> H1-C, H1-D
  - `2UPDAB` -> H2-UPD, H2-A, H2-B
  - `2CD` -> H2-C, H2-D
  - `3UPDAB` -> H3-UPD, H3-A, H3-B
  - `3CD` -> H3-C, H3-D
  - `4UPDAB` -> H4-UPD, H4-A, H4-B
  - `4CD` -> H4-C, H4-D

**What Changes Per Voyage:**
- The **temperature assigned** to each cooling section (range: -25°C to +15°C)
- Example: Section `1AB` today at +13°C (bananas), next voyage at -18°C (frozen fish)
- All compartments in a cooling section MUST operate at the same temperature

**UI Implication:**
- In the stowage plan wizard Step 2, user only sets **temperature values** for each section
- The section-to-compartment mapping is fixed and read-only
- Temperature zone colors in vessel profile SVG are visual aids only, not configurable entities
- "Temperature Zone" in the models refers to the same concept as "Cooling Section"

---

## ARCHITECTURE DECISIONS

| Decision | Choice | Reason |
|----------|--------|--------|
| Schema organization | Single `lib/db/schemas.ts` | Avoids circular dependencies |
| API layer | Server Actions | Simpler than tRPC for this scope |
| Database | MongoDB Atlas + Mongoose | Flexible nested data (holds/compartments) |
| Types | `types/models.ts` | Shared between frontend/backend |
| Captain comms | Email only (PDF attachments) | Maritime tradition, no internet at sea |
| Stability calc | Python FastAPI (future) | NumPy/SciPy for naval architecture math |
| Styling | CSS Modules / Pure CSS | Full design control, no Tailwind |
| Fonts | Space Grotesk + Inter | Maritime professional aesthetic |
| Theme | Dark navy (#0A1628) | Data-dense, technical feel |
| Data loading | Mock data (current phase) | Fast UI prototyping without DB dependency |
| Navigation | Next.js `<Link>` preferred | Prefetch, no 'use client' needed for simple nav |


### Git Workflow - Incremental Development

**Work in small, atomic commits:**
- Each task = 1-2 files changed = 1 commit
- Test before committing
- Push after each successful task

**Commit Message Convention:**
- `fix:` - Bug fixes (e.g., "fix: remove temperature zone dropdown")
- `feat:` - New features (e.g., "feat: add createStowagePlan action")
- `refactor:` - Code improvements (e.g., "refactor: horizontal layout in review")
- `docs:` - Documentation only

**Example Session:**
```bash
# Task 1: Fix specific issue
claude "Fix wizard step 2 - remove dropdown. Stop when done."
git add app/stowage-plans/new/
git commit -m "fix: simplify temperature assignment UI"
git push

# Task 2: Next incremental change
claude "Fix wizard step 3 - horizontal layout. Stop when done."



> WARNING: DO NOT split schemas into separate files, use tRPC, use Tailwind, or make captain login to system

---

## PROJECT STRUCTURE

```
reefer-stowage-planner/
├── app/
│   ├── layout.tsx                    ✅ Root layout with fonts
│   ├── page.tsx + page.module.css    ✅ Dashboard (mock data)
│   ├── globals.css                   ✅ Design tokens + reset
│   ├── voyages/page.tsx + .css       ✅ Voyage cards + port timeline
│   ├── vessels/page.tsx + .css       ✅ Vessel grid listing
│   ├── vessels/[id]/page.tsx + .css  ✅ Vessel detail + profile SVG
│   ├── bookings/page.tsx + .css      ✅ Booking table with filters
│   ├── stowage-plans/page.tsx + .css ✅ Stowage plan cards
│   ├── stowage-plans/new/page.tsx    ✅ 3-step wizard (NEEDS FIX)
│   ├── stowage-plans/[id]/page.tsx   ✅ Plan detail/edit page
│   └── actions/                      ✅ 8 Server Action files
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx              ✅ Sidebar + Header wrapper
│   │   ├── Sidebar.tsx + .css        ✅ Collapsible nav (240->56px)
│   │   └── Header.tsx + .css         ✅ Breadcrumbs + context indicators
│   └── vessel/
│       └── VesselProfile.tsx + .css  ✅ Interactive longitudinal SVG
├── lib/
│   ├── db/ (connect.ts, schemas.ts, data/aconcagua-bay-data.ts)  ✅
│   ├── mock-data.ts                  ✅ UI prototyping data
│   └── vessel-profile-data.ts        ✅ Voyage temp/cargo assignments
├── types/models.ts                   ✅ All TypeScript interfaces
├── scripts/ (seed-aconcagua-bay.ts, seed-complete-data.ts)       ✅
└── stability-service/                🔮 FUTURE
```

---

## UI COMPONENTS IMPLEMENTED

### Layout Shell
- **AppShell**: sidebar + header + content wrapper
- **Sidebar**: Collapsible, 5 nav items (Dashboard, Voyages, Vessels, Bookings, Stowage Plans), inline SVG icons
- **Header**: Auto-breadcrumbs, vessel/voyage context indicators, user avatar

### Pages (all with mock data)
| Page | Route | Key Features | Status |
|------|-------|-------------|--------|
| Dashboard | `/` | 4 stat cards, voyages table, plans table, pending bookings | ✅ |
| Voyages | `/voyages` | Cards with port call timeline, lock icons, util bars | ✅ |
| Vessels | `/vessels` | Grid cards, specs, temp range gradient bar | ✅ |
| Vessel Detail | `/vessels/[id]` | Interactive SVG profile + stats + 8-zone table | ✅ |
| Bookings | `/bookings` | 8-row table, cargo dots, req/conf/standby columns | ✅ |
| Stowage Plans | `/stowage-plans` | Progress bars, overstow/temp conflict indicators | ✅ |
| **New Plan Wizard** | `/stowage-plans/new` | 3-step wizard for plan creation | ⚠️ NEEDS FIX |
| **Plan Detail** | `/stowage-plans/[id]` | Cargo mgmt, stability, validation tabs | ✅ |

### Navigation Pattern
- Use Next.js `<Link>` for simple navigation (avoids 'use client', enables prefetch)
- Use `useRouter()` only when programmatic navigation needed (after form submit, etc.)
- Route mapping: "Open Plan" -> `/stowage-plans/{id}`, "View Profile" -> `/vessels/{id}`

### Vessel Profile SVG (Core Component)
- Hull with bow/stern, superstructure, funnel, masts
- 19 compartments across 4 holds (proportional sizing, C/D narrow with hull)
- 8 temp zones: distinct colors + yellow boundary lines between zones
- Cargo fill bars from bottom showing loaded/capacity
- Hover highlights entire zone + detail panel (ID, temp, cargo, pallets, %)
- Click fixes selection (yellow border)

### Mock Data
- 4 voyages, 8 bookings, 2 stowage plans, 2 vessels
- 19 compartment temp/cargo assignments for ACON-062026

---

## CURRENT ISSUES TO FIX

### 1. Stowage Plan Wizard Step 2 (Temperature Assignment)
**Problem:** Confusing UI - dropdown selecting "Temperature Zone" doesn't make sense
**Root Cause:** Mixing two concepts - cooling sections (fixed physical) vs temperature zones (UI grouping)
**Solution Needed:**
- Remove the "Temperature Zone" dropdown column
- Keep only: Cooling Section, Compartments, Target Temp input
- Each row shows: `1AB` | `H1-A, H1-B` | `[  13  ] °C`
- User only edits the temperature number, not the zone assignment

**File to modify:** `app/stowage-plans/new/page.tsx`
**Changes:**
```typescript
// REMOVE this column:
<div className={styles.colZone}>
  <select value={...} onChange={...}>
    {temperatureZones.map(...)}
  </select>
</div>

// KEEP only:
<div className={styles.colSection}>1AB</div>
<div className={styles.colCompartments}>H1-A, H1-B</div>
<div className={styles.colTemp}>
  <input type="number" value={13} min={-25} max={15} step={0.5} />
</div>
```

### 2. Stowage Plan Wizard Step 3 (Review)
**Problem:** Shows temperature config as vertical list, not matching vessel layout
**Better Approach:** Show horizontal layout matching vessel profile (4 holds, 2 sections each)
**Solution:**
- Create grid: 4 columns (Hold 1, Hold 2, Hold 3, Hold 4)
- Each column shows 2 rows (AB section, CD section)
- Visual bars showing temperature with color gradient

### 3. Missing Server Action Integration
**Problem:** Wizard "Create Stowage Plan" button does nothing
**Solution Needed:**
- Create Server Action: `app/actions/stowage-plan.ts` -> `createStowagePlan()`
- Accept: voyageId, tempAssignments[]
- Create VoyageTemperatureConfig document
- Create empty StowagePlan document
- Return planId, navigate to `/stowage-plans/{planId}`

---

## VESSEL LAYOUT (ACONCAGUA BAY)

```
Hold 1: H1-A, H1-B, H1-C, H1-D           (4 comps, no UPD)
Hold 2: H2-UPD, H2-A, H2-B, H2-C, H2-D   (5 comps)
Hold 3: H3-UPD, H3-A, H3-B, H3-C, H3-D   (5 comps)
Hold 4: H4-UPD, H4-A, H4-B, H4-C, H4-D   (5 comps)
TOTAL: 19 compartments

Cooling Sections (8):
- 1AB: H1-A, H1-B
- 1CD: H1-C, H1-D
- 2UPDAB: H2-UPD, H2-A, H2-B
- 2CD: H2-C, H2-D
- 3UPDAB: H3-UPD, H3-A, H3-B
- 3CD: H3-C, H3-D
- 4UPDAB: H4-UPD, H4-A, H4-B
- 4CD: H4-C, H4-D
```

> **CRITICAL:** Cooling sections are physical and fixed. Only the temperature assigned to each section changes per voyage.

---

## COMPLETION STATUS

```
✅ DONE                          🔜 NEXT (Phase 4-6)
────────────────────────────    ────────────────────────────
Architecture & data models       ⚠️  Fix wizard Step 2 UI
All 9 Mongoose schemas           🔜 Fix wizard Step 3 review
All 8 Server Actions             🔜 createStowagePlan Server Action
Seed data & scripts              🔜 Auto-stow algorithm
Design tokens & CSS              🔜 Drag-and-drop stowage
Layout shell (sidebar/header)    🔜 Manual compartment assignment
All listing pages (5 pages)      🔜 Temperature conflict validation
Vessel profile SVG               🔜 Overstow violation detection
Mock data integration            🔜 Server Action <-> UI integration
Stowage plan wizard (basic)      🔜 Authentication (NextAuth)
Stowage plan detail page         🔜 Captain email + PDF generation
HTML previews                    🔜 Real-time validation
                                 🔜 Port weather integration

Overall: ~68%
```

### 15-Day Plan Progress
| Phase | Days | Status |
|-------|------|--------|
| 1. Fundaments | 1-2 | ✅ DONE |
| 2. Static Views | 3-5 | ✅ DONE |
| 3. Vessel Visualization | 6-8 | ✅ DONE |
| 4. Core Functionality | 9-11 | 🔄 IN PROGRESS |
| 5. Persistency | 12-13 | — |
| 6. Polish | 14-15 | — |

---

## IMMEDIATE NEXT STEPS (Priority Order)

1. **Fix Wizard Step 2** - Remove zone dropdown, keep only temp input
2. **Fix Wizard Step 3** - Horizontal layout matching vessel profile
3. **Create Server Action** - `createStowagePlan()` with Zod validation
4. **Integrate Server Action** - Wire wizard to actual plan creation
5. **Manual Cargo Assignment** - Modal/dropdown to assign shipment to compartment
6. **Auto-Stow Algorithm** - Basic implementation (temp compatibility + weight distribution)

---

## DATA MODEL CLARIFICATION

### VoyageTemperatureConfig (Per Voyage)
```typescript
{
  voyageId: string;
  vesselId: string;
  coolingSectionConfigs: [
    {
      coolingSectionId: "1AB",
      targetTemperature: 13,
      compartmentIds: ["H1-A", "H1-B"]  // Read-only, from vessel data
    },
    // ... 7 more sections
  ]
}
```

### StowagePlan (Per Voyage)
```typescript
{
  voyageId: string;
  vesselId: string;
  cargoPositions: [
    {
      shipmentId: string;
      compartmentId: string;  // Must match temp requirements
      weight: number;
    }
  ],
  validation: {
    temperatureConflicts: [...],
    overstowViolations: [...],
    weightDistributionWarnings: [...]
  }
}
```

---

## FEATURE REQUESTS (BACKLOG)

### Port Weather Integration
- Show live temperature at vessel's current port
- Show forecast temperature for future ports based on ETA date
- API: OpenWeatherMap or similar
- Display in: Dashboard, Voyage cards, Port timeline
- Useful for planners to verify reefer settings match ambient conditions

---

## NAMING CONVENTIONS

```
Compartments:       "H{hold}-{level}"        -> H1-A, H2-UPD, H4-D
Cooling Sections:   "{hold}{levels}"         -> 1AB, 3CD, 2UPDAB
Voyages:            "{vessel}-{week}{year}"  -> ACON-062026
Bookings:           "BKG-{YYYYMMDD}-{seq}"  -> BKG-20260205-001
Ports:              5-letter UNLOCODE        -> CLVAP, NLRTM
Levels:             DECK > UPD > A > B > C > D (top to bottom)
```

---

## DEPENDENCIES

### Installed
```
next@15.1.4, react@19, mongoose@8.9.4, tsx@4.19.2, typescript@5.7.2
```

### To Install
```
next-auth, react-hook-form, @tanstack/react-query, resend/sendgrid, pdfkit
```

---

## HOW TO USE THIS FILE (FOR CLAUDE TERMINAL AGENT)

**Context Window Management:**
1. Read this file FIRST when starting any task
2. For specific code details, refer to:
   - `types/models.ts` - All TypeScript interfaces
   - `lib/db/schemas.ts` - Mongoose schemas (~1100 lines)
   - `lib/db/data/aconcagua-bay-data.ts` - Vessel specifications
   - `app/actions/*.ts` - Server Actions with Zod validation

**When Working on UI:**
- Check existing pages for design patterns
- Follow CSS Modules convention (no Tailwind)
- Use Space Grotesk for headings, Inter for body
- Follow dark maritime theme (#0A1628 base)

**When Working on Data:**
- ALWAYS use connectDB() from lib/db/connect.ts
- NEVER split schemas into separate files (circular dependencies)
- Use Zod for all Server Action validation

**Incremental Approach:**
- Work 1-2 steps at a time, not long multi-step procedures
- STOP after each task completion (wait for user to test & commit)
- When task is done, report:
1. Files changed
2. Suggested commit message (fix:/feat:/refactor:)
3. What to test manually
- Ask clarifying questions before major architectural changes
- Keep responses code-focused and concise

---

## VERSION HISTORY

- **v0.7.0** (2026-02-08): Wizard and detail pages created, identified fixes needed, comprehensive PROJECT_STATUS update
- **v0.6.1** (2026-02-07): Navigation pattern documented, port weather feature added to backlog
- **v0.6.0** (2026-02-06): UI Phases 1-3 complete - layout, all listing pages, vessel SVG profile
- **v0.5.0** (2026-02-06): All Server Actions implemented, seeding complete
- **v0.4.0** (2026-02-05): Fixed cooling sections, complete vessel seed data
- **v0.3.0** (2026-02-04): All 9 schemas, TypeScript interfaces finalized

---

*Read this file FIRST when starting any task. This is the single source of truth for project status and context.*

