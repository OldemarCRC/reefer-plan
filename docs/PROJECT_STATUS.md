# REEFER STOWAGE PLANNER — PROJECT STATUS

**Updated:** 2026-06-08 | **Version:** v1.72.65 | **Completion:** ~99%

> For core business logic, vessel architecture, and naming conventions, see [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md).

---

## End-of-Session Documentation Requirement

After every work session, the following files MUST be updated
if there are relevant changes:

1. `docs/PROJECT_STATUS.md` — version bump, session summary,
   updated pending backlog
2. `docs/MANUAL_DRAFT_AGENCY.md` — new features, workflow
   changes affecting agency/planner users
3. `docs/MANUAL_DRAFT_SHIPPER.md` — new features, workflow
   changes affecting shipper/exporter users
4. `docs/PROJECT_INVESTMENT.md` — update session log table
   with date, version range, key work summary, and estimated
   hours for the session

This is mandatory. Do not close a session without running
the end-of-session documentation update prompt.

---

## Workflow Rules

**Git workflow:**
- After each task: suggest a one-line commit message in format `type(scope): description`
- Do NOT run `git add`, `git commit`, or `git push` — user commits manually

---

## NEXT VERSION: v1.72.66

---

## CURRENT STATE

**No active blocking bugs.** As of v1.55.0: shipper portal gains a Forecasts section —
shippers can submit space estimates per voyage before committing to a booking.
As of v1.56.0: SpaceForecastsPanel in voyage detail gains planner-side estimate entry —
planners can enter or edit PLANNER_ENTRY estimates per counterparty inline, with full
priority enforcement (BOOKING > ESTIMATE > CONTRACT_DEFAULT). createSpaceForecast()
now blocks estimate creation when a booking already exists for that shipper+voyage+contract.
As of v1.56.1–1.56.2: development environment migrated from Docker to local Node.js.
MongoDB Atlas cluster active (AWS eu-north-1 / Stockholm, DB: reefer-planner). All
base collections migrated from local to Atlas: users (5), vessels (20), offices (6),
ports (21), UNECE_PORTS (21), countries (66), services (1). MONGODB_URI now points to
Atlas; MONGODB_URI_LOCAL retained as local backup.
As of v1.60.0: Contracts & Space table redesigned — BOOKING/WEEKLY EST. column replaces
plain WEEKLY EST., BOOKING NR./FORECAST column shows booking number or estimate source,
STATUS column added, ROUTE shows port codes only, SHIPPER shows name only.
As of v1.61.0: contract counterparty weeklyPallets editing added — click-to-edit on the
value cell (PLANNER/ADMIN only), Enter to save, Escape to cancel, informational booking
count shown as context.
As of v1.62.0–v1.62.4: StowagePlanWizard unified — both ⚡ Auto-Generate and + New Plan
use the same 3-step wizard; mode=auto calls autoGenerateSinglePlan (engine-backed);
mode=manual calls createStowagePlanFromWizard (blank plan). Regression fixed: auto-generate
was creating empty plans after unification.
As of v1.63.0: SpaceForecasts are fed to autoGenerateSinglePlan — the engine now receives
SHIPPER_PORTAL, PLANNER_ENTRY, and CONTRACT_DEFAULT forecasts as contractEstimates, giving
forecast cargo positions in auto-generated plans.
As of v1.63.1: NO_CARGO UI added to both portals — shipper portal has a "No cargo this
voyage" checkbox per voyage row in ForecastWizard; planner portal has a "No Cargo" button
per row in the Contracts & Space table (VoyageDetailClient). NO_CARGO source skips the
engine entirely; planImpact is set to INCORPORATED at creation (authoritative).
As of v1.64.0: Stowage engine bottom-up fill fix — hold sections now fill bottom-up
(D before C before B before A) rather than top-down. Root cause was score-tie-break
defaulting to first candidate in array order (top-to-bottom); fix adds depth-rank
tie-breaking (LEVEL_DEPTH map: FC=0, A=1, B=2, C=3, D=4) so deeper sections win ties,
then higher holdNumber wins depth ties. Cargo with the furthest discharge now settles at
the bottom of each hold; canPlace POL/POD constraints pass freely for cargo stacked above.
VesselProfile compartment cells now permanently display `used/capacity` in the cell center
(e.g. `262/388`), visible regardless of whether cargo has been assigned.
As of v1.65.1: stowage plan cards in /stowage-plans corrected — pallets assigned now
sums cargoPositions[].quantity (was counting position slots); pallets total computed
from vessel.temperatureZones[].coolingSections[].sqm × designStowageFactor (was
hardcoded 4840); overstow and temp conflict badge paths fixed to top-level
p.overstowViolations / p.temperatureConflicts (were broken via p.validation?.* and
always showed healthy); booking count added to card.
As of v1.65.2–1.65.3: booking count on plan cards corrected — synthetic engine IDs
("FORECAST-*", "CONTRACT-ESTIMATE-*") excluded from Set; booking and estimate counts
now sourced from live Booking and SpaceForecast collections (not cargoPositions[]),
so cards reflect bookings created after plan generation. Cards display
"N bookings · Y estimates" (estimates part omitted when 0).
As of v1.65.4: estimate count definition standardized across /voyages/[id] Contracts
& Space summary and /stowage-plans cards — valid estimates are SHIPPER_PORTAL
(pallets > 0) + PLANNER_ENTRY (pallets > 0) + CONTRACT_DEFAULT (pallets > 0,
planImpact = INCORPORATED). PLANNER_ENTRY with quantity = 0 now blocked at backend
(Zod) and frontend (disabled submit). Migration script created at
scripts/migrate-planner-zero-to-nocargo.ts for existing zero-quantity PLANNER_ENTRY
records. "No Cargo" button in Contracts & Space table given distinct amber color
(#D97706) for improved visibility.
As of v1.65.5: CONTRACT_DEFAULT rows in Contracts & Space table now show "Contract
Est." label in BOOKING NR./FORECAST column and "Incorporated" status badge in STATUS
column, matching the visual treatment of PLANNER_ENTRY and SHIPPER_PORTAL estimates.
As of v1.65.6: estimate count filter corrected in both /voyages/[id] and
getStowagePlans() — CONTRACT_DEFAULT entries now only counted when
planImpact === 'INCORPORATED' (PENDING_REVIEW on CONTRACT_DEFAULT is legacy data;
new code always sets INCORPORATED at creation). $or filter applied in MongoDB
aggregate and client-side estimateCount function. Migration script created at
scripts/migrate-contract-default-pending-to-incorporated.ts to update legacy
CONTRACT_DEFAULT PENDING_REVIEW documents to INCORPORATED.
As of v1.65.7: root cause of estimate undercounting fixed in _createForecastCore
(space-forecast.ts) — NO_CHANGE planImpact guard was evaluated before the source
check, causing CONTRACT_DEFAULT documents to receive NO_CHANGE instead of INCORPORATED
when estimatedPallets matched an existing forecast. Fix: NO_CHANGE is now only
assigned for SHIPPER_PORTAL resubmissions; CONTRACT_DEFAULT and PLANNER_ENTRY always
receive INCORPORATED. Migration script
scripts/migrate-contract-default-nochange-to-incorporated.ts created and executed —
4 legacy records updated in Atlas.
As of v1.65.8: new reusable <CapacityBar> component created at
components/ui/CapacityBar/CapacityBar.tsx — segmented bar showing booked pallets
(solid) and estimated pallets (semi-transparent with diagonal stripe pattern) vs total
vessel capacity. Replaces all three previous single-value progress bars: /stowage-plans
plan cards, Dashboard Recent Voyages UTILIZATION column, and Dashboard Stowage Plans
LOADED column. getStowagePlans() aggregate updated to return estimatedPalletsTotal
(sum of estimatedPallets) in addition to estimateCount. Dashboard queries updated to
include estimated pallet totals per voyage. Label format: "N booked · M est. / T
pallets" (md size) and "N + M est." (sm size).
As of v1.66.0–v1.66.1: booking edit modal is now role-aware. Agency portal
(/bookings) shows confirmedQuantity field only and forces status=CONFIRMED on
save. Shipper portal (/shipper/bookings) shows requestedQuantity field only and
forces status=PENDING on save, requiring planner re-approval. Status select
removed from both modals. Fixed ReferenceError on newQuantity variable in
updateBookingQuantity() (v1.66.1).
As of v1.67.0: stowage engine scoring improved — getPreferredPair() recalculates
per booking (not once per plan), podImbalancePenalty added to sectionScore() to
distribute same-POD cargo evenly across holds, compactnessBonus (−0.15) rewards
partially-filled sections to reduce fragmentation in lower levels.
As of v1.67.1: section detail panel in /stowage-plans/[id] corrected — clicking a
compartment now shows estimate positions (FORECAST-* / CONTRACT-ESTIMATE-*)
alongside real bookings; consigneeNames, usedInCompartment, and selectedSectionSlots
all updated to include estimate positions.
As of v1.67.2: compactnessBonus guarded by polCompatible check — bonus only applies
when sectionMaxPolSeq <= incomingPolSeq, preventing the engine from preferring
sections whose existing cargo would fail canPlace() for the incoming booking's POL
sequence. Sections 3A, 4A, 4C now fill correctly.
As of v1.67.3: headroom reservation penalty added to sectionScore() — sections
filled >70% incur a +0.35 penalty when later-POL cargo is still pending
(remainingByPolSeq map). Minor improvement; does not resolve structural overstow
on routes with mixed POD cargo from the same POL.
As of v1.68.0: two-pass POD-priority assignment in assignCargo() — Pass 1 (podSeq
DESC) fills hold bottoms with last-discharge cargo from all loading ports; Pass 2
(podSeq ASC) places remaining cargo in upper levels. Conflict detection runs only
in Pass 2. HoldState shared between passes. [TypeScript engine: 5 OVERSTOW_CONFLICTs
remain on Baltic Klipper AC26020 — structural cause is mixed-POD cargo from a single
early POL; OR-Tools optimizer (v1.68.9) now provides 0-overstow alternative plans.
See PENDING BACKLOG.]
As of v1.68.7: consigneeName now persisted for FORECAST- positions —
forecastBookings.push() was hardcoding consigneeCode: '' and omitting
consigneeName; the SpaceForecast document has both as required fields.
Fix: forecast.consigneeName/consigneeCode read directly at push time;
allBookingMeta forecast entries pass consigneeName through to
mapEngineOutputToDocument. Header chips now render the full
"Est · C.I. Banasan – Tesco Stores Limited · 200p" format.
As of v1.69.3: stowage-optimizer critical bugs fixed — capacity formula corrected from sqm × DSF to sqm ÷ DSF (1FC: 757 → 434 pallets; total vessel 9,386 → 5,385); POL monotonicity constraint direction inverted (now blocks late-POL in deep + early-POL in shallow — the actual violation); overstow metric direction corrected; supply constraint changed from == to ≤ for partial placement when demand exceeds capacity; Unicode crash fixed. Result: 0 POL violations across all 4 holds, all sections within capacity on AC26020.
As of v1.69.4: fastapi and uvicorn added to stowage-optimizer/requirements.txt — Python optimizer environment can now be fully reproduced with `pip install -r requirements.txt`.
As of v1.69.5: AdvancedOptimizeButton polls GET /health every 30 seconds — green dot (online), red dot (offline), gray dot (checking). Button disabled when service offline. Tooltip shows uvicorn startup command when offline.
As of v1.69.6: Agency manual section 7.2 reorganised — Advanced Optimize (OR-Tools) promoted to Option A (Recommended), Auto-Generate to Option B (Quick Plan), Manual Plan to Option C. Section 7.9 retained as technical reference for the Python service.
As of v1.70.0: Booking deadline and forecast expiration system — `bookingDeadline: Date` added to VoyageSchema; `EXPIRED` added to SpaceForecast `planImpact` enum; `expiredForecasts: [ObjectId]` array added to StowagePlanSchema; `expireForecasts()` server action marks SHIPPER_PORTAL / PLANNER_ENTRY / CONTRACT_DEFAULT forecasts as EXPIRED for a voyage when deadline has passed; `dismissExpiredForecasts()` server action clears the expired list from a plan; `updateVoyageDeadline()` server action in voyage.ts; `BookingDeadlineEditor` component in VoyageDetailClient.tsx — shows editable date or "No deadline set"; "⏱ Expire Estimates" button on voyage detail page (PLANNER/ADMIN only, visible when deadline has passed); amber banner on stowage plan detail lists shipper names with expired forecasts; `autoGenerateSinglePlan` already excludes EXPIRED forecasts; `scripts/cleanup-expired-forecasts.ts` created for manual DB cleanup.
As of v1.70.1–v1.70.3: DEMO_AGENT role added — read-only access to all planner routes; all action buttons visible but disabled (opacity 0.4); role added to Mongoose enum, TypeScript types, Zod validation ROLES array, sidebar nav (same pages as SHIPPING_PLANNER), and all roleLabel maps; middleware passes DEMO_AGENT through to all planner routes (/admin remains blocked); 41 WRITE server action guards block DEMO_AGENT by omission; `getAdminBookings()` READ guard explicitly allows DEMO_AGENT; AutoGenerateButton and AdvancedOptimizeButton accept `isDemo` prop; + New Voyage / + New Plan replaced with disabled buttons for DEMO_AGENT; `canEdit` excludes DEMO_AGENT in plan detail and voyage detail; Demo Agent added to role dropdown in Admin user management (USER_ROLES array + roleLabel).
As of v1.70.4–v1.70.7: serviceFilter access guards on detail pages — `getVoyageById()` and `getStowagePlanById()` now verify that `voyage.serviceCode` is in the caller's `serviceFilter` (ADMIN/SUPERUSER bypass; empty serviceFilter = no restriction). If `serviceCode` is missing/undefined on the document, access is allowed — missing data is not treated as a security violation (voyage AC26020 has `serviceCode: undefined`). v1.70.5–v1.70.6 fixed a fragile extra `VoyageModel.findById()` call — `voyageId` is already populated before the check runs, so `serviceCode` is read directly from the populated object.
As of v1.70.8: + New Voyage button renders as a disabled `<button>` with `opacity: 0.4` for DEMO_AGENT instead of an active `<Link>`.
As of v1.70.9: Pallet capacity formula corrected across all UI — `sqm × designStowageFactor` replaced with `floor(sqm / designStowageFactor)` everywhere. `designStowageFactor` is m²/pallet (area per pallet), not pallets/m². Affected files: `app/stowage-plans/page.tsx` (plan cards), `app/vessels/[id]/page.tsx` (vessel detail), `components/vessel/VesselProfile.tsx` (fill bar historical mode), `lib/stowage-engine/types.ts` (comment corrected). Baltic Klipper 1FC: 757 → 434 pallets; total vessel: 9,386 → 5,385 pallets (now matches Python optimizer). `lib/stowage-engine/assign.ts` and plan detail compartment capacities were already using division — all paths now consistent.
As of v1.71.0: Dashboard and voyages-list capacity bars now use dynamic calculation — `getVoyages()` and `getAdminVoyages()` calculate `palletsCapacity` by summing `floor(sqm / designStowageFactor)` across all `temperatureZones.coolingSections`. Both populate selects extended to include `temperatureZones`. Falls back to `vessel.capacity.totalPallets` if zones not populated (backward compatible). Eliminates reliance on the manually-entered `totalPallets` field which was often stale or incorrect.
As of v1.72.14: plan detail header chips fixed — (1) CAPACITY chip now derives totalPallets from vesselProfileData[].palletsCapacity (sum of floor(sqm/sfactor) per zone) instead of summing booking.totalQuantity; (2) LOADED/Utilization chip stowedPallets now includes FORECAST-* and CONTRACT-ESTIMATE-* cargoPositions alongside real booking quantities; (3) Utilization % calculation replaced hardcoded 4840 with totalPallets (with division-by-zero guard). All three fixes in app/stowage-plans/[id]/page.tsx.
As of v1.72.15: SpaceForecast ObjectId serialization fixed in shipper portal — `getMyForecasts()` and `_createForecastCore()` in `app/actions/space-forecast.ts` now apply `JSON.parse(JSON.stringify())` before returning documents across the server→client boundary, eliminating `{buffer: ...}` warnings for all ObjectId fields (contractId, voyageId, shipperId, _id, previousForecastId).
As of v1.72.16: shipper portal tables expanded — `/shipper/forecasts`: CONTRACT column removed, VESSEL / WEEK / ROUTE / CONSIGNEE columns added; `/shipper/bookings`: VESSEL column added after SERVICE; `/shipper` dashboard Recent Bookings: VESSEL and WEEK columns added; `vesselName` mapping added to `getBookingsByShipperCode()` and `getShipperDashboard()`.
As of v1.72.17–v1.72.19: Pending Requests feature for shipper portal — `getPendingRequestsForShipper()` server action returns upcoming voyages on the shipper's active contracts where no forecast or booking exists (CONTRACT_DEFAULT forecasts also excluded as of v1.72.19 — only truly blank voyage+contract pairs shown). All 5 Overview KPI cards are now clickable via `app/shipper/KpiCards.tsx` (`'use client'` component). A fifth KPI card shows the Pending Requests count (amber when > 0). A dedicated `/shipper/pending` page (server component) lists each pending voyage as a card with two action buttons: Submit Estimate → `/shipper/forecasts/new?voyageId=X&contractId=Y`; Request Booking → `/shipper/request`. Empty state: "All caught up — no pending submissions".
As of v1.72.20–v1.72.24: shipper portal voyage visibility improvements — status filter expanded from PLANNED-only to `$nin ['COMPLETED','CLOSED','CANCELLED']`; ATD ?? ETD fallback logic for departure checks in `getUpcomingVoyagesForService()` and `getPendingRequestsForShipper()`; `getShipperSchedules()` gains 7-day grace period for recently-completed voyages; `HAS_ESTIMATE` state added to `getPendingRequestsForShipper()` — voyages with a SHIPPER_PORTAL or PLANNER_ENTRY forecast are returned with `forecastStatus: 'HAS_ESTIMATE'` instead of being skipped; `/shipper/pending` page shows amber "Estimate submitted" badge and Request Booking button only for HAS_ESTIMATE cards; `KpiCards.tsx` gains three-way sub-label.
As of v1.72.25: agency dashboard KPI stat cards made clickable — extracted `StatCard` component to `app/dashboard-stat-card.tsx` ('use client'); all 4 cards navigate to filtered list views on click: Active Voyages → `/voyages?status=IN_PROGRESS,PLANNED`; Pending Bookings → `/bookings?status=PENDING,STANDBY,PARTIAL`; Plans in Draft → `/stowage-plans?status=DRAFT`; Awaiting Captain → `/stowage-plans?status=READY_FOR_CAPTAIN,EMAIL_SENT`; `?status=` query param filter wired up in `/bookings` (BookingsClient useMemo) and `/stowage-plans` (server-side filter); hover translateY(-1px) effect on all clickable cards.
As of v1.72.26–v1.72.29: list-page cards fully clickable — voyage cards (`/voyages`), vessel cards (`/vessels`), and stowage plan cards (`/stowage-plans`) now navigate to their detail pages via whole-card click; keyboard navigation (Enter/Space, `role="button"`, `tabIndex={0}`) on all cards; `focus-visible` cyan outline; hover `translateY(-1px)` + shadow; MarineTraffic SVG icon added next to IMO number on vessel cards; redundant "View Details →", "View Profile →", and "Open Plan →" text links removed; wrapper technique: `useRouter` onClick for client components (voyages), CSS stretched-link for server components with nested `<a>` links (vessels), direct `<Link>` wrapper for server components with no inner links (stowage plans).
As of v1.72.30: shipper portal voyage action modal — new `getVoyageSubmissionStatus(voyageId)` server action in `app/actions/shipper.ts` returns per-contract `NONE`/`HAS_ESTIMATE`/`HAS_BOOKING` status for the current EXPORTER user; new `VoyageActionModal.tsx` client component shows contract rows with contextual actions (NONE: Submit Estimate + Request Booking buttons; HAS_ESTIMATE: amber "Estimate sent" badge + Book button; HAS_BOOKING: green "Booked" confirmation); dashboard Upcoming Voyages strip extracted to `UpcomingVoyageStrip.tsx` (client component) — cards are now clickable and open the modal; `/shipper/schedules` table rows are now clickable via new `SchedulesClient.tsx` (client component replacing the inline server-rendered map); keyboard navigation (Enter/Space) on all clickable elements.
As of v1.72.31: shipper portal pending submission cards — both action buttons always shown on every card; "Submit Estimate" is disabled with "✓ Estimate sent" label when `forecastStatus === 'HAS_ESTIMATE'` (new `.btnActionSmDone` CSS class: transparent background, success-color border, cursor:default, opacity 0.7); "Estimate submitted" text badge removed from outside the button area; `.cardActions` uses `margin-top: auto` so buttons always sit at the bottom regardless of card content height.
As of v1.72.32: voyage and contract pre-selection in shipper wizards — `/shipper/forecasts/new/page.tsx` and `/shipper/request/page.tsx` accept `searchParams: Promise<{ voyageId?: string; contractId?: string }>` (Next.js 15 async params); `ForecastWizard` initialises `step` to 2 and `selectedId` to `initialContractId` when the contract is found in the contracts list (falls back to step 1 if not found), highlights the target voyage row in blue tint; `RequestClient` initialises `step` to 3 (both params present), 2 (contract only), or 1 (neither); mount-only `useEffect` auto-fetches voyages for the pre-selected contract and pre-fills `cargoType` + `quantity` when starting at step 3; `VoyageActionModal` "Book →" and "Request Booking" links updated to include `?voyageId=${voyage._id}&contractId=${c.contractId}`.
As of v1.72.33: "Request Booking" link in `/shipper/pending` cards corrected — `href` was hardcoded to `/shipper/request` with no query params; fixed to `/shipper/request?voyageId=${item.voyageId}&contractId=${item.contractId}` so clicking the button from a pending card opens the booking wizard directly at step 3.
As of v1.72.34–v1.72.46: stowage plan detail page UX overhaul — clicking a compartment now opens a fixed right-side slide-over panel (420px, 380px when Unassigned also open) instead of inline content below the SVG; the panel contains a collapsible eligible bookings section and the top-down bird's-eye grid; the sidebar auto-collapses when the panel opens via a custom event dispatched to AppShell (v1.72.35–v1.72.37); page container applies dynamic right padding so the SVG is never covered by fixed panels (v1.72.44); hover/click tooltip removed from VesselProfile SVG (v1.72.39); plan identity (WK · Vessel · Voyage · Version), status badge, and all plan action buttons (Save Draft, Send to Captain, Delete, New Draft when locked) moved to the fixed app header alongside pallet stats LOADED / CAPACITY / AVAILABLE / UTIL% (v1.72.45–v1.72.46); statsBar and compactHeader blocks removed from page body.
As of v1.72.47: shipper portal responsive fixes — KPI grid at 768–1023px changed from 2-column to 3-column (eliminates lone-card row); ShipperShell gains transitionsReady double-rAF guard (prevents hydration animation flash); zero-flicker sidebar on reload via html class sync (SHIPPER_HTML_CLASS + blocking script).
As of v1.72.48: ForecastWizard fully mobile responsive — complete @media (max-width: 767px) block added; buttons width 100%, min-height 44px; wizardActions column-reverse on mobile; step 2 voyage table converts to card-list layout using CSS display:block + ::before data-label; data-label attributes added to 5 <td> elements; estimateInput 16px font-size prevents iOS zoom on focus; checkbox enlarged to 20×20px touch target.
As of v1.72.49: shipper wizards centered (Opción A) — both booking request and forecast wizards gain margin: 0 auto centering; .wizardPage class added to RequestClient root div (max-width: 680px); ForecastWizard .page gets margin: 0 auto (max-width: 860px was already present); .wizardPanel and .tableCard border/border-radius upgraded for visual card weight.
As of v1.72.50: account page centered — app/account/account.module.css .page gains margin: 0 auto; width: 100%; fix applies to both agency and shipper account pages (shared CSS module).
As of v1.72.51: table list UX improvements — numeric columns (REQ./CONF./STANDBY/pallets) right-aligned with tabular-nums across /shipper/bookings, /shipper/forecasts, /shipper/schedules, /bookings; date columns right-aligned with tabular-nums; column header contrast upgraded from color-text-muted to color-text-secondary across all affected list pages.
As of v1.72.52: /shipper/schedules expandable rows — page converted to client component; VoyageActionModal row-click replaced with expand/collapse toggle; collapsed row shows compact first-load → last-discharge route summary with flag icons and "+N stops" pill; expanded row shows full horizontal port timeline (cyan dots = load ports, amber dots = discharge ports) with port name, date, and Load/Discharge label; timeline scrollable horizontally on narrow screens.
As of v1.72.53–v1.72.54: /shipper/schedules timeline dots reduced (10px), expanded row gets subtle background separation, Unicode chevrons replaced with SVG chevron-down with three contrast states (default #94A3B8 / hover white / active cyan rotated).
As of v1.72.55: VoyageActionModal restored on row click in /shipper/schedules — chevron exclusively controls timeline expand/collapse with stopPropagation.
As of v1.72.56–v1.72.58: mobile card layout (@media max-width 767px) applied to /shipper/bookings, /shipper/schedules, /shipper/forecasts, and Recent Bookings on /shipper dashboard — each table converts to compact labeled cards with 44px touch targets.
As of v1.72.60: ShipperShell mobile-first CSS — margin-left moved from base .main rule into @media (min-width: 768px) block; eliminates iOS sidebar margin flash on refresh.
As of v1.72.62–v1.72.65: Comprehensive layout harmonization across both portals. (1) Shipper Portal widescreen expansion — ShipperShell .content max-width cap (1 400 px) removed so all operational tables (Bookings, Schedules, Forecasts) fill 100 % of the available area on 16-inch and 24-inch monitors; KPI summary grid updated to repeat(auto-fit, minmax(240px, 1fr)) for even card distribution across wide viewports; New Booking Request wizard widened to 800 px, New Forecast wizard to 1 000 px, Account Settings to 1 100 px; --content-max-width / --content-max-width-xl global tokens updated to 1 600 px / 1 920 px. (2) Shipper Portal header consistency — ShipperSidebar .brand changed from min-height to height: var(--header-height) so its border-bottom aligns exactly with ShipperShell .header at all breakpoints (tablet 44 px vs 48 px mismatch also resolved); shipper company name removed from the sidebar brand section and from the ShipperShell header badge — shipper identity is now displayed exclusively in the sidebar footer user section below the user name. (3) Agency Portal header breathing room — global --header-height CSS token increased from 48 px to 56 px (+8 px), giving 12 px of vertical air around the two-line plan identity (WK · Vessel · Voyage · Version) and the header action buttons on /stowage-plans/[id]; all consumers of the token (app-content margin-top, UnassignedCargoPanel top/height offsets, stowage plan page positioning) adjust automatically.
As of v1.72.61: Global responsive layout refactor — globals.css APP LAYOUT section rewritten mobile-first; both agency and shipper sidebars now use height: 100dvh (fixes Lenovo TB-X505L vertical clipping); tablet @media (768–1024px) reduces sidebar padding to surface more nav items; .table-scroll and .page-cap utility classes added; Recent Bookings mobile card: table min-width: 700px neutralised (fixes horizontal page overflow), inline-flex quantities replaced with standard flex rows, cell padding reduced to 3px vertical, consignee truncated via .tdVal + <span> wrapper.
As of v1.72.13: forecast quantity sync fixed in updateBookingQuantity() — after saving the booking, related SpaceForecasts (planImpact REPLACED_BY_BOOKING or INCORPORATED) now have their estimatedPallets updated to match the new booking quantity; on cancellation/zero, forecasts revert to contract weeklyPallets and planImpact=PENDING_REVIEW. Root cause was updateBookingQuantity() having no SpaceForecastModel interaction at all. estimatedPalletsTotal aggregations in getVoyages() and getStowagePlans() were already correct.
As of v1.72.12: CapacityBar capacity consistency audit — confirmed all four CapacityBar instances (Dashboard Recent Voyages, Stowage Plans list, Voyages list, plan detail header) use dynamic palletsCapacity derived from floor(sqm÷designStowageFactor). The v1.71.0 dynamic calculation fix is intact in getVoyages(), getAdminVoyages(), and voyageCapacityMap in app/page.tsx. No code changes required — audit only.
As of v1.72.11: two header polish fixes — (1) .vesselHeaderSub color changed from var(--color-text-tertiary) to var(--color-cyan) so vessel · voyage reads in teal. (2) Unassigned button split out of headerActions into its own unassignedButton prop threaded through AppShell → Header; it now renders in .headerRight (right side) just before the user avatar, while the three stat chips remain in the left vesselHeaderGroup.
As of v1.72.10: VesselProfile internal title bar removed and consolidated into the app header. AppShell and Header gain headerActions?: ReactNode prop threaded all the way through. page.tsx defines headerActions const (LOADED/CAPACITY/AVAILABLE stat chips + Unassigned button) before the return and passes it to AppShell, which passes it to Header. Header renders a vesselHeaderGroup (title + sub-title + separator + actions) instead of the old badge pills when activeVessel && activeVoyage. VesselProfile.tsx: ReactNode import removed, headerActions prop removed, hasHistorical removed, full title bar block removed. VesselProfile.module.css: .header/.title/.subtitle/.headerRight rules removed. page.module.css: .statChip updated to flex-column layout; .statChip .statLabel scoped override added (9px/muted/uppercase); .statChip strong uses color: inherit so AVAILABLE chip number inherits its green/amber inline color.
As of v1.72.9: two header/panel UX fixes — (1) Header.tsx now shows ⛵ VESSEL NAME and ⚓ VOYAGE NUMBER as cyan pill badges in the breadcrumb area (replacing the breadcrumb) when both activeVessel and activeVoyage props are set; the right-side context items are suppressed to avoid duplication; new CSS classes vesselBadges/vesselBadge/voyageBadge/badgeIcon added to Header.module.css. (2) UnassignedCargoPanel overlay and panel now start at var(--header-height) = 48px instead of top: 0, so the fixed app header and user avatar are never obscured by the panel or its backdrop.
As of v1.72.8: capacity bar refined — height 2px (was 4px), track rgba(255,255,255,0.12), fill colors match header chip palette: green #22c55e (same as available qty text, fillPct ≤ 0.75), amber #fbbf24 (fillPct ≤ 0.90), red #f87171 (fillPct > 0.90); drop-shadow filter removed; y-position flush at bottom edge (comp.y + comp.h − 2).
As of v1.72.7: VesselProfile deck strip removed — FC and UPD compartments now render inside the main hull SVG at equal height to A/B/C/D levels. SVG_H increased from 430 to 480; HULL_LABEL_AREA_H=28 provides top margin for hold labels (y=11) and totals (y=22) inside the hull canvas. buildCompartmentRects() no longer has a separate above-deck path — all ordered levels share the same normalH = (430 - 28 - gaps) / numLevels budget. With 5 levels: normalH = 79.6px (> CELL_FULL_THRESHOLD=56) so footer (POL/temp/factor) is visible on FC rows. DECK_STRIP_H, DECK_LEVEL_H, SPECIAL_LEVELS, ABOVE_DECK, SPECIAL_HEIGHT_RATIO, FC_WIDTH_RATIO, deckCompartments, hasDeckLevels all removed. UPD retains 50% width (UPD_WIDTH_RATIO=0.5). Capacity bar: height 4px, y offset −5, track rgba(0.20), colors #00dd66/#ffbb00/#ff4444, drop-shadow filter.
As of v1.71.7: solver.py balance objective replaced with fill-ratio variance across all holds — for each unique polSeq departure, per-hold deviation = |fill_ratio_h - avg_fill_ratio| computed via integer cross-multiplication (hold_pallets * total_capacity − total_aboard * cap_h) normalized to pallet scale via AddDivisionEquality(dev, dev_scaled, total_capacity). compute_metrics() now returns holdFillRatios dict and balance_dev as a fraction (0.0 = perfect, 1.0 = fully unbalanced). build_and_solve() prints "Hold 1: X% | Hold 2: Y% | ..." and "Balance deviation: N%". AC26020 run shows 0.03–0.07% balance deviation across all 5 configs — essentially perfect hold balance.
As of v1.71.6: cargoType validation fully migrated off hardcoded enums — CargoTypeSchema in booking.ts replaced with z.string().min(1) (was z.enum([20 legacy values])); SpaceForecastSchema.cargoType enum constraint removed from lib/db/schemas.ts (now plain { type: String, required: true }). contract.ts was already fixed in v1.71.3. space-forecast.ts has no Zod cargoType validation (derives cargoType from contract doc). types/models.ts CargoType union and temperature.ts CARGO_TEMP_RANGES are lookup tables, not validators — left unchanged.
As of v1.71.5: solver.py cargo temperature lookup made DB-driven — load_voyage_data() now queries the cargoProducts collection (active: true) and builds cargo_temp_map keyed by product code with ±1°C tolerance window around the stored temperature (e.g. BAN → (12, 14), PINE → (6, 8)). build_cargo_items() accepts cargo_temp_map and uses it preferentially, falling back to CARGO_TEMP_RANGES, then to (0, 25) wide range for unknowns. data['cargoTempMap'] stored for downstream inspection. get_temp_range() fallback changed from (0, 4) to (0, 25) — unknown codes are now treated as universally compatible instead of being incorrectly constrained to a 0–4°C chilled window.
As of v1.71.4: solver.py CARGO_TEMP_RANGES updated — short CargoProduct codes (BAN, OBAN, PLAN, PINE, PAPA, MANGO, AVOC, CITRUS, GRAPE) added as primary keys; legacy names (BANANAS, PINEAPPLES, etc.) retained for backwards compatibility. Without this fix, get_temp_range() fell back to (0, 4) for all cargo types used in current bookings, silently disabling temperature zone grouping (Constraint 5) in the CP-SAT optimizer.
As of v1.71.3: savePythonPlan() now derives coolingSectionStatus from cargo product temperatures — MAJORITY_RULE logic assigns the dominant CargoProduct.temperature (weighted by pallet quantity) to each vessel temperature zone after CP-SAT optimization. Requires CargoProduct collection to be seeded (scripts/seed-cargo-products.ts). Zones with no known cargo type get assignedTemperature: undefined. CargoTypeSchema in contract.ts replaced with z.string().min(1) (was z.enum([19 values])) — contracts now accept any CargoProduct code. modalError CSS updated with word-break and overflow-wrap to prevent long error strings from breaking the layout.
As of v1.71.2: CargoProduct collection introduced — new CargoProductSchema with code, name, shortLabel, temperature (°C), active; 9 products seeded (BAN/OBAN/PINE/PLAN/AVOC/GRAPE/CITRUS/MANGO/PAPA); Admin Cargo Products tab added; Contract edit modal cargo type dropdown now DB-driven from CargoProduct collection instead of hardcoded enum. updateCargoProduct() supports temperature field updates.
As of v1.71.1: Voyages list cards now use shared `<CapacityBar>` — replaces inline `UtilizationBar`; estimated pallets segment (striped) shown alongside booked pallets. `estimatedPalletsTotal` was already returned by `getVoyages()` but discarded; `DisplayVoyage` interface extended with `estimatedPallets`; `UtilizationBar` function deleted from `VoyagesClient.tsx`.
As of v1.69.2: http://localhost:8001 added to CSP connect-src in next.config.ts for browser→FastAPI fetch from /stowage-plans/optimize.
As of v1.69.1: Python optimizer Fase 2 — api.py FastAPI microservice (port 8001) wraps solver.py; solver.py refactored into load_voyage_data() / build_and_solve() / format_solutions() importable functions (CLI unchanged); /stowage-plans/optimize voyage-selector + 5-plan CP-SAT carousel with metrics and cargo positions table; AdvancedOptimizeButton added to plans list; savePythonPlan() server action saves selected plan (generationMethod: PYTHON_OPTIMIZER_*); StowagePlanSchema generationMethod enum constraint removed; NEXT_PUBLIC_PYTHON_ENGINE_URL=http://localhost:8001 added to .env.local. Start service: cd stowage-optimizer && venv\Scripts\activate && uvicorn api:app --port 8001 --reload
As of v1.69.0: /vessels access control for SHIPPING_PLANNER role — getVessels() now filters by JWT serviceFilter → ServiceModel.vesselPool; ADMIN/SUPERUSER see all vessels; empty serviceFilter returns empty list.
As of v1.68.10: stowage-optimizer CP-SAT constraints corrected — POL
monotonicity constraint was blocking the wrong direction (early-in-j_lo +
late-in-j_hi is the overstow pattern; both original and first-pass fix
blocked the inverse). Fix: constraint now fires on (i_early, j_lo) compat
check and blocks early in higher-depth sections when late would occupy
lower-depth sections. POD monotonicity unchanged (was already correct).
Temperature zone grouping constraint added: incompatible cargo types
(non-overlapping temp ranges) blocked from sharing the same zoneId via
OnlyEnforceIf binary indicator pairs. Result: 0 overstow violations across
all 5 plan objectives on Baltic Klipper voyage AC26020 (was 1258 before fix,
2813–3581 after first-pass incorrect fix).
As of v1.68.9: Python OR-Tools CP-SAT stowage optimizer created — Fase 1
(stowage-optimizer/ folder, Python 3.12, OR-Tools 9.11.4210). solver.py
reads MongoDB directly and generates 5 alternative stowage plans per voyage
with different objective weight profiles (Balanced, Max Balance, Max
Compactness, POD-Friendly, Max Utilization). Excel output color-coded by POD
port; JSON output compatible with cargoPositions schema. Standalone offline
tool separate from the Next.js application.
Run: stowage-optimizer\venv\Scripts\python.exe stowage-optimizer\solver.py <voyage_id>
As of v1.68.8: POD colors changed from positional to deterministic — new
lib/constants/pod-colors.ts defines POD_COLOR_MAP (22 known UN/LOCODEs with
fixed hex values) and getPodColor() (hash-based fallback for unlisted ports).
POD_COLORS array and positional index assignment removed from
app/stowage-plans/[id]/page.tsx; podColorMap useMemo now calls getPodColor()
per port code. Same port always renders the same color across all plans and
voyages. VesselProfile, CoolingSectionTopDown, and engine files unchanged.
As of v1.68.6: cargoType abbreviation removed from header chip label —
BAN/PINE/AVOC etc. were redundant visual noise. Chip format is now
[dot] bookingNumber · shipper – consignee · Np (or "Est · …" for
estimates). CARGO_ABBREV constant and abbrev local variable removed
from CoolingSectionTopDown.tsx.
As of v1.68.5: shipperName/consigneeName/confidence/polSeq/podSeq now
persisted for all cargo positions. Root cause: mapEngineOutputToDocument()
built a fixed object literal ignoring CargoPositionOutput; synthetic
allBookingMeta entries for forecast/estimate pseudo-bookings lacked
shipperName. Fix: cpLookup added (future-proof), bk-path reads
shipperName/consigneeName/confidence/polSeq/podSeq; synthetic entries in
both autoGenerateSinglePlan and autoGenerateDraftPlans now carry those
fields. CargoPositionSchema gains snapshotQuantity, confidence, polSeq,
podSeq (all optional, existing docs degrade gracefully).
As of v1.68.4: shipperName added to CargoPositionSchema — completes the
end-to-end persistence path for shipper name in cargo positions. No other
changes needed: EngineBooking already has shipperName?, assign.ts already
pushes booking.shipperName to CargoPositionOutput, and the UI already reads
pos.shipperName with ?? '' fallback.
As of v1.68.3: top-down view header chips restyled — colored-border "christmas
tree" style replaced with neutral chip (dot + #94a3b8 text, #1e3a5f border,
rgba bg, border-radius 6px); chips now include cargo abbrev and full
shipper–consignee party string; bottom legend removed (all info in chips).
Estimate slot mapping updated: shipperName uses pos.shipperName ??
pos.shipperCode ?? '' (note: shipperName absent from CargoPositionSchema so
empty for existing plans until schema migration adds the field).
As of v1.68.2: top-down section detail view enriched — SectionBookingSlot
gains shipperName and consigneeName optional fields; header shows compact
chips per occupied slot (bookingNumber/Est · party · Nplt); legend rows
now show "Est · shipper – consignee · BAN · N plt" format with CARGO_ABBREV
abbreviations. shipperName/consigneeName passed from selectedSectionSlots
useMemo for both real bookings and estimate positions.
As of v1.68.1: UI-side temperature conflict validation removed from
/stowage-plans/[id]/page.tsx — cargoTempRequirements hardcoded table deleted,
temperature conflict check loop removed from validation useMemo,
conflictSuggestions useMemo removed, conflictWarning block removed from assign
modal, assign button always uses btnPrimary. Engine-generated conflicts in
engineConflicts[] (from constraints.ts) remain the authoritative source; the
validation panel's Temperature Conflicts section always shows "No temperature
conflicts".

---

## IMPLEMENTED FEATURES

### Pages

| Page | Route | Key features |
|------|-------|-------------|
| Dashboard | `/` | Real-time stats, voyages table (CapacityBar UTILIZATION), plans table (CapacityBar LOADED), pending bookings; **4 KPI cards clickable** — each navigates to the relevant filtered list view (`?status=` param) |
| Voyages | `/voyages` | Cards + port call timeline, ETA weather, MarineTraffic link; **fully clickable cards** — whole card navigates to detail; filter by PLANNED/IN_PROGRESS/COMPLETED/CLOSED/CANCELLED |
| Voyage Detail | `/voyages/[id]` | Port call editor (locked ports highlighted), plan list, bookings + POD column; CloseVoyageButton (COMPLETED→CLOSED), ChangeDestinationButton per booking (IN_PROGRESS only); Contracts & Space table with BOOKING/WEEKLY EST., BOOKING NR./FORECAST, STATUS columns; counterparty weeklyPallets click-to-edit (PLANNER/ADMIN) |
| New Voyage | `/voyages/new` | 4-step wizard: service → vessel (filtered to service vesselPool) → schedule → review |
| Vessels | `/vessels` | Grid cards, specs, temp range gradient bar; **fully clickable cards** — whole card navigates to detail; MarineTraffic SVG icon next to IMO number |
| Vessel Detail | `/vessels/[id]` | Interactive SVG profile, Configure Zones modal, stowage factors |
| Bookings | `/bookings` | 12-col table, 3-step create modal (720px wide, min-height 600px), approve/reject/edit modals, estimate badges |
| Stowage Plans | `/stowage-plans` | CapacityBar (booked + estimated segments), booking + estimate counts, overstow/temp conflict badges, ⚡ Auto-Generate button, 🔬 Advanced Optimize button; **fully clickable cards** — whole card navigates to detail |
| New Plan Wizard | `/stowage-plans/new` | Unified 3-step wizard (voyage → temperature → review); mode=auto runs engine (autoGenerateSinglePlan), mode=manual creates blank plan; both ⚡ Auto-Generate and + New Plan buttons share this wizard; revision mode auto-detected |
| Optimizer | `/stowage-plans/optimize` | Voyage selector + POST to Python FastAPI service + 5-plan CP-SAT carousel with metrics + cargo positions table (POD-colored); Save plan → savePythonPlan() → redirect to plan detail |
| Plan Detail | `/stowage-plans/[id]` | Full-width SVG, booking roster strip, top-down DnD view, comm log |
| Admin | `/admin` | 12 tabs: Voyages · Contracts · Plans · Vessels · Services · Users · Ports · Shippers · Offices · Bookings · Customers · Cargo Products |
| Shipper Portal | `/shipper/*` | Dashboard (5 clickable KPI cards: Active Bookings, Confirmed Pallets, Awaiting Approval, On Standby, Pending Requests); **Upcoming Voyages strip cards and Schedules table rows are clickable** — opens voyage action modal with per-contract NONE/HAS_ESTIMATE/HAS_BOOKING status and contextual action buttons; Bookings, Booking Detail, Forecasts, Pending (`/shipper/pending` — voyage cards with Submit Estimate / Request Booking actions), Schedules, New Request wizard (EXPORTER only) |
| Account | `/account` | Password change (role-aware shell) |
| Login | `/login` | NextAuth v5 credentials, JWT, all roles |
| Confirm | `/confirm/[token]` | Email invitation + account activation |

### Layout Shell

- **AppShell** — localStorage sidebar persistence; mobile overlay (hamburger + backdrop, close-on-route-change); zero-flicker blocking `<script>` in `<head>`; `transitionsReady` double-rAF guard
- **Sidebar** — collapsible 240→56px; Fleet Status + Port Temps widgets server-rendered and filtered by user's service assignments; no client-side fetching; collapsed icon tooltips
- **Header** — auto-breadcrumbs from pathname; vessel/voyage context; user avatar + logout dropdown
- **ShipperShell** — isolated layout for EXPORTER role; same localStorage persistence; fetches shipper company name server-side (via `app/shipper/layout.tsx`) and displays it in sidebar brand area and user section

### Database Status

| SpaceForecasts | via actions | source: SHIPPER_PORTAL / PLANNER_ENTRY / CONTRACT_DEFAULT / NO_CARGO; planImpact: PENDING_REVIEW / INCORPORATED / SUPERSEDED / NO_CHANGE / REPLACED_BY_BOOKING / **EXPIRED** (v1.70.0); NO_CARGO always sets planImpact=INCORPORATED at creation (skips engine); linked to StowagePlan via pendingForecastUpdates[], pendingBookingReplacements[], **expiredForecasts[]** (v1.70.0) |

### Auth & Roles

| Role | Access |
|------|--------|
| ADMIN | All routes including `/admin` |
| SHIPPING_PLANNER | All planning routes except `/admin` |
| DEMO_AGENT | All planning routes except `/admin` — read-only; all write buttons visible but disabled (opacity 0.4) |
| STEVEDORE | `/`, `/voyages`, `/stowage-plans` (read-only) |
| CHECKER | Same as STEVEDORE |
| EXPORTER | `/shipper/*` + `/account` only |
| VIEWER | Planning routes, read-only |

Session: JWT strategy, `maxAge: 8h`, `sessionVersion` counter (incremented on login/logout to invalidate stale sessions). Client-side 15-min inactivity timer — no DB writes. JWT carries `officeIds[]` + `serviceFilter[]` (union of service codes from assigned offices; empty = global access).

---

## FILE TREE

```
app/
├── layout.tsx                    ✅ Root layout + blocking sidebar script
├── page.tsx                      ✅ Dashboard
├── dashboard-stat-card.tsx       ✅ Clickable KPI stat card — 'use client'; useRouter for drill-down navigation; hover + focus-visible styles
├── globals.css                   ✅ Design tokens + reset + layout CSS
├── actions/                      ✅ 14 server action files (voyage, vessel, booking,
│                                    contract, stowage-plan, service, office, port,
│                                    weather, shipper, user, cargo-product,
│                                    country, customer)
│   ├── cargo-product.ts          ✅ CRUD for cargoProducts and compatibilityGroups
│   ├── country.ts                ✅ getCountries() — auth-gated, returns { code, name, flag }[]
│   └── customer.ts               ✅ getCustomers(), createCustomer(), updateCustomer(), deactivateCustomer()
├── voyages/
│   ├── page.tsx                      ✅ Server component; batch coord + weather fetch
│   ├── VoyagesClient.tsx             ✅ Filter + card display; CapacityBar (booked + estimated segments); fully clickable cards (useRouter onClick)
│   ├── new/
│   │   ├── page.tsx                  ✅ Server component; filters services by serviceFilter
│   │   └── NewVoyageWizard.tsx       ✅ Client component; accepts initialServices prop; auto-skips step 1 for single-service users
│   └── [id]/                         ✅ Port call editor, bookings + POD column, close/divert actions
├── vessels/                      ✅ List + [id] detail
├── bookings/                     ✅ List + modals
├── stowage-plans/                ✅ List + new wizard + [id] detail + AdvancedOptimizeButton + /optimize carousel
│   ├── AdvancedOptimizeButton.tsx    ✅ "🔬 Advanced Optimize" button — routes to /stowage-plans/optimize
│   └── optimize/
│       ├── page.tsx                  ✅ Voyage selector + 5-plan CP-SAT carousel + save action (client component)
│       └── optimize.module.css      ✅ Carousel, metrics, cargo table styles
├── admin/                        ✅ 12-tab admin hub
├── contracts/[id]/               ✅ Contract detail + ContractShippersPanel
├── shipper/                      ✅ EXPORTER portal (Dashboard · Bookings · Forecasts · Schedules · New Request · Pending · Account); KpiCards.tsx; UpcomingVoyageStrip.tsx (clickable voyage cards); VoyageActionModal.tsx (per-contract booking/estimate status modal); pending/page.tsx; schedules/SchedulesClient.tsx (clickable table rows)
├── account/                      ✅ Password change
├── login/                        ✅ Auth page
└── confirm/[token]/              ✅ Email confirmation

components/
├── layout/
│   ├── AppShell.tsx + (no module)    ✅ Sidebar + Header + mobile overlay
│   ├── Sidebar.tsx + .module.css     ✅ Collapsible nav + fleet/weather widgets
│   ├── Header.tsx + .module.css      ✅ Breadcrumbs + user menu
│   ├── ShipperShell.tsx + .module.css ✅ Exporter portal layout
│   ├── ShipperSidebar.tsx + .module.css ✅ Exporter portal nav
│   ├── Providers.tsx                 ✅ SessionProvider + SidebarProvider wrapper
│   ├── SidebarContext.tsx            ✅ React context: FleetStatus + PortTemp[] for server-rendered sidebar data
│   └── InactivityTimer.tsx           ✅ 15-min client-side timeout
├── ui/
│   ├── CountrySelect.tsx + .module.css  ✅ Searchable country select — SVG flag icon (flag-icons lib), live filter, keyboard nav
│   ├── ContractSelect.tsx + .module.css ✅ Custom multi-line contract dropdown — contract#, service, route, cargo; shared by /bookings and /shipper/request
│   └── CapacityBar/ (CapacityBar.tsx + .module.css) ✅ Segmented capacity bar — bookedPallets (solid cyan) + estimatedPallets (45% opacity + diagonal stripe) vs totalCapacity; size='sm'|'md'; used in /stowage-plans cards, Dashboard UTILIZATION, Dashboard LOADED
└── vessel/
    ├── VesselProfile.tsx + .module.css       ✅ Dynamic longitudinal SVG
    ├── CoolingSectionTopDown.tsx + .module.css ✅ Bird's-eye grid + MOVE/SWAP DnD
    ├── ConfigureZonesModal.tsx + .module.css  ✅ Zone temperature config + audit
    └── ConfigureZonesButton.tsx               ✅ Client wrapper

lib/
├── constants/
│   └── pod-colors.ts                 ✅ POD_COLOR_MAP (22 UN/LOCODEs → fixed hex); getPodColor() hash fallback
├── db/
│   ├── connect.ts                    ✅ Mongoose connection with caching + error sanitization
│   ├── schemas.ts                    ✅ All Mongoose schemas (~1,300 lines — VoyagePortCallSchema: locked/lockedBy/lockedAt; VoyageSchema: bookingDeadline: Date (v1.70.0); BookingSchema: changelog[]; UserSchema: offices[], role enum includes DEMO_AGENT (v1.70.1); OfficeSchema: services[], parentOfficeId; StowagePlanSchema: expiredForecasts: [ObjectId] (v1.70.0); SpaceForecastSchema: planImpact includes EXPIRED (v1.70.0))
│   └── data/aconcagua-bay-data.ts    ✅ ACON vessel specifications
├── stowage-engine/                   ✅ Pure TypeScript planning engine (no DB/HTTP)
│   ├── index.ts                      ✅ generateStowagePlan() entry point
│   ├── types.ts                      ✅ EngineInput/Output, EngineConflict, StabilityIndicator
│   ├── temperature.ts                ✅ Zone init: INHERITED → MAJORITY_RULE → PLANNER_OVERRIDE
│   ├── constraints.ts                ✅ Temp compatibility, capacity, overstow validators
│   ├── assign.ts                     ✅ HoldState algorithm + canPlace POL/POD constraint + balance scoring + bottom-up fill (LEVEL_DEPTH tie-break, v1.64.0) + two-pass POD-priority assignment (v1.68.0): Pass 1 podSeq DESC fills bottoms, Pass 2 podSeq ASC fills tops; headroomPenalty, podImbalancePenalty, compactnessBonus in sectionScore()
│   ├── stability.ts                  ✅ Per-port LCG/TCG → trim/list index → GREEN/YELLOW/RED; loading/discharge balance checks
│   └── engine.test.ts                ✅ ACONCAGUA BAY hardcoded test, 14/14 assertions pass
├── email.ts                          ✅ Gmail SMTP — `buildEmailHtml()` dark maritime template; booking lifecycle emails (received, created-on-behalf, planners notified, status changed, cancelled, modified); security emails (password changed, failed login warning); `lookupPlannerRecipients()` shared helper
├── generate-plan-pdf.ts              ✅ PDF via pdf-lib (text/tables; no SVG embed yet)
├── vessel-profile-data.ts            ✅ VesselLayout interfaces + confidence field
├── mock-data.ts                      ✅ Retained as fallback only
└── utils/
    ├── flagIcon.tsx                  ✅ <FlagIcon code="CL" /> — SVG flag using flag-icons CSS lib (cross-browser safe)
    └── accessFilter.ts               ✅ buildServiceFilter(serviceFilter[]) → MongoDB $in query or {} for global access

stowage-optimizer/                    ✅ Python CP-SAT optimizer + FastAPI microservice
├── solver.py                         ✅ OR-Tools CP-SAT; load_voyage_data() / build_and_solve() / format_solutions() public API; sqm÷DSF capacity; corrected POL monotonicity; ≤ supply; DB-driven cargo temp lookup from cargoProducts collection (±1°C window, fallback to CARGO_TEMP_RANGES then (0,25)); fill-ratio variance balance objective across holds per POL departure (AddDivisionEquality normalization)
├── api.py                            ✅ FastAPI — GET /health, POST /optimize; thread-pool executor; CORS for localhost:3000 + 192.168.10.45:3000; start: uvicorn api:app --port 8001 --reload
├── requirements.txt                  ✅ ortools, pymongo, pandas, openpyxl, python-dotenv, fastapi, uvicorn
├── README.md                         ✅ Setup + run instructions + uvicorn startup command + API endpoint table
├── .gitignore                        ✅ Excludes venv/, __pycache__, output/
└── venv/                             ✅ Python 3.12 venv (git-ignored)

types/models.ts                       ✅ All TypeScript interfaces
scripts/seed-minimal.ts               ✅ Full reset — requires --force flag
scripts/seed-ports.ts                 ✅ Ports-only reset — safe, no --force needed
scripts/seed-countries.ts             ✅ Upserts ~65 maritime countries into Country collection (no --force needed)
scripts/migrate-voyage-status.ts      ✅ One-time migration: ESTIMATED + CONFIRMED → PLANNED (already run)
scripts/diagnose-plan.ts              ✅ Baltic Klipper diagnostic — re-runs engine, saves to DB, prints conflicts / unassigned / section fills / deep canPlace analysis per unassigned booking; run with: npx tsx --env-file=.env.local scripts/diagnose-plan.ts
scripts/analyze-route.ts              ✅ Read-only route analysis — cargo by POL→POD group, totals per POD, section capacities by hold+temp, hold reservation feasibility math; run with: npx tsx --env-file=.env.local scripts/analyze-route.ts
auth.config.ts                        ✅ Edge-safe config + role guards
auth.ts                               ✅ Credentials provider + bcrypt + JWT callbacks
middleware.ts                         ✅ Edge route protection
next.config.ts                        ✅ Security headers (CSP, X-Frame-Options, etc.)

docs/
├── PROJECT_STATUS.md                 ✅ This file
├── PROJECT_CONTEXT.md                ✅ Business logic, vessel architecture, naming conventions
├── SECURITY_AND_COMPLIANCE.md        ✅ Security and compliance requirements — review against this before every change
├── MANUAL_DRAFT_AGENCY.md            ✅ Agency operations manual (Planners, Admins, Stevedores)
└── MANUAL_DRAFT_SHIPPER.md           ✅ Shipper portal manual (Exporters)
```

---

## DATABASE STATUS

**Connection:** MongoDB (port 27017) · **DB:** `reefer-planner`

| Collection | State | Notes |
|------------|-------|-------|
| Services | 3 seeded | ANDES-EXPRESS, RAYO, CARIBANEX |
| Vessels | 19 seeded | Full `temperatureZones` + cooling section data |
| Users | 3+ | admin / planner / stevedore; invite new via Admin Users tab; `offices[]` field links to Office collection |
| Offices | 6 seeded | RTM, VLP, GYE, SMR, PME, VLI; now carry `services[]` (serviceCodes) and optional `parentOfficeId` |
| Contracts | 10 seeded | 8 CONSIGNEE-type, 2 SHIPPER-type |
| Shippers | via Admin | Managed in Admin Shippers tab; linked to contracts via `counterparties[]` |
| UNECE_PORTS | 21 seeded | Reference/master data — country, portName, unlocode, lat/lon |
| Ports | 21 seeded | Operational ports — `unlocode` (canonical field), `weatherCity`, `latitude`, `longitude`, `active`; reseeded 2026-03-27 to fix stale `code` field leftover from a schema rename |
| Voyages | via UI | Created via `/voyages/new` wizard |
| StowagePlans | via UI | Created from voyage detail or `/stowage-plans/new` |
| Bookings | via UI | Created from `/bookings` → select contract |
| CompatibilityGroups | empty | Managed via Admin — groups of compatible cargo products |
| CargoProducts | 9 seeded | BAN 13°C, OBAN 13°C, PINE 7°C, PLAN 13°C, AVOC 6°C, GRAPE −1°C, CITRUS 5°C, MANGO 10°C, PAPA 10°C; managed via Admin → Cargo Products tab (12th tab); seed: `scripts/seed-cargo-products.ts` |
| Countries | via seed | ~65 maritime countries; seeded with `npm run db:seed:countries` |
| Customers | via Admin | Managed in Admin Customers tab (11th tab); CONSIGNEE / SHIPPER / AGENT types |

```bash
npm run db:seed:reset                  # wipe + reseed ALL collections (--force internally)
npm run db:seed:ports                  # reseed UNECE_PORTS + ports only (safe, no --force)
npm run db:seed:countries              # upsert ~65 countries into Country collection (safe, no --force)
tsx scripts/seed-minimal.ts --force    # direct full reset
npx tsx scripts/verify-db.ts          # verify data
```

### Port schema fields (English, canonical)

`unlocode` · `countryCode` · `country` · `portName` · `weatherCity` · `latitude` · `longitude` · `active`

### New/updated schema fields (v1.37.0–v1.45.0)

| Schema | Field(s) added | Notes |
|--------|----------------|-------|
| VoyagePortCallSchema | `locked: Boolean`, `lockedBy: ObjectId ref User`, `lockedAt: Date` | Auto-set when ATD recorded on a LOAD port |
| BookingSchema | `changelog: [{ changedAt, changedBy, field, fromValue, toValue }]` | Appended by `updateBookingDestination()` |
| BookingSchema | `vesselName: String` (optional) | Denormalized from voyage at booking creation; backward-compatible (absent on pre-v1.46.0 bookings) |
| OfficeSchema | `services: [String]`, `parentOfficeId: ObjectId ref Office` | serviceCodes assigned to this office; optional parent office |
| UserSchema | `offices: [ObjectId ref Office]` | Offices assigned to this user; drives `serviceFilter` in JWT |

---

## PENDING BACKLOG

Items recorded for future implementation — not yet started.

### PRIORITY #1 — solver.py balance score (v1.71.7) needs investigation
- Fill-ratio variance objective produces fewer placed pallets (57–65%) than the previous
  version (~91%).
- Root cause: `AddDivisionEquality` adds model complexity that slows the solver within the
  30-second time limit, returning FEASIBLE rather than OPTIMAL. Temperature zone separation
  (Constraint 5) also reduces per-type available capacity when BAN [12–14°C] and PINE [6–8°C]
  ranges do not overlap.
- May need: adjusting objective weight, constraint reformulation, or increasing the time limit.

### PRIORITY #2 — Add Cargo UI refresh after assignment
- After assigning cargo via the Unassigned Cargo sidebar, the compartment display does not
  update: loaded/available numbers stay the same, hold totals don't change, capacity bar
  doesn't move. The assignment is saved to DB but `vesselProfileData` and `holdTotals` states
  are not refreshed after `handleAssignFromPanel` completes.
- **Fix:** after successful assign, reload `vesselProfileData` by re-fetching
  `planCargoPositions` and triggering `vesselProfileData` useMemo dependencies.
- **File:** `app/stowage-plans/[id]/page.tsx` — `handleAssignFromPanel()`

### Transfer Cargo modal (Step 3 of manual stowage workflow)
- Context menu "Transfer Cargo" still has `console.log` stub.
- Needs: source/target selection, quantity slider, Before/After preview, temperature
  compatibility validation.

### Reduce/Cancel Cargo modal (Step 5)
- Context menu "Reduce/Cancel Cargo" still has `console.log` stub.
- Needs: quantity slider, reason field, confirm action.

### Staging Area
- Decided: persist as unassigned (remove `compartmentId`) not as a separate DB state.
- "Staged" badge for intentionally removed cargo vs "Unassigned" for never-placed cargo.

### Undo stack
- History of operations (assign, transfer, reduce) with revert capability.

### Detect duplicate cargo per contract+shipper
- When a booking AND an active forecast exist for the same `contractId+shipperId` on the
  same voyage, show a warning banner in Contracts & Space with a "Fix" button that sets
  `forecast.planImpact = REPLACED_BY_BOOKING`.
- The shipperId mismatch at booking creation caused a silent failure of the
  REPLACED_BY_BOOKING transition in some cases.
- **Files:** `app/actions/space-forecast.ts` (new `resolveConflicts()`),
  `app/voyages/[id]/VoyageDetailClient.tsx` (conflict banner)

### serviceCode field in VoyageSchema
- Voyage AC26020 has `serviceCode: undefined`. Migration or removal pending.
- Evaluate migration script to populate from `serviceId` join, or remove the field and use
  a `serviceId` join in access guards instead.

### Security and compliance audit
- `docs/SECURITY_AND_COMPLIANCE.md` — full project audit pending.
- After the review, every new change should be checked against it before committing.

### Code cleanup audit
- Dead code, unused imports, hardcoded constants superseded by DB data, obsolete collections.
- Needs a fresh pass after v1.70.x–v1.72.x changes.

### TypeScript stowage engine — structural overstow decision
- 5 OVERSTOW_CONFLICTs remain on Baltic Klipper AC26020 after the two-pass fix (v1.68.0).
- Structural cause: mixed-POD cargo from a single early POL; sort-order alone cannot resolve
  it without POD-affinity pre-routing.
- Decision pending: continue fixing the TypeScript engine, or designate it "Quick Plan" only
  and direct planners to the Advanced Optimizer.

### Demo with new naviera
- Create services, vessels, contracts, and users for a second shipping company to validate
  DEMO_AGENT serviceFilter isolation with multiple companies.

### Help System — Combination A + D

Phase 1 (short term):
- Create `/help` route rendering existing manual content as MDX
- Role-aware: SHIPPING_PLANNER/ADMIN sees agency manual,
  EXPORTER sees shipper manual, DEMO_AGENT sees agency manual
- Navigation by sections, basic search, dark maritime theme
- Convert `MANUAL_DRAFT_AGENCY.md` and `MANUAL_DRAFT_SHIPPER.md` to `.mdx`
- Link to `/help` from app header or sidebar

Phase 2 (medium term):
- Add real screenshots from stable UI
- Section anchors for direct linking from within the app

Phase 3 (long term):
- Contextual help tooltips (?) on complex sections:
  * Stowage plan wizard steps
  * Advanced Optimizer page
  * Contracts & Space table
  * Booking approval workflow
- Optional PDF export from `/help` page

Files to create:
- `app/help/page.tsx` (role-aware MDX renderer)
- `app/help/[section]/page.tsx` (individual sections)
- `docs/MANUAL_DRAFT_AGENCY.mdx`
- `docs/MANUAL_DRAFT_SHIPPER.mdx`

### Cargo Tracking & Live Monitor

A three-component module for real-time cargo tracking from farm to vessel hold.

**Component 1 — CargoMovement schema (new collection)**
New schema: `CargoMovement` / `PalletEvent` — traceability events:
- Fields: `bookingId`, `voyageId`, `contractId`, `shipperId`, `quantity`,
  `status: 'AT_FARM' | 'IN_TRANSIT' | 'AT_DOCK' | 'LOADED'`,
  `timestamp`, `reportedBy`, `transporterId`, `notes`

**Component 2 — TRANSPORTER role and portal**
New role: `TRANSPORTER` (cargo transport company)
- Marks when cargo departs farm/warehouse
- Marks when cargo arrives at dock (alongside vessel)
- Sees only their own cargo (filtered by `contractId`/`shipperId`)
- Simple mobile-friendly interface
- Does NOT see full stowage plans

**VIEWER role — Live Monitor access model**

UserSchema addition:
- `viewerPorts: [{ serviceCode: String, portCode: String }]`
  — replaces the current free-text port field for VIEWER role
  — each entry = one service+port combination the user can monitor

Admin UI when creating/editing a VIEWER user:
- Select service from dropdown → portCode select shows only
  ports belonging to that service's voyages
- Multiple service+port pairs can be added per user

Access rule: VIEWER sees only voyages where:
- `voyage.serviceCode` is in user's `viewerPorts[].serviceCode`
- AND the voyage has a portCall matching user's `viewerPorts[].portCode`
  that is currently IN_PROGRESS (vessel at that port)
- OR the voyage is IN_PROGRESS and that port is upcoming soon

Live Monitor home screen (`/live` or `/stowage-plans/live`):
- Shows one card per active voyage the VIEWER has access to
- Card shows: vessel name, voyage number, service, port, status
- Multiple cards if user has access to multiple service+port combos
  (e.g. CARIBANEX/COTRB + RAYO/GUYE simultaneously)
- Click any card → opens full longitudinal profile for that voyage
- Easy navigation between active voyages (tab or sidebar)

Example: user with `viewerPorts = [{ serviceCode: 'CARIBANEX', portCode: 'COTRB' }, { serviceCode: 'RAYO', portCode: 'GUYE' }]` sees Baltic Klipper loading in Turbo AND Hood Island loading in Guayaquil at the same time.

**Component 3 — Live Stowage Monitor (`/stowage-plans/[id]/live`)**

Phase 1 (no transporter flow needed — can build now):
- Read-only full-screen page at `/stowage-plans/[id]/live`
- Reuses existing `VesselProfile` SVG
- Auto-refresh every 30 seconds via polling
- Kiosk mode (hide navigation, full screen)
- Optimized for 1080p/4K wall monitors
- Each compartment shows: cargo type, temperature,
  shipper · consignee · pallets per shipper
  (more info fits on large screens)
- Color legend by POD port

Phase 2 (requires TRANSPORTER role + CargoMovement data):
- WebSockets or Server-Sent Events for instant updates
- Compartment color states:
  Grey = planned, no news · Yellow = cargo in transit ·
  Orange = cargo at dock, ready to load · Green = loaded and confirmed
- Hover tooltip: full pallet detail + arrival timestamp
- KPI panel: planned vs loaded pallets, progress %,
  pallets per hour, estimated completion time (ETC)
- Reconnection indicator when network drops:
  "Reconnecting... (Last sync X seconds ago)"
- Subtle transition animations only —
  flashing/alerts reserved for temperature conflicts only

Phase 3 (long term):
- Transporter mobile app / PWA
- Farm-to-dock full chain visibility
- Integration with port operations systems

### cargoProducts Admin UI
- CRUD tab in `/admin` for `CargoProduct` and `CompatibilityGroup` collections.
- Full create/edit/deactivate workflow for cargo products (currently edit-only via inline row).
- Compatibility group management: assign products to groups for temperature zone grouping.
- **Access:** SUPERUSER + ADMIN only.

### PWA / field views
- Stevedore view: `/field/loading` — real-time load order, mark pallets as loaded.
- Checker view: `/field/checklist` — confirm cargo against stowage plan.
- Prerequisite for Live Monitor Phase 2 (TRANSPORTER role and CargoMovement data).
- Mobile-optimised, offline-capable (PWA).

---

## RECENT CHANGES

### v1.72.52 (2026-06-02) — /shipper/schedules expandable rows with port timeline

`app/shipper/schedules/SchedulesClient.tsx` fully rewritten. The VoyageActionModal row-click was replaced with an expand/collapse toggle. The cramped PORT ROTATION cell (flag+code+date all inline) is replaced by a clean collapsed/expanded pattern.

**Part A — State:** `expandedVoyageId: string | null` state + `toggleRow()` function replace the previous `selectedVoyage` modal state. `Fragment` (from React) wraps each voyage's two `<tr>` elements so both share a single `key` in the `<tbody>` without invalid nesting.

**Part B — Collapsed row:** New "Route" header (was "Port Rotation"). Cell shows `firstLoad.flag+code → lastDisch.flag+code` using the new `.colRoute / .routePort / .routeArrow` classes, plus a `.routeMore "+N stops"` pill when `portCalls.length > 2`. Rightmost column shows `▲`/`▼` chevron (`.colExpand / .expandChevron`). Row uses `.scheduleRow` (not `.tableRowClickable`) — hover highlights all td cells via `.scheduleRow:hover td`.

**Part C — Expanded row:** A second `<tr className={styles.expandedRow}>` with `<td colSpan={6}>` renders when `isExpanded`. Contains a horizontal scrollable `portTimeline` flex container. Each `.timelineStop` renders: optional connector line (`.timelineConnector`, 40px wide, 2px high, margin-top 10px to align with dot center), a `.timelineDotSch` circle (cyan for LOAD, amber for DISCHARGE), and a `.timelineInfo` column (portCode+flag, portName, date, ▲/▼ operation label) positioned via `margin-top: 28px; margin-left: -10px`. Effective date uses `pc.etd ?? pc.eta` (the `VoyagePortCall` interface has these fields but not `ata`/`atd`).

**Part D — CSS (shipper.module.css):** New section `SCHEDULES — Expandable row timeline` with 22 new classes. Dot classes named `.timelineDotSch*` (not `.timelineDot*`) to avoid collision with the existing `.timelineDot / .timelineDot--load / .timelineDot--discharge` classes used in the booking detail timeline. `var(--color-border-secondary)` (undefined token) substituted with `rgba(255,255,255,0.08)` throughout.

**Files changed:** `app/shipper/schedules/SchedulesClient.tsx` · `app/shipper/shipper.module.css`

---

### v1.72.53 (2026-06-04) — Schedules timeline visual polish

- `.expandedRow td`: background `rgba(255,255,255,0.03)`, border-top `1px solid rgba(255,255,255,0.06)` — sub-panel visually separated from collapsed row
- `.timelineDotSch` reduced to 10px; connector line 1px; `.timelineInfo` font-size 11px (UNLOCODE 12px)
- Chevron padding-right matched to STATUS column header for visual symmetry

**Files changed:** `app/shipper/schedules/SchedulesClient.tsx` · `app/shipper/shipper.module.css`

### v1.72.54 (2026-06-04) — Consistent SVG chevron with contrast states across shipper portal

- Unicode ▲/▼ in `SchedulesClient.tsx` replaced with 10×10 inline SVG chevron-down (`viewBox="0 0 16 16"`, `stroke="currentColor"`)
- `.expandChevron`: `color #94A3B8`, `transition color+transform 150ms ease`
- `.expandChevronActive`: `rotate(180deg)` + `color var(--color-cyan, #06B6D4)`
- `.scheduleRow:hover .expandChevron`: `color #FFFFFF`; hover over active state pins back to cyan
- `BookingsClient` confirmed using native `<select>` (no custom chevron needed)
- `RequestClient` confirmed: no chevrons found

**Files changed:** `app/shipper/schedules/SchedulesClient.tsx` · `app/shipper/shipper.module.css`

### v1.72.55a (2026-06-04) — Chevron icon in /shipper/request (duplicate version number)

- Note: two commits share v1.72.55 — labeled 55a and 55b for clarity
- `style(shipper-request): consistent chevron-down icon` — `RequestClient.tsx` reviewed; no custom chevrons found, no changes applied

**Files changed:** none

### v1.72.55b (2026-06-04) — Restore VoyageActionModal on row click in /shipper/schedules

- Row click → opens `VoyageActionModal` (same behavior as dashboard `UpcomingVoyageStrip`)
- Chevron cell click → toggles port timeline expand/collapse with `e.stopPropagation()`
- Both states coexist: row can be expanded AND modal opened independently
- `VoyageActionModal` import and `selectedVoyage` state re-added to `SchedulesClient`

**Files changed:** `app/shipper/schedules/SchedulesClient.tsx`

### v1.72.56 (2026-06-04) — Mobile card layout for /shipper/bookings and /shipper/schedules

- `@media (max-width: 767px)`: both tables convert to compact card list
- `BookingsClient` card hierarchy: booking#/status · vessel/voyage · route/week · consignee(cargo) · req/conf/stby quantities
- Edit button full-width, `min-height: 44px` touch target on mobile
- `SchedulesClient` collapsed rows same card pattern; expanded timeline already scrolls horizontally

**Files changed:** `app/shipper/bookings/BookingsClient.tsx` · `app/shipper/schedules/SchedulesClient.tsx` · `app/shipper/shipper.module.css`

### v1.72.57 (2026-06-04) — Mobile card layout for Recent Bookings on /shipper dashboard

- Same card pattern applied to `recentBookings` table in `app/shipper/page.tsx`
- `data-label` attributes added to quantity `<td>` elements

**Files changed:** `app/shipper/page.tsx` · `app/shipper/shipper.module.css`

### v1.72.58 (2026-06-04) — Mobile card layout for /shipper/forecasts

- `app/shipper/forecasts/page.tsx` table → compact cards at `max-width: 767px`
- Card hierarchy: voyage/status · vessel/week · route/cargo · consignee · pallets/submitted
- `data-label` attributes added to relevant `<td>` elements

**Files changed:** `app/shipper/forecasts/page.tsx` · `app/shipper/forecasts/page.module.css`

### v1.72.59 (2026-06-04) — Diagnose mobile sidebar margin bug (no code change)

- Full audit of `ShipperShell.tsx`, `ShipperShell.module.css`, `globals.css`, `app/layout.tsx`
- All four guards confirmed already correct (blocking script, globals.css `@media`, `syncState`, CSS Module)
- Root cause identified: `.main` unconditionally applied `margin-left: var(--sidebar-width)`; mobile override won only by source order (same specificity 0,1,0) — fragile under SSR hydration timing
- Fix deferred to v1.72.60

**Files changed:** none

### v1.72.60 (2026-06-04) — Mobile-first margin-left eliminates sidebar flash on iOS

- `.main` base rule: `margin-left` removed entirely (browser default 0)
- New `@media (min-width: 768px)` block: `margin-left: var(--sidebar-width)` for `.main`; `margin-left: var(--sidebar-width-collapsed)` for `.main--collapsed`
- Old `@media (max-width: 767px)` `margin-left: 0` overrides removed — no longer needed
- No changes to `ShipperShell.tsx` — JS hydration logic was already correct

**Files changed:** `components/layout/ShipperShell.module.css`

### v1.72.61 (2026-06-04) — Global responsive layout refactor + Recent Bookings mobile card fix

**Part A — globals.css APP LAYOUT rewrite (4 breakpoints, mobile-first)**

- `.app-layout` and `.app-main`: `min-height: 100dvh` — dynamic viewport height, respects browser chrome on tablet/mobile
- `.app-main` mobile-first: `margin-left` removed from base rule; desktop margins live exclusively inside `@media (min-width: 768px)` block
- `.app-content` padding tiered: `var(--space-4)` mobile · `var(--space-4) var(--space-5)` tablet (768–1024px) · `var(--space-6)` desktop (1025px+)
- Pre-hydration sidebar rules and backdrop unchanged; `th { white-space: nowrap }` added to prevent orphaned column headers

**Part B — Sidebar height fix (both portals)**

- `Sidebar.module.css` + `ShipperSidebar.module.css`: `height: 100vh` → `height: 100dvh` on the `.sidebar` base rule — eliminates vertical clipping on Lenovo TB-X505L and Android Chrome tablets where `100vh` includes the URL bar area
- `overflow: hidden` split into `overflow-x: hidden; overflow-y: hidden` (explicit axes — `.nav` handles its own vertical scroll via `flex: 1; overflow-y: auto`)
- New `@media (min-width: 768px) and (max-width: 1024px)` block on both sidebars: compresses brand, nav-item, and user-section padding to surface more nav items on portrait tablet without scrolling

**Part C — Content layout utilities (globals.css)**

- `.page-cap { max-width: 1400px; margin-inline: auto }` — opt-in centering for dashboard / detail pages on monitors > 1440px
- `.page-cap-xl { max-width: 1600px }` — wider variant for multi-panel views
- `.table-scroll` — horizontal scroll wrapper: `overflow-x: auto; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch`; thin persistent scrollbar as scroll affordance; `> table { min-width: max-content }` ensures table never collapses below content width
- New `--content-max-width: 1400px` and `--content-max-width-xl: 1600px` design tokens added to `:root`

**Part D — Recent Bookings (dashboard) mobile card fix**

- Root cause 1: `.table { min-width: 700px }` was never reset in the mobile card-list block; with `.tableWrapper { overflow: visible }`, the table extended 700px beyond the viewport. Fix: `min-width: 0` added to `.table` inside `@media (max-width: 767px)`.
- Root cause 2: `display: inline-flex; width: 50%` on Req./Conf. quantity cells — inline whitespace between elements pushed total beyond 100%, causing `Conf.` to drop to the next line. Fix: replaced with `display: flex; flex-direction: row; width: auto; justify-content: space-between` — consistent with all other card rows.
- `::before` for Req./Conf. restored to standard: `min-width: 80px; margin-right: var(--space-3); text-align: left` (was `min-width: 0; margin-right: 0; text-align: center` from the column-stacking override).
- Info row padding reduced from `var(--space-1) var(--space-3)` + `min-height: 36px` to `3px var(--space-3)` + `min-height: 0` — eliminates excess vertical whitespace.
- New `.tdVal` utility class: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: right` — applied via `<span className={styles.tdVal}>` wrapper on the Consignee `<td>` value in `page.tsx`. Targets the text node (text nodes cannot be selected with CSS in a flex container).

**Files changed:** `app/globals.css` · `app/shipper/page.tsx` · `app/shipper/shipper.module.css` · `components/layout/Sidebar.module.css` · `components/layout/ShipperSidebar.module.css`

---

### v1.72.51 (2026-06-02) — Numeric column alignment and header contrast across list tables

**Fix 1 — Numeric/date column right-alignment with tabular-nums:**

Two new utility classes added to `shipper.module.css` and `forecasts/page.module.css`:
- `.colNumeric` — `text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`
- `.colDate` — `text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums`

`tabular-nums` / `"tnum"` ensures digits align vertically in Inter and Space Grotesk (both support OpenType tabular number variants).

Applied per page:
- **Shipper bookings** (`BookingsClient.tsx` + `shipper.module.css`): `Req.`, `Conf.`, `Stby.` → `.colNumeric` on both `<th>` and `<td>`; `Requested` date → `.colDate` on both. Cells combine: `className={`${styles.mono} ${styles.colNumeric}`}` to preserve font-family.
- **Shipper forecasts** (`page.tsx` + `forecasts/page.module.css`): `Pallets` → `.colNumeric` on `<th>` and `<td>` (inline style simplified — `fontVariantNumeric` moved to CSS class); `Submitted` → `.colDate` on both.
- **Shipper schedules** (`SchedulesClient.tsx`, reuses `shipper.module.css`): `Departure` → `.colDate` on both `<th>` and `<td>`.
- **Agency bookings** (`app/bookings/BookingsClient.tsx` + `page.module.css`): `Requested`, `Confirmed`, `Standby` `<th>` → `.thRight` (new class with `text-align: right !important`); `<td>` cells already used `.cellRight` — added `font-variant-numeric: tabular-nums; font-feature-settings: "tnum"` to `.cellRight`. No td JSX changes needed.

**Fix 2 — Column header contrast:**
- `shipper.module.css` `.table th`: `color` upgraded from `var(--color-text-tertiary)` to `var(--color-text-secondary)` (`#64748B` → `#94A3B8` — one step up the contrast scale)
- `forecasts/page.module.css` `.table th`: same upgrade from `var(--color-text-muted)` to `var(--color-text-secondary)`
- `app/bookings/page.module.css` `.table thead th`: upgraded from `var(--color-text-muted)` to `var(--color-text-secondary)`

**Files changed:** `app/shipper/shipper.module.css` · `app/shipper/forecasts/page.module.css` · `app/bookings/page.module.css` · `app/shipper/bookings/BookingsClient.tsx` · `app/bookings/BookingsClient.tsx` · `app/shipper/forecasts/page.tsx` · `app/shipper/schedules/SchedulesClient.tsx`

---

### v1.72.50 (2026-06-02) — Center account page horizontally

`app/account/account.module.css` `.page` gains `margin: 0 auto; width: 100%`. Mirrors the same fix applied to the shipper wizards in v1.72.49. Because `app/shipper/account/page.tsx` imports this shared CSS module (via `../../account/account.module.css`), both the shipper portal and agency portal account pages are now centered within their respective content areas at the same `max-width: 900px` constraint.

**Files changed:** `app/account/account.module.css`

---

### v1.72.49 (2026-06-02) — Center shipper wizards horizontally (Opción A layout)

Both shipper wizard pages now appear centered within the content area with a max-width constraint, matching the visual weight of the agency portal booking modal.

**Fix 1 — Booking Request wizard** (`RequestClient.tsx`, `shipper.module.css`): root `<div>` (was bare, no class) given `className={styles.wizardPage}`. New `.wizardPage` class added to `shipper.module.css`: `max-width: 680px; margin: 0 auto; width: 100%`. `.wizard` class cleared of its own `max-width` (now delegated to `.wizardPage`). Descendant rule `.wizardPage .pageHeader { max-width: 100% }` added to confirm the page header aligns within the 680px column. `.wizardPanel` updated: `border` upgraded from `var(--border-subtle)` to `var(--border-default)` (more visible at `rgba(255,255,255,0.10)`); `border-radius` upgraded from `var(--radius-lg)` (8px) to `var(--radius-xl)` (12px); `padding` increased from `var(--space-5)` (20px) to `var(--space-6)` (24px).

**Fix 2 — Forecast wizard** (`ForecastWizard.module.css`): `.page` gains `margin: 0 auto; width: 100%` — the 860px max-width was already present but had no centering. **Fix 3 — visual consistency**: `.tableCard` border upgraded from `var(--border-subtle)` to `var(--border-default)` and `border-radius` from `var(--radius-lg)` to `var(--radius-xl)`, matching the upgraded `.wizardPanel` style. The mobile `@media` block (added in v1.72.48) already overrides `.tableCard` to `border: none; border-radius: 0; background: transparent` so the upgrade is desktop-only.

**Files changed:** `app/shipper/request/RequestClient.tsx` · `app/shipper/shipper.module.css` · `app/shipper/forecasts/new/ForecastWizard.module.css`

---

### v1.72.48 (2026-06-02) — ForecastWizard mobile responsive CSS

Added a complete `@media (max-width: 767px)` block to `ForecastWizard.module.css` — the file previously had zero responsive rules. Four fixes applied:

**Fix 1 — Button touch targets:** `.btnPrimary` and `.btnSecondary` get `min-height: 44px; width: 100%; display: flex; justify-content: center`. `.footer` stacks with `flex-direction: column; align-items: stretch` — primary button is first in the DOM in this wizard so `column` (not `column-reverse`) keeps it visually on top. `.stepIndicator` gap and separator width reduced to fit 375px without wrapping. Contract cards get tighter padding (`var(--space-3) var(--space-4)`) and `flex-wrap: wrap` so the weekly estimate block (`contractWeekly`) moves to its own row below the contract info, left-aligned, with indentation matching the `contractInfo` column.

**Fix 2 — Voyage table → card list:** `.tableCard` loses its background/border/overflow (transparent container); `.table` min-width overridden to `0`; all table elements set to `display: block`; header row hidden (`display: none`); each `<tbody tr>` becomes a card with `background: var(--color-bg-secondary); border: var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-3)`; each `<td>` becomes a `display: flex; justify-content: space-between` label+value row using `::before { content: attr(data-label) }`.

**Fix 3 — data-label attributes:** Five `<td>` elements in `ForecastWizard.tsx` voyage table rows given `data-label` props: `"Voyage"`, `"Vessel"`, `"Departure"`, `"Route"`, `"Estimate"`. Required for the CSS `::before` content to render column labels in the card layout.

**Fix 4 — iOS zoom prevention + estimate input sizing:** `.estimateInput` on mobile: `width: 100%; min-height: 44px; font-size: 16px` — the 16px font-size prevents iOS Safari auto-zoom on input focus (triggered by any input < 16px). `.noCargoLabel` gets `min-height: 44px` and its checkbox is enlarged to `20×20px`.

**Files changed:** `app/shipper/forecasts/new/ForecastWizard.module.css` · `app/shipper/forecasts/new/ForecastWizard.tsx`

---

### v1.72.47 (2026-06-02) — Shipper portal responsive design fixes

Three responsive gaps closed. No changes to AppShell, agency portal, server actions, or schemas.

**Fix 1 — KPI grid tablet breakpoint** (`app/shipper/shipper.module.css`): tablet breakpoint (768–1023px) changed from 2-column to 3-column `summaryGrid`. With 5 KPI cards: row 1 = 3 cards, row 2 = 2 cards — eliminates the lone-card-on-its-own-row layout. Two centering selectors added: `last-child:nth-child(3n-1)` sets `grid-column: 2/3` (centers a 2-card partial row); `last-child:nth-child(3n-2)` sets `grid-column: 1/-1` with `max-width: calc(33.333% - ...)` and `margin: 0 auto` (centers a lone card).

**Fix 2 — transitionsReady guard** (`ShipperShell.tsx`, `ShipperShell.module.css`, `ShipperSidebar.module.css`): `transitionsReady` state added with double-rAF useEffect (parallel to AppShell). `transitions-ready` class applied to the outer layout div. `transition: margin-left` removed from `.main` in `ShipperShell.module.css`; replaced with `:global(.transitions-ready) .main` guard. `transition: width` removed from `.sidebar` in `ShipperSidebar.module.css`; replaced with `:global(.transitions-ready) .sidebar` guard. Prevents animation flash during React hydration.

**Fix 3 — zero-flicker sidebar on reload** (`ShipperShell.tsx`, `ShipperSidebar.tsx`, `globals.css`, `app/layout.tsx`): `SHIPPER_HTML_CLASS = 'shipper-sidebar-collapsed'` constant added. `syncState()` now syncs `document.documentElement.classList` on every viewport change. `toggleSidebar()` now syncs the html class on desktop toggle. `shipper-sidebar` literal class added to `<aside>` in `ShipperSidebar.tsx`; `shipper-main` literal class added to `<main>` in `ShipperShell.tsx`. `globals.css` gains pre-hydration rules inside `@media (min-width: 768px)`: `html.shipper-sidebar-collapsed .shipper-sidebar { width: var(--sidebar-width-collapsed) }` and `html.shipper-sidebar-collapsed .shipper-main { margin-left: var(--sidebar-width-collapsed) }`. Blocking script in `app/layout.tsx` extended to also apply `shipper-sidebar-collapsed` to `<html>` before first paint.

**Files changed:** `app/shipper/shipper.module.css` · `components/layout/ShipperShell.tsx` · `components/layout/ShipperShell.module.css` · `components/layout/ShipperSidebar.tsx` · `components/layout/ShipperSidebar.module.css` · `app/globals.css` · `app/layout.tsx`

---

### v1.72.46 (2026-06-01) — Plan actions and identity moved to app header

Plan header bar removed from page body. `plan.planNumber` parsed into parts (WK · vessel slug · voyage · version) via `planParts` useMemo using regex `/^(WK\d+)-(.+)-([A-Z]{2}\d+)-(\d+)$/`. `vesselHeaderSub` in Header now shows `planInfo` string instead of `activeVessel · activeVoyage`. Plan status badge added inline in subtitle via new `vesselHeaderStatus` CSS class. `planInfo` and `planStatus` props added to `Header` and `AppShell` and threaded from `page.tsx`. `headerActions` converted from const to `useMemo` — now includes Save Draft, Send to Captain / Mark as Sent, Delete, and LOCKED + New Draft buttons alongside the existing stat chips. `compactHeader` block (back arrow, plan number, status badge, all action buttons) removed from page body. `.statusBadge`, `.compactHeader`, `.backLink` etc. CSS classes removed; `.headerBtn`, `.headerBtnDanger`, `.headerLockedBadge`, `.headerSaveMsg` added.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css` · `components/layout/Header.tsx` · `components/layout/Header.module.css` · `components/layout/AppShell.tsx`

---

### v1.72.45 (2026-06-01) — Stats moved to header, statsBar removed

`headerActions` expanded to include UTIL% chip and (when `stabilityIndicators.length > 0`) stability chips: Displacement (MT), Trim, List, Fwd Draft, Aft Draft. `.statSep` vertical divider added between chip groups. `statsBar` block (Total Cargo, Stowed, Utilization, Displacement, GM, Trim, List, Fwd/Aft Draft + warning) removed from page body. Header font sizes bumped: `vesselHeaderTitle` 13→14px, `vesselHeaderSub` 11→12px; `statChip strong` 12→15px, letter-spacing 0.04→0.06em.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css` · `components/layout/Header.module.css`

---

### v1.72.44 (2026-06-01) — Page content shrinks when panels open

`.container` receives dynamic `paddingRight` inline style: `calc(660px + 2rem)` when both panels open (compartment shifted 280px + width 380px = 660px from right edge), `calc(420px + 2rem)` compartment only, `calc(280px + 2rem)` Unassigned only, `undefined` when neither. `transition: padding-right 0.22s ease-out` added to `.container` CSS to sync with panel slide-in animation.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css`

---

### v1.72.43 (2026-06-01) — Remove redundant Consignees block from panel

"Consignees:" label + name chip row removed from top of the compartment detail panel — same information is already shown in the CoolingSectionTopDown header chips. `sectionPositions`, `consigneeNames`, and `estimateLabels` variable declarations removed (exclusively used by the removed block).

**Files changed:** `app/stowage-plans/[id]/page.tsx`

---

### v1.72.42 (2026-06-01) — Remove internal close button and technical label from top-down view

`CoolingSectionTopDown` internal close button (×) and "Top-down · N×M" view label removed — the parent compartment detail panel already has a close button. `onClose` prop removed from `CoolingSectionTopDown` interface and all call sites. `cellPanelHeader` restructured: section ID and temp wrapped in `cellPanelHeaderLeft`; close button moved to top-right with `title="Close"`. `.cellPanelHeader`, `.cellPanelHeaderLeft`, `.cellPanelClose` CSS updated; dead `.cellPanelTitle` class removed.

**Files changed:** `components/stowage/CoolingSectionTopDown.tsx` · `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css`

---

### v1.72.41 (2026-06-01) — Two-line compact booking row layout

`cellPanelRow` redesigned from single horizontal row to two-line card: Line 1 (`cellPanelRowTop`) = POD dot · booking number · "N pal left"; Line 2 (`cellPanelRowBottom`) = cargo type · shipper · route · Assign button. `min-width` constraints removed (`cellPanelBookingNum` 130px, `cellPanelCargo` 100px, `cellPanelPallets` 70px) — these forced ~500px minimum row width causing overflow in the 380–420px panel. Row `onClick` selects the booking; Assign button uses `e.stopPropagation()`. `overflow-x: hidden` added to `.compartmentDetailScrollArea`.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css`

---

### v1.72.40 (2026-06-01) — Scrollable panel with collapsible booking list

Panel restructured as flex-column: `.compartmentDetailPanel` uses `overflow: hidden`; `.compartmentDetailScrollArea` child uses `flex: 1; overflow-y: auto`. `CoolingSectionTopDown .wrap` changed from `overflow: hidden` to `overflow: visible` (slide-down animation uses opacity/transform, not height). Eligible bookings section wrapped in collapsible `<div className={detailSection}>` with ▼/▶ toggle; `bookingListCollapsed` state added. New CSS: `.detailSection`, `.detailSectionHeader`, `.detailSectionCount`, `.detailSectionChevron`, `.detailSectionBody`.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css` · `components/stowage/CoolingSectionTopDown.module.css`

---

### v1.72.39 (2026-06-01) — Remove compartment hover/click tooltip from VesselProfile

Removed the inline overlay panel that appeared on hover/click over compartment cells showing consignee names and zone info. State variables (`hoveredId`, `selectedId`), derived values (`hovered`, `selected`, `detail`, `highlightZone`), `onMouseEnter`/`onMouseLeave` handlers, `setSelectedId` from `onClick`, `showCompartmentTooltip` and `consigneesBySection` props all removed. Cell opacity/stroke/strokeWidth simplified (hover/selected/inZone branches removed). Tooltip JSX block (lines 842–930) removed. CSS classes `.detailPanel`, `@keyframes fadeIn`, `.detailHeader`, `.detailId`, `.detailZone`, `.detailGrid`, `.detailItem`, `.detailLabel`, `.detailValue`, `.detailFactors`, `.detailFactorRow`, `.detailFactorLabel`, `.detailFactorValue`, `.detailShipments` removed.

**Files changed:** `components/vessel/VesselProfile.tsx` · `components/vessel/VesselProfile.module.css`

---

### v1.72.38 (2026-06-01) — Compartment panel UX fixes

Three fixes: (1) `.overlayWithPanel { right: 380px }` added to `UnassignedCargoPanel.module.css` — overlay stops before the compartment panel so clicks reach it; `compartmentPanelOpen?: boolean` prop added to `UnassignedCargoPanel`; z-index of `.compartmentDetailPanel` raised 850→910 (above overlay's 900). (2) Smooth exit animation: `@keyframes slideOutRight` + `.compartmentDetailPanelClosing` added; `detailPanelClosing` state + `closeDetailPanel()` function (180ms delay) added; both close paths (cellPanel ✕ and CoolingSectionTopDown `onClose`) now call `closeDetailPanel()`. (3) Sidebar collapse dispatch wrapped in `setTimeout(..., 10)` to synchronize with panel slide-in animation.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css` · `components/stowage/UnassignedCargoPanel.tsx` · `components/stowage/UnassignedCargoPanel.module.css`

---

### v1.72.37 (2026-06-01) — Confirm custom event approach for sidebar collapse

`AppShell.tsx` gains a `useEffect` that listens for `window.dispatchEvent(new CustomEvent('collapse-sidebar', { detail: { collapsed: true/false } }))`. Handler calls `setCollapsed()` which keeps React state, `localStorage`, and `html.sidebar-collapsed` class all in sync — the same path as `toggleSidebar()`. This ensures one click after panel close correctly toggles the sidebar rather than being silently ignored.

**Files changed:** `components/layout/AppShell.tsx`

---

### v1.72.36 (2026-06-01) — Clean sidebar collapse constants to module level

`SIDEBAR_KEY` and `HTML_CLASS` constants moved from inside the component function to module level (matching AppShell.tsx pattern). Old imperative CSS manipulation approach from v1.72.34–v1.72.35 replaced with single clean `useEffect`. `sidebarWasCollapsed` ref typed as `useRef<boolean>(false)`. `sidebarWasCollapsed.current = false` reset added in the `else` branch so the ref is always clean after panel close.

**Files changed:** `app/stowage-plans/[id]/page.tsx`

---

### v1.72.35 (2026-06-01) — Sidebar collapse via custom event (correct path)

`page.tsx` no longer manipulates `localStorage` or `document.documentElement.classList` directly. Instead dispatches `window.CustomEvent('collapse-sidebar')` with `{ detail: { collapsed: true/false } }`. `AppShell.tsx` receives the event and calls `setCollapsed()` through its own `toggleSidebar`-equivalent logic, keeping React state, localStorage, and CSS class in sync. `sidebarWasCollapsed` ref reads `localStorage.getItem('reefer-sidebar-collapsed')` to remember pre-panel state without writing it.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `components/layout/AppShell.tsx`

---

### v1.72.34 (2026-06-01) — Compartment detail as fixed right slide-over panel

`CoolingSectionTopDown` and the eligible bookings panel (`cellPanel`) moved from inline page flow into a `position: fixed; right: 0; width: 380px; z-index: 850; animation: slideInRight` panel. Panel shifts left (`right: 280px; width: 380px`) when `UnassignedCargoPanel` is also open via `.compartmentDetailPanelShifted`. `UnassignedCargoPanel` narrows to 280px (`.panelNarrow`) when `isNarrow` prop set (passed as `!!selectedSectionId`). Guard: `selectedSectionId && selectedSectionInfo` — panel only renders when a section is selected. `.unassignedButton` moved to header `headerRight` so it remains accessible when panel covers body area.

**Files changed:** `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css` · `components/stowage/UnassignedCargoPanel.tsx` · `components/stowage/UnassignedCargoPanel.module.css`

---

### v1.72.33 (2026-05-30) — Fix Request Booking link in /shipper/pending

`app/shipper/pending/page.tsx` line 95: the "Request Booking" `<Link>` had `href="/shipper/request"` with no query params. Fixed to `href={\`/shipper/request?voyageId=${item.voyageId}&contractId=${item.contractId}\`}` so the booking wizard opens at step 3 (cargo details) directly when clicked from a pending card — matching the behaviour of the Voyage Action Modal buttons added in v1.72.32.

**Files changed:** `app/shipper/pending/page.tsx`

---

### v1.72.32 (2026-05-30) — Pre-select voyage and contract in shipper wizards

**`/shipper/forecasts/new/page.tsx`** — adds `searchParams: Promise<{ voyageId?: string; contractId?: string }>` to the page component (Next.js 15 async params). Passes `initialContractId` and `initialVoyageId` to `<ForecastWizard>`.

**`ForecastWizard.tsx`** — two new optional props `initialContractId` and `initialVoyageId`. `step` initializer starts at `2` if `initialContractId` resolves to a known contract (falls back to `1` if not found). `selectedId` initializer sets the contract immediately. In step 2, the voyage row matching `initialVoyageId` receives a subtle blue-tint background (`rgba(59,130,246,0.07)`) to indicate the pre-selected voyage.

**`/shipper/request/page.tsx`** — same `searchParams` pattern, passes both IDs to `<RequestClient>`.

**`RequestClient.tsx`** — two new optional props. `step` initializer: both params present → 3; contract only → 2; neither → 1. `selectedContractId` and `selectedVoyageId` initialize from URL params when the contract is verified in `initialContracts`. Mount-only `useEffect` auto-fetches voyages for the pre-selected contract and pre-fills `cargoType` (from contract) and `quantity` (from weeklyHint) when starting at step 3. Falls back to step 1 with error if no voyages found. Step 2 shows "Loading voyages…" while the fetch is in progress.

**`VoyageActionModal.tsx`** — "Book →" link (HAS_ESTIMATE) and "Request Booking" link (NONE) both updated from `href="/shipper/request"` to `href={\`/shipper/request?voyageId=${voyage._id}&contractId=${c.contractId}\`}`.

**Files changed:** `app/shipper/forecasts/new/page.tsx` · `app/shipper/forecasts/new/ForecastWizard.tsx` · `app/shipper/request/page.tsx` · `app/shipper/request/RequestClient.tsx` · `app/shipper/VoyageActionModal.tsx`

---

### v1.72.31 (2026-05-30) — /shipper/pending button alignment fix

Both action buttons now always shown on every pending card — consistent card height regardless of `forecastStatus`.

- `HAS_ESTIMATE`: disabled `<button>` with class `.btnActionSmDone` shows "✓ Estimate sent" (transparent background, success-color border, opacity 0.7, cursor:default). Request Booking link active.
- `NONE`: `btnActionSmSecondary` "Submit Estimate" link + `btnActionSm` "Request Booking" link, both active.

"Estimate submitted" text badge removed (was rendered outside the button area; button now communicates the state). `.cardActions` added to CSS with `display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 12px` — `margin-top: auto` ensures buttons always sit at the bottom of the flex-column card. `.btnActionSmDone` added to CSS.

**Files changed:** `app/shipper/pending/page.tsx` · `app/shipper/shipper.module.css`

---

### v1.72.30 (2026-05-28) — Shipper portal voyage action modal

New `getVoyageSubmissionStatus(voyageId)` server action in `app/actions/shipper.ts`:
- Auth-gated to EXPORTER role; reads `shipperId`/`shipperCode` from JWT session.
- For each active contract where the shipper is a counterparty: checks for a non-cancelled
  booking (`HAS_BOOKING`), then for a SHIPPER_PORTAL or PLANNER_ENTRY forecast with
  `planImpact ≠ SUPERSEDED` (`HAS_ESTIMATE`), otherwise `NONE`.
- Returns `{ voyageId, contracts: [{ contractId, contractNumber, cargoType, weeklyEstimate, status }] }`.

New `app/shipper/VoyageActionModal.tsx` ('use client'):
- Exports `VoyageInfo` and `VoyagePortCall` interfaces reused by strip and schedules client.
- Backdrop (z-index 800) + modal panel (z-index 801); closes on backdrop click or Escape key.
- Header: voyage number (cyan mono), vessel name, departure date, route summary.
- Body: one `contractRow` per contract. Actions by status:
  - `NONE` → "Submit Estimate" (secondary) + "Request Booking" (primary) buttons.
  - `HAS_ESTIMATE` → amber "Estimate sent" badge + "Book →" button.
  - `HAS_BOOKING` → green "Booked" confirmation badge only.

New `app/shipper/UpcomingVoyageStrip.tsx` ('use client'):
- Extracted from `app/shipper/page.tsx`; manages `selectedVoyage` state.
- Each voyage card gains `voyageCardClickable` class; `onClick` opens modal.
- `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) for keyboard nav.

New `app/shipper/schedules/SchedulesClient.tsx` ('use client'):
- Replaces the inline server-rendered service/voyage map in `schedules/page.tsx`.
- Table rows gain `tableRowClickable` class; `onClick` opens `VoyageActionModal`.
- Server page now just fetches and passes `services` to `<SchedulesClient>`.

CSS additions to `app/shipper/shipper.module.css`: `.voyageCardClickable`,
`.tableRowClickable`, `.modalBackdrop`, `.voyageModal`, `.voyageModalHeader`,
`.voyageModalTitle`, `.voyageModalSub`, `.modalCloseBtn`, `.voyageModalBody`,
`.voyageModalLoading`, `.voyageModalEmpty`, `.contractRow`, `.contractRowInfo`,
`.contractRowNum`, `.contractRowCargo`, `.contractRowEst`, `.contractRowActions`,
`.statusDone`, `.statusEstimate`, `.btnActionSm`, `.btnActionSmSecondary`.

**Files changed:** `app/actions/shipper.ts` · `app/shipper/VoyageActionModal.tsx` (new) ·
`app/shipper/UpcomingVoyageStrip.tsx` (new) · `app/shipper/page.tsx` ·
`app/shipper/schedules/page.tsx` · `app/shipper/schedules/SchedulesClient.tsx` (new) ·
`app/shipper/shipper.module.css`

---

### v1.72.29 (2026-05-28) — Stowage plan cards fully clickable

Each plan card in `/stowage-plans` converted from `<div>` to `<Link>` wrapper navigating
to `/stowage-plans/[id]`. Server component with no nested interactive elements, so the
direct `<Link>` wrapper pattern is used. `display: block` added to
`.planCardClickable` in CSS (required because `<a>` is inline by default). Redundant
"Open Plan →" footer link removed. `?status=` filter param added to server component.

**Files changed:** `app/stowage-plans/page.tsx` · `app/stowage-plans/page.module.css`

---

### v1.72.28 (2026-05-28) — Vessel cards: MarineTraffic link style

MarineTraffic link on vessel cards updated to match the style used in `/voyages`:
Unicode `↗` replaced with 12×12 SVG external-link icon; CSS class renamed to `.mtLink`
(same naming convention); `.vesselImo` font size increased to 12px for readability;
`e.stopPropagation()` added so clicking the MT link does not trigger the stretched-link
card navigation; descriptive `title` attribute added.

**Files changed:** `app/vessels/page.tsx` · `app/vessels/page.module.css`

---

### v1.72.27 (2026-05-28) — Vessel cards fully clickable

Each vessel card made fully clickable using the **CSS stretched-link pattern** (required
because the card is a server component containing a nested `<a>` for MarineTraffic):
outer `<div>` kept; a `<Link position:absolute; inset:0; z-index:1>` added as first child;
inner MarineTraffic `<a>` given `position:relative; z-index:2` to remain independently
clickable above the stretched link. "View Profile →" text link removed. Keyboard nav
(`role="button"`, `tabIndex={0}`, `focus-visible` outline) added.

**Files changed:** `app/vessels/page.tsx` · `app/vessels/page.module.css`

---

### v1.72.26 (2026-05-28) — Voyage cards fully clickable

Each voyage card in `/voyages` converted to a clickable `<div>` using `useRouter.push()`
on click (client component — `useRouter` avoids the nested-anchor HTML5 validity issue
present with a direct `<Link>` wrapper when a MarineTraffic `<a>` is nested inside).
`role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space). `e.stopPropagation()` on
the MarineTraffic link. "View Details →" text link removed from card footer.

**Files changed:** `app/voyages/VoyagesClient.tsx` · `app/voyages/page.module.css`

---

### v1.72.25 (2026-05-28) — Agency dashboard KPI cards clickable

Extracted inline `StatCard` function to `app/dashboard-stat-card.tsx` ('use client').
Component accepts `href?: string` prop — when set, the card is clickable (useRouter.push),
shows a pointer cursor, and applies a hover translateY(−1px) effect.

Four cards wired up:
- Active Voyages → `/voyages?status=IN_PROGRESS,PLANNED`
- Pending Bookings → `/bookings?status=PENDING,STANDBY,PARTIAL`
- Plans in Draft → `/stowage-plans?status=DRAFT`
- Awaiting Captain → `/stowage-plans?status=READY_FOR_CAPTAIN,EMAIL_SENT`

`?status=` filter added to `BookingsClient` (comma-split `includes()` check) and
`/stowage-plans/page.tsx` (server-side `filter()` with `(filtered)` subtitle indicator).
CSS added to `app/page.module.css`: `.statCardClickable`, `.accent_blue`, `.accent_cyan`,
`.accent_yellow`, `.accent_warning`.

**Files changed:** `app/page.tsx` · `app/dashboard-stat-card.tsx` (new) ·
`app/page.module.css` · `app/bookings/BookingsClient.tsx` · `app/stowage-plans/page.tsx`

---

### v1.72.24 (2026-05-27) — Pending requests: HAS_ESTIMATE state

`getPendingRequestsForShipper()` now includes voyages that already have a
`SHIPPER_PORTAL` or `PLANNER_ENTRY` forecast, returning them as
`forecastStatus: 'HAS_ESTIMATE'` instead of skipping them. `CONTRACT_DEFAULT`
forecasts continue to be skipped (internal to agency). The `SpaceForecastModel`
query now fetches the `source` field in addition to `_id`.

**`/shipper/pending` page updates:**
- Cards with `HAS_ESTIMATE`: show an amber "Estimate submitted" badge and
  only the **Request Booking** button.
- Cards with `NONE`: show both **Submit Estimate** (`btnSecondary`) and
  **Request Booking** (`btnPrimary`) buttons.

**`KpiCards.tsx`:** `pendingRequestsHasEstimate` prop added. Sub-label is now
three-way: `0 → "All submissions up to date"` / all have estimate → `"Booking
pending · estimate sent"` / some missing → `"N awaiting submission"`.

**`app/shipper/page.tsx`:** passes `pendingRequestsHasEstimate` count to `<KpiCards>`.

**Files changed:** `app/actions/shipper.ts` · `app/shipper/pending/page.tsx` ·
`app/shipper/KpiCards.tsx` · `app/shipper/page.tsx`

---

### v1.72.23 (2026-05-27) — Fix /shipper/schedules voyage visibility

`getShipperSchedules()` in `app/actions/shipper.ts`:
- `departureDate >= now` filter removed.
- `status` filter changed from `$in ['PLANNED','ESTIMATED','CONFIRMED','IN_PROGRESS']`
  to `$nin ['COMPLETED','CLOSED','CANCELLED']`.
- Limit increased from 60 to 100.
- Post-query `visibleVoyages` filter added: finds the highest-`sequence` port call
  (final destination), reads `atd ?? etd ?? ata ?? eta` as the effective date, and
  keeps the voyage only if that date is missing or within the last 7 days
  (7-day grace period for recently completed voyages).

`app/shipper/schedules/page.tsx`: `COMPLETED` status badge was already present —
no change needed.

**Files changed:** `app/actions/shipper.ts`

---

### v1.72.22 (2026-05-27) — ATD ?? ETD departure logic in voyage query functions

**`getUpcomingVoyagesForService()`:** post-query ATD filter (lines ~407–418) updated
from `!polPc.atd` to full `atd ?? etd ?? null` logic — voyage excluded only when
the effective departure date exists and is in the past.

**`getPendingRequestsForShipper()`:** added `polPortCodes` (contracts matching current
service → their `originPort.portCode`) and `openVoyages` filter before the
booking/forecast loop. Port-call-level check uses `atd ?? etd`; falls back to
voyage-level `departureDate` when no load port calls are identified.

**Files changed:** `app/actions/shipper.ts`

---

### v1.72.21 (2026-05-27) — POL ATD ?? ETD filter for pending requests

`getPendingRequestsForShipper()`: after fetching voyages, added `openVoyages`
post-query filter that checks the shipper's loading port calls for ATD ?? ETD.
Voyages where the loading port has already departed (effective departure < now)
are excluded from pending requests. Fallback to voyage-level `departureDate`
when no load port calls can be identified by origin port code.

**Files changed:** `app/actions/shipper.ts`

---

### v1.72.20 (2026-05-27) — Fix voyage visibility in shipper portal

**`getUpcomingVoyagesForService()`:** status filter expanded from `$in ['PLANNED']`
to `$nin ['COMPLETED','CLOSED','CANCELLED']`; `departureDate >= now` condition
removed entirely — IN_PROGRESS voyages and those past departure date are now
visible.

**`getPendingRequestsForShipper()`:** same status expansion from
`$in ['PLANNED','IN_PROGRESS']` to `$nin ['COMPLETED','CLOSED','CANCELLED']`;
`departureDate >= now` condition removed.

**Files changed:** `app/actions/shipper.ts`

---

### v1.72.19 (2026-05-26) — Pending Requests: tighten filter, dedicated page

**Fix 1 — Remove CONTRACT_DEFAULT from `getPendingRequestsForShipper()`:**
Action now only returns voyages where no forecast document exists at all for
the shipper+voyage+contract combination. Any existing forecast (including
`CONTRACT_DEFAULT`) causes the voyage to be skipped with `continue`. The
`forecastStatus` field is removed from the return type and the pushed object.

**Fix 2 — `/shipper/pending` dedicated page (`app/shipper/pending/page.tsx`):**
New server component listing all pending voyage+contract pairs. Each card shows
voyage number, vessel, week chip, departure date, route (`LOAD ports → DISCHARGE
ports`), cargo type, and weekly contract estimate. Two action links per card:
- **Submit Estimate** → `/shipper/forecasts/new?voyageId=X&contractId=Y`
- **Request Booking** → `/shipper/request`
Empty state: "All caught up — no pending submissions".
New CSS classes in `shipper.module.css`: `.pendingGrid`, `.pendingCard`,
`.pendingCardTop`, `.pendingCardVoyage`, `.pendingCardVessel`, `.pendingCardWeek`,
`.pendingCardMeta`, `.pendingCardCargo`, `.pendingCardActions`, `.btnAction`.

**KpiCards.tsx updates:**
- Pending Requests card navigates to `/shipper/pending` (was `/shipper/forecasts?pending=1`)
- Sub-label: "Voyages awaiting your submission" / "All submissions up to date"
- Removed `pendingRequestsMissing` and `pendingRequestsDefault` props

### v1.72.18 (2026-05-26) — Shipper dashboard: KPI cards refactor

Extracted KPI summary grid into `app/shipper/KpiCards.tsx` (`'use client'` component).
Added a 5th card for **Pending Requests** (count from `getPendingRequestsForShipper()`).
All 5 cards are now clickable — each navigates to the relevant filtered list view via
`useRouter`. Removed the separate Pending Requests table section (added in v1.72.17);
the `getPendingRequestsForShipper()` call and `pendingRequests` variable are kept in
`page.tsx` to feed the KPI card count.

**CSS additions to `shipper.module.css`:** `.kpiCard` (hover + focus-visible states),
`.kpiLabel`, `.kpiValue` with colour variants `--blue/--green/--yellow/--muted`,
`.kpiWarning` (amber, when pendingRequestsCount > 0), `.kpiMuted`, `.kpiSub`.

### v1.72.17 (2026-05-26) — Shipper dashboard: Pending Requests section

New `getPendingRequestsForShipper()` server action in `app/actions/shipper.ts` and
matching section in the shipper dashboard `app/shipper/page.tsx`.

**Action logic:**
1. Finds all active contracts where the EXPORTER's `shipperId`/`shipperCode` appears
   in `counterparties`.
2. For each contract, queries upcoming voyages (`PLANNED` or `IN_PROGRESS`,
   `departureDate >= now`) for that service.
3. For each contract+voyage pair, skips if a non-cancelled booking already exists.
4. Checks `SpaceForecastModel` for the shipper+voyage+contract:
   - No forecast → `forecastStatus: 'NONE'`
   - `source: 'CONTRACT_DEFAULT'` → `forecastStatus: 'CONTRACT_DEFAULT'` (planner
     created; shipper hasn't weighed in)
   - `source: 'SHIPPER_PORTAL'` or `'PLANNER_ENTRY'` → skip (already actioned)
5. Returns NONE and CONTRACT_DEFAULT items sorted by `departureDate` ascending.
   Deduplicates by `voyageId+contractId` via Set.

**Dashboard section:**
- Rendered between Upcoming Voyages and Recent Bookings.
- Hidden when `pendingRequests` is empty (no section rendered at all).
- Table columns: VOYAGE · VESSEL · WEEK · SERVICE · ROUTE · CARGO · EST. PALLETS ·
  STATUS · Submit button.
- STATUS badge: amber "Contract default used" (`CONTRACT_DEFAULT`) or red "No estimate
  sent" (`NONE`).
- Submit → links to `/shipper/forecasts/new?voyageId=…&contractId=…`.
- Count pill (`sectionCount`) in section header shows number of pending items.

**New CSS classes in `shipper.module.css`:** `.sectionCount`, `.badgeWarning`,
`.badgeDanger`, `.btnGhostSm`, `.mutedText`.

`SpaceForecastModel` added to top-level import in `shipper.ts`.

**Files changed:** `app/actions/shipper.ts` · `app/shipper/page.tsx` ·
`app/shipper/shipper.module.css`

---

### v1.72.16 (2026-05-26) — Shipper portal table column improvements

Three table updates across the shipper portal:

1. **`/shipper/forecasts`** — CONTRACT column removed; VESSEL, WEEK, ROUTE, and CONSIGNEE
   columns added. New column order: VOYAGE · VESSEL · SERVICE · WEEK · ROUTE · CARGO ·
   CONSIGNEE · PALLETS · STATUS · SUBMITTED. WEEK derived from last 2 digits of
   `voyageNumber` (e.g. AC26020 → "Wk 20"). ROUTE shows `polPortCode → podPortCode`.

2. **`/shipper/bookings`** — VESSEL column added after SERVICE. `vesselName` field added
   to `ShipperBooking` interface. `getBookingsByShipperCode()` mapping extended with
   `vesselName` (denormalized field present since v1.46.0, was simply not mapped).

3. **`/shipper` dashboard — Recent Bookings** — VESSEL and WEEK columns added after VOYAGE.
   `recentBookings` mapping in `getShipperDashboard()` extended with `vesselName`.
   New column order: BOOKING # · VOYAGE · VESSEL · WEEK · CARGO · CONSIGNEE · REQ. ·
   CONF. · ROUTE · STATUS.

**Files changed:** `app/shipper/forecasts/page.tsx` · `app/shipper/bookings/BookingsClient.tsx` ·
`app/shipper/page.tsx` · `app/actions/booking.ts` · `app/actions/shipper.ts`

---

### v1.72.15 (2026-05-26) — Fix SpaceForecast serialization across server→client boundary

Two sources of `previousForecastId: {buffer: ...}` warnings fixed in `app/actions/space-forecast.ts`:

1. **`getMyForecasts()`** — was using `.lean()` but returning documents via a TypeScript-only
   cast, then (in v1.72.15 attempt 1) switched to an explicit field mapping that still omitted
   `previousForecastId`. Fix: replaced the explicit mapping with
   `JSON.parse(JSON.stringify(forecasts))` on the raw `.lean()` result — handles ALL ObjectId
   and Date fields automatically, including any future schema additions.

2. **`_createForecastCore()`** — was returning `forecastDoc.toObject()` which includes raw
   BSON `ObjectId` instances for every reference field (`previousForecastId`, `contractId`,
   `voyageId`, `shipperId`). `createSpaceForecast()` is a `'use server'` action called
   directly from `ForecastWizard.tsx` (`'use client'`); Next.js must serialize the full
   return value across the boundary even when the client only reads `result.success`. Fix:
   `JSON.parse(JSON.stringify(forecastDoc.toObject()))` before returning.

`app/shipper/forecasts/page.tsx` (pure server component) and
`app/shipper/forecasts/new/page.tsx` (already applies `JSON.parse/stringify` on all props
before crossing to `ForecastWizard`) were not the source and required no changes.

**Files changed:** `app/actions/space-forecast.ts`

---

### v1.72.14 (2026-05-25) — Fix CAPACITY chip in plan detail header

Three fixes to `app/stowage-plans/[id]/page.tsx`:

1. **CAPACITY chip showed total booked pallets instead of vessel physical capacity.**
   `totalPallets` was summing `booking.totalQuantity` across all bookings — that is total
   cargo quantity, not vessel capacity. For Baltic Klipper the chip was showing 4,150 instead
   of 5,385. Fix: `totalPallets` now derives from `vesselProfileData[].palletsCapacity` (the
   same source as `compartmentCapacities`), each entry already containing
   `Math.floor(sqm / sfactor)` from the historical or design stowage factor.

2. **`stowedPallets` excluded estimate positions.**
   FORECAST-* and CONTRACT-ESTIMATE-* cargo positions were not counted in the LOADED chip or
   Utilization %. Fix: `stowedPallets` now sums both real booking assignments
   (`bookings.reduce(assignedQty)`) and estimate positions filtered from `planCargoPositions`
   by `bookingId` prefix.

3. **Utilization % used hardcoded `4840`.**
   Replaced with `totalPallets > 0 ? Math.round((stowedPallets / totalPallets) * 100) : 0`
   (includes division-by-zero guard).

**Files changed:** `app/stowage-plans/[id]/page.tsx`

### v1.72.13 (2026-05-25) — Sync SpaceForecasts when booking quantity changes

Root cause: `updateBookingQuantity()` had no code touching `SpaceForecastModel`. When a planner reduced a booking's `confirmedQuantity` or `requestedQuantity`, the related forecast's `estimatedPallets` stayed at the original value, causing the capacity bar estimated segment to show the old number even after the booking was updated.

Additional contributing factor: `createBookingFromContract()` marks forecasts as `REPLACED_BY_BOOKING` but never updates their `estimatedPallets`; CONTRACT_DEFAULT forecasts whose `shipperId` did not match the booking's shipperId at creation time stayed `INCORPORATED` with their original pallet count.

Fix: after `booking.save()` in `updateBookingQuantity()`, a fire-and-forget block finds all `SpaceForecast` documents for the same `contractId + voyageId + shipperId/shipperCode` where `planImpact` is in `['REPLACED_BY_BOOKING', 'INCORPORATED']` and:
- Active booking (qty > 0, not cancelled): sets `estimatedPallets = effectiveQty` (confirmedQuantity if agency edit, else requestedQuantity). `planImpact` is left unchanged.
- Booking cancelled or zeroed: looks up `contract.counterparties[].weeklyPallets` for the shipper and sets `estimatedPallets = weeklyPallets, planImpact = 'PENDING_REVIEW'` — restoring the forecast to its pre-booking state.

`estimatedPalletsTotal` aggregations in `getVoyages()` and `getStowagePlans()` already correctly exclude `REPLACED_BY_BOOKING` — no change needed there.

**Files changed:** `app/actions/booking.ts`

### v1.72.12 (2026-05-25) — CapacityBar capacity consistency audit (no code changes)

Audited all four `<CapacityBar>` call sites for `totalCapacity` source consistency:

- **Dashboard Recent Voyages** (`app/page.tsx`): `palletsCapacity` via `getVoyages()` — dynamic formula ✅
- **Stowage Plans list** (`app/stowage-plans/page.tsx`): `palletsTotal` from local `sqm÷DSF` reduce ✅
- **Voyages list** (`app/voyages/VoyagesClient.tsx`): `palletsCapacity` via `getVoyages()` — dynamic formula ✅
- **Plan detail header** (`app/stowage-plans/[id]/page.tsx`): was using booking sum ❌ — fixed in v1.72.14

Verified the v1.71.0 dynamic calculation (`floor(sqm / designStowageFactor)` summed over
`temperatureZones.coolingSections`) is intact in `getVoyages()`, `getAdminVoyages()`, and
`voyageCapacityMap` in `app/page.tsx`. No corrections needed — audit only.

**Files changed:** none

### v1.72.6 (2026-05-24) — Remove thousands separators from all numeric displays

Replaced all bare `.toLocaleString()` calls on pallet/capacity/sqm numbers with `String(n)` across 6 files (11 call sites). The two date-formatting `.toLocaleString('en-US', { … })` calls in `stowage-plans/[id]/page.tsx` and `VoyageDetailClient.tsx` are untouched. The optional-chaining cases in `AdminClient.tsx` (`?.toLocaleString()`) are rewritten as `value != null ? String(value) : undefined / '—'` to preserve the null-guard semantics.

### v1.72.5 (2026-05-24) — Capacity bar visibility + sidebar slide animation

- **Fix 1 (Capacity bar):** Thin progress bar in all compartment cells increased from 2 px to 3 px; track opacity raised from 0.08 to 0.15; colors made more vivid (`#4ade80` / `#fbbf24` / `#f87171`); fill rect gains `filter: brightness(1.2)`.
- **Fix 2 (Sidebar animation):** `UnassignedCargoPanel` gains `slideIn` (0.22 s ease-out) and `slideOut` (0.18 s ease-in) CSS keyframe animations. A `closing` state delays `onClose()` by 180 ms so the exit animation completes before unmount. The overlay becomes `pointer-events: all` with a transparent background — clicking outside the panel triggers `handleClose()`. The panel uses `e.stopPropagation()` to block overlay clicks from registering inside it.

### v1.72.4 (2026-05-24) — Visual improvements to vessel profile and plan header

#### v1.72.4 — Five visual polish fixes

- **Fix 1 (Hold totals):** Below each "Hold N" label in the deck strip, a second SVG text line now shows `loaded / capacity` totals summed across all compartment levels in that hold. Only rendered when at least one value is non-zero.
- **Fix 2 (Thin progress bar):** A 2 px left-to-right capacity bar is now rendered at the very bottom edge of every hull compartment cell and every deck (FC/UPD) cell. Color thresholds: green < 75 %, amber 75–90 %, red > 90 %. The original volumetric (bottom-up fill) bar is preserved.
- **Fix 3 (FC full width):** 1FC/nFC cells no longer use `FC_WIDTH_RATIO = 0.6`; they now match the full hold column width like all other levels. Only UPD retains its narrowed width.
- **Fix 4 (Header stat chips):** A `headerActions` ReactNode prop added to `VesselProfile`. In the plan detail page, the vessel profile header right side now shows LOADED · CAPACITY · AVAILABLE chips plus a "⊕ Unassigned [N]" button that opens the cargo sidebar in browse mode (no target compartment).
- **Fix 5 (POD legend centered):** `.podLegend` gains `justify-content: center`. `.podLegendDot` changed from `border-radius: 2px` to `border-radius: 50%` for proper circle dots.

### v1.72.2 (2026-05-24) — Unassigned Cargo Sidebar (Step 2 of manual stowage workflow)

#### v1.72.2 — Slide-over panel for assigning unplaced bookings to a compartment

Right-clicking a compartment and choosing "Add Cargo" opens a 360 px slide-over panel listing all bookings that still have unplaced pallets. Selecting a booking expands an assign sub-panel with a number input + range slider clamped to `min(remaining pallets, available capacity in target compartment)`. Clicking "Assign" adds the position optimistically to `planCargoPositions`, updates `bookings.assignments` in memory, and immediately calls `saveCargoAssignments` to persist — showing a success/error flash on the existing save-message slot. The panel's overlay uses `pointer-events: none` so the main SVG/page is not blocked; only the panel itself captures events.

**Changes:**
- `components/stowage/UnassignedCargoPanel.tsx` (new): slide-over with filter tabs (All / Not placed / Partial), full-text search (booking number, shipper, consignee, POL, POD), per-booking progress bar, collapsible assign sub-panel.
- `components/stowage/UnassignedCargoPanel.module.css` (new): panel, header, cards, assign sub-panel styles.
- `app/stowage-plans/[id]/page.tsx`:
  - Import `UnassignedCargoPanel` and `UnassignedBooking`.
  - `unassignedPanelOpen` + `unassignedTargetCompartment` state added.
  - `unassignedOrPartialBookings` useMemo derived from `bookings` state.
  - `handleAssignFromPanel`: appends new position to `planCargoPositions`, updates `bookings.assignments`, calls `saveCargoAssignments` immediately; rolls back on failure.
  - Context menu `onAddCargo` stub replaced with real handler.
  - `<UnassignedCargoPanel>` JSX rendered before context menu.

**Not changed:** booking roster, stowage engine, server actions (beyond `saveCargoAssignments` already in use), `VesselProfile.tsx`.

**Files changed:** `components/stowage/UnassignedCargoPanel.tsx` (new) · `components/stowage/UnassignedCargoPanel.module.css` (new) · `app/stowage-plans/[id]/page.tsx` · `docs/PROJECT_STATUS.md`

---

### v1.72.1 (2026-05-24) — Context menu trigger changed from left-click to right-click

#### v1.72.1 — Separate onCompartmentClick (left) and onCompartmentContextMenu (right-click)

`onCompartmentClick` reverted to `(compartmentId: string) => void` — left-click handles selection only. New `onCompartmentContextMenu?: (compartmentId, assignment, mouseEvent)` prop added for right-click. Both deck-strip and hull `<g>` elements in `VesselProfile.tsx` now carry two separate handlers: `onClick` (selection only) and `onContextMenu` (e.preventDefault() + context menu open). `page.tsx` updated to match: `onCompartmentClick` back to simple toggle; `onCompartmentContextMenu` carries the context menu state setter.

**Files changed:** `components/vessel/VesselProfile.tsx` · `app/stowage-plans/[id]/page.tsx` · `docs/PROJECT_STATUS.md`

---

### v1.72.0 (2026-05-24) — Compartment context menu (Step 1 of manual stowage workflow)

#### v1.72.0 — Right-click/click context menu on VesselProfile compartment cells

First step of the manual stowage workflow. Clicking any occupied compartment in the
plan detail SVG now opens a positioned context menu with four actions: Transfer Cargo,
Add Cargo, Reduce / Cancel Cargo, and Details. Steps 2–5 (modals/sidebars for each
action) are stubbed as `console.log` TODOs pending future implementation.

**Changes:**
- `lib/vessel-profile-data.ts` (via `VesselProfileProps`): `onCompartmentClick` extended
  to pass `assignment: VoyageTempAssignment | undefined` and `mouseEvent: { x, y }` so
  callers receive the full cell data and viewport coordinates at click time.
- `components/vessel/VesselProfile.tsx`: both deck-strip and hull `<g>` `onClick` handlers
  updated to `(e) =>` and call `onCompartmentClick?.(comp.id, comp.assignment, { x: e.clientX, y: e.clientY })`.
- `components/stowage/CompartmentContextMenu.tsx` (new): fixed-position context menu
  component; header shows cargo label, hold/level, set temperature; four action buttons
  (Transfer, Add, Reduce, Details) with `isLocked` / `isEmpty` / `isFull` guards;
  viewport-clamp `useEffect` repositions menu if it would overflow right or bottom edge;
  backdrop `<div>` closes menu on outside click.
- `components/stowage/CompartmentContextMenu.module.css` (new): dark menu styles using
  design tokens; `menuItemDanger` variant for the Reduce action.
- `app/stowage-plans/[id]/page.tsx`:
  - Import `CompartmentContextMenu` and `ContextMenuCompartment`.
  - `contextMenu` state added (`{ compartment, position } | null`).
  - Escape key `useEffect` closes the menu.
  - `onCompartmentClick` handler updated: still toggles `selectedSectionId` and clears
    highlights; also opens context menu when `assignment` is present (empty compartments
    do not trigger the menu).
  - Context menu rendered after all modals, before `</AppShell>`, wired to stub handlers.

**Not changed:** stowage engine, server actions, Python optimizer, any schema.

**Files changed:** `components/vessel/VesselProfile.tsx` · `components/stowage/CompartmentContextMenu.tsx` (new) · `components/stowage/CompartmentContextMenu.module.css` (new) · `app/stowage-plans/[id]/page.tsx` · `docs/PROJECT_STATUS.md`

---

### v1.71.9 (2026-05-24) — Optimizer loading UX improvements

#### v1.71.9 — Cancel button, navigation warning, and elapsed timer on optimizer loading card

Three UX improvements to the loading state of `/stowage-plans/optimize`:

- **Cancel button**: a `✕ Cancel` button in the loading card aborts the in-flight fetch (`abortRef.current?.abort()`), stops the health-check poll, and returns to the idle state. The existing AbortError handler in `runOptimizer` returns silently, leaving the phase as 'idle' set by the cancel handler.
- **Navigation warning banner**: an amber full-width banner appears at the top of the page while the optimizer is running, warning that navigating away will lose results.
- **Elapsed time counter**: a large `MM:SS` display in the loading card shows how long the solve has been running. Driven by a `useEffect` on `phase` that starts a 1-second interval when `phase === 'loading'` and clears it on any phase change or unmount.

**Files changed:** `app/stowage-plans/optimize/page.tsx` · `app/stowage-plans/optimize/optimize.module.css` · `docs/PROJECT_STATUS.md`

---

### v1.71.8 (2026-05-24) — Restrict Advanced Optimize to first plan version only

#### v1.71.8 — Advanced Optimize blocked for voyages that already have a plan

Advanced Optimize (`/stowage-plans/optimize`) now enforces a first-plan-only restriction. Using the OR-Tools optimizer on a revision would silently discard any temperature configuration and cargo placement from the prior plan, so subsequent revisions must be done manually via the plan detail page (`copyStowagePlan`).

**Changes:**
- `app/stowage-plans/optimize/page.tsx`:
  - On mount, calls `getLatestPlanInfoForVoyages()` after loading the voyage list.
  - Auto-selects the first voyage without an existing plan.
  - Voyage selector: options for voyages with an existing plan are disabled and prefixed with `⚠` + plan number label `(manual revision only)`.
  - Amber warning shown below the selector when the selected voyage has an existing plan.
  - Run Optimizer button disabled when `latestPlanMap[selectedId]` is set.
  - `runOptimizer()` has a hard guard: sets phase=error with a descriptive message if the voyage already has a plan, before calling the Python engine.
- `app/actions/stowage-plan.ts` (`savePythonPlan()`):
  - Server-side defense-in-depth guard: checks for any non-cancelled plan for the voyage before creating a new one; returns `{ success: false, error: '...' }` if found.

**Not changed:**
- `StowagePlanWizard.tsx` — Auto-Generate already handles this correctly: when `isRevision && latestPlan`, `handleCreatePlan` calls `copyStowagePlan` (copy the prior plan) instead of `autoGenerateSinglePlan` (engine run). The engine is never invoked for a revision via the wizard.
- `AutoGenerateButton.tsx`, `AdvancedOptimizeButton.tsx` — list-page buttons unchanged; restriction enforced inside each flow.

**Files changed:** `app/stowage-plans/optimize/page.tsx` · `app/actions/stowage-plan.ts` · `docs/PROJECT_STATUS.md`

---

### v1.71.2–v1.71.7 (2026-05-22) — CargoProduct collection · DB-driven optimizer temps · cargoType validation · fill-ratio balance

#### v1.71.2 — CargoProduct collection + Admin tab

`CargoProductSchema` introduced with fields: `code`, `name`, `shortLabel`, `temperature` (°C), `active`. 9 products seeded: BAN (13°C), OBAN (13°C), PINE (7°C), PLAN (13°C), AVOC (6°C), GRAPE (−1°C), CITRUS (5°C), MANGO (10°C), PAPA (10°C). Admin Cargo Products tab added (12th tab). Contract edit modal cargo type dropdown is now DB-driven from the `CargoProduct` collection instead of a hardcoded enum. `updateCargoProduct()` supports temperature field updates.

**Files changed:** `lib/db/schemas.ts`, `app/actions/cargo-product.ts`, `app/admin/` (Cargo Products tab), seed: `scripts/seed-cargo-products.ts`

#### v1.71.3 — savePythonPlan() MAJORITY_RULE temperature derivation + contract.ts cargoType fix

`savePythonPlan()` now derives `coolingSectionStatus` from cargo product temperatures — MAJORITY_RULE logic assigns the dominant `CargoProduct.temperature` (weighted by pallet quantity) to each vessel temperature zone. Zones with no known cargo type get `assignedTemperature: undefined`. `CargoTypeSchema` in `contract.ts` replaced with `z.string().min(1)` (was `z.enum([19 values])`). `modalError` CSS updated with `word-break` and `overflow-wrap` to prevent long error strings from breaking the layout.

**Files changed:** `app/actions/stowage-plan.ts`, `app/actions/contract.ts`, CSS

#### v1.71.4 — solver.py CARGO_TEMP_RANGES short code entries

`CARGO_TEMP_RANGES` updated — short `CargoProduct` codes (BAN, OBAN, PLAN, PINE, PAPA, MANGO, AVOC, CITRUS, GRAPE) added as primary keys alongside legacy names. Without this fix, `get_temp_range()` fell back to `(0, 4)` for all cargo in current bookings, silently disabling temperature zone grouping (Constraint 5).

**Files changed:** `stowage-optimizer/solver.py`

#### v1.71.5 — solver.py DB-driven cargo temperature lookup

`load_voyage_data()` now queries the `cargoProducts` collection (`active: True`) and builds `cargo_temp_map` keyed by product code with ±1°C tolerance window (e.g. BAN → (12, 14), PINE → (6, 8)). `build_cargo_items()` accepts `cargo_temp_map` and uses it preferentially, falling back to `CARGO_TEMP_RANGES`, then to `(0, 25)` wide range for unknowns. `get_temp_range()` fallback changed from `(0, 4)` to `(0, 25)`.

**Files changed:** `stowage-optimizer/solver.py`

#### v1.71.6 — cargoType validation fully migrated off hardcoded enums

`CargoTypeSchema` in `booking.ts` replaced with `z.string().min(1)` (was `z.enum([20 legacy values])`). `SpaceForecastSchema.cargoType` Mongoose enum removed from `lib/db/schemas.ts` (now plain `{ type: String, required: true }`). `contract.ts` was already fixed in v1.71.3. `space-forecast.ts` has no Zod cargoType validation (derives cargoType from contract doc). `types/models.ts` `CargoType` union and `temperature.ts` `CARGO_TEMP_RANGES` are lookup tables — left unchanged.

**Files changed:** `app/actions/booking.ts`, `lib/db/schemas.ts`

#### v1.71.7 — solver.py fill-ratio variance balance objective

Balance objective replaced with fill-ratio variance across all holds — for each unique `polSeq` departure, per-hold deviation = |fill_ratio_h − avg_fill_ratio| computed via integer cross-multiplication (`hold_pallets × total_capacity − total_aboard × cap_h`) normalized to pallet scale via `AddDivisionEquality(dev, dev_scaled, total_capacity)`. `compute_metrics()` now returns `holdFillRatios` dict and `balance_dev` as a fraction. `build_and_solve()` prints per-hold fill percentages and balance deviation. AC26020 run: 0.03–0.07% balance deviation across all 5 configs. Utilization 57–65% (lower than previous ~91% due to temperature zone separation now correctly enforcing BAN/PINE into separate zones — see PENDING BACKLOG #5).

**Files changed:** `stowage-optimizer/solver.py`

---

### v1.69.4–v1.71.1 (2026-05-20) — DEMO_AGENT role · booking deadline · capacity formula · serviceFilter guards · capacity bar unification

#### v1.69.4 — fastapi + uvicorn in requirements.txt

Added `fastapi` and `uvicorn[standard]` to `stowage-optimizer/requirements.txt`. The Python optimizer environment can now be fully reproduced with `pip install -r requirements.txt`.

**Files changed:** `stowage-optimizer/requirements.txt`

#### v1.69.5 — AdvancedOptimizeButton service health indicator

`AdvancedOptimizeButton.tsx` polls `GET /health` every 30 seconds. A colored dot on the button indicates service state: green (online), red (offline), gray (checking). Button is disabled and shows the uvicorn startup command in its tooltip when the service is offline.

**Files changed:** `app/stowage-plans/AdvancedOptimizeButton.tsx`

#### v1.69.6 — Manual section 7.2 reorganised

Agency manual `MANUAL_DRAFT_AGENCY.md` section 7.2 updated: Advanced Optimize (OR-Tools) is now Option A (Recommended), Auto-Generate is Option B (Quick Plan), Manual Plan is Option C. Section 7.9 retained as technical reference for the Python service.

**Files changed:** `docs/MANUAL_DRAFT_AGENCY.md`

#### v1.70.0 — Booking deadline + forecast expiration

- `VoyageSchema` gains `bookingDeadline: Date` (optional).
- `SpaceForecast.planImpact` enum gains `EXPIRED`.
- `StowagePlanSchema` gains `expiredForecasts: [ObjectId ref SpaceForecast]`.
- New server actions: `updateVoyageDeadline()` (voyage.ts), `expireForecasts()` (space-forecast.ts), `dismissExpiredForecasts()` (space-forecast.ts).
- `BookingDeadlineEditor` component in `VoyageDetailClient.tsx` — editable date field with inline save; shows "No deadline set" when empty.
- "⏱ Expire Estimates" button on voyage detail page (PLANNER/ADMIN only) — appears when `bookingDeadline` has passed; marks active SHIPPER_PORTAL / PLANNER_ENTRY / CONTRACT_DEFAULT forecasts as EXPIRED.
- Amber banner on stowage plan detail lists shipper names whose forecasts have expired; "Dismiss" clears each entry.
- `autoGenerateSinglePlan` already excludes EXPIRED forecasts — no change needed.
- `scripts/cleanup-expired-forecasts.ts` for manual DB cleanup.

**Files changed:** `lib/db/schemas.ts` · `app/actions/voyage.ts` · `app/actions/space-forecast.ts` · `app/voyages/[id]/VoyageDetailClient.tsx` · `app/stowage-plans/[id]/page.tsx` · `scripts/cleanup-expired-forecasts.ts` (new)

#### v1.70.1–v1.70.3 — DEMO_AGENT role

New role for read-only demos. Sees all planner pages with all write buttons visible but disabled (opacity 0.4, cursor not-allowed). Cannot create, edit, or delete any data.

- Added to Mongoose role enum (`lib/db/schemas.ts`), TypeScript union (`types/models.ts`, `types/next-auth.d.ts`), Zod `ROLES` array (`app/actions/user.ts`).
- Added to sidebar `getVisibleItems()` — same nav as SHIPPING_PLANNER (all pages except `/admin`).
- Added to all `roleLabel` maps: `Header.tsx`, `lib/email.ts`, `app/account/page.tsx`, `app/shipper/account/page.tsx`.
- Middleware: DEMO_AGENT passes through to all planner routes; `/admin` remains blocked.
- 41 WRITE server action guards block DEMO_AGENT by omission (no change needed).
- `getAdminBookings()` READ guard explicitly includes DEMO_AGENT.
- `AutoGenerateButton` and `AdvancedOptimizeButton` accept `isDemo` prop; disabled when true.
- `+ New Voyage`, `+ New Plan` links replaced with disabled `<button>` elements for DEMO_AGENT.
- `canEdit` excludes DEMO_AGENT in `stowage-plans/[id]/page.tsx` and `voyages/[id]/page.tsx`.
- Demo Agent added to USER_ROLES array in `AdminClient.tsx`.

**Files changed (13):** `lib/db/schemas.ts` · `types/models.ts` · `types/next-auth.d.ts` · `app/actions/user.ts` · `app/actions/booking.ts` · `components/layout/Sidebar.tsx` · `components/layout/Header.tsx` · `lib/email.ts` · `app/account/page.tsx` · `app/shipper/account/page.tsx` · `app/voyages/page.tsx` · `app/stowage-plans/page.tsx` · `app/stowage-plans/AutoGenerateButton.tsx` · `app/stowage-plans/AdvancedOptimizeButton.tsx` · `app/stowage-plans/[id]/page.tsx` · `app/voyages/[id]/page.tsx` · `app/voyages/[id]/VoyageDetailClient.tsx` · `app/bookings/BookingsClient.tsx` · `app/admin/AdminClient.tsx`

#### v1.70.4–v1.70.7 — serviceFilter access guards on detail pages

`getVoyageById()` and `getStowagePlanById()` were previously open by ID with no auth check. Now both verify that `voyage.serviceCode` is in the caller's `serviceFilter` (ADMIN/SUPERUSER bypass; empty serviceFilter = no restriction). If `serviceCode` is missing on the document, access is allowed (v1.70.7 — missing data not treated as a security violation). v1.70.5–v1.70.6 iterated to fix a fragile double-query: `voyageId` is already populated before the check, so `serviceCode` is read directly from the populated object.

**Files changed:** `app/actions/voyage.ts` · `app/actions/stowage-plan.ts`

#### v1.70.8 — + New Voyage disabled for DEMO_AGENT

`app/voyages/page.tsx`: `+ New Voyage` button renders as a disabled `<button style={{ opacity: 0.4, cursor: 'not-allowed' }}>` for DEMO_AGENT instead of an active `<Link>`.

**Files changed:** `app/voyages/page.tsx`

#### v1.70.9 — Pallet capacity formula corrected (× → ÷)

All UI capacity calculations corrected from `sqm × designStowageFactor` (wrong) to `floor(sqm / designStowageFactor)` (correct). `designStowageFactor` is expressed in m²/pallet (area per pallet, e.g. 1.32 m²/pallet), so it is a divisor. Baltic Klipper 1FC: 757 → 434 pallets; total vessel: 9,386 → 5,385 pallets (now matches Python optimizer). The engine (`assign.ts`) and plan detail compartment capacities were already dividing — all paths now consistent. Type comment in `lib/stowage-engine/types.ts` corrected.

**Files changed:** `app/stowage-plans/page.tsx` · `app/vessels/[id]/page.tsx` · `components/vessel/VesselProfile.tsx` · `lib/stowage-engine/types.ts`

#### v1.71.0 — Dashboard capacity bars: dynamic calculation from cooling sections

`getVoyages()` and `getAdminVoyages()` now calculate `palletsCapacity` dynamically: `vessel.temperatureZones.coolingSections.reduce(sum + floor(sqm / designStowageFactor))`. Both populate selects extended to include `temperatureZones`. Falls back to `vessel.capacity.totalPallets` if zones not populated. Eliminates reliance on the manually-entered `totalPallets` field (often stale).

**Files changed:** `app/actions/voyage.ts`

#### v1.71.1 — Voyages list: CapacityBar replaces inline UtilizationBar

Inline `UtilizationBar` function deleted from `VoyagesClient.tsx`. Replaced with shared `<CapacityBar size="sm" showLabel={false}>` component — adds the estimated pallets (striped) segment. `estimatedPalletsTotal` was already returned by `getVoyages()` but discarded; `DisplayVoyage` interface extended with `estimatedPallets`; `app/voyages/page.tsx` now maps `estimatedPalletsTotal` into the display object.

**Files changed:** `app/voyages/VoyagesClient.tsx` · `app/voyages/page.tsx`

---

### v1.69.0–v1.69.3 (2026-05-16) — Service-based vessel access control + Python optimizer Fase 2 + solver bug fixes

#### v1.69.0 — Service-based vessel access control

`getVessels()` in `app/actions/vessel.ts` now applies row-level filtering for
SHIPPING_PLANNER role. Filter chain: JWT `serviceFilter[]` → `ServiceModel.find({ serviceCode: $in })` → union of `vesselPool` IDs → `VesselModel.find({ _id: $in })`.
ADMIN and SUPERUSER roles bypass the filter and see all vessels. Empty `serviceFilter`
(user with no offices assigned) returns an empty list.

**Files changed in v1.69.0:**
`app/actions/vessel.ts`

#### v1.69.1 — Python optimizer Fase 2: FastAPI microservice + UI carousel

New FastAPI service wrapping the CP-SAT solver:
- `api.py`: GET `/health` → `{"status":"ok","version":"1.0.0"}`;
  POST `/optimize` → runs `build_and_solve()` in a thread-pool executor (CPU-bound),
  returns full 5-solution JSON; CORS enabled for `localhost:3000` and `192.168.10.45:3000`.
- `solver.py` refactored: three public functions (`load_voyage_data()`,
  `build_and_solve()`, `format_solutions()`) importable from `api.py`; `main()` and CLI
  path unchanged; `if __name__ == '__main__': main()` guard preserved.
- `StowagePlanSchema.generationMethod` enum constraint removed — now a free string
  to support `PYTHON_OPTIMIZER_<LABEL>` values alongside `AUTO`/`MANUAL`/`REVISED`.

Start service: `cd stowage-optimizer && venv\Scripts\activate && uvicorn api:app --port 8001 --reload`

New UI at `/stowage-plans/optimize` (`'use client'`):
- Voyage selector populated from `getVoyagesForPlanWizard()`.
- Calls `POST $NEXT_PUBLIC_PYTHON_ENGINE_URL/optimize`; health-check polling every 2 s
  during solve; user-friendly error message if service is not running.
- 5-plan carousel: metrics card (placed pallets, overstow, balance, compactness) +
  cargo positions table grouped by hold / section, POD cells colored via `getPodColor()`.
- "Save this Plan" calls `savePythonPlan()` server action → redirects to `/stowage-plans/[id]`.
- `savePythonPlan()`: ADMIN / SHIPPING_PLANNER only; builds `planNumber` via
  `generatePlanNumber()`; `generationMethod: PYTHON_OPTIMIZER_<LABEL>`; `status: ESTIMATED`.

**Files created/changed in v1.69.1:**
`stowage-optimizer/api.py` (new) · `stowage-optimizer/solver.py` ·
`stowage-optimizer/requirements.txt` · `stowage-optimizer/README.md` ·
`app/stowage-plans/AdvancedOptimizeButton.tsx` (new) ·
`app/stowage-plans/optimize/page.tsx` (new) ·
`app/stowage-plans/optimize/optimize.module.css` (new) ·
`app/stowage-plans/page.tsx` · `app/actions/stowage-plan.ts` ·
`lib/db/schemas.ts` · `.env.local`

#### v1.69.2 — CSP fix for Python optimizer service

`connect-src` in `next.config.ts` extended to include `http://localhost:8001`.
Required to allow browser→FastAPI `fetch()` calls from the optimize page without
a Content Security Policy violation.

**Files changed in v1.69.2:**
`next.config.ts`

#### v1.69.3 — Critical solver bug fixes

Three bugs confirmed via `_diag.py` temporary diagnostic script against
`plan_AC26020_20260515_172209.json`:

1. **Capacity formula** (`build_sections()`): `math.floor(sqm * dsf)` →
   `math.floor(sqm / dsf)`. DSF is sq-metres per pallet (not pallets per sq-metre).
   Effect: 1FC corrected from 757 to 434 pallets; total vessel 9,386 → 5,385 (matches UI).

2. **POL monotonicity direction** (`solve()` Constraint 3): was checking
   `(i_early, j_lo) in compat and (i_late, j_hi) in compat`, which blocked early-POL
   from occupying deep sections — the *correct* arrangement. Fixed to check
   `(i_late, j_lo) in compat and (i_early, j_hi) in compat`, blocking the *violation*
   (late-POL deep + early-POL shallow simultaneously).

3. **Overstow metric direction** (`compute_metrics()`): condition
   `a2['depth'] < a1['depth']` → `a1['depth'] < a2['depth']` so the metric counts
   violations (early-POL shallower than late-POL) rather than the correct arrangement.

4. **Supply constraint** (`solve()` Constraint 1): `== pallets` → `<= pallets` —
   allows partial placement when total demand (5,500) exceeds corrected capacity (5,385);
   utilization objective maximises placement within capacity.

5. **Unicode crash** in `build_and_solve()`: `✗` replaced with ASCII `FAILED` to avoid
   `UnicodeEncodeError` on Windows cp1252 console.

Result on Baltic Klipper AC26020: **0 POL violations** across all 4 holds; all sections
within capacity; 5,030 / 5,500 pallets placed (91.5%) across all 5 plan objectives.

**Files changed in v1.69.3:**
`stowage-optimizer/solver.py`

---

### v1.68.8–v1.68.10 (2026-05-15) — Deterministic POD colors + Python OR-Tools optimizer

#### v1.68.8 — Deterministic POD color map

- New `lib/constants/pod-colors.ts`: exports `POD_COLOR_MAP` (22 known UN/LOCODEs
  with fixed hex values) and `getPodColor(portCode)` (hash-based fallback for ports
  not in the map). Same port always returns the same color regardless of plan or voyage.
  Notable assignments: NLVLI=#f97316, GBPME=#3b82f6, GBDVR=#2563eb, FRRAD=#7c3aed.
- `app/stowage-plans/[id]/page.tsx`: removed positional `POD_COLORS` array and index
  assignment; `podColorMap` useMemo now calls `getPodColor()` per port code.

**Files changed in v1.68.8:**
`lib/constants/pod-colors.ts` (new) · `app/stowage-plans/[id]/page.tsx`

#### v1.68.9 — Python OR-Tools stowage optimizer, Fase 1

New standalone optimizer service at `stowage-optimizer/`:
- `venv/`: Python 3.12 virtual environment with OR-Tools 9.11.4210, pymongo 4.10.1,
  pandas 2.2.3, openpyxl 3.1.2, python-dotenv 1.0.1.
- `solver.py`: CP-SAT model reading MongoDB directly (MONGODB_URI from `.env.local`).
  Generates 5 alternative stowage plans per voyage with configurable objective weights:
  1. **Balanced** — equal weight on balance, compactness, POD distribution
  2. **Max Balance** — prioritises fwd/aft weight distribution
  3. **Max Compactness** — fills lower hold levels first
  4. **POD-Friendly** — discourages same-POD concentration in one hold
  5. **Max Utilization** — maximises placed pallets
- Excel export: 6-sheet workbook (Summary + Plan 1–5), cells color-coded by POD port.
- JSON export: `cargoPositions`-compatible array, importable into MongoDB.
- Hard constraints: temperature compatibility, hold capacity, POL monotonicity (corrected
  in v1.68.10), POD accessibility, temperature zone grouping.

Run: `stowage-optimizer\venv\Scripts\python.exe stowage-optimizer\solver.py <voyage_id>`
Output: `stowage-optimizer/output/plan_<voyageNumber>_<timestamp>.{xlsx,json}`

**Files created in v1.68.9:**
`stowage-optimizer/solver.py` · `stowage-optimizer/requirements.txt` ·
`stowage-optimizer/README.md` · `stowage-optimizer/.gitignore` ·
`stowage-optimizer/venv/` (git-ignored)

#### v1.68.10 — Fix POL monotonicity constraint direction

Root cause analysis: the overstow metric counts `early-in-j_lo + late-in-j_hi` as a
violation (early cargo in a higher-depth section while late cargo is in a lower-depth
section, blocking access). The original constraint — and an initial fix attempt — both
blocked the inverse pattern `(late, j_lo) in compat AND (early, j_hi)`, actively
discouraging the correct stowage arrangement and inflating overstow from 1,258 to
2,813–3,581.

**Correct fix:** POL constraint now triggers on `(i_early, j_lo) in compat AND
(i_late, j_hi) in compat`, with the big-M indicator on `x[i_early, j_lo]`. When
early cargo occupies a higher-depth section (the overstow position), late cargo is
forced out of the lower-depth section in the same hold.

Also added: Constraint 5 — **temperature zone grouping**. Cargo pairs with
non-overlapping temperature ranges cannot share the same `zoneId`. Implemented as
`OnlyEnforceIf` binary indicator pairs over `incompat_pairs × zones_sec`.

Result on Baltic Klipper AC26020: **0 overstow violations** across all 5 plans
(100% pallet placement, 73–87% compactness).

**Files changed in v1.68.10:**
`stowage-optimizer/solver.py` · `docs/PROJECT_STATUS.md`

---

### v1.67.0–v1.68.0 (2026-05-12) — Stowage engine two-pass assignment + scoring fixes

#### v1.67.0 — Scoring improvements in assignCargo()
- `getPreferredPair()` moved inside the main booking loop so the preferred hold pair
  (1+3 vs 2+4) recalculates after every booking placement, reflecting live balance state.
- `podImbalancePenalty` added to `sectionScore()`: penalizes holds with a disproportionate
  share of cargo for the same POD, encouraging even distribution. Coefficient: 0.4 ×
  (podInThisHold / podTotal).
- `compactnessBonus` (−0.15) added: rewards partially-filled sections (palletsUsed > 0,
  fillRatio < 0.85) to reduce fragmentation in lower levels.

**Files changed in v1.67.0:**
`lib/stowage-engine/assign.ts`

#### v1.67.1 — Section detail panel: estimate positions now visible
- `consigneeNames` in the click panel now reads `consigneeName` and `shipperName` directly
  from `planCargoPositions`. Estimate positions (bookingId prefixed `FORECAST-` or
  `CONTRACT-ESTIMATE-`) now appear in the panel instead of "No cargo assigned".
- `usedInCompartment` sums estimate position quantities alongside real booking assignments.
- `selectedSectionSlots` appends estimate positions as extra slots for `CoolingSectionTopDown`.

**Files changed in v1.67.1:**
`app/stowage-plans/[id]/page.tsx`

#### v1.67.2 — compactnessBonus POL-compatibility guard
- `compactnessBonus` is now gated on `polCompatible`:
  `sectionMaxPolSeq === 0 || sectionMaxPolSeq <= incomingPolSeq`. Sections already holding
  later-loaded cargo suppress the bonus — they would fail `canPlace()` anyway, so the old
  bonus was producing OVERSTOW_CONFLICTs by steering cargo toward incompatible sections.
- Result: sections 3A, 4A, 4C now fill correctly (were left empty before this fix).

**Files changed in v1.67.2:**
`lib/stowage-engine/assign.ts`

#### v1.67.3 — Headroom reservation penalty
- `remainingByPolSeq: Map<number, number>` built before the assignment loop; decremented
  after each successful placement. Tracks unprocessed pallets per POL sequence.
- `headroomPenalty` = +0.35 when `fillRatio > 0.70` AND later-POL cargo is still pending.
  Discourages filling sections near-full when cargo from later loading ports still needs
  headroom in upper levels.
- Minor improvement; does not resolve structural overstow on routes where a single POL has
  cargo for multiple POD destinations (confirmed via Baltic Klipper AC26020 diagnostic).

**Files changed in v1.67.3:**
`lib/stowage-engine/assign.ts`

#### v1.68.0 — Two-pass POD-priority assignment [result pending confirmation]

**Root cause confirmed via `scripts/diagnose-plan.ts`:** Baltic Klipper AC26020 had 1,474
pallets unplaced (5 OVERSTOW_CONFLICTs). Single-pass sort (polSeq ASC, podSeq DESC) filled
hold bottoms with COTRB cargo (polSeq=1) for both NLVLI (podSeq=4) and GBPME (podSeq=5).
By the time COSMR/DOMNZ→GBPME arrived, every section either had NLVLI above GBPME (violating
condition b: podSeq(5) ≤ podMinBelow(4)) or COTRB in upper levels (violating condition d:
polSeq(2) ≤ polMinAbove(1)). Total cargo 4,700 pal vs vessel capacity 5,385 pal — purely a
sequencing problem.

**Fix — two-pass assignment in `assignCargo()`:**
- **Pass 1** (`podSeq DESC, polSeq ASC, pallets DESC`): processes latest-POD cargo first;
  fills hold bottoms with last-discharge cargo from all loading ports simultaneously.
  Unplaced remainder is silently deferred — no conflict recorded.
- **Pass 2** (`podSeq ASC, polSeq ASC, pallets DESC`): processes cargo not fully placed in
  Pass 1 (reduced to remaining pallets via `partialRemaining`); places earliest-discharge
  cargo in upper levels. Full conflict detection (OVERSTOW, CAPACITY, TEMPERATURE) runs only
  here.
- `fullyPlaced: Set<string>` and `partialRemaining: Map<string, number>` bridge the two passes.
- `HoldState` and `remainingByPolSeq` are shared across both passes.

**Known state at session end:**
- Two-pass reduces unplaced to 1,374 pal (−100), but shifts which bookings are blocked:
  COTRB→NLVLI now fails instead of COSMR/DOMNZ→GBPME. Structural cause: routes with mixed
  POD destinations from the same early POL cannot be fully resolved by sort-order alone.
  Next exploration: POD-affinity pre-routing (reserve holds per discharge port before
  the assignment loop).
- Baltic Klipper vessel (AC26020): Hold 3 is pineapple (+8.5°C); Holds 1, 2, 4 are banana
  (+13°C). Total banana GBPME: 1,700 pal; banana NLVLI: 1,600 pal; pineapple all: 1,400 pal.

**Diagnostic infrastructure created this session:**
- `scripts/diagnose-plan.ts` — re-runs engine on Baltic Klipper plan, saves to DB, prints
  conflicts / unassigned / assigned pallets by POL and section / deep `canPlace` diagnostic
  per unassigned booking. Run: `npx tsx --env-file=.env.local scripts/diagnose-plan.ts`
- `scripts/analyze-route.ts` — read-only analysis: cargo items by POL→POD group, totals per
  POD, section capacities by hold and temperature, compatible cargo groupings, hold reservation
  feasibility math. Run: `npx tsx --env-file=.env.local scripts/analyze-route.ts`

**Files changed in v1.68.0:**
`lib/stowage-engine/assign.ts`

---

### v1.66.0–v1.66.1 (2026-05-11) — Role-aware booking edit modal

#### v1.66.0 — Role-aware fields in booking edit modal
- Agency portal (/bookings — ADMIN / SHIPPING_PLANNER):
  - Edit modal now shows confirmedQuantity field (pre-filled with current
    confirmedQuantity ?? requestedQuantity). Label: "Confirmed Quantity".
  - Status select removed — backend forces status=CONFIRMED on save.
  - requestedQuantity is never modified from the agency side.
- Shipper portal (/shipper/bookings — EXPORTER):
  - Edit modal shows requestedQuantity field only. Label: "Requested Quantity".
  - Status select removed — backend forces status=PENDING on save (always).
  - Pending status triggers approve/reject action buttons in agency portal.
- updateBookingQuantity() server action extended:
  - Accepts confirmedQuantity (optional) in Zod schema.
  - Agency path: updates confirmedQuantity, forces CONFIRMED, skips requestedQuantity.
  - Shipper path: updates requestedQuantity, forces PENDING, skips confirmedQuantity.
  - Changelog append and email notifications preserved.

#### v1.66.1 — Fix ReferenceError in updateBookingQuantity
- newQuantity variable was referenced in email notification call before being
  assigned, causing ReferenceError on both agency and shipper edit paths.
- Fix: assigned const newQuantity = input.confirmedQuantity ?? input.requestedQuantity ?? 0
  early in the function, before any branch logic.

### v1.65.0 (2026-05-06) — Auth fix + VesselProfile deck strip

#### Auth: next-auth beta.31 regression fix
- Root cause: nodemailer upgrade to v8 (commit e34d86c) caused npm to resolve
  next-auth ^5.0.0-beta.30 → beta.31, which broke /api/auth/session, /api/auth/csrf
  and /api/auth/signout endpoints (404). Sessions appeared valid on login but reset
  every ~30s due to SessionProvider polling failing.
- Fix: pinned next-auth to exactly 5.0.0-beta.30 and nodemailer to ^7.0.7 in
  package.json. Both are compatible with Next.js 16.2.4.

#### VesselProfile: deck strip for above-deck compartments (FC/UPD)
- FC and UPD levels removed from main hull SVG and rendered in a separate narrow
  SVG strip (deckStrip) above the hull, aligned with hold columns.
- Hold labels (Hold 1, Hold 2...) moved to deck strip, always visible regardless
  of whether FC/UPD levels exist.
- Ghost outlines shown for holds without FC/UPD to maintain column alignment.
- Hull compartments (A/B/C/D/E) now fill hull exactly with no top/bottom margin
  (2px top padding, SVG_H=430 for bottom).
- Mast/derricks and superstructure/bridge hidden (wrapped in {false && (...)})
  for future relocation above deck strip.
- HOLD_HEIGHT_BUDGET now computed from hull levels only, excluding FC/UPD, so
  their removal from hull does not leave empty space.

### v1.63.0–v1.64.0 (2026-05-05) — SpaceForecast→engine integration, NO_CARGO UI, bottom-up fill fix, vessel-profile display

#### v1.64.0 — Engine bottom-up fill fix

Root cause: `candidates.reduce()` in `assign.ts` broke score ties by returning the first
candidate in array order. Sections are stored top-to-bottom in the vessel's
`temperatureZones[].coolingSections[]`, so ties were resolved top-down, filling `A`
before `B` before `C` before `D`. This caused `canPlace` condition 1
(`booking.podSeq >= podMaxAbove`) to block later cargo from filling lower sections after
an earlier-discharging booking occupied the top level.

Fix: added `LEVEL_DEPTH` map (`{ FC: 0, A: 1, B: 2, C: 3, D: 4 }`) and `depthRank()`
helper after `levelIndex()`. The reduce tie-break now: (1) picks lower score, (2) on
score tie picks deeper section (higher depthRank), (3) on depth tie picks higher
holdNumber. No other engine file was changed.

**Files changed in v1.64.0:**
`lib/stowage-engine/assign.ts`

#### v1.64.0 (addendum) — VesselProfile: permanent used/capacity display

- **`components/vessel/VesselProfile.tsx`**: Each compartment cell now permanently renders
  `used/capacity` (e.g. `262/388`) in the cell center below the cargo type abbreviation.
  Previously visible only when cargo was assigned; now always present so planners can see
  remaining space at a glance on empty cells.

**Files changed:**
`components/vessel/VesselProfile.tsx`

**Smoke test pending:** Regenerate plan for AC26020 (BALTIC KLIPPER) — verify 2B/2C/2D
and 4C/4D fill with cargo; verify NLVLI cargo sits above GBPME in Hold 2 and Hold 4;
zero new overstow conflicts; regression test with single-POD voyage.

#### v1.63.1 — NO_CARGO UI (pending smoke test)

**Shipper portal (`ForecastWizard.tsx`):**
- Added `noCargo: Record<string, boolean>` state per voyage row.
- "No cargo this voyage" checkbox shown below the quantity input on each voyage row.
- When checked: input is hidden; submitting creates `source: 'NO_CARGO', estimatedPallets: 0`.
- `hasAnyInput` broadened to include `noCargo` entries so Submit button activates.
- Existing NO_CARGO forecasts display as a "No Cargo Declared" badge instead of a `0`
  in the number input (prevents confusing pre-fill).
- Reset on handleNext: `setNoCargo({})`.

**Planner portal (`VoyageDetailClient.tsx`):**
- Added `no_cargo` RowState (detected before `CONTRACT_DEFAULT` in derivation chain).
- `handleNoCargoDeclaration()` server action call + optimistic `setAllForecasts` update.
- "No Cargo" button shown alongside "Enter Estimate" for `none` and `default` row states.
- `no_cargo` rows show `0 plt` in qty column, a "No Cargo" badge in status column, and
  an "Edit" button (starts empty — user must enter a real value, superseding NO_CARGO).

**Files changed in v1.63.1:**
`app/shipper/forecasts/new/ForecastWizard.tsx` ·
`app/shipper/forecasts/new/ForecastWizard.module.css` ·
`app/shipper/forecasts/page.tsx` ·
`app/voyages/[id]/VoyageDetailClient.tsx` ·
`app/voyages/[id]/VoyageDetailClient.module.css`

**Smoke test pending:** Submit "No cargo" from shipper portal; verify badge in forecast
list; use "No Cargo" button in planner Contracts & Space; verify "No Cargo" badge + "Edit"
to reverse.

#### v1.63.0 — SpaceForecasts fed to stowage engine

- `autoGenerateSinglePlan()` now loads all active SpaceForecasts for the voyage (sources:
  SHIPPER_PORTAL, PLANNER_ENTRY, CONTRACT_DEFAULT) and passes them to
  `generateStowagePlan()` as `contractEstimates`. NO_CARGO forecasts are excluded — they
  signal zero cargo and must not create phantom positions.
- Engine receives real forecast quantities; `cargoPositions` in auto-generated plans now
  reflect shipper estimates rather than only confirmed bookings.

**Files changed in v1.63.0:**
`app/actions/stowage-plan.ts` · `lib/db/schemas.ts`

---

### v1.60.0–v1.62.4 (2026-05-04) — Contracts & Space redesign, counterparty editing, unified plan wizard

#### v1.62.0–v1.62.4 — Unified StowagePlanWizard

Both ⚡ Auto-Generate Plan and + New Plan now route to the same wizard at `/stowage-plans/new`.

- **`app/stowage-plans/AutoGenerateButton.tsx`**: simplified to a navigation button;
  routes to `/stowage-plans/new?mode=auto`.
- **`app/stowage-plans/new/page.tsx`**: reads `searchParams.mode` and passes
  `mode` prop (`'auto'|'manual'`) to wizard; also restores `sqm` field in
  vesselZones mapping (required by `buildVesselLayout`).
- **`app/stowage-plans/new/StowagePlanWizard.tsx`**: unified 3-step wizard —
  Step 1: voyage cards with revision detection; Step 2: bulk toolbar + VesselProfile
  SVG with per-compartment inputs + read-only summary table; Step 3: dark maritime
  review card. Branching: `mode=auto` → `autoGenerateSinglePlan()` (engine-backed,
  populates cargoPositions); `mode=manual` → `createStowagePlanFromWizard()` (blank
  plan). Step indicator: teal active / green done / gray pending.
- **`app/stowage-plans/new/page.module.css`**: full CSS rewrite — wizard step
  breadcrumb, bulk toolbar, svgWrap, maritime review card, zone chip grid.
- **`components/vessel/VesselProfile.tsx`**: per-compartment `<foreignObject>` input
  width widened from 22% to 38% of cell width; label and divider x positions adjusted
  to match.
- **Regression fix (v1.62.1–v1.62.4)**: unified wizard was calling
  `createStowagePlanFromWizard` for both modes, producing empty plans when triggered
  via Auto-Generate. Fixed by the mode prop branch above.

**Files changed in v1.62.x:**
`app/stowage-plans/AutoGenerateButton.tsx` · `app/stowage-plans/new/page.tsx` ·
`app/stowage-plans/new/StowagePlanWizard.tsx` · `app/stowage-plans/new/page.module.css` ·
`components/vessel/VesselProfile.tsx`

#### v1.61.0 — Contract counterparty weeklyPallets editing

- **`app/actions/contract.ts`**: new `updateCounterpartyWeeklyPallets(contractId, counterpartyIndex, weeklyPallets)` server action — PLANNER/ADMIN only; validates range.
- **`app/contracts/[id]/ContractShippersPanel.tsx`**: value cell is click-to-edit
  (no pencil icon). Enter to save, Escape to cancel. Editing is NOT blocked by
  existing bookings — booking count shown as an informational indicator only.

**Files changed in v1.61.0:**
`app/actions/contract.ts` · `app/contracts/[id]/ContractShippersPanel.tsx`

#### v1.60.0 — Contracts & Space table redesign

- **`app/voyages/[id]/VoyageDetailClient.tsx`**: Contracts & Space table column
  changes:
  - **WEEKLY EST.** → **BOOKING/WEEKLY EST.**: shows booking confirmed qty if
    booking exists, else forecast qty, else contract counterparty weeklyEstimate.
  - **BOOKING NR.** → **BOOKING NR./FORECAST**: shows booking number, or
    "Planner Est." / "Shipper Est." badge when only a forecast exists.
  - **STATUS** column added: shows booking status badge (CONFIRMED/PARTIAL/PENDING)
    or forecast planImpact badge.
  - **ROUTE** column: now shows port codes only (e.g. `COTUB → NLRTM`).
  - **SHIPPER** column: shows name only — shipper code removed.

**Files changed in v1.60.0:**
`app/voyages/[id]/VoyageDetailClient.tsx` · `app/voyages/[id]/VoyageDetailClient.module.css`

---

### v1.59.x (2026-04-29) — Contracts & Space panel + Shipper Forecasts portal

#### v1.59.6 (2026-04-30) — Hotfixes: HMR, serialization, confirm forecast

##### next.config.ts
- Added `allowedDevOrigins: ['192.168.10.45']` to allow local network HMR
  in Next.js 16.2.4. Fixes all event handlers (hamburger, collapse, sign out,
  wizard clicks) being unresponsive when accessing from network IP.

##### app/shipper/forecasts/new/page.tsx
- Serialize contracts, voyagesByServiceId, and existingForecasts via
  JSON.parse(JSON.stringify()) before passing to ForecastWizard client
  component. Fixes React hydration error from Mongoose ObjectId buffers.

##### app/voyages/[id]/page.tsx
- Serialize spaceForecasts, activeContracts, and bookings before passing
  to UnifiedContractsPanel. Same Mongoose serialization fix.

##### app/actions/space-forecast.ts
- markForecastIncorporated: planId parameter made optional. incorporatedInPlanId
  only set in update query when planId is a non-empty string. Fixes
  "Cast to ObjectId failed" error when confirming forecasts from voyage detail
  (where no planId exists).

##### app/voyages/[id]/VoyageDetailClient.tsx
- handleConfirmEstimate: fixed markForecastIncorporated call to match
  corrected signature (no second argument).

##### package.json / package-lock.json
- nodemailer downgraded to v7 to resolve next-auth peer conflict.
- Next.js updated to 16.2.4 (from 16.1.6).
- Safe dependency patches applied (npm audit fix).

**Files changed in v1.59.6:**
next.config.ts · app/shipper/forecasts/new/page.tsx ·
app/voyages/[id]/page.tsx · app/actions/space-forecast.ts ·
app/voyages/[id]/VoyageDetailClient.tsx ·
package.json · package-lock.json

#### v1.59.5 — ForecastWizard UX + planner confirm action
- **app/shipper/forecasts/new/ForecastWizard.module.css**: contract card
  selection uses 2px blue border + box-shadow for strong visual highlight.
- **app/shipper/forecasts/new/ForecastWizard.tsx**: contract cards in Step 1
  now show service badge, consignee name, full port names (code · name).
  Step 2 shows "ref: N plt/wk" below each estimate input.
- **app/voyages/[id]/VoyageDetailClient.tsx**: UnifiedContractsPanel gains
  "✓ Confirm" button for SHIPPER_PORTAL forecasts in PENDING_REVIEW state —
  calls markForecastIncorporated(), updates badge to Incorporated optimistically.
- **app/voyages/[id]/VoyageDetailClient.module.css**: .btnConfirmEst added.

#### v1.59.4 — Separate Shipper/Consignee columns in UnifiedContractsPanel
- **app/voyages/[id]/VoyageDetailClient.tsx**: ContractRow interface gains
  explicit shipperCode/Name and consigneeCode/Name fields derived from
  contract.client.type. Table now has separate Shipper and Consignee columns
  instead of a single "Shipper / Consignee" column.

#### v1.59.3 — Add POL/POD route column to UnifiedContractsPanel
- **app/voyages/[id]/VoyageDetailClient.tsx**: Route column added showing
  originPort → destinationPort per contract row.

#### v1.59.2 — Auto-incorporate planner forecasts
- **app/actions/space-forecast.ts**: PLANNER_ENTRY and CONTRACT_DEFAULT
  forecasts created with planImpact INCORPORATED directly. Only
  SHIPPER_PORTAL forecasts start as PENDING_REVIEW.

#### v1.59.1 — Fix consigneeCode required validation
- **app/actions/space-forecast.ts**: consigneeCode falls back to
  contract.client?.code ?? 'N/A' in both createSpaceForecast() and
  createContractDefaultForecasts().

#### v1.59.0 — Unified Contracts & Space section + restore shipper forecasts portal
- **app/voyages/[id]/page.tsx**: Bookings section and SpaceForecastsPanel
  replaced by single UnifiedContractsPanel. Fetches getSpaceForecasts() and
  active contracts for the voyage's service.
- **app/voyages/[id]/VoyageDetailClient.tsx**: UnifiedContractsPanel — one row
  per shipper per contract. Shows booking status if booking exists, forecast
  options if not. Seven columns: Shipper | Consignee | Contract | Route |
  Cargo | Weekly Est. | Booking | Forecast | Actions.
- **app/voyages/[id]/VoyageDetailClient.module.css**: all forecast/unified
  panel CSS classes added.
- **app/shipper/forecasts/page.tsx** (new): forecast list for shipper portal.
- **app/shipper/forecasts/page.module.css** (new): list page styles.
- **app/shipper/forecasts/new/page.tsx** (new): server shell for wizard.
- **app/shipper/forecasts/new/ForecastWizard.tsx** (new): two-step wizard —
  Step 1 contract selection, Step 2 estimate entry per voyage.
- **app/shipper/forecasts/new/ForecastWizard.module.css** (new): wizard styles.
- **components/layout/ShipperSidebar.tsx**: Forecasts nav item added.

#### v1.58.x (2026-04-29) — Admin and shipper portal fixes
- **v1.58.6**: Restored SpaceForecastsPanel (now UnifiedContractsPanel) after
  accidental removal in v1.58.5.
- **v1.58.5**: Admin tab bar replaced native scroll with arrow-button navigation
  (TabBar.tsx + TabBar.module.css).
- **v1.58.4**: Admin tab bar horizontal scroll on small screens; custom visible
  scrollbar.
- **v1.58.3**: My Account navigation fixed for shipper portal — moved to
  /shipper/account to stay within ShipperShell layout, eliminating flicker
  and menu text jump. app/account/page.tsx cleaned up (AppShell only).

**Files added in v1.59.0:**
app/shipper/forecasts/page.tsx · app/shipper/forecasts/page.module.css ·
app/shipper/forecasts/new/page.tsx · app/shipper/forecasts/new/ForecastWizard.tsx ·
app/shipper/forecasts/new/ForecastWizard.module.css

**Files modified across v1.59.x:**
app/voyages/[id]/page.tsx · app/voyages/[id]/VoyageDetailClient.tsx ·
app/voyages/[id]/VoyageDetailClient.module.css ·
app/actions/space-forecast.ts · components/layout/ShipperSidebar.tsx ·
app/shipper/account/page.tsx (new) · app/account/page.tsx ·
app/admin/TabBar.tsx (new) · app/admin/TabBar.module.css (new) ·
app/admin/page.module.css · app/admin/AdminClient.tsx

---

### v1.58.2 (2026-04-28) — Vessel capacity data + utilization bars

#### Vessel data migration
- scripts/update-vessel-capacity.ts (deleted after use): updated 19 vessels
  with capacity.totalPallets, capacity.totalSqm, and callsign from CSV source
- BARRINGTON ISLAND was entered manually via UI (not in CSV)
- All capacity values stored as BSON numbers (confirmed)

#### Utilization bars — real data
- **`app/actions/voyage.ts`**: getVoyages() and getAdminVoyages() now
  populate vesselId with capacity.totalPallets; BookingModel aggregation
  added per voyage returning confirmedPallets, requestedPallets, bookingCount
- **`app/page.tsx`**: dashboard Recent Voyages utilization bar uses real
  palletsBooked and palletsCapacity; Stowage Plans LOADED bar uses sum of
  confirmedQuantity from bookings instead of cargoPositions array length
- **`app/voyages/page.tsx`**: voyage cards bookingsCount and utilization
  bar now use real aggregated data

**Files changed in v1.58.2:**
`app/actions/voyage.ts` · `app/page.tsx` · `app/voyages/page.tsx`

### v1.58.1 (2026-04-28) — UX polish

#### Cancel button in shipper request wizard
- **`app/shipper/request/RequestClient.tsx`**: Cancel button added to
  Step 1 (was missing); verified all steps have both Back and Cancel.
  Cancel navigates to /shipper/bookings.

#### Custom scrollbar styles
- **`app/globals.css`**: global scrollbar styles added — 7px width/height,
  themed to dark maritime palette using CSS variables. Webkit and Firefox
  both covered.

**Files changed in v1.58.1:**
`app/shipper/request/RequestClient.tsx` · `app/globals.css`

### v1.58.0 (2026-04-27) — Booking approval overhaul + email improvements

#### Booking approval — three-bucket model
- **`app/actions/booking.ts`**: ApproveBookingSchema extended with
  standbyQuantity and rejectedQuantity; approveBooking() now requires
  confirmed + standby + rejected === requestedQuantity; status derived
  automatically from bucket values
- **`app/bookings/BookingsClient.tsx`**: approve modal replaced with
  three-input layout (confirmed/standby/rejected) with live running total,
  color indicator, and quick-fill buttons (Confirm all / All standby /
  Reject all)

#### Standby resolution
- **`app/actions/booking.ts`**: new resolveStandby() action — moves
  standbyQuantity to confirmed or rejected; updates status accordingly;
  sends sendStandbyResolved email (not a generic status-changed email)
- **`app/bookings/BookingsClient.tsx`**: Confirm Standby / Reject Standby
  buttons on STANDBY and PARTIAL rows with standbyQuantity > 0

#### Edit quantity rules
- **`app/actions/booking.ts`**: updateBookingQuantity() now enforces:
  - Blocked if POL has ATD recorded
  - EXPORTER increases quantity → status reset to PENDING, re-approval required
  - EXPORTER reduces quantity → updates directly, notifies planners
  - ADMIN/PLANNER → updates directly, notifies shipper
- Changelog recorded on all edits

#### Pending bookings filter
- **`app/bookings/BookingsClient.tsx`**: pending panel now only shows
  PENDING + PARTIAL with standbyQuantity > 0; closed PARTIAL bookings
  (no standby remaining) excluded

#### Shipper dashboard fixes
- **`app/actions/shipper.ts`**: standbyPallets now sums standbyQuantity
  (not confirmedQuantity); filter includes PARTIAL bookings with
  standbyQuantity > 0; pendingPallets added (sum of requestedQuantity
  for PENDING bookings)
- **`app/shipper/page.tsx`**: Awaiting Approval card shows pendingPallets
  instead of booking count

#### Email improvements — lib/email.ts
- sendBookingStatusChanged: PARTIAL body now shows rejectedQuantity when
  non-zero; only non-zero buckets mentioned
- sendBookingStatusChanged: REJECTED body distinguishes full vs partial
  rejection
- New sendStandbyResolved(): dedicated email for standby resolution —
  replaces generic status-changed email in resolveStandby()
- sendBookingModifiedToShipper: improved body with previous quantity and
  coordinator attribution
- sendBookingModifiedToPlanners: optional requiresReapproval flag adds
  warning block when shipper increases quantity
- sendPasswordChangedNotification + sendFailedLoginWarning: subject lines
  now use AGENCY_NAME env variable

#### Responsive fixes
- **`app/shipper/shipper.module.css`**: horizontal scroll restored for
  bookings table on 768px–1199px viewports; ShipperShell overflow fixed

**Files changed in v1.58.0:**
`app/actions/booking.ts` · `app/actions/shipper.ts` ·
`app/bookings/BookingsClient.tsx` · `app/shipper/bookings/BookingsClient.tsx` ·
`app/shipper/page.tsx` · `app/shipper/shipper.module.css` · `lib/email.ts`

### v1.57.2 (2026-04-26) — Fix cargoTypes iteration after contract schema cleanup

#### Bug fix
- **`app/bookings/BookingsClient.tsx`**: goToStep3 was iterating over
  `cp.cargoTypes` which no longer exists after the v1.57.0 schema cleanup.
  Fixed by using `selectedContract.cargoType` (contract-level field) to build
  booking rows. Same fix applied to legacy shippers[] and consignees[] blocks.
- **`app/shipper/request/RequestClient.tsx`**: same pattern found and fixed.
- Root cause: cargoTypes was removed from counterparties in v1.57.0 but the
  booking row builder was not updated at that time.

**Files changed in v1.57.2:**
`app/bookings/BookingsClient.tsx` · `app/shipper/request/RequestClient.tsx`

### v1.57.1 (2026-04-25) — Booking wizard UX improvements

#### ContractSelect component
- Contract list items redesigned for readability: bold shipper/consignee on line 1,
  POL→POD + cargo + weekly cap on line 2, contract number in monospace tag
- Removed low-contrast styles that made options nearly invisible

#### BookingsClient.tsx — planner booking wizard
- Contract preview card (Step 1): shipper(s), consignee, POL→POD, cargo type,
  weekly cap all clearly labeled
- Quantity step: persistent info box showing contract reference, route, cargo,
  and cap — planner does not need to memorize Step 1 data
- Approval context: amber warning shown when shipper requested quantity differs
  from their contract weeklyEstimate

#### RequestClient.tsx — shipper portal request wizard
- Quantity step (Step 3): visible info panel showing contract number, route,
  and cargo type above the input
- Weekly estimate always shown as prominent panel, not just hint text below input
- weeklyEstimate resolved from counterparties[].weeklyEstimate matching session
  shipperCode, falling back to contract.weeklyPallets

#### Shipper dashboard — Standby card
- Primary value now shows total pallets on standby instead of booking count
- Secondary line: "across N booking(s)"
- Label changed from "Standby allocation" to "Pallets on Standby"
- app/actions/shipper.ts: getShipperDashboard now returns standbyPallets

**Files changed in v1.57.1:**
`components/ui/ContractSelect.tsx` · `components/ui/ContractSelect.module.css` ·
`app/bookings/BookingsClient.tsx` · `app/shipper/request/RequestClient.tsx` ·
`app/shipper/page.tsx` · `app/actions/shipper.ts`

---

### v1.57.0 (2026-04-24) — Contract schema cleanup

#### Schema changes
- **lib/db/schemas.ts**: removed legacy `shippers[]` and `consignees[]` arrays from
  ContractSchema; removed `cargoTypes[]` from ContractCounterpartySchema
- **app/actions/contract.ts**: removed `shippers` and `consignees` from
  CreateContractSchema; removed `cargoTypes` from ContractCounterpartyInputSchema
  and AddContractShipperSchema
- **app/admin/ContractsClient.tsx**: removed Cargo Types chip selector from
  counterparty rows in CreateContractModal
- **components/contracts/ContractShippersPanel.tsx**: removed Cargo Types checkbox
  grid from Add Shipper form and Cargo Types column from counterparties table

#### Business rule enforced
A contract is created for a single cargo type (contract-level cargoType field).
All shippers on a contract ship that same cargo type — no per-counterparty
cargo type needed.

#### Also completed this session
- Role-aware invitation email (v1.56.3): EXPORTER users receive portal-branded
  invitation; AGENCY_NAME env variable added (current: "Olivia Reefer Lines")
- Operational data created via UI: CARIBANEX service, offices, shippers, customers,
  users (EXPORTER + SHIPPING_PLANNER roles), voyages, contracts

### v1.56.3 (2026-04-21) — Invitation email + data setup

#### Role-aware invitation email
- EXPORTER users now receive a distinct invitation email mentioning the cargo portal
  (not "Reefer Stowage Planner")
- AGENCY_NAME env variable added (.env.local, fallback: 'Reefer Lines')
- Current value: "Olivia Reefer Lines"
- All other roles keep the existing invitation email template

#### Operational data created via UI (CARIBANEX service)
- Services: CARIBANEX created
- Offices: additional offices created
- Shippers: created via Admin → Shippers
- Customers: created via Admin → Customers
- Users: EXPORTER and SHIPPING_PLANNER role users created and linked
- Voyages: test voyages created for CARIBANEX service

#### Pending
- Services RAYO and ANDES-EXPRESS still pending
- Contracts pending — see design note below
- Bookings and Stowage Plans pending

### v1.56.2 (2026-04-17) — Atlas migration complete
- MONGODB_URI updated to point to MongoDB Atlas (reefer-planner DB)
- Collections successfully migrated from local to Atlas: users, vessels, offices, ports,
  UNECE_PORTS, countries, services
- MONGODB_URI_LOCAL retained in .env.local as local backup
- Migration script deleted after use

### Pending data setup (to be created via UI)
- Services: RAYO and CARIBANEX services pending creation
- Users: additional planner and EXPORTER role users pending
- Shippers: pending creation via Admin → Shippers
- Customers: pending creation via Admin → Customers
- Contracts: pending creation via Admin → Contracts
- Voyages, Bookings, Stowage Plans: pending creation as part of operational smoke test

### v1.56.1 (2026-04-16) — Environment migration
- Migrated from Docker container to local Node.js execution (Claude Code runs directly in project folder)
- MongoDB Atlas cluster created (AWS eu-north-1 / Stockholm) — pending data migration from local instance
- Port collection restored via `npm run db:seed:ports` (21 ports, data hardcoded in scripts/seed-ports.ts)
- Collections with existing data: users, vessels, offices, services (1)
- Remaining collections (contracts, voyages, bookings, stowage plans, shippers, customers) to be re-created via UI
- TODO: migrate local MongoDB collections to Atlas once operational data is rebuilt

### v1.56.0 (2026-04-15) — Planner estimate entry in SpaceForecastsPanel

#### Guard added to createSpaceForecast()
- **`app/actions/space-forecast.ts`**: before creating or superseding, checks if the
  existing active forecast has `planImpact === 'REPLACED_BY_BOOKING'`. If so, returns
  `{ success: false, error: '...' }` — a booking cannot be replaced by an estimate.

#### SpaceForecastsPanel — inline estimate form
- **`app/voyages/[id]/VoyageDetailClient.tsx`**: SpaceForecastsPanel extended with
  per-row inline estimate entry. Four states per counterparty row:
  - No forecast → "Use Contract Est." + "Enter Estimate" buttons
  - CONTRACT_DEFAULT exists → "Enter Estimate" replaces the default on save
  - PLANNER_ENTRY or SHIPPER_PORTAL exists → "Edit" button, pre-filled form, source badge retained
  - REPLACED_BY_BOOKING → read-only "Booking confirmed", no actions
- **`app/voyages/[id]/VoyageDetailClient.module.css`**: new classes for inline form,
  estimate input, save/cancel buttons.

**Files changed in v1.56.0:**
`app/actions/space-forecast.ts` · `app/voyages/[id]/VoyageDetailClient.tsx` ·
`app/voyages/[id]/VoyageDetailClient.module.css`

---

### v1.55.0-B (2026-04-15) — Shipper portal: forecast submission wizard + list

- **`components/layout/ShipperSidebar.tsx`**: "Forecasts" nav item added between
  Bookings and Schedules.
- **`app/shipper/forecasts/page.tsx`** (new): server component — forecast list table
  with status badges, empty state, success banner via `?submitted=N` query param.
- **`app/shipper/forecasts/page.module.css`** (new): status badge variants, page header,
  success banner.
- **`app/shipper/forecasts/new/page.tsx`** (new): server shell — auth guard, fetches
  contracts, renders wizard.
- **`app/shipper/forecasts/new/ForecastWizard.tsx`** (new): client wizard — Step 1
  (ContractSelect) + Step 2 (voyage estimate table with pre-fill, UPDATED badge,
  "Booking confirmed" detection via planImpact).
- **`app/shipper/forecasts/new/ForecastWizard.module.css`** (new): voyage table styles.

**Known limitation:** Rows with a booking but no prior forecast show an editable input
instead of "Booking confirmed." Fix: cross-check against `getBookingsByShipperCode()`
in Step 2 data fetch — deferred.

**Files changed in v1.55.0-B:**
`components/layout/ShipperSidebar.tsx` · `app/shipper/forecasts/page.tsx` *(new)* ·
`app/shipper/forecasts/page.module.css` *(new)* · `app/shipper/forecasts/new/page.tsx`
*(new)* · `app/shipper/forecasts/new/ForecastWizard.tsx` *(new)* ·
`app/shipper/forecasts/new/ForecastWizard.module.css` *(new)*

---

### v1.55.0-A (2026-04-15) — SpaceForecast banners in stowage plan detail

- **`app/stowage-plans/[id]/page.tsx`**: two dismissible notification banners added
  above the vessel SVG profile.
  - Amber banner: when `pendingForecastUpdates.length > 0` — lists updated estimates
    with "Mark OK" per item (calls `markForecastIncorporated()`).
  - Blue banner: when `pendingBookingReplacements.length > 0` — lists replaced estimates
    with "Dismiss" per item (calls `dismissBookingReplacement()`).
  - Both banners collapse when all items are dismissed. Read-only for STEVEDORE/VIEWER.
- **`app/stowage-plans/[id]/page.module.css`**: ~110 lines of new banner classes.

**Files changed in v1.55.0-A:**
`app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css`

---

### v1.54.0 (2026-04-11) — SpaceForecast UI: voyage detail panel + bug fixes

#### SpaceForecastsPanel added to voyage detail

- **`app/voyages/[id]/page.tsx`**: fetches `getSpaceForecasts(voyageId)` and active contracts for the voyage's service; passes both as props to the detail layout for the new panel.
- **`app/voyages/[id]/VoyageDetailClient.tsx`**: new exported `SpaceForecastsPanel` component added at end of file. Collapsible section shown only on PLANNED/IN_PROGRESS voyages. Builds unified row list from service contract counterparties — one row per active counterparty. Rows with an active forecast show source badge (Shipper Portal/Planner/Contract Est.) + status badge (Pending Review/Incorporated) + Mark OK button. Rows without a forecast show "No Estimate" badge + "Use Contract Est." button scoped to that specific shipper.
- **`app/voyages/[id]/VoyageDetailClient.module.css`**: new classes for forecast section, table, source badges, status badges, and action buttons.

#### Bookings table improvements in voyage detail

- Route column (POL → POD) replaces standalone POD column.
- Shipper column added.
- Column label standardized to "Cargo" (was inconsistent across views).

#### Bug fixes

- **`app/actions/space-forecast.ts`**: `consigneeCode` now falls back to `contract.client?.code ?? 'N/A'` — fixes required-field validation error on `createContractDefaultForecasts`.
- **`app/actions/space-forecast.ts`**: `markForecastIncorporated()` no longer attempts to cast empty string to ObjectId for `incorporatedInPlanId` — field is only set when a non-empty planId is provided.
- **`app/actions/space-forecast.ts`**: `createContractDefaultForecasts()` gains optional `shipperId` and `shipperName` params — creates forecast for one specific counterparty only, not all counterparties on the contract.
- **`app/voyages/[id]/VoyageDetailClient.tsx`**: `handleUseContractEst()` passes `shipperId` and `shipperName` from the row to `createContractDefaultForecasts` — prevents estimates being created for unrelated shippers on the same contract.

**Files changed in v1.54.0:**
`app/voyages/[id]/page.tsx` · `app/voyages/[id]/VoyageDetailClient.tsx` · `app/voyages/[id]/VoyageDetailClient.module.css` · `app/actions/space-forecast.ts`

---

### v1.53.0 (2026-04-10) — SpaceForecast backend: REPLACED_BY_BOOKING state + booking integration

Extension of v1.52.0 SpaceForecast backend. No UI changes.

#### Schema + type additions
- **`lib/db/schemas.ts`**: SpaceForecastSchema planImpact enum gains `'REPLACED_BY_BOOKING'`. StowagePlanSchema gains `pendingBookingReplacements: [String]` (default []) alongside existing `pendingForecastUpdates`.
- **`types/models.ts`**: SpaceForecastPlanImpact union gains `'REPLACED_BY_BOOKING'`. StowagePlan interface gains `pendingBookingReplacements?: string[]`.

#### New action: dismissBookingReplacement
- **`app/actions/space-forecast.ts`**: new `dismissBookingReplacement(forecastId, planId)` — ADMIN/PLANNER only. Marks forecast as reviewed, removes from plan.pendingBookingReplacements via $pull. planImpact stays REPLACED_BY_BOOKING permanently.

#### Booking creation now silences active forecasts
- **`app/actions/booking.ts`**: after successful booking save, fire-and-forget block finds active forecasts matching contractId + voyageId + shipperId/shipperCode, sets planImpact = 'REPLACED_BY_BOOKING', removes their IDs from plan.pendingForecastUpdates and adds to plan.pendingBookingReplacements on any StowagePlan for that voyage.

#### Business rule established
A SpaceForecast and a Booking for the same contract+voyage+shipper never coexist as active. The booking always wins. The transition is automatic and silent (no planner action required to trigger it). The planner is notified via plan.pendingBookingReplacements[] banner on the stowage plan detail page — to be implemented in UI phase.

**Files changed in v1.53.0:**
`lib/db/schemas.ts` · `types/models.ts` · `app/actions/space-forecast.ts` · `app/actions/booking.ts`

---

### v1.52.0 (2026-04-10) — SpaceForecast collection: schema, types, server actions

New collection for shipper space estimates — intermediate data source between
contract weekly estimates and confirmed bookings, used to build stowage plans
weeks in advance.

- **`lib/db/schemas.ts`**: SpaceForecastSchema + SpaceForecastModel (3 indexes:
  voyageId+shipperId+contractId, voyageId+planImpact, contractId+submittedAt).
  StowagePlanSchema gains `forecastSnapshot` and `pendingForecastUpdates[]`.
- **`types/models.ts`**: SpaceForecastSource, SpaceForecastPlanImpact types,
  SpaceForecast interface, two optional fields added to StowagePlan.
- **`app/actions/space-forecast.ts`** (new): getSpaceForecasts, getMyForecasts,
  createSpaceForecast (supersede logic + planImpact), createContractDefaultForecasts,
  markForecastIncorporated.

No UI changes. No stowage engine changes.

### v1.51.0 (2026-04-09) — Stowage plan save/send fixes + bookings UI overhaul + archive toggle

#### Stowage plan: cargo positions preserved through full lifecycle

- **`app/stowage-plans/[id]/page.tsx`**: `handleSavePlan()` and `handleSendToCaptain()` now build `allAssignments` from `planCargoPositions` (raw DB positions) instead of `bookings.flatMap()`. This preserves ALL positions including contract estimates, and preserves `polPortCode`/`podPortCode`/`consigneeName` through save/reload cycles.
- **`app/actions/stowage-plan.ts`**: `SaveCargoAssignmentsSchema` gains `polPortCode`, `podPortCode`, `consigneeName` optional fields. `saveCargoAssignments()` persists these fields to MongoDB. `markPlanSent()` now uses snapshot-first approach for bookingNumber lookup — reads `pos.bookingNumber` from saved cargoPosition first, falls back to DB query only for legacy positions. Non-ObjectId booking IDs (CONTRACT-ESTIMATE-xxx) are filtered out before querying BookingModel to prevent cast errors.
- **Root cause**: contract estimate positions (bookingId: "CONTRACT-ESTIMATE-xxx") were excluded from save because `handleSavePlan` only iterated real bookings. POD colors disappeared on reload because `podPortCode` was never persisted.
- **New Draft**: confirmed working — copies all cargoPositions from locked plan, numbered with next consecutive suffix (e.g. 0001 → 0002).

#### Bookings page: vessel column + new filters + smart archive toggle

- **`app/bookings/BookingsClient.tsx`**: removed Client column, added Vessel column. Column order is now: Booking · Service · Vessel · Voyage · Shipper · Consignee · Cargo · Requested · Confirmed · Standby · Route · Status · Actions. Added shipper, consignee, and route filter dropdowns. Voyage filter now shows `[VESSEL NAME] [VOYAGE NUMBER]` format. Status filter triggers archive mode automatically when CANCELLED or REJECTED is selected (navigates to `?archived=true&status=...`). Added "Show Archived / Hide Archived" toggle button.
- **`app/bookings/page.tsx`**: passes `showArchived` and `initialStatusFilter` to client. `showArchived` is true when `?archived=true` OR when `?status=CANCELLED/REJECTED`.
- **`app/actions/booking.ts`**: `getBookings(includeArchived = false)` and `getAdminBookings(includeArchived = false)` — when false (default), exclude CANCELLED/REJECTED bookings and bookings from COMPLETED/CLOSED/CANCELLED voyages. This keeps active booking lists clean without deleting data.

#### Admin bookings tab: vessel column + archive toggle

- **`app/admin/AdminClient.tsx`**: `BookingsTab` gains Vessel column after Booking #. Voyage filter uses `[VESSEL NAME] [VOYAGE NUMBER]` format. Archive toggle and status filter work same as `/bookings`. `key` prop on `BookingsTab` forces remount when `showArchived` or `initialStatusFilter` changes, fixing useState not reinitializing on prop change.
- **`app/admin/page.tsx`**: reads `archivedBookings` and `status` searchParams, computes `showArchivedBookings`, passes to `AdminClient`.

#### MongoDB: unlock stowage plans via CLI

Plans locked at EMAIL_SENT status can be reset to DRAFT via mongosh for testing/cleanup:
```
db.stowageplans.updateMany({ planNumber: { $in: [...] } }, { $set: { status: "DRAFT" } })
```

**Files changed in v1.51.0:**
`app/stowage-plans/[id]/page.tsx` · `app/actions/stowage-plan.ts` · `app/bookings/BookingsClient.tsx` · `app/bookings/page.tsx` · `app/bookings/page.module.css` · `app/actions/booking.ts` · `app/admin/AdminClient.tsx` · `app/admin/page.tsx`

---

### v1.50.0 (2026-04-08) — Booking date guards + port call ATA/ATD columns + UI refinements

#### Booking creation guards by POL port call date (frontend + backend)

- **`app/actions/booking.ts`**: `createBookingFromContract()` and `updateBookingQuantity()` now validate the POL port call dates before allowing booking creation or edits.
  - ATD set → all roles blocked ("vessel already departed").
  - ETA passed + no ATA → ADMIN/PLANNER blocked ("update ATA first"); EXPORTER blocked ("contact coordinator").
  - ETA passed + ATA recorded + no ATD → ADMIN/PLANNER allowed (vessel in operations); EXPORTER blocked ("vessel in port operations, contact coordinator").
- **`app/bookings/BookingsClient.tsx`**: `goToStep3()` validates POL port call before proceeding — checks ATD (blocks all) and ETA-passed-without-ATA (blocks planners with clear message to update ATA first). `VoyageOption` interface gains `portCalls` with `eta`, `ata`, `atd` fields.
- **`app/bookings/page.tsx`**: `portCalls` added to VoyageOption mapping passed to client.
- **`app/shipper/request/RequestClient.tsx`**: `handleStep2Next()` blocks progression if POL has ATD or `inOperation` flag. Voyage cards show amber "⚠ In port operations" badge when applicable. `polPortCode` passed as second argument to `getUpcomingVoyagesForService`.
- **`app/actions/shipper.ts`**: `getUpcomingVoyagesForService(serviceId, shipperPolPortCode?)` — new optional param; filters out voyages where POL already has ATD; adds `inOperation` boolean to each portCall (ETA passed + ATA recorded + no ATD).

#### Port call table: ATA and ATD as separate columns

- **`app/voyages/[id]/VoyageDetailClient.tsx`**: Port calls table restructured from 8 to 10 columns — ETA and ATA are now separate columns, ETD and ATD are separate columns. ATA column shows green value when recorded, amber indicator when ETA has passed but ATA is missing. ATD column shows muted value when recorded. Editing mode uses 4 separate `<td>` inputs instead of stacked sub-rows. Column headers distinguish estimated (ETA/ETD) from actual (ATA/ATD) with color-coded "actual" sublabels.
- **`app/voyages/[id]/VoyageDetailClient.module.css`**: Added `.ataValue`, `.atdValue`, `.ataMissing` classes. Removed stale `.actualInputRow`, `.actualLabel`, `.actualValue` classes.

#### Email: vessel name order corrected

- **`lib/email.ts`**: All 8 booking email functions now render vessel/voyage as `VESSEL NAME / VOYAGE NUMBER` (was `VOYAGE NUMBER · VESSEL NAME`). Label changed from "Voyage / Vessel" to "Vessel / Voyage". Plain-text fallbacks updated to match.

#### Booking vesselName resolution hardened

- **`app/actions/booking.ts`**: `createBookingFromContract()` now fetches vessel name via `VesselModel.findById(voyage.vesselId)` as fallback when `voyage.vesselName` is empty. `approveBooking()`, `rejectBooking()`, `cancelBooking()`, `updateBookingQuantity()` all resolve `vesselName` through the same cascade: `booking.vesselName → voyage.vesselName → VesselModel.name` before sending emails.

#### Stowage plan SVG: footer strip column proportions

- **`components/vessel/VesselProfile.tsx`**: Footer strip restored to 5 columns (design factor, historical factor, actual factor, POL codes, temperature). Columns are now proportionally sized: factors at 10%/10%/10%, POL at 57%, temperature at 13%. Previously the 3 factor columns were collapsed into 1 by a prior agent edit.

#### Stowage plan detail panel: compartment / zone display

- **`components/vessel/VesselProfile.tsx`**: Click panel header now shows compartment ID and zone name inline as `"2A / 2AB"` with a colored zone badge. Previously the zone badge was a separate element crowding the close button.

#### ATA/ATD input validation: min constraints

- **`app/voyages/[id]/VoyageDetailClient.tsx`**: ATA `datetime-local` input gains `min={ETA}` — prevents setting ATA before ETA; inline error "ATA cannot be before ETA". ATD input gains `min={ATA ?? ETA}` with matching inline errors.
- **`app/actions/voyage.ts`**: `updatePortRotation()` backend now validates `ata >= eta` and `atd >= ata (or eta)` in addition to the existing "not in future" checks.

**Files changed in v1.50.0:**
`app/actions/booking.ts` · `app/actions/shipper.ts` · `app/bookings/BookingsClient.tsx` · `app/bookings/page.tsx` · `app/shipper/request/RequestClient.tsx` · `app/voyages/[id]/VoyageDetailClient.tsx` · `app/voyages/[id]/VoyageDetailClient.module.css` · `app/actions/voyage.ts` · `lib/email.ts` · `components/vessel/VesselProfile.tsx`

---

### v1.36.0 — 2026-03-25

#### Shipper portal: company name in sidebar
- `app/shipper/layout.tsx` made `async`; calls `auth()` + `getShipperById(shipperId)` server-side to resolve company name before rendering
- `auth.config.ts` — `session` callback now maps `token.shipperId` → `session.user.shipperId` (was missing; caused `shipperId` to always be null in server components calling `auth()`)
- `components/layout/ShipperShell.tsx` — accepts and forwards `shipperName?: string` prop
- `components/layout/ShipperSidebar.tsx` — brand section restructured: `brandContent` div wraps `brandMeta` row (logo + "Shipper" badge) and new `brandCompany` span below; user section `.userRole` shows shipper name instead of hardcoded "Exporter" (falls back to "Shipper" if no linked shipper); collapses cleanly with sidebar
- `components/layout/ShipperSidebar.module.css` — added `.brandContent`, `.brandMeta`, `.brandCompany` classes

#### Admin Services: vesselPool management UI
- `app/actions/service.ts` — `assignVesselToService()` and `removeVesselFromService()` now have auth guards (ADMIN + SHIPPING_PLANNER); added `auth` import
- `app/admin/AdminClient.tsx` — `AdminService` interface gains `vesselPool?: string[]`; `ServicesTab` accepts `vessels: AdminVessel[]` prop (passed from parent); service detail panel now shows a "Vessel Pool" section: lists assigned vessels with individual Remove buttons, plus a select + Add button for unassigned active vessels; pool errors displayed inline

#### Voyage wizard: vessel filtering by service pool
- `app/voyages/new/page.tsx` — `ServiceData` interface gains `vesselPool?: string[]`; Step 2 filters vessel grid to only service pool members when pool is non-empty; shows count hint ("Showing N vessel(s) assigned to this service"); shows error box if pool is configured but empty; vessel name moved above IMO/flag for better visual hierarchy

#### Admin booking creation modal: layout fixes
- `app/bookings/page.module.css` — `.modal` widened from `max-width: 600px` → `720px`; added `min-height: 600px`; added `overflow-x: visible`; `.modalBody` gets `overflow: visible` so the absolutely-positioned `ContractSelect` dropdown panel is not clipped
- `components/ui/ContractSelect.module.css` — dropdown `.panel` `max-height` increased from `300px` → `360px`

**Files changed in v1.36.0:**
`app/shipper/layout.tsx` · `auth.config.ts` · `components/layout/ShipperShell.tsx` · `components/layout/ShipperSidebar.tsx` · `components/layout/ShipperSidebar.module.css` · `app/actions/service.ts` · `app/admin/AdminClient.tsx` · `app/voyages/new/page.tsx` · `app/bookings/page.module.css` · `components/ui/ContractSelect.module.css`

---

### v1.37.0 (2026-03-26) — Cross-browser flag icons via flag-icons CSS library

- **Problem:** Unicode regional indicator emoji (🇨🇱, 🇳🇱) do not render on Windows Chrome/Edge/Opera — they show letter sequences instead of flags.
- **`flag-icons` npm package** added (`^7.2.3`). Renders flags as CSS sprite SVGs using `<span class="fi fi-cl" />` pattern.
- **`lib/utils/flagIcon.tsx`** (new): exports `FlagIcon({ code, className })` component. Accepts ISO 3166-1 alpha-2 code (e.g. "CL"); lowercases it and applies `fi fi-{code}` CSS classes. Returns `null` for invalid/missing codes.
- **`app/layout.tsx`**: added `import 'flag-icons/css/flag-icons.min.css'` to load SVG sprites globally.
- **`components/layout/Sidebar.tsx`**: port temps widget replaces raw emoji with `<FlagIcon code={p.country} />`. `PortTemp` interface field renamed `flag` → `country`. `FleetStatus` interface `confirmed` field removed (status removed from vocab).
- **`components/ui/CountrySelect.tsx`**: flag no longer stored in input text state; a positioned `<FlagIcon>` overlay sits in front of the input when a country is selected. Added `.inputFlagPrefix` (absolute overlay) + `.inputWithFlag` (adds padding-left) to `CountrySelect.module.css`.
- **`app/vessels/[id]/page.tsx`**: replaces `flagDisplay()` helper with `<FlagIcon code={vessel.flag} />` inline.
- **`lib/mock-data.ts`**: `status: 'ESTIMATED'` corrected to `'PLANNED'` (TypeScript error fix after status enum change).

**Files changed in v1.37.0:**
`lib/utils/flagIcon.tsx` *(new)* · `app/layout.tsx` · `components/layout/Sidebar.tsx` · `components/ui/CountrySelect.tsx` · `components/ui/CountrySelect.module.css` · `app/vessels/[id]/page.tsx` · `lib/mock-data.ts`

---

### v1.38.0 (2026-03-26) — Voyage status simplification + full voyage lifecycle

#### Part 1 — Remove ESTIMATED and CONFIRMED from VoyageStatus
- **`types/models.ts`**: `VoyageStatus` reduced to `'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'CANCELLED'`. `ESTIMATED` and `CONFIRMED` removed.
- **`lib/db/schemas.ts`**: VoyageSchema status enum updated to match.
- **`scripts/migrate-voyage-status.ts`** (new): one-time migration that updates all existing voyages with `ESTIMATED` or `CONFIRMED` status to `PLANNED`. Already run; returned 0 documents modified (DB was already clean).
- **`app/voyages/VoyagesClient.tsx`**: removed ESTIMATED/CONFIRMED from `statusStyles` map and filter dropdown; added CLOSED.
- **`app/vessels/[id]/page.tsx`**: `VOYAGE_STATUS_PRIORITY` updated to `['IN_PROGRESS', 'PLANNED']`.
- **`app/page.tsx`**: `activeVoyages` filter updated to `status === 'IN_PROGRESS' || status === 'PLANNED'`.
- **`app/actions/service.ts`**: active-voyage guard query updated; removed ESTIMATED/CONFIRMED.
- **`app/actions/shipper.ts`**: three voyage queries updated; removed ESTIMATED/CONFIRMED.

#### Part 2 — Auto-status transitions (fire-and-forget)
- **`app/actions/voyage.ts`** — new private `syncVoyageStatuses()` function:
  - Fetches all non-CLOSED/CANCELLED voyages; checks ETAs of first/last port calls.
  - `PLANNED` → `IN_PROGRESS`: when first LOAD port ETA is in the past.
  - `IN_PROGRESS` → `COMPLETED`: when last port ETA is in the past.
  - Fired fire-and-forget from `getVoyages()` and `getAdminVoyages()` (`.catch(() => {})`).

#### Part 3 — Close voyage (manual COMPLETED→CLOSED transition)
- **`app/actions/voyage.ts`** — new `closeVoyage(voyageId, lastPortAtd)` exported action:
  - Guards: ADMIN or SHIPPING_PLANNER only.
  - Validates voyage is in COMPLETED status.
  - Sets `status: 'CLOSED'` and records ATD on the last active port call via MongoDB `arrayFilters`.
- **`app/voyages/[id]/VoyageDetailClient.tsx`** — new `CloseVoyageButton` component:
  - Shown when `voyage.status === 'COMPLETED'` and user has edit rights.
  - Modal with `datetime-local` input (max=now) for last port ATD.
  - On success: calls `router.push('/voyages')`.

#### Part 4 — Port-level locking (ATD auto-lock on LOAD ports)
- **`lib/db/schemas.ts`**: `VoyagePortCallSchema` gains `locked: Boolean` (default false), `lockedBy: ObjectId ref User`, `lockedAt: Date`.
- **`types/models.ts`**: `VoyagePortCall` interface gains `locked: boolean`, `lockedBy?: string`, `lockedAt?: Date`.
- **`app/actions/voyage.ts`** — `updatePortRotation()` DATE_CHANGED branch: when ATD is set and port operations include LOAD, sets `portCalls[n].locked = true` via arrayFilters.
- **`app/actions/booking.ts`** — `createBookingFromContract()` and `updateBookingQuantity()`: new POL lock check — if the booking's POL port call has `locked: true`, creation/edit is rejected with "Load port has already departed".
- **`app/voyages/[id]/page.tsx`**: port call editor hidden when voyage is CLOSED; locked ports rendered with visual indicator in `PortCallsEditor`.

#### Part 5 — In-transit destination change (POD divert)
- **`lib/db/schemas.ts`**: `BookingSchema` gains `changelog: [{ changedAt, changedBy, field, fromValue, toValue }]`.
- **`types/models.ts`**: `Booking` interface gains `changelog?: Array<{ changedAt, changedBy, field, fromValue, toValue }>`.
- **`app/actions/booking.ts`** — new `updateBookingDestination(bookingId, { podPortCode, podPortName, consigneeName })` exported action:
  - Guards: ADMIN or SHIPPING_PLANNER only.
  - Validates voyage is IN_PROGRESS.
  - Updates `pod.portCode`, `pod.portName`, and `consignee.name`; appends three `changelog` entries.
- **`app/voyages/[id]/VoyageDetailClient.tsx`** — new `ChangeDestinationButton` component:
  - Shown per booking row when `voyage.status === 'IN_PROGRESS'` and user has edit rights.
  - Modal with POD select (from voyage's own port calls, discharge only) + consignee name input.
- **`app/voyages/[id]/page.tsx`**: derives `dischargePorts` from voyage portCalls; passes to `ChangeDestinationButton`; adds POD column to bookings table; `auth()` called server-side to gate `canEdit`.

**Files changed in v1.38.0:**
`types/models.ts` · `lib/db/schemas.ts` · `scripts/migrate-voyage-status.ts` *(new)* · `app/actions/voyage.ts` · `app/actions/booking.ts` · `app/actions/service.ts` · `app/actions/shipper.ts` · `app/voyages/VoyagesClient.tsx` · `app/voyages/[id]/page.tsx` · `app/voyages/[id]/VoyageDetailClient.tsx` · `app/voyages/[id]/VoyageDetailClient.module.css` · `app/vessels/[id]/page.tsx` · `app/page.tsx` · `lib/mock-data.ts`

---

### v1.39.0 (2026-03-26) — Office schema: services array + parent office

- **`lib/db/schemas.ts`** — `OfficeSchema` gains:
  - `services: [{ type: String }]` — array of serviceCode strings assigned to this office (e.g. `['CARIBANEX', 'RAYO']`).
  - `parentOfficeId: { type: ObjectId, ref: 'Office', required: false }` — optional hub/branch hierarchy.
- **`types/models.ts`** — `Office` interface gains `services: string[]` and `parentOfficeId?: string`.
- **`app/actions/office.ts`** — `CreateOfficeSchema` gains `services: z.array(z.string()).default([])`. Propagates through `UpdateOfficeSchema` via `.partial()`.
- **`app/admin/AdminClient.tsx`**:
  - `AdminOffice` interface gains `services?: string[]` and `parentOfficeId?: string`.
  - New `OfficeServiceChecklist` component renders a scrollable checkbox list of services (reuses `.officeServiceList` / `.officeServiceItem` CSS classes).
  - `CreateOfficeModal` and `EditOfficeModal` accept `allServices: AdminService[]` prop; render the checklist.
  - `OfficesTab` accepts `allServices` and passes to modals.
  - Office detail panel shows assigned services as badge chips.
- **`app/admin/page.module.css`** — added `.officeServiceList` (scrollable, max-height 180px, bordered) and `.officeServiceItem` (flex row with checkbox).

**Files changed in v1.39.0:**
`lib/db/schemas.ts` · `types/models.ts` · `app/actions/office.ts` · `app/admin/AdminClient.tsx` · `app/admin/page.module.css`

---

### v1.40.0 (2026-03-26) — User office assignments + JWT serviceFilter propagation

- **`lib/db/schemas.ts`** — `UserSchema` gains `offices: [{ type: ObjectId, ref: 'Office' }]`.
- **`types/models.ts`** — `User` interface gains `offices?: string[]`.
- **`app/actions/user.ts`**:
  - `CreateUserSchema` gains `officeIds: z.array(z.string()).default([])`.
  - `UpdateUserSchema` gains `officeIds: z.array(z.string()).optional()`.
  - Saved as `offices` in DB on create; applied via `update.offices = data.officeIds` on update.
  - `getUsers()`, `createUser()`, `updateUser()` all return `officeIds` in response payload.
- **`auth.ts`**:
  - Imported `OfficeModel`.
  - `authorize()` reads `user.offices` and includes `officeIds: string[]` in the returned user object.
  - JWT `user` path: stores `token.officeIds`; if non-empty, fetches associated offices and builds `token.serviceFilter` as the flat unique union of all `office.services[]`. Empty `officeIds` → `serviceFilter = []` (global access, e.g. ADMIN with no office assignment).
- **`auth.config.ts`** — `session` callback maps `token.officeIds` → `session.user.officeIds` and `token.serviceFilter` → `session.user.serviceFilter`.
- **`app/admin/AdminClient.tsx`**:
  - `AdminUser` interface gains `officeIds?: string[]`.
  - `CreateUserModal` and `EditUserModal` accept `offices: AdminOffice[]` prop.
  - Both modals render a scrollable office checklist (reuses `.officeServiceList` / `.officeServiceItem` styles) for non-EXPORTER roles, with label "Offices (leave empty for global access)".
  - `selectedOfficeIds` state initialized from `user.officeIds` in edit modal.
  - `UsersTab` accepts and propagates `initialOffices: AdminOffice[]`; all modal call sites updated.
  - In `AdminClient`, `UsersTab` call updated to pass `initialOffices={offices}`.

**Files changed in v1.40.0:**
`lib/db/schemas.ts` · `types/models.ts` · `app/actions/user.ts` · `auth.ts` · `auth.config.ts` · `app/admin/AdminClient.tsx`

---

### v1.41.0 (2026-03-27) — Service-scoped access filter applied to all list queries + chronological sort

#### Access filter applied
- **`lib/utils/accessFilter.ts`** (new): exports `buildServiceFilter(serviceFilter: string[])` — returns `{ serviceCode: { $in: serviceFilter } }` or `{}` for global access.
- **`app/actions/voyage.ts`** — `getVoyages()` and `getVoyagesForPlanWizard()`: when `serviceFilter` is non-empty, look up service ObjectIds via `ServiceModel.find({ serviceCode: { $in: [...] } })`, then filter voyages by `{ serviceId: { $in: serviceIds } }` (required because `Voyage.serviceCode` is an optional field not reliably set by the wizard — only `serviceId` is always present).
- **`app/actions/stowage-plan.ts`** — `getStowagePlans()`: two-step filter — serviceIds → voyageIds → `{ voyageId: { $in: voyageIds } }` (StowagePlanSchema has no `serviceCode` field).
- **`app/actions/booking.ts`** — `getBookings()`: `buildServiceFilter` applied via populated `voyageId`.
- **`app/actions/shipper.ts`** — `getShipperSchedules()`: serviceId-based filter applied so EXPORTER users only see voyages on their assigned services. `getBookingsByShipperCode()` and `getShipperDashboard()`: service filter intentionally **removed** — EXPORTER bookings are scoped by shipper identity, not service.

#### Admin: EXPORTER users can have office assignments
- **`app/admin/AdminClient.tsx`**: removed `role !== 'EXPORTER'` guard from offices checklist in `CreateUserModal` and `EditUserModal`; changed `officeIds: role !== 'EXPORTER' ? selectedOfficeIds : []` → `officeIds: selectedOfficeIds` in both submit handlers.

#### Chronological ascending sort on all lists
All list functions now return records earliest-first (previously mixed or descending):
- `getVoyages()`, `getAdminVoyages()`, `getVoyagesForPlanWizard()`: sort `{ weekNumber: 1, departureDate: 1 }`.
- `getStowagePlans()`, `getAdminPlans()`: in-memory sort by `voyageId.departureDate` ASC then `planNumber` ASC (Mongoose `.sort()` cannot sort on populated fields).
- `getBookings()`, `getAdminBookings()`: in-memory sort by `voyageId.departureDate` ASC then `bookingNumber` ASC; `getAdminBookings()` now populates `voyageId` with `departureDate weekNumber` for this sort.

**Files changed in v1.41.0:**
`lib/utils/accessFilter.ts` *(new)* · `app/actions/voyage.ts` · `app/actions/stowage-plan.ts` · `app/actions/booking.ts` · `app/actions/shipper.ts` · `app/admin/AdminClient.tsx`

---

### v1.42.0 (2026-03-27) — Voyage wizard: service filter + auto-skip for single-service users

- **`app/voyages/new/page.tsx`**: converted from `'use client'` to async server component. Calls `auth()` to read `session.user.serviceFilter`; fetches all active services via `getActiveServices()`; filters to only services matching `serviceFilter` (empty = all). Passes filtered list as `initialServices` prop to `NewVoyageWizard`.
- **`app/voyages/new/NewVoyageWizard.tsx`** (new — extracted from old `page.tsx`): `'use client'` wizard component. Accepts `initialServices: ServiceData[]` prop; no longer fetches services itself. Pre-selection logic: when `initialServices.length === 1`, initialises with `step=2`, `selectedService`, and `portSchedule` pre-built via `buildPortSchedule()` helper — skipping Step 1 entirely for single-service users. `buildPortSchedule(service)` extracted as a shared helper used both in initial state and `handleServiceSelect`.

**Files changed in v1.42.0:**
`app/voyages/new/page.tsx` · `app/voyages/new/NewVoyageWizard.tsx` *(new)*

---

### v1.43.0 (2026-03-27) — Sidebar: server-rendered fleet status and port temps filtered by service

**Problem:** Sidebar fetched fleet status and port weather via client-side `useEffect` using a hardcoded 6-port list (`SIDEBAR_PORTS`), with no service filtering.

**Fix:**
- **`components/layout/SidebarContext.tsx`** (new): React context (`SidebarContext`) holding `{ fleetStatus: FleetStatus | null, portTemps: PortTemp[] }`. Exports `SidebarProvider` and `useSidebarData()` hook.
- **`app/actions/voyage.ts`** — `getFleetStatus(serviceFilter?: string[])`: new optional param; when non-empty, looks up service ObjectIds and filters voyage count queries by `{ serviceId: { $in: serviceIds } }`.
- **`app/actions/service.ts`** — `getServicePortsForWeather(serviceFilter?: string[])`: new optional param filters to matching services. `ServicePortInfo` gains `lat: number | null` and `lon: number | null` fields. After collecting unique portCodes from service rotations, batch-queries `PortModel` by `unlocode` to populate coordinates.
- **`components/layout/Providers.tsx`**: accepts `fleetStatus` and `portTemps` props; wraps children in `SidebarProvider`.
- **`app/layout.tsx`**: server-side fetch — calls `getFleetStatus(serviceFilter)` and `getServicePortsForWeather(serviceFilter)` in parallel, then `getPortWeather()` for each port; passes results to `Providers`. Sidebar data is now filtered by the user's office service assignments.
- **`components/layout/Sidebar.tsx`**: removed `useState`, `useEffect`, `getPortWeather` import, `getFleetStatus` import, and `SIDEBAR_PORTS` hardcoded constant. Now reads `{ fleetStatus, portTemps }` from `useSidebarData()`. Empty `portTemps` shows "No ports configured" instead of "Loading…".

**Files changed in v1.43.0:**
`components/layout/SidebarContext.tsx` *(new)* · `app/actions/voyage.ts` · `app/actions/service.ts` · `components/layout/Providers.tsx` · `app/layout.tsx` · `components/layout/Sidebar.tsx`

---

### v1.44.0 (2026-03-27) — Weather: coordinate-based API lookup + port reseed + CSS fix

#### Coordinate-based weather lookup (fixes Radicatel and other industrial terminals)
**Problem:** `getPortWeather()` used only the city-name endpoint `?q=city,country`. Industrial port terminals like Radicatel (FRRAD) are not in OpenWeatherMap's city database — API returns 404, sidebar shows `—`.

**Fix:** Coordinate-based lookup is now the primary strategy; city-name is the fallback.
- **`app/actions/weather.ts`**:
  - `getPortWeather(city, country, lat?, lon?)`: when `lat`/`lon` are provided and non-zero, uses `?lat={lat}&lon={lon}` endpoint. Falls back to `?q={city},{country}` when missing. Cache key prefixed `coord:lat,lon` vs `city:city,country` to avoid collisions.
  - `getPortWeatherForecast(city, country, isoDate, lat?, lon?)`: threads `lat`/`lon` through to both internal `getPortWeather()` calls (current weather fallback paths).
- **`app/actions/service.ts`** — `ServicePortInfo` gains `lat: number | null`, `lon: number | null`. `getServicePortsForWeather()` batch-queries `PortModel` by `unlocode` after collecting portCodes; populates `lat`/`lon` from DB.
- **`app/actions/port.ts`** — new `getPortCoordsByUnlocodes(unlocodes: string[])` exported action: returns `Record<unlocode, { lat, lon }>` for a list of UNLOCODE strings. Used by voyages page.
- **`app/layout.tsx`**: passes `p.lat, p.lon` to `getPortWeather()`.
- **`app/voyages/page.tsx`**: `portKeys` map now stores `portCode`; calls `getPortCoordsByUnlocodes()` to batch-fetch coords; passes `coords?.lat, coords?.lon` to `getPortWeatherForecast()`.

**Result:** Radicatel (`lat=49.4833, lon=0.5167`) now returns temperature via OWM coordinate endpoint (resolves to Quillebeuf-sur-Seine). Verified: 200 OK, ~11°C.

#### Port collection reseed (stale `unlocode` field)
- **Problem:** All 21 operational ports had `unlocode: undefined` — the field was previously named `code` and renamed to `unlocode` at some point, but the DB data was never remigrated.
- **Fix:** `scripts/seed-ports.ts` already used `unlocode` correctly. Ran `npm run db:seed:ports` — 21 UNECE_PORTS + 21 operational ports reseeded. All ports now have `unlocode` populated (confirmed: 0 missing).

#### CSS: contracts table hover color normalized
- **Problem:** `app/contracts/page.module.css` `tr:hover` used `var(--color-bg-hover)` = `#1E3154` (solid dark blue), while all other admin tab tables used `rgba(255, 255, 255, 0.06)` (subtle white tint). The alternating row color (`rgba(255, 255, 255, 0.03)`) already matched.
- **Fix:** Changed contracts `tr:hover` to `rgba(255, 255, 255, 0.06)`.

**Files changed in v1.44.0:**
`app/actions/weather.ts` · `app/actions/service.ts` · `app/actions/port.ts` · `app/layout.tsx` · `app/voyages/page.tsx` · `scripts/seed-ports.ts` *(rerun)* · `app/contracts/page.module.css`

---

### v1.45.0 (2026-03-30) — Transactional email notification system

#### Dark maritime HTML template

- **`lib/email.ts`** — new `buildEmailHtml(options: BuildEmailHtmlOptions)` function: returns a full `<!DOCTYPE html>` document. Background `#0A1628`, card `#0F1F3D`, accent `#3b82f6`. Google Fonts `Space Grotesk` + `Inter` loaded via `@import`. Table-based layout (Outlook-compatible — no flexbox/grid). Reused by all new email functions.
- Private helpers: `formatCargoType(raw)` ("ORGANIC_BANANAS" → "Organic Bananas"), `bookingDetailTable(rows)` (HTML detail rows), `formatUtcDateTime(d)` (UTC date + time strings).

#### Booking lifecycle email functions

Ten new exported async functions added to `lib/email.ts`:

| Function | Recipient | Trigger |
|----------|-----------|---------|
| `sendBookingReceivedToShipper` | EXPORTER who submitted | Booking created by EXPORTER |
| `sendBookingCreatedOnBehalf` | Shipper user account | Booking created by planner/admin on shipper's behalf |
| `sendBookingReceivedToPlanners` | All planners scoped to service | Booking submitted by EXPORTER |
| `sendBookingStatusChanged` | Shipper user account | Booking approved / partial / rejected / standby |
| `sendBookingCancelledToShipper` | Shipper user account | Booking cancelled by planner/admin |
| `sendBookingCancelledToPlanners` | All planners scoped to service | Booking cancelled by EXPORTER |
| `sendBookingModifiedToShipper` | Shipper user account | Quantity updated by planner/admin |
| `sendBookingModifiedToPlanners` | All planners scoped to service | Quantity updated by EXPORTER |
| `sendPasswordChangedNotification` | Logged-in user | Password changed via `/account` |
| `sendFailedLoginWarning` | Account owner (if exists) | 5th consecutive failed login attempt |

#### Wiring in server actions

- **`app/actions/booking.ts`**:
  - `createBookingFromContract()`: reads `session.user.role`. EXPORTER path → `sendBookingReceivedToShipper` (session email) + fire-and-forget `sendBookingReceivedToPlanners`. Planner/Admin path → `UserModel.findOne({ shipperId: booking.shipperId })` then `sendBookingCreatedOnBehalf`; no planner notification.
  - `approveBooking()` / `rejectBooking()`: `UserModel.findOne({ shipperId: booking.shipperId })` resolves recipient email; sends `sendBookingStatusChanged` with confirmed/partial/rejected/standby status data. Console warning if no matching user found.
  - `cancelBooking()`: EXPORTER → `sendBookingCancelledToPlanners`; ADMIN/PLANNER → `sendBookingCancelledToShipper` (via `shipperId` lookup).
  - `updateBookingQuantity()`: EXPORTER → `sendBookingModifiedToPlanners`; ADMIN/PLANNER → `sendBookingModifiedToShipper` (via `shipperId` lookup).
  - `lookupPlannerRecipients(serviceCode)` — new private async helper: queries offices assigned to the service, then users with `SHIPPING_PLANNER` role in those offices; falls back to all confirmed planners globally. Reused by all four planner-notify call sites.
- **`app/actions/user.ts`**: `changePassword()` fires `sendPasswordChangedNotification` fire-and-forget after hash update.
- **`app/actions/auth.ts`**: `recordFailedAttempt()` return type changed from `void` → `number`; on exactly the 5th failed attempt, queries `UserModel` for the account and fires `sendFailedLoginWarning`.

#### Recipient resolution pattern

All post-creation notifications use `UserModel.findOne({ shipperId: booking.shipperId })` to resolve the shipper's user account email. This is canonical: it links the `Shipper` document (ObjectId) to the `User` account — not `booking.client.email` (often empty) and not `ShipperModel` (holds company contact, not user login email).

#### No schema changes

No new collections or schema fields were added in v1.45.0.

**Files changed in v1.45.0:**
`lib/email.ts` · `app/actions/booking.ts` · `app/actions/user.ts` · `app/actions/auth.ts`

---

### v1.49.0 (2026-04-07) — Stowage plan SVG rendering fixes

#### vessels/[id] always shows empty profile
- `app/vessels/[id]/page.tsx`: `profileAssignments` now always calls `buildEmptyAssignments(temperatureZones)` — never reads plan cargo data. Vessel detail page shows structure only, regardless of whether a stowage plan exists for the vessel.

#### stowage-plans/[id] renders cargo correctly
- `app/stowage-plans/[id]/page.tsx`: removed hardcoded `defaultTempZoneConfig` (ACONCAGUA BAY section IDs). `tempZoneConfig` now initializes as `[]` and is always built from `p.vesselId.temperatureZones` — either from `coolingSectionStatus` when present, or directly from the vessel's zone/section structure as fallback. This fixes the Hood Island and all non-ACONCAGUA BAY vessels showing empty SVG.

#### POD-based colors and POL codes now display correctly
- Root cause: `autoGenerateSinglePlan()` in `app/actions/stowage-plan.ts` was building `allBookingMeta` for contract estimate entries without `polPortCode` and `podPortCode` fields. `mapEngineOutputToDocument()` could not resolve these fields, so all saved `cargoPositions` had `polPortCode: undefined` and `podPortCode: undefined`.
- Fix: added `polPortCode: ce.polPortCode` and `podPortCode: ce.podPortCode` to the contract estimate entries in `allBookingMeta` inside `autoGenerateSinglePlan()`.
- Also fixed: `contractEstimates.push()` calls inside `autoGenerateSinglePlan` now include `polPortCode` and `podPortCode` as port code strings (matching the pattern already correct in `autoGenerateDraftPlans`).
- Result: SVG compartments now show distinct colors per destination port (POD palette: `#3b82f6`, `#f59e0b`, `#10b981`, `#ef4444`, `#8b5cf6`, `#ec4899`, `#06b6d4`). POD legend renders below SVG. Cell footer strip shows POL port codes.

**Files changed in v1.49.0:**
`app/vessels/[id]/page.tsx` · `app/stowage-plans/[id]/page.tsx` · `app/actions/stowage-plan.ts`

---

### v1.48.0 (2026-04-02) — Auto-generate temperature config: UX improvements

Refinement of the temperature configuration step inside the Auto-Generate Plan modal introduced in v1.47.0. The 2-step flow structure and server action are unchanged.

#### Input visual affordance
- Temperature inputs in coolingSection footer cells now have explicit background (rgba(255,255,255,0.08)), visible blue border (rgba(100,160,255,0.4)), border-radius, and a fixed "°C" suffix span — they now clearly look like interactive fields rather than decorative elements.
- On focus: border brightens to rgba(100,160,255,0.9) + cell glow (box-shadow: 0 0 0 2px rgba(59,130,246,0.3)).
- On valid value: border turns green rgba(34,197,94,0.7).
- On invalid value (outside -25 to +15): border turns red rgba(239,68,68,0.8) + tooltip "Valid range: -25°C to +15°C".
- Placeholder text "°C" shown in dimmed color when empty.

#### Zone synchronization trigger changed to onBlur
- Previously synced sibling sections on every keystroke (onChange). Now syncs on blur to avoid mid-typing flicker.
- After propagation, synced cells flash briefly (200ms, rgba(59,130,246,0.15)) so the user sees what was affected.

#### Cell body tint by temperature range
- When a valid temperature is set, the main body area of the cell receives a subtle background tint indicating cargo type compatibility:
  - ≤ 0°C: rgba(147,197,253,0.08) — icy blue (frozen cargo)
  - 1–8°C: rgba(134,239,172,0.08) — cool green (chilled cargo)
  - 9–15°C: rgba(253,224,132,0.08) — warm yellow (tropical cargo)

#### Zone label above each input
- Small "zone: {zoneId}" label (e.g. "zone: 2CD") shown above each temperature input in 8px dimmed text, making the sync relationship visible before the user starts typing.

#### Bulk action toolbar
- New toolbar row above the vessel profile in Step 2: a number input + "Apply to all zones" button sets all temperature inputs simultaneously (respects zone sync logic). A "Clear all" button resets all inputs and removes cell tints.

#### UX copy improvements
- Step 2 header gains a subtitle: "Set the target temperature for each cooling zone. Sections in the same zone synchronize automatically."
- Below the Generate Plan button: hint text "Enter at least one zone temperature to continue" shown when no zones have a value; hidden once at least one valid value exists.

**Files changed in v1.48.0:**
`app/stowage-plans/AutoGenerateButton.tsx` · `app/stowage-plans/page.module.css` · `components/vessel/VesselProfile.tsx`

---

### v1.47.0 (2026-04-01) — Stowage plan UI redesign: schema prep + SVG layout + cell data + auto-generate flow + plan detail cleanup

#### Schema additions (prerequisite)
- **`lib/db/schemas.ts`** — `CoolingSectionSchema` gains two optional fields:
  - `historicalStowageFactor: { type: Number, min: 0.5, max: 3.0 }` — rolling average stowage factor from completed voyages for this section
  - `isFull: { type: Boolean, default: false }` — flag set true when section is considered fully loaded in the current plan (used to compute live actual factor)
- **`types/models.ts`** — `CoolingSection` interface gains `historicalStowageFactor?: number` and `isFull?: boolean`

#### VesselProfile SVG layout redesign
- **`components/vessel/VesselProfile.tsx`**: All holds now occupy equal horizontal width in the drawing area (Hold 1 no longer narrower than others). Drawing area expands to ~85% of SVG width, eliminating the large dead space at the stern that previously could have fit an entire extra hold.
- **FC level** (T4A/T4B vessels, Hold 1 only): rendered as a cell 60% of hold width, horizontally centered, sitting above the main column as a visual "step" at the bow — matching the real vessel profile.
- **UPD level** (T1 vessels, Holds 2/3/4 only): rendered as a cell 50% of hold width, horizontally centered, sitting above the A level row.
- FC and UPD cells are ~60% the height of a normal level row.
- **Temperature zone legend removed** from SVG header — the colored squares with zone names and °C values are no longer shown above the profile.

#### CoolingSection cell data overlay
- Each coolingSection cell now shows a **top header strip** (3 boxes): capacity in pallets (using historicalStowageFactor if available, else designStowageFactor), pallets loaded, and available pallets.
- **Bottom footer strip**: factor default | factor histórico | factor actual (only when isFull=true, calculated as sqm/palletsLoaded) | POL port codes | temperature (°C).
- `VoyageTempAssignment` interface in `lib/vessel-profile-data.ts` extended with: `palletsLoaded`, `capacity`, `polPortCodes`, `assignedTemperature`, `isFull`.
- Parent page `app/stowage-plans/[id]/page.tsx` computes these values when building the assignments array from cargoPositions + vessel temperatureZones.

#### Auto-generate plan: one voyage at a time + inline temperature configuration
- **`app/stowage-plans/page.tsx`** + **`AutoGenerateButton.tsx`**: clicking "Auto-Generate Plan" now opens a 2-step flow instead of generating all plans immediately.
  - Step 1: modal listing voyages without a plan — user selects exactly one.
  - Step 2: vessel longitudinal profile rendered empty (no cargo), with editable temperature inputs in each coolingSection footer. Typing a temperature in any section auto-propagates to all sections sharing the same temperatureZone. "Generate Plan" button disabled until at least one zone has a temperature.
- **`app/actions/stowage-plan.ts`** — `autoGenerateDraftPlans()` now accepts `(voyageId: string, zoneTemperatures: Record<string, number>)` instead of generating for all voyages. Returns the new plan `_id` for client-side navigation. Zone temperatures are applied to coolingSectionStatus before running the engine.
- The existing `/stowage-plans/new` 3-step wizard is unchanged.

#### Plan detail page: compact header + contextual booking assignment
- **`app/stowage-plans/[id]/page.tsx`**: Header reduced to a single ~48px bar: plan number (once), status badge, voyage number (once), action buttons right-aligned. Eliminated all redundant repetitions of vessel name and plan number.
- **ConfigureZonesModal** removed from plan detail page (temperature is now configured at plan creation time). Modal file kept — not deleted.
- **Persistent booking select removed** from plan detail layout. Replaced with a contextual inline panel that appears when a coolingSection is clicked in the SVG:
  - Shows section ID and assigned temperature
  - Lists only bookings eligible for that section: CONFIRMED/PARTIAL status, temperature-compatible cargo, POL/POD overstow-safe, remaining capacity > 0
  - Each eligible booking shows shipper, cargo type, pallet count, POL→POD route, and an Assign button
  - "No eligible bookings" message with reason when none qualify

**Files changed in v1.47.0:**
`lib/db/schemas.ts` · `types/models.ts` · `components/vessel/VesselProfile.tsx` · `lib/vessel-profile-data.ts` · `app/stowage-plans/[id]/page.tsx` · `app/stowage-plans/[id]/page.module.css` · `app/stowage-plans/page.tsx` · `app/actions/stowage-plan.ts`

---

### v1.46.0 (2026-03-31) — Vessel name in booking emails + service-filtered contract wizard

#### Vessel name denormalized onto BookingSchema and included in all email notifications

- **`lib/db/schemas.ts`** — `BookingSchema` gains `vesselName: { type: String }` (optional, no `required: true` for backward compatibility with pre-existing bookings).
- **`app/actions/booking.ts`** — `createBookingFromContract()`: saves `vesselName: (voyage as any).vesselName ?? ''` into the new field at booking creation time. The voyage document is already fetched at that point — no additional query required.
- **`lib/email.ts`** — `vesselName?: string` added to six interfaces: `BookingEmailData`, `BookingStatusEmailData`, `BookingCancelledShipperData`, `BookingCancelledPlannerData`, `BookingModifiedShipperData`, `BookingModifiedPlannerData`. All eight booking email HTML bodies updated: the voyage row is now labeled `'Voyage / Vessel'` and renders `"ACON-062026 · ACONCAGUA BAY"` format (vessel name appended with ` · ` separator when present; omitted gracefully for legacy bookings where the field is absent).
- **`app/actions/booking.ts`** — `vesselName: booking.vesselName ?? ''` added to every booking email call site: `emailData` (new bookings), `approveBooking()`, `rejectBooking()`, `cancelBooking()` (both planner and shipper paths), `updateBookingQuantity()` (both planner and shipper paths). No additional DB queries — `booking.vesselName` is already in scope at all call sites.

#### Duplicate booking error: show shipper name instead of code

- **`app/actions/booking.ts`** line 162: error message changed from `"${validated.shipperCode}"` to `"${existingBooking.shipper.name || validated.shipperCode}"` — `existingBooking` is already fetched at that point; falls back to the code if name is unexpectedly empty.

#### Booking wizard: contract list filtered by user's serviceFilter

- **`app/bookings/page.tsx`** — `auth` imported from `@/auth`. `auth()` added to the parallel `Promise.all` fetch. After contracts are fetched, a server-side filter is applied: when `session.user.serviceFilter` is non-empty, only contracts whose `serviceCode` is in that array are passed to the client. Empty `serviceFilter` (ADMIN with no office restriction) passes all contracts unchanged. No changes to `getActiveContracts()`, no schema changes, no client-side logic changes.

**Files changed in v1.46.0:**
`lib/db/schemas.ts` · `lib/email.ts` · `app/actions/booking.ts` · `app/bookings/page.tsx`

---

## NEXT STEPS

### 📋 Pending / Next
- Smoke test end-to-end: create RAYO and CARIBANEX services, users, shippers,
  customers, contracts, voyages, bookings, stowage plans via UI
- Known limitation: ForecastWizard Step 2 cannot detect bookings without a
  prior forecast (relies on planImpact === REPLACED_BY_BOOKING). Fix: cross-check
  against getBookingsByShipperCode() in Step 2 data fetch — deferred.
- Auto-update Claude Code CLI: npm i -g @anthropic-ai/claude-code
- Booking wizard step reorder (admin/planner): Step 1 = voyage, Step 2 =
  contracts filtered by service, Step 3 = details. Do NOT change shipper portal.
- Naval stability microservice (Python/OR-Tools) — future
- Live stowage display for port monitors — future

### 📋 Known Issues

| Issue | Impact | Suggested fix |
|-------|--------|---------------|
| cargoProducts + compatibilityGroups have no Admin UI yet | Admin cannot create/manage products or groups | Add tab in /admin with CRUD modals for both collections — SUPERUSER + ADMIN only |

### 📋 Backlog

| Item | Priority | Notes |
|------|----------|-------|
| PWA / field views — Stevedore (`/field/loading`), Checker (`/field/checklist`) | Low | |
| Python stability service — FastAPI + NumPy/SciPy | Low | |
| Code cleanup audit — stowage plan detail + related files | Technical debt | Review line by line and remove dead code, unused variables/imports, hardcoded constants superseded by DB data, legacy functions from earlier iterations, and logic duplicated between engine and UI. Files in priority order: `app/stowage-plans/[id]/page.tsx`, `components/vessel/VesselProfile.tsx`, `components/vessel/CoolingSectionTopDown.tsx`, `lib/stowage-engine/assign.ts`, `lib/stowage-engine/constraints.ts`, `lib/vessel-profile-data.ts`. Must be done before adding new features to these files. |
| Engine: outside-hatch pallet slots | Low | When sqm data per hatch vs orilla is available, add palletsUnderHatch / palletsOutsideHatch to CoolingSection; outsideHatch slots exempt from canPlace POL monotonic constraint |
| Live stowage display — `/stowage-plans/[id]/live` | Low | Read-only full-screen page optimized for large port monitors (TV/dock display). Shows the vessel longitudinal SVG profile with cargo already on board, plus real-time highlighting of the hold(s) currently being loaded. Auto-refreshes via polling or WebSocket as STEVEDORE/CHECKER users update pallet positions from the dock. Design requirements: large fonts, high contrast, no navigation controls, readable from distance. Critical dependency: requires STEVEDORE/CHECKER users actively updating stowage in situ from mobile/tablet devices on the dock — without that live input the display has no fresh data to show. Do not implement until the field checker/stevedore update flow is operational. |

---

## IMPLEMENTATION ROADMAP

*Added 2026-03-11. Execute steps in order — each step depends on the previous.*

### Step 1 — Data cleanup (prerequisite for everything else)
- Delete JUICE EXPRESS (IMO 9812456) from the vessels collection — it is a ghost
  test entry with no sections and incomplete data
- Verify T3A sister ships (ALBEMARLE ISLAND, CHARLES ISLAND, DUNCAN ISLAND,
  HOOD ISLAND) have identical sqm values intentionally — they are sister ships
  of the same type; confirm in DB and add a note to seed script
- Existing contracts in DB have weeklyPallets: undefined because they were created
  before that field was added — run a migration to set weeklyPallets: 0 on all
  contracts missing it, so the UI does not break when those contracts are displayed

### Step 2 — Pending UI prompts (contracts + admin + RBAC)
Execute the already-prepared prompts in this order:
1. Contract creation modal: add cargoType + weeklyPallets fields, allow multiple
   shippers at creation, admin contracts table edit/deactivate actions, shipper
   quantity validation vs contract total
2. Admin Bookings tab + /bookings overflow fix: new Bookings tab in /admin with
   approve/reject/cancel actions, fix table overflow in /bookings page
3. Admin detail views + navigation fix: click-through detail view for all admin
   tabs (vessels, users, services, shippers, ports, offices), fix contracts
   breadcrumb 404, add shipper management to contract edit modal
4. Data normalization + shipper-user relationship: Title Case for names, UPPERCASE
   for codes on all server actions, add shipperId to UserSchema, fix EXPORTER
   portal data filtering
5. RBAC sidebar: hide nav items the logged-in user's role cannot access

### Step 3 — Stowage engine ✅ DONE (v1.23.0)

### Step 4 — Wire engine into autoGenerateDraftPlans() ✅ DONE (v1.24.0)

### Step 5 — Conflict panel UI + temperature override flow ✅ DONE (v1.25.0)
Build lib/stowage-engine/ as a pure TypeScript module — no DB calls, no HTTP,
no external dependencies. Input: vessel data + bookings array + optional previous
plan temperatures. Output: cargoPositions[], coolingSectionStatus[], conflicts[].

Engine logic in execution order:
1. Temperature zone initialization
   - If a completed StowagePlan exists for this vessel+service: inherit
     assignedTemperature per zone from that plan (source: 'INHERITED')
   - If no prior plan exists: analyze bookings by cargo type volume, find which
     non-adjacent hold pair (1+3 or 2+4) has the largest combined sqm, set those
     zones to the majority cargo type temperature (source: 'MAJORITY_RULE')
   - Apply any planner overrides on top (source: 'PLANNER_OVERRIDE')

2. Constraint application in priority order (hard constraints first):
   a. Temperature compatibility (hard): filter sections per booking by cargo type
      temperature range vs zone assignedTemperature
   b. Port sequence / overstow (hard): cargo for earlier discharge ports must be
      accessible — never place later-discharge cargo in the only access path above
      earlier-discharge cargo within the same hold
   c. Capacity (hard): never exceed floor(sqm / designStowageFactor) pallets per
      section; allow configurable overfill % in Phase 1 (estimated) mode only,
      flagged as CAPACITY_WARNING
   d. Loading stability preference (soft): prefer filling non-adjacent hold pairs
      simultaneously (1+3 or 2+4) for the initial loading port
   e. Discharge stability (soft): simulate cargo removal port by port, compute
      longitudinal and transverse weight moments, flag if outside bands

3. Assignment algorithm:
   - Greedy constructive pass: sort bookings by (discharge port desc, pallet count
     desc), assign each to the first compatible section with remaining capacity
   - Local repair pass: if any booking is unassigned, attempt swaps with already
     assigned bookings in compatible sections
   - Stability balancing pass: nudge assignments between sections to improve
     trim/list index without violating temperature or overstow constraints

4. Conflict detection — never fail silently:
   - TEMPERATURE_CONFLICT: no zone has compatible temperature for this booking
   - CAPACITY_CONFLICT: compatible zones exist but all are full
   - OVERSTOW_CONFLICT: port sequence makes placement impossible in any section
   - STABILITY_WARNING: placement is valid but pushes trim/list index to yellow/red
   Each conflict includes: type, bookingIds[], zonesInvolved[], palletsAffected,
   suggestedActions[]

5. Two-phase data handling:
   - Phase 1 (estimated): use booking.requestedQuantity, mark assignments as
     confidence: 'ESTIMATED'
   - Phase 2 (confirmed): use booking.confirmedQuantity where available, mark as
     confidence: 'CONFIRMED'; confirmed assignments are frozen (not moved by
     re-runs unless planner explicitly unlocks)

File structure:
   lib/stowage-engine/
   ├── index.ts          — main generateStowagePlan() entry point
   ├── types.ts          — EngineInput, EngineOutput, Conflict interfaces
   ├── temperature.ts    — zone initialization logic
   ├── constraints.ts    — hard constraint validators
   ├── assign.ts         — greedy packer + local repair
   └── stability.ts      — weight moment calculations + trim/list indices

### Step 4 — Wire engine into autoGenerateDraftPlans()
Replace the current autoGenerateDraftPlans() stub in app/actions/stowage-plan.ts
(which creates empty shells) with a version that:
- Calls generateStowagePlan() from lib/stowage-engine/
- Saves returned cargoPositions[] and coolingSectionStatus[] to the plan document
- Saves conflicts[] to a new plan field for UI display
- Sets plan.generationMethod: 'AUTO' | 'MANUAL' | 'REVISED'
- On planner temperature override: re-calls engine with frozen confirmed assignments
  and new zone temperatures, updates plan, appends to temperatureChangelog

### Step 5 — Conflict panel UI + temperature override flow ✅ DONE (v1.25.0)
All 5 sub-items implemented in `/stowage-plans/[id]`:
- **Engine Analysis panel**: collapsible section showing `plan.conflicts[]` from DB, color-coded
  type badges (TEMPERATURE=red, CAPACITY=amber, OVERSTOW=red, STABILITY_WARNING=amber).
  Each conflict has clickable booking chips that set `highlightedSectionIds[]`, highlighting the
  relevant sections in the SVG profile with a green border.
- **Stability Timeline**: horizontal strip below the stats bar showing one stop per
  `plan.stabilityIndicators[]` entry; colored dot (GREEN/YELLOW/RED) + proportional trim-index
  bar + port code label. Replaces the hardcoded mock stability object.
- **Estimated vs confirmed visual**: `VoyageTempAssignment` gains `confidence` field. VesselProfile
  SVG renders a `#hatch-estimated` diagonal-line pattern overlay on ESTIMATED fills; CONFIRMED
  stays solid. Confidence derived from `booking.confirmedQuantity > 0`.
- **Temperature override replan flow**: `ConfigureZonesModal` `onSuccess` now sets
  `showReplanBanner=true`. A yellow banner appears with "⚡ Auto-Reassign Bookings" button that
  calls `replanAfterTemperatureOverride()`, updates bookings, conflicts, and stability in-place.
- **Highlighted sections**: `highlightedSectionIds` state passed to `VesselProfile` as
  `highlightedCompartmentIds`; clicking a section in the SVG clears the highlight.

### Step 6 — Python FastAPI migration (future, when stability math requires it)
When full naval architecture stability calculations are needed (GM, KG, drafts,
hydrostatic curves), migrate lib/stowage-engine/stability.ts to a Python FastAPI
microservice. The JSON contract between Next.js and the engine is already defined
from Step 3 — migration is replacing a local function call with a fetch() to
http://fastapi:8000/plan/generate. No frontend changes required.

Add docker-compose.yml at project root with two services: nextjs (existing) and
planner-engine (Python FastAPI). The Next.js service action checks for
PLANNER_ENGINE_URL env var — if set, calls FastAPI; if not set, falls back to
the TypeScript engine. This allows gradual migration with zero downtime.

---

## RECENT CHANGES

### v1.35.0 (2026-03-23) — Countries collection, Customers collection + Admin tab, CountrySelect component, customer-linked contracts

- **`CountrySchema` / `CountryModel`** (`lib/db/schemas.ts`): New collection. Fields: `name` (unique), `code` (ISO 3166-1 alpha-2, unique), `flag` (emoji), `active`. Indexed on `code` and `name`.
- **`CustomerSchema` / `CustomerModel`** (`lib/db/schemas.ts`): New collection for external counterparties. Fields: `customerNumber` (`CUST-0001` auto-seq), `name`, `type` enum `['CONSIGNEE', 'SHIPPER', 'AGENT']`, `countryCode`, `country` (denormalized), `contactName/Email/Phone`, `address`, `notes`, `active`, `createdBy`, timestamps. Indexed on `type`, `active`, `countryCode`.
- **`ContractSchema` updated** (`lib/db/schemas.ts`): Added `customerId` (optional `ObjectId` ref `Customer`), `notes` (`String`); extended `client.type` enum to include `'AGENT'`; removed `required: true` from all `client` subfields; changed `weeklyPallets` from `required + min:1` to optional `min:0`.
- **`scripts/seed-countries.ts`** (new): Upserts ~65 maritime-relevant countries (South America, Caribbean, North America, Europe, Africa, Asia Pacific, Middle East, flag states). Uses `CountryModel.updateOne({ code }, { $set: {...} }, { upsert: true })`. Safe to re-run. Added `"db:seed:countries"` to `package.json`.
- **`app/actions/country.ts`** (new): `getCountries()` — requires auth session, returns active countries sorted by name as `{ code, name, flag }[]`.
- **`app/actions/customer.ts`** (new): `getCustomers(filter?)`, `createCustomer()`, `updateCustomer()`, `deactivateCustomer()`. Read = authenticated; mutate = ADMIN only. `createCustomer` auto-generates `CUST-XXXX` sequence number; normalizes name/contactName via `toTitleCase`, email via `toLower`, countryCode `.toUpperCase()`.
- **`app/actions/contract.ts`** updated: Imported `CustomerModel`; `CreateContractSchema` now accepts optional `customerId`, `notes`, AGENT type, optional client subfields, `weeklyPallets` min 0; `createContract()` fetches customer from `CustomerModel` when `customerId` provided and uses its data (`name`, `contactName`, `contactEmail`, `countryCode`) for the `client.*` fields; falls back to manual input otherwise. `UpdateContractSchema` extended with AGENT type and `notes`.
- **`components/ui/CountrySelect.tsx` + `.module.css`** (new): Controlled combobox. Loads countries on mount via `getCountries()`. Live-filters by name or code. Absolute-positioned dropdown (max 200px, dark theme). Keyboard navigation: ArrowUp/Down moves highlight, Enter selects, Escape closes. 150ms blur timeout allows click to register before dropdown closes.
- **Admin Customers tab (11th)** (`app/admin/AdminClient.tsx`, `app/admin/page.tsx`): Full CRUD — table with Customer# / Name / Type / Country (flag + name) / Contact / Status columns; type filter buttons (ALL / CONSIGNEE / SHIPPER / AGENT); `CreateCustomerModal` and `EditCustomerModal` with `CountrySelect`; deactivate confirm modal; row click opens detail panel. `page.tsx` calls `getCustomers()` in `Promise.all`, passes result as `customers` prop.
- **CountrySelect in CRUD modals** (`app/admin/AdminClient.tsx`): Replaced free-text country `<input>` with `<CountrySelect>` in `CreateShipperModal`, `EditShipperModal`, `CreateOfficeModal`, `EditOfficeModal`, `CreateVesselModal` (flag field), `EditVesselModal` (flag field). Country/flag stored as ISO-2 code (`.toUpperCase()`); `shipper.ts` and `office.ts` actions updated to store `.toUpperCase()` instead of `toTitleCase()`.
- **CountrySelect in Contract modals** (`app/contracts/ContractsClient.tsx`): Replaced `clientCountry` text input with `<CountrySelect>` in `CreateContractModal` and `EditContractModal`. `contract.ts` action updated to store `.toUpperCase()` for country.
- **`CreateContractModal` refactored** (`app/contracts/ContractsClient.tsx`): Removed free-text client name/type/contact/email/country fields. Replaced with searchable customer combobox (search by name or customer number, onMouseDown selection, 150ms blur timeout). Selected customer shows a card with name, customerNumber, type badge, countryCode, and contactName; "Change" button resets. `clientType` is auto-derived from `selectedCustomer.type`. For AGENT contracts: shows Notes textarea instead of cargo/pallets grid; counterparties section hidden. `customers?: CustomerOption[]` added to `ContractsClientProps`; `customers={customers}` passed from AdminClient.
- **`flagDisplay()` helper** (`app/vessels/page.tsx`, `app/vessels/[id]/page.tsx`): Derives flag emoji from 2-letter ISO code via `String.fromCodePoint`; falls back to raw string for legacy full-name values (e.g. "LIBERIA"). Applied to vessel list card footer and vessel detail header.
- Files changed: `lib/db/schemas.ts`, `app/actions/contract.ts`, `app/actions/country.ts` *(new)*, `app/actions/customer.ts` *(new)*, `app/admin/AdminClient.tsx`, `app/admin/page.tsx`, `app/contracts/ContractsClient.tsx`, `app/contracts/page.module.css`, `app/vessels/page.tsx`, `app/vessels/[id]/page.tsx`, `components/ui/CountrySelect.tsx` *(new)*, `components/ui/CountrySelect.module.css` *(new)*, `scripts/seed-countries.ts` *(new)*, `package.json`

### v1.26.0 (2026-03-13) — Stowage engine: temperature grouping fix, capacity pre-check, portCode resolution, per-counterparty estimates

- **Fix 1 — Temperature grouping** (`lib/stowage-engine/temperature.ts`): Replaced the transitive-overlap
  `groupByTemperature` logic with per-cargoType grouping. Each distinct `cargoType` becomes its own group;
  ranges are never merged across cargo types. Previously TABLE_GRAPES (−0.5,0.5) + BLUEBERRIES (−0.5,1.0)
  collapsed with PLUMS (0.0,2.0) into a single group, leaving holds 1+3 with `null` temperatures. Now all
  8 zones are assigned: BLUEBERRIES → holds 1 (0.3°C), TABLE_GRAPES → holds 2+4 (0.0°C), PLUMS → holds 3 (1.0°C).
- **Fix 2 — Capacity pre-check** (`lib/stowage-engine/assign.ts`): Added a pre-assignment total capacity
  check before the greedy pass. When total requested pallets exceed total vessel capacity, lowest-priority
  bookings (end of priority-sorted list) are excluded up-front. Each excluded booking gets one
  `CAPACITY_CONFLICT` with a clear "vessel total capacity exceeded" message. Only the included bookings
  proceed to the greedy packer, eliminating spurious overstow conflicts caused by over-subscription.
- **Fix 3 — Per-counterparty contract estimates** (`app/actions/stowage-plan.ts`): `autoGenerateDraftPlans()`
  now iterates `contract.counterparties[]` and creates one `EngineBooking` per active counterparty using
  `counterparty.weeklyEstimate` and `counterparty.cargoTypes[0]`. Falls back to contract-level `weeklyPallets`
  + `cargoType` when no counterparties exist. Added `console.log` at each step (portCallMap, contract count,
  pol/pod resolution, per-counterparty details) for runtime diagnostics.
- **Fix 4 — Stability portCode resolution** (`lib/stowage-engine/types.ts`, `stability.ts`, `index.ts`,
  `stowage-plan.ts`): `EngineInput` gains optional `portCalls: {sequence, portCode}[]`. `index.ts` builds a
  `Map<number, string>` from it and passes it to `calculateStability()`. All three `portCode` output sites in
  `stability.ts` now use `portSequenceToCode?.get(portSeq) ?? \`SEQ\${portSeq}\`` — stability indicators
  show real port codes (e.g. `USILG`) instead of `SEQ2`. `portCalls` is populated in both
  `autoGenerateDraftPlans()` and `replanAfterTemperatureOverride()`.
- **Fix 5 — Contract/counterparty cargoType inconsistency warning**: `autoGenerateDraftPlans()` logs a
  `console.warn` when `contract.cargoType` is not present in a counterparty's `cargoTypes[]` array.
- **Updated CARGO_TEMP_RANGES**: BERRIES max 0.5→1.0, BLUEBERRIES max 0.5→1.0, PLUMS min −0.5→0.0.
- **Engine results after all fixes**: 4 CA voyages generate plans with 0 hard conflicts; all holds occupied;
  PLUMS no longer produce spurious CAPACITY_CONFLICT.

### v1.31.0 (2026-03-17) — POD color coding + cargo labels in stowage plan

- **VesselProfile SVG**: compartment fill color now represents port of destination (POD) instead of temperature zone. Each unique POD in the plan gets a distinct color from a fixed palette (`#3b82f6`, `#f59e0b`, `#10b981`, `#ef4444`, `#8b5cf6`, `#ec4899`, `#06b6d4`).
- **Cargo short label**: each occupied compartment shows a short text label (e.g. "BAN", "GRAP", "AVOC") derived from cargoType or from `cargoProduct.shortLabel` when available. Font size ~9px, centered in cell.
- **POD legend**: inline flex legend below the SVG — one colored dot + POD code per destination port present in the plan.
- **`getCargoTypeColor` removed**: function deleted from `app/stowage-plans/[id]/page.tsx`; color is now driven by `podColorMap` useMemo.
- **`podColor` and `cargoShortLabel`** added to `VoyageTempAssignment` interface in `lib/vessel-profile-data.ts`.
- **`tempToColor` retained**: still used by ConfigureZonesModal — not removed.
- Files changed: `app/stowage-plans/[id]/page.tsx`, `app/stowage-plans/[id]/page.module.css`, `components/vessel/VesselProfile.tsx`, `components/vessel/VesselProfile.module.css`, `lib/vessel-profile-data.ts`

### v1.34.0 (2026-03-17) — Engine: balance checks + updated tests

- **checkLoadingBalance(holdState, polSeq)** added to `lib/stowage-engine/stability.ts`: after each POL group is fully assigned, computes total pallets per hold among non-empty holds; emits LOADING_IMBALANCE YELLOW if ratio > 1.3, RED if > 1.5.
- **checkDischargeBalance(holdState, podSeq)** added to `lib/stowage-engine/stability.ts`: simulates removal of entries for a given podSeq, recomputes per-hold totals, applies same thresholds; emits DISCHARGE_IMBALANCE.
- **engine.test.ts updated**: portSequence and contractEstimates added to test input; 6 new assertions added (polSeq/podSeq defined on all positions, estimateStats present, totalContractEstimates === 2, monotonic POL check per hold, monotonic POD check per hold); all original 8 assertions retained; total assertions now 14.
- Files changed: `lib/stowage-engine/stability.ts`, `lib/stowage-engine/engine.test.ts`

### v1.33.0 (2026-03-17) — Engine: POL/POD assignment algorithm refactor

- **assign.ts fully replaced**: greedy now processes a sorted work queue (polSeq ASC → podSeq DESC → quantity DESC) instead of simple discharge-port sort.
- **HoldState** initialized per section with capacity derived from `floor(sqm / designStowageFactor)` — no hardcoded values.
- **getLevelsAbove / getLevelsBelow**: parse sectionId into holdNumber + level, apply fixed level order DECK > UPD > FC > A > B > C > D > E to determine vertical neighbors within same hold.
- **canPlace(booking, sectionId, holdState)**: four-condition check enforcing monotonic POL (fondo→tope non-decreasing) and monotonic POD (fondo→tope non-decreasing). Two consecutive POLs sharing a level are naturally permitted; non-consecutive mix blocked.
- **Balance score**: candidate sections scored by palletsUsed/capacity; preferred non-adjacent hold pair (1+3 or 2+4, chosen by remaining capacity) gets -0.2 bonus.
- **CargoPositionOutput** built from HoldState entries after loop, including all snapshot fields.
- **index.ts updated**: builds PortSequence from voyage.portCalls (LOAD ports sorted by ETA → seq 1,2,3; DISCHARGE ports same); enriches all bookings and contractEstimates with polSeq/podSeq before passing to assign; computes estimateStats from output positions; includes in EngineOutput.
- Files changed: `lib/stowage-engine/assign.ts`, `lib/stowage-engine/index.ts`

### v1.32.0 (2026-03-17) — Engine: types refactor for POL/POD sequences

- **EngineBooking** extended: `polSeq`, `podSeq`, `polPortCode`, `podPortCode`, `confidence` ('CONFIRMED' | 'ESTIMATED' | 'CONTRACT_ESTIMATE'), `contractId?`, `contractNumber?`, `shipperName?`, `consigneeName?`.
- **New interfaces**: `SectionEntry`, `SectionState`, `HoldState` (Record<string, SectionState>), `PortSequence` ({ polPorts, podPorts each with portCode, seq, eta }), `EstimateStats` ({ totalContractEstimates, totalBookingEstimates, totalConfirmed }).
- **EngineInput** extended: `contractEstimates: EngineBooking[]`, `portSequence: PortSequence`.
- **CargoPositionOutput** extended: `bookingId?`, `contractId?`, `contractNumber?`, `shipperName?`, `consigneeName?`, `snapshotQuantity`, `confidence`, `polPortCode`, `podPortCode`, `polSeq`, `podSeq`.
- **EngineOutput** extended: `estimateStats: EstimateStats`.
- Files changed: `lib/stowage-engine/types.ts`

### v1.30.0 (2026-03-16) — Snapshot booking quantity in cargoPositions

- **Problem fixed**: when a booking was updated (e.g. 300 → 400 pallets), earlier plan versions displayed the new quantity instead of the historical one, because `totalQuantity` was read live from the booking record.
- **`snapshotTotalQuantity`** field added to `CargoPositionSchema` in `lib/db/schemas.ts` — stores the booking's total quantity at the moment the plan version was saved.
- **`bookingNumber`** added as a denormalized snapshot field in `CargoPositionSchema`.
- **`saveCargoAssignments` server action** updated to accept and persist `snapshotTotalQuantity` and `bookingNumber` per position. Zod input schema updated accordingly.
- **`app/stowage-plans/[id]/page.tsx` loading logic**: when building the booking roster, checks `savedSnapshot?.snapshotTotalQuantity` first; falls back to live booking quantity only if no snapshot exists (backward compat with pre-v1.30 plans).
- Files changed: `app/actions/stowage-plan.ts`, `app/stowage-plans/[id]/page.tsx`

### v1.29.0 (2026-03-16) — Compartment capacities derived from vessel DB data

- **Bug fixed**: `compartmentCapacities` was a hardcoded `Record<string, number>` with ACONCAGUA BAY values — all other vessel types showed wrong capacity warnings and limits.
- **Replaced** with a `useMemo` that derives pallet capacity per section from `sectionFactors` (already loaded from DB): `Math.floor(sqm / designStowageFactor)`.
- **Stowage factor hierarchy** (defined, not yet fully implemented in UI): design factor (from vessel spec) → historical factor (rolling avg) → voyage factor (current voyage, field pending). Engine uses design factor as fallback.
- Files changed: `app/stowage-plans/[id]/page.tsx`

### v1.28.0 (2026-03-16) — Server actions for cargoProducts and compatibilityGroups

- **New file**: `app/actions/cargo-product.ts`
- **CompatibilityGroup actions**: `getCompatibilityGroups()`, `createCompatibilityGroup()`, `updateCompatibilityGroup()`, `deleteCompatibilityGroup()` — delete blocked if any CargoProduct references the group.
- **CargoProduct actions**: `getCargoProducts()` (populated with group), `createCargoProduct()`, `updateCargoProduct()`, `deleteCargoProduct()` (soft delete — sets `active: false`).
- **Auth guard**: all mutating actions require ADMIN or SUPERUSER role. Read actions available to all authenticated users.
- **Zod v4** used throughout (`error.issues[0].message`).

### v1.27.0 (2026-03-16) — cargoProducts + compatibilityGroups schemas, SUPERUSER role, cargoPosition snapshots

- **New Mongoose schema + model**: `CompatibilityGroupSchema` / `CompatibilityGroupModel` in `lib/db/schemas.ts`.
  Fields: `groupCode` (unique, uppercase), `groupName`, `description`, `canCoexistWith: string[]` (array of compatible groupCodes), `color` (hex, default `#64748b`), `active`, `createdBy`, timestamps.
- **New Mongoose schema + model**: `CargoProductSchema` / `CargoProductModel` in `lib/db/schemas.ts`.
  Fields: `code` (unique, uppercase), `name`, `shortLabel` (max 4 chars — used in stowage plan cell labels, e.g. "BAN", "GRAP"), `compatibilityGroupId` (ref: CompatibilityGroup), `compatibilityGroupCode` (denormalized), `notes`, `active`, `createdBy`, timestamps.
- **SUPERUSER role**: added to `UserSchema` role enum in `lib/db/schemas.ts` and to `UserRole` union type in `types/models.ts`. Access level: same as ADMIN plus exclusive management of cargoProducts and compatibilityGroups.
- **CargoPosition snapshot fields**: `snapshotTotalQuantity: Number` and `bookingNumber: String` added as optional fields to `CargoPositionSchema` (embedded in StowagePlanSchema).
- **TypeScript interfaces**: `CompatibilityGroup` and `CargoProduct` added to `types/models.ts`.
- **`CargoType` union type retained** in `types/models.ts` for backward compatibility — will eventually be replaced by the cargoProducts DB collection.
- Files changed: `lib/db/schemas.ts`, `types/models.ts`

### v1.25.0 (2026-03-11) — Plan detail: engine conflicts, stability timeline, estimated/confirmed visual, replan flow

- **Engine Analysis panel** (`app/stowage-plans/[id]/page.tsx`): New collapsible section in the
  validation panel reads `plan.conflicts[]` from DB. Each conflict card shows a color-coded type badge
  (TEMPERATURE_CONFLICT=red, CAPACITY_CONFLICT=amber, OVERSTOW_CONFLICT=red, STABILITY_WARNING=amber),
  the conflict message, affected pallets count, clickable booking chips, and `suggestedActions[]` chips.
- **Booking chip → highlight sections**: Clicking a booking chip in the Engine Analysis panel sets
  `highlightedSectionIds[]` to all sections assigned to that booking. VesselProfile renders highlighted
  sections with a green border (`#22c55e`), distinct from conflict (red) and selected (yellow).
- **Stability Timeline**: Horizontal widget rendered below the stats bar when `plan.stabilityIndicators[]`
  is non-empty. Shows one stop per port discharge event with a colored status dot, a proportional
  trim-index bar, and port code label. Replaces the hardcoded mock stability object.
- **Estimated vs confirmed fill**: `VoyageTempAssignment` gains `confidence?: 'ESTIMATED' | 'CONFIRMED'`.
  `VesselProfile` SVG adds a `#hatch-estimated` diagonal-stripe pattern (SVG `<defs>`) rendered as an
  overlay on ESTIMATED cargo fills; CONFIRMED assignments keep solid fill. `isConfirmed` field added to
  `CargoInPlan` interface, derived from `booking.confirmedQuantity > 0`.
- **Temperature override replan flow**: `ConfigureZonesModal` `onSuccess` callback now sets
  `showReplanBanner=true`. A dismissible amber banner appears above the SVG with an
  "⚡ Auto-Reassign Bookings" button that calls `replanAfterTemperatureOverride()` (Step 4 action),
  then updates `bookings`, `engineConflicts`, and `stabilityIndicators` state from the returned plan.
- **`replanAfterTemperatureOverride` + `highlightedCompartmentIds`** wired through page state.
  Clicking any section in VesselProfile clears the highlight (`setHighlightedSectionIds([])`).
- **CSS** (`page.module.css`): Added `.stabilityTimeline*`, `.replanBanner*`, `.btnReplan`,
  `.engineConflict{TYPE}`, `.conflictBookingChips`, `.conflictChip`, `.conflictChipActive` classes.

### v1.24.0 (2026-03-11) — Engine wired into autoGenerateDraftPlans()

- **`autoGenerateDraftPlans()`** (Step 4): replaced empty stub with engine-wired version calling
  `generateStowagePlan()`. Saves `cargoPositions[]`, `coolingSectionStatus[]`, `conflicts[]`,
  `stabilityIndicators[]`, `generationMethod: 'AUTO'` to plan document. Status: `hasHardConflict ?
  'ESTIMATED' : 'DRAFT'`. Checks for prior completed plan on same vessel for INHERITED zone temps.
- **`replanAfterTemperatureOverride(planId, zoneOverrides)`**: new server action. Re-runs engine with
  planner zone overrides; maps output to plan, computes `temperatureChangelog` entry, sets
  `generationMethod: 'REVISED'`, saves.
- **`getStowagePlanWithConflicts(id)`**: new server action returning plan with `conflicts[]`,
  `stabilityIndicators[]`, `generationMethod` defaulted to empty/MANUAL.
- **`StowagePlanSchema`** (`lib/db/schemas.ts`): added `generationMethod`, `conflicts[]`,
  `stabilityIndicators[]` sub-schemas.
- **`AutoGenerateButton.tsx`**: updated to use new `details[].result` + `details[].conflictCount`
  shape; shows conflict count on created plan rows.
- **`lib/stowage-engine/`**: pure TypeScript engine (Step 3) — `types.ts`, `temperature.ts`,
  `constraints.ts`, `assign.ts`, `stability.ts`, `index.ts`, `engine.test.ts`. All 8 assertions pass.

### v1.22.0 (2026-03-09) — shipperId link + input normalization

- **`shipperId` on UserSchema**: New `ObjectId` ref to the `Shipper` collection added to `UserSchema` (`lib/db/schemas.ts`) and `User` interface (`types/models.ts`). Propagated through `auth.ts` JWT callbacks, `createUser`/`updateUser` schemas and return values, and `getUsers()` projection.
- **Admin Users modals**: `CreateUserModal` and `EditUserModal` now use a **Linked Shipper** dropdown populated from the already-fetched `shippers` list (no extra API call). Selecting a shipper saves both `shipperId` and auto-derives `shipperCode` from the selected record. Removed `getShipperCodes()` import from `AdminClient.tsx`. `UsersTab` receives `initialShippers` prop; detail panel shows "Linked Shipper" with code + name.
- **Portal filtering by shipperId**: `getShipperDashboard`, `getContractsForShipper` (shipper.ts), and `getBookingsByShipperCode` (booking.ts) now accept an optional `shipperId` parameter; queries use `$or` to match by `shipperId` OR `shipper.code` for backward compatibility with legacy data.
- **Shipper portal empty state**: All 4 portal pages (`/shipper`, `/shipper/bookings`, `/shipper/request`, `/shipper/bookings/[id]`) read `shipperId` from session alongside `shipperCode`. Ownership check in booking detail now matches by either field. Empty state message standardized: *"Your account is not linked to a shipper. Contact your administrator."*
- **Input normalization — `lib/utils/normalize.ts`** (new): `toTitleCase`, `toUpperCode`, `toLower` helpers shared across server actions.
- **Normalization applied on save**:
  - `shipper.ts`: name/contact/country → TitleCase, email → lower, code → UPPER
  - `contract.ts`: client.name/contact/country → TitleCase, email → lower
  - `booking.ts`: `rejectionReason` → `.trim()`
  - `office.ts`: name/country/contactName → TitleCase, contactEmail → lower
  - `port.ts`: portName/country/weatherCity → TitleCase
  - `user.ts`: name/company → TitleCase, shipperCode → UPPER

### v1.21.0 (2026-03-08) — Contract cargoType/weeklyPallets + Edit/Deactivate + capacity bar

- **`ContractSchema` new fields**: `cargoType` (String, required) and `weeklyPallets` (Number, required, min 1) at the contract level. Added to `lib/db/schemas.ts`, `types/models.ts`, `CreateContractSchema`, `UpdateContractSchema`, and `createContract()`.
- **`activateContract()` server action**: new export in `app/actions/contract.ts` — restores an inactive contract to active. Complements existing `deactivateContract()`.
- **`updateContract()` bug fix**: was using `$set: validated` which replaced the entire `client` subdocument, silently wiping `clientNumber` and `type`. Now builds a dot-notation `setFields` object (`client.name`, `client.contact`, etc.) before calling `findByIdAndUpdate`.
- **Contracts table — new columns + row actions**: "Cargo" and "Wkly Pallets" columns added. Each row has *Edit* and *Deactivate/Activate* buttons (click stops row navigation). Inline success/error feedback banner below filters.
- **Edit Contract modal**: opens pre-filled with all editable fields (client name/contact/email/country, cargo type, weekly pallets, ports, validity dates). Contract number and service are read-only. Port selects populated from service port rotation when available.
- **Create Contract modal — CONSIGNEE multi-shipper**: replaced single-shipper select with multi-row cards (same pattern as SHIPPER consignees). Each row: shipper select (deduped), weekly estimate, cargo type chips. Live capacity bar shows running total vs `weeklyPallets`; turns amber when over.
- **`ContractShippersPanel` — capacity bar**: accepts `contractWeeklyPallets` prop. `WeeklyCapacityBar` component shows active-shipper total / contract cap as a fill bar + label. Blue → green (exact) → red (over). In the add-shipper form, the bar previews the projected total as `weeklyEst` is entered. Over-cap prompts a `confirm()` (never hard-blocks); exact-cap fires `alert()`.
- **Contract detail page**: "Primary Cargo" and "Contract Weekly Cap" fields added to the Route & Service card.
- **CSS**: `.rowActions`, `.btnSmall*`, `.msgSuccess`, `.msgError`, `.weeklyBar*` added to `contracts/page.module.css`; `.weeklyCapBar*` added to `contracts/[id]/page.module.css`.

### v1.20.0 (2026-03-05) — Auth hardening + session management

- **Hard 8-hour JWT timeout**: `loginAt` timestamp added to JWT token on sign-in. Every request checks `now - loginAt > 28800000ms` and returns null to invalidate. `updateAge: 0` prevents silent token renewal from extending the window.

- **Concurrent session blocking**: `sessionVersion` counter incremented in DB on every login. Stored in JWT token. `SessionProvider` configured with `refetchInterval={10}` and `refetchOnWindowFocus={true}` in `Providers.tsx`. `InactivityTimer.tsx` watches for status transition from `'authenticated'` to `'unauthenticated'` and redirects via `window.location.replace('/login')`.

- **captainEmail clear fix**: Client was converting empty string to `undefined` before sending to server action. Server action now uses MongoDB `$unset` when trimmed value is empty string, instead of setting `undefined` which Mongoose silently ignores.

- **minimatch ReDoS CVE**: Added `minimatch@9.0.7` as devDependency and `overrides` block in `package.json`. Dismissed as tolerable risk — dev-only dependency with no production exposure.

### v1.19.0 (2026-02-27) — Voyage sorting, duplicate check, Offices admin tab

- **Voyage sort order**: All voyage listings (main list, dashboard "Recent Voyages", Admin Voyages table) now sort by `weekNumber: 1, departureDate: 1` — soonest voyage first. Changed in `getVoyages()` and `getAdminVoyages()` in `app/actions/voyage.ts`.
- **Real-time voyage number validation**: `checkVoyageNumberExists()` server action added to `voyage.ts`. New Voyage wizard (Step 3) calls it `onBlur` on the Voyage Number field; shows inline error + red border if duplicate; typing clears the error; Next button blocked while checking or while error is active.
- **Admin Offices tab** (9th tab): Full CRUD UI for the `offices` collection. List table (Code · Name · Country · Status), "New Office" modal (3-char code, name, country), "Edit Office" modal (code read-only), "Deactivate" soft-delete with confirmation. `admin/page.tsx` now calls `getOffices()` (all offices) instead of `getActiveOffices()`; ContractsClient still receives only active offices (filtered inline). Imports `createOffice`, `updateOffice`, `deleteOffice` from `app/actions/office.ts`.

### v1.18.0 (2026-02-26) — Port module overhaul

- **Two-collection port architecture**: `UNECE_PORTS` (read-only master reference, 21 ports) + `ports` (operational, managed via Admin)
- **Port schema canonical rename**: `code`→`unlocode`, added `country` (full English name). Field order: `unlocode`, `countryCode`, `country`, `portName`, `weatherCity`, `latitude`, `longitude`. All Spanish field names (`puerto`, `pais_sigla`, `latitud`, `longitud`) removed entirely.
- **"New Port" form — dependent selects**: Country dropdown (full name → 2-letter code value) → Port dropdown (filtered by country) → auto-fills UNLOCODE, lat, lon, weatherCity from UNECE record. weatherCity editable in case port name differs from OpenWeatherMap city (e.g. ECPBO → "Machala").
- **"Import All from UNECE" button**: Admin Ports toolbar; one-click clear + re-import of all 21 ports from UNECE master data. Auth-guarded (ADMIN only).
- **`clearAllPorts()` + `importAllPortsFromUnece()` server actions** added to `app/actions/port.ts`, both ADMIN-only with auth guard.
- **`scripts/seed-ports.ts`** + `npm run db:seed:ports`: targeted safe script — reseeds UNECE_PORTS and drops/recreates operational ports without touching any business data.
- **Stale index fix**: MongoDB `ports` collection retained old `code_1` unique index after field rename → seed script drops it before inserting.
- **Duplicate Mongoose index warnings eliminated**: removed redundant `.index()` calls on `ShipperCollectionSchema` (`code`), `VesselSchema` (`name`, `imoNumber`), `UserSchema` (`email`) — all already indexed via inline `unique: true`.
- **Warning banner**: Admin Ports tab shows contextual warning when UNECE_PORTS is empty, with `npm run db:seed:ports` command hint.

### v1.17.0 (2026-02-25) — Security hardening + Phase 11.1

- **Auth guards on all sensitive server actions**: ADMIN-only (`user.ts`, `vessel.ts`, `voyage.ts` hard-delete, `stowage-plan.ts`); ADMIN+SHIPPING_PLANNER on all mutating voyage/contract/plan actions. Pattern: `await auth()` → check `session?.user` → check role.
- **Rate limiting** in `app/actions/auth.ts`: in-memory Map, 5 failed attempts per 15-min window per email.
- **Security headers** in `next.config.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, CSP (restricts scripts, fonts, connect-src).
- **DB error sanitization**: `lib/db/connect.ts` throws generic `Error('Failed to connect to database')` — no connection string leak in responses.
- **Audit fix**: `updatePortRotation` sets `changedBy` from `session.user.name ?? session.user.email ?? 'SYSTEM'`.
- **Phase 11.1 — Contract-Shipper Assignment Rules**: `ContractCounterpartySchema.active` flag; `addShipperToContract`, `toggleContractShipperActive`, `removeShipperFromContract` actions; `ContractShippersPanel.tsx` with add/deactivate/remove UI; booking validation blocks creation if no active counterparties.

### v1.16.1 (2026-02-25) — Responsive layout, sidebar UX, login fix

- **Responsive layout** — `min-width: 0` on all overflowing flex/grid children; dashboard breakpoints 1200→1440px; admin removed `max-width` cap and double padding
- **Sidebar persistence** — localStorage key `reefer-sidebar-collapsed`; mobile overlay with hamburger, dark backdrop, close on route change; `ShipperShell` gains same behavior
- **Zero-flicker sidebar** — blocking `<script>` in `<head>` sets `html.sidebar-collapsed` from localStorage before first paint; `suppressHydrationWarning` on `<html>`; pre-hydration CSS in `globals.css`; `transitionsReady` double-rAF gates all CSS transitions
- **Shipper login fix** — `loginAction` pre-checks user role via DB; routes EXPORTER directly to `/shipper`, eliminating the double-redirect crash

### v1.16.0 (2026-02-24) — Session simplification + Docker redirect fix

- Removed cron-based session management (root cause of random logouts)
- `sessionVersion: Number` replaces `isOnline`/`sessionToken`/`lastActivity`; incremented on login/logout via `$inc`
- JWT `maxAge: 8h`; client-side 15-min inactivity timer (`InactivityTimer.tsx`), zero DB writes
- `redirect` callback in `auth.config.ts` returns path-only URLs — fixes Docker/LAN host mismatch
- Deleted: `lib/cron/cleanup.ts`, heartbeat route, `ActivityTracker`, `SessionExpiredHandler`, `force-signout` route

---

## COMPLETION SUMMARY

```
✅ Design tokens + CSS                 ✅ Phase 9A: Contract management
✅ Layout shell (sidebar/header)       ✅ Phase 9B: Booking workflow + Port collection
✅ All listing pages (6)               ✅ Top-down bird's-eye view + DnD
✅ All detail pages                    ✅ Cargo assignment UX (roster, fill bars)
✅ Voyage creation wizard              ✅ Admin vessel CRUD (full zone editor)
✅ Plan creation wizard                ✅ Admin user CRUD (invite + confirm)
✅ Port weather integration            ✅ Phase 10: EXPORTER shipper portal
✅ MongoDB full integration            ✅ Session simplification (sessionVersion)
✅ Cargo capacity validation           ✅ Docker/LAN redirect fix
✅ Configure Zones modal               ✅ Responsive layout + mobile sidebar
✅ Temperature audit changelog         ✅ Zero-flicker sidebar (blocking script)
✅ Cascade delete guards               ✅ Shipper login double-redirect fix
✅ MarineTraffic links                 ✅ Phase 11: Shipper collection + booking refactor
✅ Stowage Factors live display        ✅ Phase 11.1: Contract-shipper assignment rules
✅ Role-based access (all 6 roles)     ✅ Security hardening (auth guards, rate limit, CSP)
✅ Email (Gmail SMTP, invitations)     ✅ UNECE_PORTS master data + dependent selects
✅ PDF generation (text/tables)        ✅ Port schema canonical rename (unlocode, country)
✅ Communication log display           ✅ Import-all-from-UNECE admin action
✅ Plan revision mode + draft locking  ✅ Stale index cleanup (code_1 dropped)
✅ Port rotation flexibility           ✅ Duplicate Mongoose index warnings resolved
✅ Admin page (9-tab hub, incl. Offices) ✅ Voyage sort: week asc → date asc
✅ Auto-plan generation               ✅ Voyage number real-time dup check
✅ Contract cargoType + weeklyPallets  ✅ Contract Edit/Deactivate/Activate row actions
✅ Multi-shipper create (CONSIGNEE)    ✅ Capacity bar in ContractShippersPanel
✅ Admin Bookings tab (10th)           ✅ Booking overflow fix (min-width: 0)
✅ shipperId link (User → Shipper)     ✅ Input normalization (TitleCase/UPPER/lower)
✅ Stowage engine (lib/stowage-engine/) ✅ Engine wired into auto-generate (v1.24.0)
✅ Plan detail: conflicts + stability  ✅ Estimated/confirmed visual + replan flow
✅ Engine: temp grouping fix (v1.26.0) ✅ Capacity pre-check + portCode resolution
✅ Per-counterparty contract estimates ✅ Phases 1–8 (schema refactor, 19 vessels, 3 services, weekNumber, naming)
✅ cargoProducts + compatibilityGroups schemas  ✅ SUPERUSER role (schemas + UserRole type)
✅ cargoPosition quantity snapshot (plan version history)  ✅ Compartment capacities from DB (not hardcoded)
✅ POD color coding in stowage plan SVG         ✅ Cargo short label in compartment cells
✅ Engine: POL/POD sequence constraints (canPlace monotonic check)  ✅ Engine: contract estimates as CONTRACT_ESTIMATE confidence level
✅ Engine: balance checks per POL group and per POD discharge simulation  ✅ Engine: HoldState tracking (minPolSeq/maxPolSeq/minPodSeq/maxPodSeq per section)
✅ Engine: estimateStats in EngineOutput  ✅ Engine: sorted work queue (polSeq ASC → podSeq DESC → quantity DESC)
✅ Countries collection + seed script (65 maritime countries)  ✅ CountrySelect component (searchable, flag emoji, keyboard nav)
✅ Customers collection (CONSIGNEE/SHIPPER/AGENT) + Admin Customers tab (11th)  ✅ Customer-linked contract creation (customerId, AGENT type, optional client fields)
✅ CountrySelect in all CRUD modals (shipper, office, vessel flag, contract)  ✅ flagDisplay() in vessel list + detail (ISO code → emoji, legacy fallback)
✅ ContractSelect shared component (custom multi-line dropdown, /bookings + shipper portal)  ✅ Shipper company name in portal sidebar (server-fetched from layout)
✅ vesselPool management UI in Admin Services detail panel (add/remove vessels, auth-gated)  ✅ Voyage wizard Step 2 filtered to service vesselPool
✅ Auth session: shipperId propagated to session.user via session callback  ✅ Booking creation modal widened (720px, min-height 600px, overflow fixes)
✅ stowage-plans/[id] SVG renders cargo from DB (POD colors + POL codes in footer)  ✅ autoGenerateSinglePlan: contract estimates include pol/pod codes (fixes empty SVG)
✅ Booking POL date guards (ETA/ATA/ATD) — frontend + backend, role-aware        ✅ Port call table: ATA/ATD as dedicated columns with color-coded display
✅ Email vessel/voyage order corrected (VESSEL / VOYAGE format)                   ✅ vesselName resolution cascade (booking → voyage → vessel DB)
✅ SVG footer strip: 5 columns restored with proportional widths                  ✅ Plan detail panel: compartment/zone inline display (2A / 2AB)
✅ Stowage plan save/send preserves all cargo positions (bookings + contract estimates)
✅ POD colors and POL codes survive save → reload cycle (polPortCode/podPortCode/consigneeName persisted)
✅ markPlanSent: snapshot-first bookingNumber lookup, CONTRACT-ESTIMATE IDs filtered before BookingModel query
✅ New Draft copies full cargo from locked plan with consecutive plan number suffix
✅ Bookings list: vessel column, shipper/consignee/route filters, vessel+voyage filter format
✅ Bookings archive toggle: CANCELLED/REJECTED hidden by default, shown on demand; auto-triggered by status filter
✅ Admin bookings tab: vessel column + archive toggle with key-based remount fix
✅ SpaceForecast collection: schema, types, server actions (v1.52.0)
✅ SpaceForecast: REPLACED_BY_BOOKING state + booking integration (v1.53.0)
✅ SpaceForecastsPanel in voyage detail: per-shipper estimates, source/status badges, mark-ok (v1.54.0)
✅ Voyage detail bookings table: Route column, Shipper column, Cargo label standardized (v1.54.0)
✅ SpaceForecast banners in stowage plan detail (pendingForecastUpdates + pendingBookingReplacements)
✅ Shipper portal: Forecasts section — list page + submission wizard (v1.55.0-B)
✅ Planner estimate entry in SpaceForecastsPanel — inline form, all 4 states, booking guard (v1.56.0)
✅ Contracts & Space table: BOOKING/WEEKLY EST. + BOOKING NR./FORECAST + STATUS columns; route port codes only; shipper name only (v1.60.0)
✅ Contract counterparty weeklyPallets click-to-edit: Enter to save, Escape to cancel, booking count shown as context (v1.61.0)
✅ StowagePlanWizard unified: ⚡ Auto-Generate + + New Plan share same 3-step wizard; mode prop branches engine vs blank plan (v1.62.0)
✅ SpaceForecasts fed to autoGenerateSinglePlan as contractEstimates; NO_CARGO entries excluded from engine (v1.63.0)
✅ NO_CARGO source: shipper portal per-voyage checkbox in ForecastWizard + planner "No Cargo" button in Contracts & Space (v1.63.1)
✅ Engine bottom-up fill fix: LEVEL_DEPTH tie-break in assign.ts; deepest sections (D→C→B→A) filled first (v1.64.0)
✅ VesselProfile: used/capacity permanently shown in each compartment cell center (v1.64.0)
✅ Stowage plan cards: pallet sum, vessel capacity, badge paths, booking/estimate counts corrected (v1.65.1–1.65.3)
✅ Estimate count definition standardized; PLANNER_ENTRY quantity=0 blocked + migration script; No Cargo button visibility (v1.65.4)
✅ CONTRACT_DEFAULT rows: "Contract Est." label + "Incorporated" status in Contracts & Space table (v1.65.5)
✅ Estimate count filter: CONTRACT_DEFAULT only counted when planImpact=INCORPORATED; legacy migration script (v1.65.6)
✅ _createForecastCore: NO_CHANGE now only for SHIPPER_PORTAL; 4 legacy records migrated to INCORPORATED (v1.65.7)
✅ CapacityBar component: segmented booked+estimated bar replaces all three progress bars in app (v1.65.8)
✅ Role-aware booking edit modal: agency edits confirmedQuantity→CONFIRMED; shipper edits requestedQuantity→PENDING (v1.66.0–v1.66.1)
```

*For previous version history (v0.3.0–v1.15.x), see `git log`.*