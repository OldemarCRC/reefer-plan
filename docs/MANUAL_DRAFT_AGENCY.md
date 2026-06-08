# Reefer Stowage Planner — Agency Operations Manual (DRAFT)

> **Status:** Work in progress — updated alongside development sessions.
> **Language:** English
> **Audience:** Shipping agency staff — Planners, Administrators, Stevedores, Checkers.
> **Last updated:** v1.72.61

---

## 1. System Overview

Reefer Stowage Planner is a shore-based planning tool for shipping agencies managing refrigerated cargo on reefer vessels. It covers the full operational cycle: vessel and service management, voyage scheduling, contract and booking administration, stowage plan generation, and captain communication.

**This system does not replace onboard stability software.** Stability calculations shown are preliminary estimates only — the captain's onboard systems are authoritative.

### 1.1 User Roles

| Role | Access level |
|------|-------------|
| **ADMIN** | Full access including system administration (`/admin`) |
| **SHIPPING_PLANNER** | All planning functions — voyages, bookings, stowage plans, contracts; vessel list filtered to assigned services |
| **DEMO_AGENT** | Read-only access to all planner pages (same navigation as Shipping Planner, no `/admin`). All action buttons are visible but disabled — cannot create, edit, or delete any data. Intended for demos and onboarding presentations. |
| **STEVEDORE** | Read-only access to dashboard, voyages, and stowage plans |
| **CHECKER** | Same as Stevedore |
| **VIEWER** | Read-only access to planning routes |
| **EXPORTER** | Shipper portal only (`/shipper/*`) |

### 1.2 Office and Service Assignments

Users are assigned to one or more **offices**. Each office is linked to one or more **services** (trade routes). A user's office assignments determine which voyages, bookings, and contracts they can see. Admins with no office assignment retain global access to all services.

**Vessel access by role:** SHIPPING_PLANNER users see only the vessels assigned to the services in their offices — the `/vessels` list is automatically filtered. ADMIN and SUPERUSER roles always see all vessels regardless of office assignment.

---

## 2. System Administration (`/admin`)

Access restricted to **ADMIN** role only.

### 2.1 Admin Tabs Overview

| Tab | Purpose |
|-----|---------|
| **Voyages** | View and manage all voyages across all services |
| **Contracts** | Create and manage annual contracts with consignees/shippers |
| **Plans** | View all stowage plans |
| **Vessels** | Add and configure vessels (holds, cooling sections, temperature zones) |
| **Services** | Manage trade routes and vessel pool assignments |
| **Users** | Create users, assign roles and offices, send invitations |
| **Ports** | Manage operational port list; import from UNECE master data |
| **Shippers** | Manage shipper/exporter company records |
| **Offices** | Create offices, assign services, set parent/child relationships |
| **Bookings** | View and action all bookings across services |
| **Customers** | Manage consignees, shippers, and agents as customer records |
| **Cargo Products** | View and edit cargo product codes, short labels, and transport temperatures |

### 2.2 Creating a New User

1. Go to **Admin → Users → New User**.
2. Enter name, email, and select role.
3. For non-EXPORTER roles: assign one or more offices (leave empty for global access).
4. For EXPORTER role: link to a shipper record using the "Linked Shipper" dropdown.
5. Save — an invitation email is sent to the user with a link to set their password.
6. The user follows the link, sets a password, and can log in immediately.

**Creating a demo user:** Select role **Demo Agent** to create an account that can view all planning data but cannot make any changes. All action buttons (New Voyage, New Plan, Approve Booking, etc.) are displayed but disabled. Use this role for live demonstrations or agency staff onboarding. A Demo Agent is assigned to offices the same way as a Shipping Planner — their office assignments determine which services they can see.

### 2.3 Managing Vessels

Each vessel has a fixed configuration of holds, cooling sections, and temperature zones. This is set once and does not change between voyages.

- **Cooling sections** are the atomic refrigerated units (e.g. `1A`, `2UPD`). Each has a floor area (sqm) and a pallet capacity derived from the stowage factor.
- **Temperature zones** group cooling sections that share a refrigeration circuit. All sections in a zone run at the same temperature.
- Zone-to-section mapping is fixed per vessel and stored in the database.

To view a vessel's configuration: go to **Vessels → [vessel name]**. The interactive SVG profile shows all holds and sections. Click any section to see its details.

### 2.4 Managing Services

A service defines a trade route (port rotation) and a pool of vessels that operate it. To assign or remove a vessel from a service's pool: go to **Admin → Services → [service name] → Vessel Pool**.

### 2.5 Managing Cargo Products

The **Cargo Products** tab (12th tab in Admin) lists the cargo product codes used throughout the system — in contracts, bookings, space forecasts, and the Python stowage optimizer.

Each product record has:
- **Code** — short identifier used in contracts and bookings (e.g. `BAN`, `PINE`, `AVOC`)
- **Name** — full descriptive name (e.g. "Bananas", "Pineapples", "Avocados")
- **Short label** — compact label for display in UI chips and tables
- **Temperature** — target transport temperature in °C (e.g. 13°C for bananas, 7°C for pineapples)
- **Active** — active products are available for selection in contracts and bookings; inactive products are hidden from dropdowns but retained for historical records

**Why transport temperatures matter:** The Python CP-SAT optimizer uses these values (±1°C tolerance window) to enforce temperature zone grouping — cargo types with non-overlapping temperature ranges are automatically assigned to different vessel zones. Keeping product temperatures accurate ensures the optimizer places cargo in the correct refrigeration circuits.

**Seeded products:**

| Code | Name | Temperature |
|------|------|-------------|
| BAN | Bananas | 13°C |
| OBAN | Organic Bananas | 13°C |
| PINE | Pineapples | 7°C |
| PLAN | Plantains | 13°C |
| AVOC | Avocados | 6°C |
| GRAPE | Table Grapes | −1°C |
| CITRUS | Citrus | 5°C |
| MANGO | Mangoes | 10°C |
| PAPA | Papaya | 10°C |

To update a product's temperature or active status: click the product row in **Admin → Cargo Products** and edit inline. Changes take effect immediately for new contracts and plan generation.

> **Note — temperature per product and zone assignment:** Each product has a **single fixed transport temperature** (°C) that applies to every shipment of that cargo type regardless of voyage or vessel. When creating a plan via **Advanced Optimize** (Option A in section 7.2), zone temperatures are automatically derived from the cargo assigned to each temperature zone using the **MAJORITY_RULE**: the zone is assigned the temperature of the most-represented product (by pallet count) in that zone. For example, if a zone contains 280 pallets of Bananas (13°C) and 60 pallets of Pineapples (7°C), the zone temperature is set to 13°C. Keeping product temperatures accurate is therefore critical — incorrect temperatures can cause the optimizer to place incompatible cargo in the same zone or assign the wrong cooling temperature.

---

## 3. Voyages

**Voyage cards are fully clickable.** On the `/voyages` list, clicking anywhere on a voyage card opens the voyage detail page — there is no separate "View Details" link. Keyboard navigation is supported: focus a card with Tab and press Enter or Space to open it. A cyan outline appears on focused cards. The MarineTraffic external link (⬡ icon next to the vessel name) remains independently clickable and does not trigger card navigation.

### 3.1 Creating a Voyage

1. Go to **Voyages → New Voyage**.
2. **Step 1 — Select service:** Choose the trade route. Users assigned to a single service skip this step automatically.
3. **Step 2 — Select vessel:** Only vessels in the service's pool are shown.
4. **Step 3 — Schedule:** Enter the voyage number (format: `VESSEL-WEEKYEAR`, e.g. `ACON-062026`). Configure port calls — all service ports are pre-selected; uncheck ports not calling on this sailing. Enter ETA and ETD for each active port.
5. **Step 4 — Review:** Confirm all details and create.

**Voyage number uniqueness:** Numbers must be unique among active voyages. A cancelled voyage's number cannot be reused until the partial unique index fix is applied (known issue — see PROJECT_STATUS.md).

### 3.2 Voyage Statuses

| Status | Meaning |
|--------|---------|
| **PLANNED** | Voyage is scheduled; no operations started |
| **IN_PROGRESS** | First load port ETA has passed |
| **COMPLETED** | Last port ETA has passed |
| **CLOSED** | Manually closed by planner after final ATD recorded — no further changes |
| **CANCELLED** | Voyage cancelled operationally |

Status transitions PLANNED → IN_PROGRESS → COMPLETED happen automatically when the system detects that ETA dates have passed. COMPLETED → CLOSED requires a manual action by an ADMIN or PLANNER.

### 3.3 Port Call Management

Open a voyage detail page to edit port calls. For each port you can record:
- **ETA / ETD** — estimated arrival and departure
- **ATA / ATD** — actual arrival and departure (ATA cannot be before ETA; ATD cannot be before ATA)

**Port locking:** When ATD is recorded for a LOAD port, that port call is automatically locked. No new bookings can be created for a locked POL. Locked ports are highlighted in the port call table.

### 3.4 Closing a Voyage

When all operations are complete, use the **Close Voyage** button on the voyage detail page (visible when status is COMPLETED). Enter the final port's ATD. Once closed, the voyage is frozen for statistics — no further edits.

### 3.5 In-Transit Destination Change (POD Divert)

For IN_PROGRESS voyages, planners can redirect individual bookings to a different discharge port. Use the **Change Destination** button on each booking row in the voyage detail. Select the new POD from the voyage's own discharge ports and optionally update the consignee name. All changes are recorded in the booking's changelog.

### 3.6 Booking Deadline and Forecast Expiration

A **booking deadline** is an optional date set per voyage to indicate when space estimates from shippers are no longer valid for planning.

**Setting a deadline:**
1. Open the voyage detail page.
2. In the **Booking Deadline** card at the top, click the date field and enter the deadline date.
3. Save. The deadline is stored on the voyage record.

**Expiring estimates after the deadline:**
Once the deadline has passed, an **⏱ Expire Estimates** button appears on the voyage detail page (visible to ADMIN and SHIPPING_PLANNER only). Clicking this button marks all active space estimates for the voyage — SHIPPER_PORTAL, PLANNER_ENTRY, and CONTRACT_DEFAULT — as **Expired**. Expired estimates are excluded from future stowage plan generation.

This is a manual action: the system does not expire estimates automatically. The button is only shown when the deadline date has passed.

**Amber banner on stowage plans:** If a plan contains positions sourced from forecasts that have since been expired, an amber banner appears at the top of the plan detail page listing the affected shipper names. Click **Dismiss** on each entry to acknowledge. When all entries are cleared the banner disappears. This does not remove the cargo positions from the plan — it is an informational notice only.

---

## 4. Contracts

Contracts define annual space agreements between the agency and a client (consignee or shipper). Each contract specifies the service, cargo type, weekly pallet allocation, and the port pair (POL → POD).

### 4.1 Creating a Contract

1. Go to **Admin → Contracts → New Contract** (or from the Contracts list page).
2. Select a customer record (consignee, shipper, or agent) — this links the contract to a registered company.
3. Select the service and cargo type.
4. Set the weekly pallet capacity and validity dates.
5. Add shippers (counterparties): For CONSIGNEE contracts, add one or more shippers
from the registered shippers list. For each shipper enter only their weekly pallet
estimate — the cargo type is inherited from the contract and does not need to be
specified per shipper.

### 4.2 Contract Counterparties

Each contract is created for a single cargo type, defined at the contract level.
All shippers assigned to a contract ship that same cargo type — there is no separate
cargo type field per shipper.

If a client ships two different cargo types, create two separate contracts — one per
cargo type.

Each counterparty (shipper) on a contract has:
- A weekly estimate (pallets per sailing)
- An active/inactive flag

To add a shipper to an existing contract: open the contract detail in Admin → Contracts,
go to the Authorized Shippers panel, select the shipper from the dropdown, enter their
weekly estimate, and save.

To deactivate a shipper: use the Deactivate button on their row. A deactivated shipper
remains on the contract but is excluded from forecast calculations and booking creation.
To remove a shipper entirely: use Remove (only available when no active bookings exist
for that shipper on active voyages).

### 4.3 Editing a Counterparty's Weekly Estimate

The weekly pallet estimate for each counterparty can be updated at any time — including when active bookings already exist for that shipper.

1. Open the contract detail page (**Admin → Contracts → [contract]** or **Contracts list → [contract]**).
2. In the **Authorized Shippers** panel, click the value in the **Weekly Est.** column for the shipper you want to update. The cell becomes an editable input.
3. Enter the new value and press **Enter** to save, or **Escape** to cancel without changes.

The current booking count for that shipper on active voyages is shown as an informational indicator. It does not block the edit — it is provided for context so planners can assess the impact before saving.

**Available to:** SHIPPING_PLANNER and ADMIN roles only.

---

## 5. Bookings

The Bookings list (`/bookings`) shows all booking requests across your assigned services. Numeric quantity columns (REQ. / CONF. / STANDBY) are right-aligned with tabular-numeral formatting — digits stack vertically for easy quantity comparison across rows. Date columns are also right-aligned.

### 5.1 Booking Statuses

| Status | Meaning |
|--------|---------|
| **PENDING** | Submitted by shipper or created by planner; awaiting review |
| **CONFIRMED** | Full quantity approved |
| **PARTIAL** | Partial quantity approved; remainder rejected or on standby |
| **STANDBY** | On waiting list |
| **REJECTED** | Not accepted |
| **CANCELLED** | Cancelled by planner or shipper |

### 5.2 Creating a Booking (Planner / Admin)

**Step 1 — Select contract:** Contracts are shown with shipper name(s), consignee,
route (POL → POD), cargo type, and weekly cap per entry. Select the contract that
applies to this booking. A preview card confirms all contract details after selection.

**Step 2 — Select voyage.**

**Step 3 — Enter quantity:** A contract reference panel stays visible showing the
contract number, route, cargo type, and weekly cap. If the shipper requested a
quantity different from their contract estimate, an amber warning is shown:
'Shipper requested N pallets — contract estimate is M pallets.' Review this before
confirming.

**Date guards — booking creation is blocked when:**
- The POL port call has ATD recorded (vessel has departed) — all roles blocked
- The POL ETA has passed but no ATA is recorded — planner must record ATA first
- The POL has ATA but no ATD (vessel in operations) — planners can proceed; exporters cannot

**Editing a booking:** Quantity can be edited from the booking list as long as the vessel has not departed the loading port (ATD not recorded). Editing as a planner updates the booking directly and notifies the shipper. If a shipper increases their quantity, the booking returns to PENDING and requires re-approval.

### 5.3 Approving / Rejecting Bookings

When reviewing a booking, click **Approve** to open the approval panel. You must explicitly assign all requested pallets across three buckets:

- **Confirmed** — pallets accepted for this sailing
- **Standby** — pallets placed on a waiting list (space permitting)
- **Rejected** — pallets that cannot be accommodated

The three values must sum to the total requested quantity. Quick-fill buttons are available: **Confirm all**, **All standby**, **Reject all**.

The booking status is set automatically:
- All confirmed → CONFIRMED
- Some confirmed, rest standby/rejected → PARTIAL
- All standby, none confirmed → STANDBY
- All rejected → REJECTED

**Resolving standby pallets:** Bookings with standby pallets show **Confirm Standby** and **Reject Standby** buttons. Use these when space becomes available or when a final decision is made. The shipper receives a dedicated email notification — not a generic booking update.

### 5.4 Archive Toggle

Cancelled and rejected bookings, and bookings from completed/closed voyages, are hidden by default. Use **Show Archived** to display them. The status filter will also activate archive mode automatically when CANCELLED or REJECTED is selected.

### 5.5 Pending Bookings Panel

The pending panel shows only bookings that require action:
- Status **PENDING** — awaiting initial approval
- Status **PARTIAL** with standby pallets remaining — awaiting standby resolution

PARTIAL bookings where all standby has been resolved are considered closed and do not appear in the pending panel.

### 5.6 Editing a Booking (Agency / Planner)

- In /bookings, click the **Edit** button on any booking row to open the edit modal.
- The modal shows the **Confirmed Quantity** field (pre-filled with the current
  confirmed quantity, or the requested quantity if none has been set).
- Update the confirmed quantity and/or notes as needed and save.
- Status is automatically set to **CONFIRMED** — no manual status selection required.
- To modify the requested quantity submitted by a shipper, the shipper must edit
  from their portal; the booking will return to PENDING status for re-approval.

---

## 6. Space Forecasts

Space forecasts are pre-booking estimates submitted by shippers (or entered by planners) to support early stowage planning.

### 6.1 Forecast Sources

| Source | Created by |
|--------|-----------|
| **SHIPPER_PORTAL** | Exporter submitting via the shipper portal |
| **PLANNER_ENTRY** | Planner entering an estimate on behalf of a shipper |
| **CONTRACT_DEFAULT** | System-generated from the contract's weekly estimate when no other forecast exists |
| **NO_CARGO** | Shipper or planner declaring that no cargo will be shipped on a specific voyage |

**NO_CARGO behaviour:** A NO_CARGO declaration is set to Incorporated immediately — it
does not go through Pending Review. The stowage engine skips NO_CARGO entries entirely;
they generate no cargo positions. Submitting a real estimate or booking after a NO_CARGO
declaration automatically supersedes it.

### 6.2 Forecast Lifecycle

- A new forecast supersedes any previous active forecast for the same shipper + contract + voyage combination.
- When a confirmed booking is created for a shipper/contract/voyage that has an active forecast, the forecast is automatically marked **REPLACED_BY_BOOKING** — no manual action needed.
- Forecasts with REPLACED_BY_BOOKING status are surfaced as a notification banner on the stowage plan detail page so the planner can review and dismiss.
- When the voyage's **booking deadline** has passed, the planner can manually expire all active forecasts using the **⏱ Expire Estimates** button on the voyage detail page. Expired forecasts are marked **EXPIRED** and excluded from future plan generation. See section 3.6 for the full workflow.

### 6.3 Contracts & Space panel in Voyage Detail

The voyage detail page (`/voyages/[id]`) now shows a single unified section
**"Contracts & Space"** that replaces the previous separate Bookings and
Space Forecasts sections.

The panel shows one row per shipper per contract for the voyage's service.
Columns: **Shipper** (name only) | **Consignee** | **Contract** | **Route**
(port codes only, e.g. `COTUB → NLRTM`) | **Cargo** | **Booking / Weekly Est.**
(booking confirmed qty > forecast qty > contract weekly estimate) |
**Booking Nr. / Forecast** (booking number, or "Contract Est." / "Planner Est." / "Shipper Est."
label) | **Status** (booking status or forecast planImpact badge) | **Actions**.

**Row behavior:**
- If a confirmed booking exists for that shipper+contract: shows booking number,
  status badge, and confirmed/requested quantity. No estimate actions.
- If no booking exists: shows forecast state and action buttons per the four
  states documented below.

**Planner confirm action:**
When a shipper submits an estimate via the portal, the row shows a "Pending Review"
badge and a "✓ Confirm" button. Clicking Confirm marks the estimate as Incorporated
without requiring any further steps.

Each row shows one of five states:

| Row state | Available actions |
|-----------|------------------|
| No forecast exists | "Use Contract Est." — creates a CONTRACT_DEFAULT from the contract's weekly estimate. "Enter Estimate" — opens an inline form to enter a PLANNER_ENTRY estimate with a custom pallet count. "No Cargo" — records that this shipper has no cargo for this voyage. |
| CONTRACT_DEFAULT active | Shows "Contract Est." in Booking Nr./Forecast column and "Incorporated" in Status column. "Enter Estimate" — replaces the default with a PLANNER_ENTRY estimate (entering 0 pallets is blocked — use "No Cargo" instead). "No Cargo" — records no-cargo status, overriding the default. |
| PLANNER_ENTRY or SHIPPER_PORTAL active | "Edit" — opens the inline form pre-filled with the current quantity. A source badge indicates whether the estimate came from the shipper portal or was entered by a planner. |
| NO_CARGO declared | Shows "0 plt" and a "No Cargo" badge. "Edit" — opens the inline form empty so a real estimate can be entered (supersedes the no-cargo declaration). |
| Booking confirmed (REPLACED_BY_BOOKING) | Read-only. No estimate actions available — the booking takes priority. |

**Priority rule:** BOOKING > ESTIMATE > CONTRACT_DEFAULT > NO_CARGO. An estimate cannot be
created or edited if a booking already exists for that shipper on that voyage. The system will
block the action with a clear error message.

**No Cargo declaration:** Use the "No Cargo" button when a shipper has confirmed they have
no cargo for a specific voyage. The declaration is set to Incorporated immediately and will
not generate engine positions for that shipper. To reverse a No Cargo declaration, click
"Edit" and enter a real pallet quantity — the new estimate supersedes the declaration.
The "No Cargo" button is displayed in amber to distinguish it clearly from the "Enter Estimate"
and "Edit" actions.

**Zero-quantity estimates are blocked:** Submitting 0 pallets via "Enter Estimate" or "Edit"
is not allowed. Use the "No Cargo" button instead.

**Editing an estimate** creates a new forecast document that supersedes the previous one.
The source badge updates to reflect who made the last change.

### 6.4 Confirming Shipper Portal Estimates

When a shipper submits an estimate via their portal, the row in the
Contracts & Space panel shows a "Pending Review" amber badge and a
"✓ Confirm" button in the Actions column.

Clicking **✓ Confirm** marks the estimate as Incorporated immediately —
no page reload required. The badge updates from "Pending Review" to
"Incorporated" (green).

This action does not require associating the estimate to a specific stowage
plan. It simply signals that the planner has reviewed and accepted the
shipper's estimate for planning purposes.

### 6.5 Forecast Notifications on Stowage Plans

The stowage plan detail page shows three notification banners when relevant:

**Amber banner — Estimate updates:** Appears when one or more space forecasts have been updated since the plan was last generated. Each item shows the shipper, cargo type, and revised estimate. Click **Mark OK** to acknowledge and remove from the banner. When all items are cleared, the banner disappears.

**Blue banner — Booking replacements:** Appears when a real booking has replaced an estimate that was incorporated into the plan. Quantities in the plan may differ from the booking. Click **Dismiss** on each item after reviewing. When all items are cleared, the banner disappears.

**Amber banner — Expired forecasts:** Appears when the plan contains cargo positions sourced from forecasts that have since been marked Expired (via the voyage's **⏱ Expire Estimates** action). Each item shows the shipper name. Click **Dismiss** on each entry to acknowledge. This does not remove the cargo positions — it is an informational notice only. To generate a fresh plan excluding expired forecasts, use Auto-Generate or the Advanced Optimizer.

---

## 7. Stowage Plans

### 7.1 Plan Numbering

Format: `WK{week}-{VESSEL}-{voyage}-{sequence}`
Example: `WK14-ACONCAGUA_BAY-ACON062026-0001`

Sequence increments per revision. Plans must be deleted in reverse order (highest number first) to preserve numbering integrity.

### 7.1.1 Plans List — Card Information

**Plan cards are fully clickable.** Clicking anywhere on a plan card opens the plan detail page. Keyboard navigation is supported (Tab to focus, Enter or Space to open). A cyan focus outline appears on the focused card.

Each plan in the `/stowage-plans` listing displays a card with the following information:

- **Plan number and status badge** — the plan identifier and its current workflow status.
- **Vessel · Voyage · Booking count · Estimate count** — metadata line. The booking count shows only active bookings (not CANCELLED or REJECTED, and excluding engine synthetic IDs). The estimate count shows active SHIPPER_PORTAL forecasts (> 0 pallets), PLANNER_ENTRY forecasts (> 0 pallets), and CONTRACT_DEFAULT forecasts (> 0 pallets, status Incorporated); NO_CARGO entries are not counted as estimates.
- **Capacity bar** — a two-segment bar showing booked and estimated pallets against the vessel's total pallet capacity (computed from cooling sections: floor(sqm ÷ designStowageFactor)). The solid segment represents confirmed booking pallets (cargo positions from real bookings, excluding engine-synthetic entries). The faded, diagonally-striped segment represents active estimate pallets (SHIPPER_PORTAL + PLANNER_ENTRY + CONTRACT_DEFAULT forecasts with status Incorporated). The label below reads "N booked · M est. / T pallets". The bar reflects live data from the booking and forecast collections — regenerating the plan updates the booked segment to match the latest cargo positions.
- **Overstow and temp conflict badges** — reflect the engine's actual validation output stored on the plan document at generation time. "No overstow" and "No temp conflicts" indicate the engine found no issues; otherwise the badge shows the count of violations.

### 7.2 Creating a Stowage Plan

Three entry points are available — choose based on quality requirements and whether the Python optimizer service is running.

**Option A — Recommended: Advanced Optimize (OR-Tools CP-SAT)**

Best quality — guarantees 0 overstow violations. Generates 5 alternative plans with different optimisation objectives so you can compare and select the best arrangement.

Requires the **Python optimizer service running on port 8001**. Quick-start (full details in section 7.9):
```
cd stowage-optimizer
venv\Scripts\activate
uvicorn api:app --port 8001 --reload
```

Steps:
1. From the Stowage Plans list, click **🔬 Advanced Optimize**. The button shows a green dot when the service is reachable; a red dot means it is offline and the button is disabled.
2. Select a voyage from the dropdown.
3. Click **Run Optimizer**. The solver runs for up to 2.5 minutes total; a spinner is shown while computing.
4. Browse the **5-plan carousel** using Previous / Next. Compare metrics (pallets placed, overstow violations, balance deviation, compactness) for each plan.
5. Select the preferred plan and click **Save this Plan**. You are redirected to the plan detail page.

---

**Option B — Quick Plan (Auto-Generate)**

Faster, no Python service required. Generates a single plan automatically using the built-in stowage engine. Recommended when the optimizer service is not available or a quick draft is needed.

Steps:
1. From the Stowage Plans list, click **⚡ Auto-Generate Plan**.
2. **Step 1 — Select voyage:** Choose the voyage from the list. Voyages with an existing plan show a Revision badge.
3. **Step 2 — Configure temperatures:** Use the "Apply to all zones" toolbar for a uniform temperature, or click individual compartments in the vessel diagram to set per-zone temperatures. A summary table confirms all assignments.
4. **Step 3 — Review & Create:** Review the maritime summary card and click **⚡ Auto-Generate Plan**. The stowage engine assigns bookings and contract estimates (including shipper portal forecasts) to sections based on temperature compatibility, port sequence (overstow), and capacity. `cargoPositions` are populated immediately.

**Engine stowage order:** The engine fills each hold bottom-up — cargo with the furthest
discharge port is placed in the deepest sections (D, then C, then B, then A) and cargo
with the nearest discharge port is placed near the top. This is correct reefer overstow
practice: earliest-discharge cargo is always accessible without moving later-discharge
cargo that sits below it.

**Two-pass POD-priority assignment (v1.68.0):** The engine uses a two-pass strategy to
prevent overstow between cargo bound for different discharge ports when multiple loading
ports are involved. Pass 1 processes all bookings sorted by latest discharge port first,
filling hold bottoms with last-to-discharge cargo from all loading ports simultaneously
(e.g. GBPME-bound cargo from COTRB, COSMR, and DOMNZ all settle at the same depth range).
Pass 2 then processes remaining cargo sorted by earliest discharge port first, placing
it in the upper levels. This prevents the common overstow failure mode where early-loading
cargo for a near discharge port blocks later-loading cargo for a far discharge port from
occupying the correct depth in the hold. Conflict classification (OVERSTOW_CONFLICT,
CAPACITY_CONFLICT, TEMPERATURE_CONFLICT) runs only in Pass 2.

---

**Option C — Manual Plan**

Full control over every compartment. Recommended for adjustments to existing plans or special cargo that requires custom placement.

Steps:
1. From the Stowage Plans list, click **+ New Plan** and follow the same 3-step wizard.
2. At Step 3, click **Create Stowage Plan**. This creates a blank plan with no cargo positions — assign cargo manually in the plan detail view, or trigger Auto-Assign from there.

---

**Revision mode:** If the selected voyage already has a plan, all three options detect this automatically and show a "Revision" badge. The wizard creates a copy of the existing plan (sequence incremented) rather than a new one.

> **Important — automatic methods for first plan version only:**
> **Option A (Advanced Optimize)** and **Option B (Auto-Generate)** are intended for generating the **first version** of a stowage plan (sequence -0001, no prior plan for the voyage). For subsequent revisions, use **Option C (Manual Plan)** as the base and edit cargo positions manually using the right-click context menu workflow (section 7.10). The optimizer and auto-generate engine do not account for the previous plan's temperature configuration or existing cargo placement — using them on a revision will silently discard any manual adjustments made to the prior plan.

### 7.3 Plan Statuses

| Status | Meaning |
|--------|---------|
| **ESTIMATED** | Plan has hard conflicts — generated from estimates only |
| **DRAFT** | Plan generated without hard conflicts; editable |
| **READY_FOR_CAPTAIN** | Planner has reviewed and approved for sending |
| **EMAIL_SENT** | Plan sent to captain — locked, read-only |
| **CAPTAIN_APPROVED** | Captain has approved the plan |
| **CAPTAIN_REJECTED** | Captain has requested changes |
| **IN_REVISION** | Being revised after captain rejection |
| **READY_FOR_EXECUTION** | Final version ready for loading |
| **IN_EXECUTION** | Loading in progress |
| **COMPLETED** | All cargo loaded and discharged |
| **CANCELLED** | Plan cancelled |

### 7.4 Sending a Plan to the Captain

Once the plan is in DRAFT or READY_FOR_CAPTAIN status, use the **Send to Captain** button in the app header (top of the page, alongside the pallet stats). The plan is locked immediately upon sending (status → EMAIL_SENT). A locked plan cannot be edited or re-sent.

**Captain communication is email-only** — the captain never logs into this system.

### 7.5 Revising a Plan

To revise a plan after sending:
1. Open the plan detail and click **+ New Draft** in the app header (visible when the plan is locked).
2. A new plan version is created (sequence incremented, e.g. 0001 → 0002) copying all cargo positions from the locked plan.
3. Edit the new draft and send when ready.
4. To delete a revision, delete the highest-numbered plan first.

### 7.6 Temperature Override and Replan

From a plan's detail page, click **Configure Zones** to change temperature assignments. After saving, an amber banner appears offering **Auto-Reassign Bookings** — this re-runs the stowage engine with the new temperatures, updates cargo positions, and recalculates conflicts and stability indicators.

### 7.7 Reading the Stowage Plan SVG

**Vessel Profile — Longitudinal View**
- All compartment levels — including FC (forecastle) and UPD (upper deck) —
  are rendered together in a single hull SVG. There is no separate deck strip.
- Level order top-to-bottom: UPD, FC, A, B, C, D, E.
- Hold labels (Hold 1–4) appear at the top of the hull area, with a
  loaded/capacity summary beneath each label (e.g. `140 / 388`).
- When no FC/UPD compartments exist for a vessel, only the A–E levels are shown.
- The fixed app header subtitle shows the full plan identity: week, vessel, voyage, and version number — e.g. `WK20 · BALTIC KLIPPER · AC26020 · 0001` — plus the plan status badge (DRAFT, ESTIMATED, READY FOR CAPTAIN, etc.).
- The header permanently shows **LOADED / CAPACITY / AVAILABLE / UTIL%** pallet stats for the entire plan, always visible regardless of scroll position.
- Plan action buttons — **Save Draft**, **Send to Captain** (or **Mark as Sent**), and **Delete** — are in the header alongside the stats. When the plan is locked, a **LOCKED** badge and **+ New Draft** button appear there instead.
- The global app header has a taller height (56 px) compared to generic list pages, giving the two-line plan identity display and the action buttons adequate vertical breathing room — metadata and counters do not touch the top or bottom border of the header bar.

The vessel longitudinal profile shows:
- **Cell fill color** — represents the destination port (POD). Each POD has a fixed, deterministic color assigned by port code — e.g. NLVLI is always orange (#f97316), GBPME always blue (#3b82f6), GBDVR deep blue (#2563eb), FRRAD purple (#7c3aed). Unknown ports receive a consistent hash-based color. The same port always uses the same color across all plans and voyages. A legend appears below the SVG.
- **Cell label** — short cargo type code (e.g. BAN, GRAP, AVOC).
- **Cell center** — `used/capacity` permanently shown (e.g. `262/388`), below the cargo type abbreviation.
- **Diagonal stripe overlay** — indicates an ESTIMATED position (from contract estimates, not a confirmed booking).
- **Cell header strip** — pallet capacity / pallets loaded / available pallets.
- **Cell footer strip** — design factor | historical factor | actual factor | POL port codes | temperature.

**Clicking a compartment** opens a fixed right-side slide-over panel (420px wide, 380px when the Unassigned Cargo sidebar is also open). The sidebar auto-collapses when the panel opens to give the SVG more space; it restores when the panel is closed.

The compartment detail panel contains two sections:

**1 — Eligible Bookings (collapsible):** Shows a count badge and a ▼/▶ toggle. When expanded, lists every booking with remaining pallets that can be placed in this section. Each row shows:
- Line 1: POD color dot · booking number · pallets remaining
- Line 2: cargo type · shipper name · POL→POD route · **Assign** button

Click the **Assign** button to open the quantity assignment flow. Click the row itself to highlight the booking in the roster strip.

If the plan is locked or you do not have edit access, the eligible bookings section is hidden.

**2 — Top-down grid (always visible):** Bird's-eye view of all pallet positions in the selected section. The header bar shows section ID, temperature, loaded/capacity count, a fill bar, and one chip per occupied booking or estimate slot:
- For confirmed bookings: `[●] BK-00123 · Shipper Name – Consignee Name · 140p`
- For estimate slots: `[●] Est · Shipper Name – Consignee Name · 200p`

The colored dot matches the booking's POD color on the longitudinal SVG.

**Interaction modes (when not locked):**
- **Paint mode** (booking selected in roster): click or drag empty cells to assign; click/drag own cells to erase.
- **Move/Swap mode**: drag a cell belonging to a different booking to move or swap it.

**Closing the panel:** click the **✕** button in the panel header, or click a different compartment to switch sections. The page content adjusts width automatically as the panel opens and closes.

### 7.8 Conflict Types

| Type | Color | Meaning |
|------|-------|---------|
| TEMPERATURE_CONFLICT | Red | No zone has a compatible temperature for this booking's cargo type |
| CAPACITY_CONFLICT | Amber | Compatible zones exist but are all full |
| OVERSTOW_CONFLICT | Red | Port sequence makes placement impossible (later-discharge cargo would block earlier-discharge cargo) |
| STABILITY_WARNING | Amber | Placement is valid but pushes trim/list index into warning range |

Conflicts never hard-block a plan — they are flagged for planner review. Click a booking chip in the Engine Analysis panel to highlight the affected sections in the SVG.

**Temperature conflict validation (v1.68.1):** Temperature compatibility is validated entirely
by the stowage engine using the zone's actual assigned temperature at plan-generation time.
The validation panel on the plan detail page always shows "No temperature conflicts" for
auto-generated plans — this is correct behaviour. If the engine detects a genuine temperature
conflict (no zone has a compatible temperature for a cargo type), it will appear as a
TEMPERATURE_CONFLICT in the Engine Analysis panel, not in the validation panel.

### 7.9 Advanced Stowage Optimizer (OR-Tools CP-SAT)

> This section is the technical reference for the **🔬 Advanced Optimize** feature. For the usage workflow see **section 7.2, Option A**.

The Advanced Optimizer generates **5 alternative stowage plans** for a voyage using
Google OR-Tools CP-SAT, a constraint programming solver. Unlike the Quick Plan engine
(which assigns cargo in a single sequential pass), the optimizer finds mathematically
optimal arrangements across multiple objectives simultaneously.

**Prerequisites:** The Python optimizer service must be running on port 8001 before
using this feature.

**Starting the service** (run once per session, in a separate terminal):
```
cd stowage-optimizer
venv\Scripts\activate
uvicorn api:app --port 8001 --reload
```

**Using the Advanced Optimizer:**
1. From the **Stowage Plans** list, click **🔬 Advanced Optimize**.
2. Select a voyage from the dropdown and click **Run Optimizer**.
3. The solver runs for up to 30 seconds per plan objective (5 plans = up to 2.5 minutes total). A spinner is shown while the service is computing.
4. When complete, a **5-plan carousel** is displayed. Each plan shows:
   - Metrics: pallets placed, overstow violations, balance deviation, compactness percentage.
   - Cargo positions table: grouped by hold and section, with POD-colored cells.
5. Browse the 5 plans using the Previous / Next buttons. Each plan corresponds to one objective:
   - **Plan 1 — Balanced:** equal weight on balance, compactness, and POD distribution.
   - **Plan 2 — Max Balance:** prioritises even fwd/aft weight distribution.
   - **Plan 3 — Max Compactness:** fills lower hold levels first.
   - **Plan 4 — POD-Friendly:** discourages same-POD cargo concentration in a single hold.
   - **Plan 5 — Max Utilization:** maximises total pallets placed.
6. Select the preferred plan and click **Save this Plan**. The plan is saved to the
   database and you are redirected to the plan detail page.

**If the service is not running:** An error message will appear:
*"Python optimizer service not running. Start it with: cd stowage-optimizer && uvicorn api:app --port 8001"*

**Hard constraints enforced by all 5 plans:**
- Temperature compatibility (cargo type vs zone temperature)
- Section capacity (assigned ≤ floor(sqm ÷ DSF))
- POL monotonicity (early-loading cargo goes to deepest sections)
- POD accessibility (first-discharge cargo goes to shallowest sections)
- Temperature zone grouping (incompatible cargo types cannot share the same zone)

**Saved plan properties:** `generationMethod` is set to `PYTHON_OPTIMIZER_<LABEL>`
(e.g. `PYTHON_OPTIMIZER_BALANCED`), `status` is set to `ESTIMATED`. The plan can be
reviewed, revised, and sent to the captain following the normal workflow.

### 7.10 Manual Stowage Editing

After a plan is created, individual cargo assignments can be adjusted without re-running the optimizer. All manual edits are performed from the plan detail page.

**App header — plan context bar**

When viewing a plan detail page, the fixed header always shows:
- **Vessel name · Voyage number** — top-left of the header, below the page title.
- **LOADED** — total pallets assigned across all compartments in the plan.
- **CAPACITY** — vessel total pallet capacity (sum across all cooling sections).
- **AVAILABLE** — remaining unassigned slots. Shown in green when space is available; amber when fully utilised.

These totals update live as cargo is assigned or removed.

**Right-click context menu**

Right-click any compartment cell in the Longitudinal Profile to open the context menu for that compartment. Actions available:

| Action | Status | Description |
|--------|--------|-------------|
| **Add Cargo** | Available | Opens the Unassigned Cargo sidebar with this compartment pre-selected as the assignment target |
| **Transfer Cargo** | Pending | Move pallets from this compartment to another compartment |
| **Reduce/Cancel Cargo** | Pending | Reduce or fully remove a cargo assignment from this compartment |
| **Details** | Available | Opens the compartment detail panel showing assigned cargo and section specifications |

> *Transfer Cargo and Reduce/Cancel Cargo are planned features — selecting them currently shows a pending notice.*

**Unassigned Cargo sidebar**

The **⊕ Unassigned** button in the top-right area of the app header (next to the user avatar) opens a side panel listing all bookings with remaining unplaced pallets. A badge on the button shows the count of bookings that are unplaced or partially placed.

Panel features:
- **Filter tabs:** All | Not placed | Partial
- **Search:** Filter by booking number, shipper name, consignee name, or port code
- **Each row shows:** booking reference, shipper name, POL→POD route, cargo type, and pallets remaining

**Assigning cargo to a compartment**

When the sidebar is opened via **Add Cargo** from the right-click context menu, the target compartment is shown at the top of the panel with:
- Available space in pallets
- A quantity slider to choose how many pallets to assign to this compartment
- A **Confirm** button to execute the assignment

The booking list is filtered automatically to show only bookings that are temperature-compatible with the target compartment's zone temperature.

> **Note — display refresh (temporary):** After confirming a cargo assignment, the compartment totals (loaded/available numbers, hold totals, and capacity bar) will update automatically in a future release. Currently the page must be refreshed to see the updated compartment totals. The assignment is saved to the database — refreshing will show the correct values.

When the sidebar is opened directly from the **⊕ Unassigned** button (not from a context menu), it shows the full unplaced booking list without a pre-selected target.

---

## 8. Vessels

**Vessel cards are fully clickable.** On the `/vessels` list, clicking anywhere on a vessel card opens the vessel detail page. Keyboard navigation is supported (Tab to focus, Enter or Space to open). A cyan focus outline appears on the focused card.

**MarineTraffic link.** Each vessel card with a valid IMO number shows a small external-link SVG icon (⬡) next to the IMO number. Clicking this icon opens the vessel's page on MarineTraffic in a new tab. The icon is independently clickable and does not navigate to the vessel detail page.

### 8.1 Vessel Detail Page

Shows the vessel's full SVG profile (empty, structural only — no cargo) with all holds and cooling sections. Click any section to see its specifications: sqm, pallet capacity, stowage factors.

The **Configure Zones** button opens a modal to review zone-to-section groupings and assign temperatures. Zone temperature assignments made here are used as the starting point for new stowage plans for this vessel.

### 8.2 Stowage Factors

Three stowage factors are tracked per cooling section:
- **Design factor** — from the vessel's specification sheet (used as the default)
- **Historical factor** — rolling average from completed voyages (updated after voyage close — planned feature)
- **Actual factor** — calculated live from the current plan when a section is marked full

Pallet capacity = `floor(sqm ÷ chosen factor)` (the design factor is expressed in square metres per pallet, so it is used as a divisor). The system always uses the design factor as the fallback.

---

## 9. Email Notifications

The system sends transactional emails via Gmail SMTP for the following events:

| Event | Recipients |
|-------|-----------|
| Booking submitted by exporter | Exporter (confirmation) + all service planners |
| Booking created by planner on behalf of shipper | Shipper user account |
| Booking status changed (approved/partial/rejected/standby) | Shipper user account |
| Booking cancelled by planner | Shipper user account |
| Booking cancelled by exporter | All service planners |
| Booking quantity modified by planner | Shipper user account |
| Booking quantity modified by exporter | All service planners |
| Password changed | Logged-in user |
| 5th consecutive failed login attempt | Account owner |

Planner recipients are determined by office-to-service assignments. If no office assignments match, all confirmed planners receive the notification.

---

## 10. Port Weather

The dashboard and voyage list show current weather conditions at each port in your service's rotation. Weather data is fetched from OpenWeatherMap using port coordinates (latitude/longitude) stored in the port records. If a port shows `—` for weather, verify that latitude and longitude are set correctly in **Admin → Ports**.

---

## 11. Dashboard (`/`)

The dashboard is the default landing page after login. It shows four stat cards (active voyages, pending bookings, plans in draft, awaiting captain approval) and two summary tables.

**KPI cards are clickable.** Each of the four stat cards navigates to the relevant filtered list when clicked:

| Card | Navigates to |
|------|-------------|
| Active Voyages | `/voyages` filtered to IN_PROGRESS and PLANNED |
| Pending Bookings | `/bookings` filtered to PENDING, STANDBY, and PARTIAL |
| Plans in Draft | `/stowage-plans` filtered to DRAFT |
| Awaiting Captain | `/stowage-plans` filtered to READY_FOR_CAPTAIN and EMAIL_SENT |

Cards show a hover effect (slight upward lift) to indicate they are interactive.

### 11.1 Recent Voyages table — UTILIZATION column

Each voyage row shows a **CapacityBar** with two segments:
- **Solid segment** — confirmed booking pallets (sum of confirmedQuantity for non-cancelled/rejected bookings).
- **Striped segment** — estimated pallets from active SpaceForecast records for that voyage (same filter as the Contracts & Space panel).

Label below the bar: "N + M est." (compact form).

### 11.2 Stowage Plans table — LOADED column

Each plan row shows the same **CapacityBar** using voyage-level data:
- **Solid segment** — confirmed booking pallets for the plan's voyage.
- **Striped segment** — estimated pallets for the plan's voyage.

Both columns use identical data sources so the bar is consistent across the dashboard and the `/stowage-plans` listing.

---

## 12. Adaptive Layout — Screen Sizes and Device Behaviour

The agency portal shares the same responsive layout foundation as the shipper portal.

### 12.1 Sidebar behaviour by breakpoint

| Viewport | Sidebar mode | Notes |
|----------|-------------|-------|
| ≤ 767 px (mobile) | Slide-in overlay (hamburger trigger) | Main content is always full-width |
| 768 – 1 024 px (tablet portrait) | Fixed — expanded or collapsed per preference | Internal padding reduced to show more nav items; sidebar height uses `100dvh` to fit the visible screen on Android/iOS |
| ≥ 1 025 px (desktop) | Fixed — user-controlled expand/collapse | Persisted in localStorage across sessions |

The sidebar uses `height: 100dvh` (dynamic viewport height) so it is never clipped by the browser address bar on tablet devices such as the Lenovo TB-X505L.

### 12.2 Dense data tables — isolated horizontal scroll

All agency data tables (Bookings, Voyages, Stowage Plans, Contracts) that contain many columns are wrapped in a scroll container. On 14" laptops or portrait tablets:

- Only the table scrolls left/right — the sidebar, fixed header, and page title remain stationary.
- A thin scrollbar at the bottom of the table indicates that more columns are available.
- The main content area never develops a page-level horizontal scrollbar.

To use this pattern on any new table, wrap `<table>` in `<div className="table-scroll">` (global utility class).

### 12.3 Large monitors (> 1 440 px)

All agency data tables (Bookings, Voyages, Stowage Plans, Contracts) expand to the full available width on 16-inch and 24-inch monitors — there is no artificial cap on the table container. This ensures that columns like Vessel, Route, Status, and Utilization remain visible without horizontal scrolling.

Dashboard and form pages that benefit from a readable line length use the `.page-cap` global utility class (max-width 1 600 px, centred). The page background always extends edge-to-edge so the centred column does not produce an abrupt dark cut-off on very wide screens.

### 12.4 Header height and visual horizon line

The agency portal header has a uniform height of 56 px across all pages. This value is defined by the `--header-height` CSS token and applies consistently to:

- The fixed top header bar (breadcrumbs, vessel/voyage identity, user avatar).
- The sidebar brand section — its bottom border aligns exactly with the header's bottom border, producing a continuous horizontal "horizon line" at the top of every page.
- All offset calculations for sticky panels (Unassigned Cargo panel, stowage plan page positioning).

On the stowage plan detail page (`/stowage-plans/[id]`), the 56 px height gives the two-line plan identity (`WK · Vessel · Voyage · Version`) and the action buttons (Save Draft, Send to Captain, Delete) 12 px of vertical padding on each side — preventing any text or control from touching the header border.

---

*This document is a working draft and will be updated as features are finalized.*