# Reefer Stowage Planner — Shipper Portal User Manual (DRAFT)

> **Status:** Work in progress — updated alongside development sessions.
> **Language:** English
> **Audience:** Exporters / Shippers using the portal to manage bookings and space forecasts.
> **Last updated:** v1.72.61

---

## 1. Getting Started

### 1.1 Your Account

- Your account is created by the shipping agency administrator. You will receive an invitation email with a link to set your password.
- Follow the link in the email, set a password, and log in at the agency's system URL.
- Your account is linked to your company (shipper) by the administrator. If you see the message "Your account is not linked to a shipper — contact your administrator," reach out to your agency coordinator before proceeding.

### 1.2 Logging In

- Go to the login page and enter your email and password.
- You will be taken directly to the Shipper Portal dashboard.
- Sessions expire after 8 hours of activity, or after 15 minutes of inactivity. You will be redirected to the login page automatically.

### 1.3 Portal Navigation

The left sidebar contains all your available sections:

| Section | What it's for |
|---------|--------------|
| **Dashboard** | Overview of your active bookings and upcoming sailings |
| **Bookings** | Full list of your booking requests and their statuses |
| **Forecasts** | Submit and track space estimates for upcoming voyages |
| **Schedules** | Upcoming sailing schedules for your service |
| **Account** | Change your password |

**Sidebar identity:** Your company name and user name appear at the bottom of the sidebar, below all navigation items. This is the single location where your shipper identity is displayed — it does not appear in the top header bar or at the top of the sidebar brand area, keeping the header uncluttered.

### 1.4 Keyboard Navigation

All interactive cards and table rows in the portal support keyboard navigation:
- Press **Tab** to move focus between clickable elements. A cyan outline indicates the currently focused item.
- Press **Enter** or **Space** on a focused card or row to activate it (same as clicking).
- Press **Escape** to close any open modal.

---

## 2. Dashboard

The **Overview** page is your home screen after login. It is divided into three parts: KPI summary cards, an Upcoming Voyages strip, and a Recent Bookings table.

### 2.1 KPI Cards

Five summary cards appear at the top of the page. Each card is clickable — click any card to open the relevant filtered view.

| Card | What it shows | Click destination |
|------|--------------|-------------------|
| **Active Bookings** | Total bookings in PENDING, CONFIRMED, PARTIAL, or STANDBY status | Your full bookings list |
| **Confirmed Pallets** | Total pallets across confirmed bookings | Bookings filtered to CONFIRMED |
| **Awaiting Approval** | Total pallets in PENDING bookings · booking count | Bookings filtered to PENDING |
| **On Standby** | Total pallets on a waiting list · booking count | Bookings filtered to STANDBY |
| **Pending Requests** | Upcoming voyages where you have not yet submitted an estimate or booking | Pending Submissions page |

**Pending Requests card:** Shows 0 with the label "All submissions up to date" when fully caught up. When action is needed, the count displays in amber. The sub-label reflects the current mix: *"N awaiting submission"* when some voyages have no submission yet, or *"Booking pending · estimate sent"* when all pending voyages already have an estimate but no booking. Click the card to open the **Pending Submissions** page.

### 2.2 Pending Submissions page (`/shipper/pending`)

Opened by clicking the **Pending Requests** KPI card. Lists every upcoming voyage on your active contracts where action is still needed — either you have not yet submitted anything, or you have submitted an estimate but not yet a booking.

Each voyage is shown as a card with:
- Voyage number, vessel name, week number (e.g. Wk 20), and departure date
- Route — loading port(s) → discharge port(s)
- Cargo type and your weekly contract estimate (pallets/week)

Cards appear in two states:

**No submission yet (`NONE`):**
- Both **Submit Estimate** and **Request Booking** buttons are shown.
- Submit an estimate first if you are not yet ready to commit to a booking.

**Estimate already submitted (`HAS_ESTIMATE`):**
- A disabled **✓ Estimate sent** button replaces the Submit Estimate button — your estimate is already on file, no further action needed here.
- The **Request Booking** button is always shown — use it to convert your estimate into a formal booking request.

> Agency-generated internal estimates (CONTRACT_DEFAULT) do not appear on this page — only estimates you submitted yourself are counted.

| Button | What it does |
|--------|-------------|
| **Submit Estimate** | Opens the forecast wizard with the voyage and contract already selected — the contract step is skipped automatically |
| **✓ Estimate sent** *(disabled)* | Your estimate has already been submitted — no further action needed here |
| **Request Booking** | Opens the booking request wizard with the voyage and contract already selected — opens directly at the cargo details step |

If no pending items exist, the page shows: *"All caught up — no pending submissions."*

### 2.3 Upcoming Voyages

A scrollable strip below the KPI cards shows active and upcoming sailings on your service — vessel name, voyage number, departure date, and the load and discharge port rotation. This includes both planned voyages and voyages currently in progress (vessel already departed but not yet arrived at the final destination). Click **View all schedules →** to see the full schedule.

This strip only appears when voyages exist on your service.

**Voyage cards are clickable — booking and estimate actions.** Clicking any voyage card opens the **Voyage Action Modal**, which shows your submission status for that voyage per contract and provides quick-action buttons:

| Contract status | What you see | Actions available |
|----------------|-------------|------------------|
| No submission yet | — | **Submit Estimate** (opens the forecast wizard, contract and voyage pre-selected) · **Request Booking** (opens the booking wizard, contract and voyage pre-selected) |
| Estimate submitted | Amber *"Estimate sent"* badge | **Book →** (opens the booking wizard, contract and voyage pre-selected) |
| Booking confirmed | Green *"Booked"* badge | No further action needed |

The modal header shows the voyage number, vessel name, departure date, and port route. Close the modal by clicking the **×** button, clicking outside it, or pressing **Escape**.

**Keyboard navigation:** Press Tab to focus a voyage card and Enter or Space to open the modal. A cyan outline indicates the focused card.

### 2.4 Recent Bookings

A table showing your last 5 booking requests. Columns: BOOKING # · VOYAGE · VESSEL · WEEK · CARGO · CONSIGNEE · REQ. · CONF. · ROUTE · STATUS. Click **View all →** to open your full bookings list.

**Mobile:** On small screens (≤767px) the table converts to a compact card list. Each card shows booking number and status at the top, followed by vessel/voyage, route/week, consignee and cargo, and the requested/confirmed/standby quantities as labeled rows.

---

## 3. Bookings

The Bookings list (`/shipper/bookings`) shows all your booking requests. Table columns: BOOKING # · VOYAGE · VESSEL · SERVICE · WEEK · CARGO · CONSIGNEE · ROUTE · REQ. PALLETS · CONF. PALLETS · STATUS. Use the search bar to filter by booking number, voyage, or vessel name. Use the status filter to narrow by booking status.

**Mobile:** On small screens (≤767px) the table converts to compact cards. Each card shows the booking number and status, then vessel/voyage, route and week, consignee and cargo type, and the requested/confirmed/standby quantities as labeled rows. The Edit button spans full width with a 44px touch target.

### 3.1 Booking Statuses

| Status | Meaning |
|--------|---------|
| **PENDING** | Your request has been submitted and is waiting for review by the agency |
| **CONFIRMED** | The agency has confirmed your full requested quantity |
| **PARTIAL** | The agency has confirmed part of your requested quantity. Some pallets may be on standby (waiting for space) or have been declined. You will receive a separate notification when standby pallets are resolved. |
| **STANDBY** | All your requested pallets are on a waiting list. You will be notified when the agency makes a final decision. |
| **REJECTED** | Your request was not accepted for this sailing |
| **CANCELLED** | The booking was cancelled (by you or the agency) |

### 3.2 Submitting a New Booking Request

> **Tip — skip steps automatically:** If you click **Request Booking** from a pending submission card (`/shipper/pending`) or from the **Voyage Action Modal**, the voyage and contract are pre-selected and the wizard opens directly at the cargo details step. You can still change the selection using the **← Back** button.

> **Layout:** On large screens the booking request wizard is centered with a maximum width, matching the visual weight of the agency portal. On mobile devices the wizard fills the full screen width automatically.

1. Click **New Booking Request** from the Bookings page or the Dashboard.
2. **Step 2 — Select contract:** Your active contracts are shown in a list. Each entry displays your company name, the consignee, the route (POL → POD), cargo type, and your weekly estimate. Select the contract that applies to this shipment.
3. **Step 3 — Select voyage:** Available upcoming sailings for your contract's service are shown.
4. **Step 4 — Enter quantity:** An info panel shows your contract reference, route, and cargo type so you can confirm you selected the right contract. Your weekly estimate from the contract is shown prominently — use this as a reference when entering your requested quantity. You can request more or less than your weekly estimate.
5. Submit — you will receive a confirmation email. The agency will review and respond.

You can cancel the request at any step by clicking **Cancel** — you will be returned to the Bookings list without submitting anything.

**Editing your booking:** You can change your requested quantity as long as the vessel has not yet departed your loading port (POL).
- If you reduce your quantity, the change takes effect immediately and your coordinator is notified.
- If you increase your quantity, your booking returns to Pending status and must be re-approved by the agency.

### 3.3 Booking Notifications

You will receive email notifications when:
- Your booking request is received
- The agency confirms, partially confirms, rejects, or puts your booking on standby
- Your booking is modified or cancelled

### 3.4 Viewing Booking Details

Click any booking row to open the detail view. You can see:
- Full booking information (vessel, voyage, route, cargo, quantities)
- Current status and any notes from the agency
- History of status changes

### 3.5 Editing a Booking Request

- In **My Bookings** (/shipper/bookings), click the **Edit** button on any booking row.
- The modal shows the **Requested Quantity** field only.
- Update the requested quantity and/or notes and save.
- The booking status is automatically set to **Pending** upon saving, regardless
  of its previous status. This notifies the shipping agency that a change has been
  made and requires their re-approval before the booking is confirmed again.

---

## 4. Space Forecasts

Space forecasts allow you to submit estimated pallet quantities for upcoming voyages **before** making a formal booking. This helps the agency plan stowage in advance and gives you visibility into available space.

### 4.1 What is a Forecast?

A forecast is a non-binding estimate of how many pallets you expect to ship on a given voyage. Once you confirm and submit a formal booking, the forecast is automatically superseded by the booking — you do not need to manually cancel it.

### 4.2 Forecast Statuses

| Status | Meaning |
|--------|---------|
| **Pending Review** | Your estimate has been submitted and is visible to the planner |
| **Incorporated** | The planner has included your estimate in the stowage plan |
| **Superseded** | A newer estimate from you replaced this one |
| **Replaced by Booking** | A confirmed booking replaced this forecast — no action needed |
| **No Change** | The planner reviewed the estimate and no plan adjustment was needed |
| **No Cargo Declared** | You declared no cargo for this voyage. No pallets are reserved. Submit a new forecast or booking to reverse this. |

### 4.3 Submitting a Forecast

> **Mobile:** The forecast wizard is fully responsive at 375px and above. On small screens the step 2 voyage table converts to a card-list layout — each voyage appears as a stacked card with labelled rows instead of a horizontal table. All buttons meet the 44px touch target standard. The quantity input uses 16px font size to prevent iOS Safari from zooming the page on focus.

> **Tip — skip steps automatically:** If you click **Submit Estimate** from a pending submission card (`/shipper/pending`) or from the **Voyage Action Modal**, the contract is pre-selected and the wizard opens directly at the estimates table (step 2). The voyage matching the pending card is highlighted in the table. You can still change the contract using the **← Back** button.

1. Go to **Forecasts** in the sidebar and click **New Forecast**.
2. **Step 1 — Select contract:** Choose the contract for which you want to submit estimates. The same contract selector used for bookings is shown here.

   > Each contract card shows: contract number, service, cargo type, route
   > (origin port → destination port with port names), consignee, and weekly
   > pallet estimate. Select the contract you want to submit estimates for and
   > click Next.

3. **Step 2 — Enter estimates per voyage:** A table shows all upcoming voyages for your contract's service. For each voyage you want to estimate, enter the number of pallets in the input field.
   - You can fill one voyage or multiple voyages in a single submission.
   - If you already have an active forecast for a voyage, the field will be pre-filled with that value — editing it will update your estimate.
   - If you already have a confirmed booking for a voyage, that row shows "Booking confirmed" and cannot be edited here.
   - Voyages where your loading port has already departed are not shown.
   - **No cargo this voyage:** If you have no cargo for a specific voyage, tick the "No cargo this voyage" checkbox on that row instead of entering a quantity. This hides the quantity input and records a No Cargo declaration when you submit.

   > Below each quantity input you will see a reference figure labeled
   > "ref: N plt/wk" — this is the weekly estimate from your contract.
   > Use it as a guide when entering your voyage estimate.
4. Click **Submit** — one forecast entry is created per voyage you filled or marked as no-cargo. You will be redirected to your Forecasts list.

**Reversing a No Cargo declaration:** Submit a new forecast for the same voyage with a real pallet quantity. The new estimate automatically supersedes the No Cargo declaration. You can also submit a booking request — the booking takes priority over any forecast.

> **Note:** If you submit a forecast for a voyage where you already have a confirmed booking,
> the system will block the submission with a message. In that case, no action is needed —
> your booking is already confirmed.

### 4.4 Tracking Your Forecasts

The Forecasts list (`/shipper/forecasts`) shows all your submitted estimates with their current status. Table columns: VOYAGE · VESSEL · SERVICE · WEEK · ROUTE · CARGO · CONSIGNEE · PALLETS · STATUS · SUBMITTED. Week is derived from the last two digits of the voyage number (e.g. voyage AC26020 → Wk 20). Route shows the loading port → discharge port codes (e.g. COTUB → NLRTM).

**Mobile:** On small screens (≤767px) the table converts to compact cards. Each card shows voyage number and status, then vessel and week, route and cargo type, consignee, and pallets submitted — as clearly labelled rows.

The agency planner can see all your forecasts and will incorporate them into the stowage plan before sending it to the captain.

---

## 5. Schedules

The Schedules page shows all active and upcoming sailings on your assigned service, grouped by service code. For each voyage you can see:
- Vessel name and voyage number
- Departure date
- Full port rotation with estimated arrival dates per port
- Voyage status badge

**What voyages are shown:**
- All voyages in `PLANNED` or `IN_PROGRESS` status — including voyages already at sea.
- Recently completed voyages remain visible for up to 7 days after the vessel's last port call (final destination), so you can see voyages that just finished their rotation.
- Voyages with status `COMPLETED`, `CLOSED`, or `CANCELLED` are hidden after the 7-day window.

The system uses the most reliable available date to determine whether a voyage has finished: actual time of departure (ATD) is used when recorded, falling back to estimated time of departure (ETD), then actual arrival (ATA), then estimated arrival (ETA). If no date information is available for the final port, the voyage remains visible.

If your account is linked to specific services, only voyages on those services appear. If you expect to see a service that is not listed, contact your agency coordinator.

**Schedule rows are clickable — click a row to open the Voyage Action Modal** (same as clicking a voyage card on the dashboard). The modal shows your submission status per contract. The available actions depend on what you have already submitted for that voyage:

| Contract status | What you see | Actions available |
|----------------|-------------|------------------|
| No submission yet | — | **Submit Estimate** · **Request Booking** |
| Estimate submitted | Amber *"Estimate sent"* badge | **Book →** |
| Booking confirmed | Green *"Booked"* badge | No further action needed |

See section 2.3 for a full description of each button's behavior.

Each row also has a **chevron icon** on the right that independently controls the port-by-port timeline:
- Click the **chevron** to expand the timeline below the row; click again to collapse it.
- Clicking the row and clicking the chevron are independent — you can have a row expanded and open the modal at the same time.

The chevron has three visual states:
- **At rest:** visible in a muted grey (#94A3B8)
- **On hover:** brightens to white
- **When expanded:** rotates 180° and turns cyan — so you always know which rows are open at a glance

Each row shows a compact route summary in its collapsed state: the first load port flag and code, an arrow, the last discharge port flag and code, and a "+N stops" badge when the voyage has intermediate ports.

**Expanded timeline:** The timeline is displayed horizontally and scrolls if needed on narrow screens. Each port call shows:
- A colour-coded dot: **cyan** for load ports, **amber** for discharge ports
- Port code with flag icon
- Port name
- Estimated departure or arrival date
- Operation label: **Load** or **Discharge**

**Mobile:** On small screens (≤767px) each collapsed voyage row converts to a compact card showing voyage number, vessel name, departure date, and route summary. The expanded port timeline scrolls horizontally as on desktop.

**Keyboard navigation:** Press Tab to focus a row and Enter or Space to open the Voyage Action Modal. Use the chevron button to expand or collapse the timeline independently.

---

## 6. Account

The Account page is centered within the content area on all screen sizes — it does not stretch edge-to-edge on wide monitors.

### 6.1 Changing Your Password

Go to **Account** in the sidebar. Enter your current password, then your new password (minimum 8 characters), and confirm. You will receive an email notification confirming the password change.

---

## 7. Adaptive Layout — Screen Sizes and Device Behaviour

The portal adapts its layout across four breakpoints to provide a usable experience from smartphones to large desktop monitors.

### 7.1 Mobile (≤ 767 px)

All data lists (Bookings, Forecasts, Schedules, and the Recent Bookings section on the dashboard) convert from horizontal tables to compact vertical card lists. Each card shows the most important fields in a labelled hierarchy:

- The booking or voyage identifier and its status badge appear in the card header.
- Subsequent rows each show a left-aligned label (e.g. **VESSEL**, **ROUTE**, **CARGO**) and the corresponding value right-aligned on the same visual line.
- Quantity rows (Req. / Conf.) follow the same label | value pattern and are separated from the info rows by a hairline divider.
- **Long consignee names** are truncated with an ellipsis (`…`) at the card edge so they never push other content off-screen or cause horizontal scroll.

The sidebar becomes a slide-in drawer triggered by the hamburger menu in the header. The main content always fills the full viewport width — no leftover sidebar margin.

### 7.2 Tablet portrait (768 – 1024 px)

The sidebar remains fixed (not an overlay) but its internal padding is reduced so more navigation items are visible without needing to scroll the sidebar itself. You can still collapse the sidebar to an icon-only rail using the **‹** toggle at the bottom.

The sidebar height uses the dynamic viewport unit (`100dvh`) so it always fits the visible screen area, even when the browser address bar is visible on Android or iOS.

### 7.3 Standard desktop (1 025 – 1 440 px)

Full table layout with all columns visible. Content padding is 24 px on all sides.

**Wide data tables** (Bookings, Schedules, Forecasts) scroll horizontally inside their own container — the sidebar and page header stay fixed. Only the table body scrolls left/right; a thin scrollbar at the bottom of the table signals that more columns are available.

### 7.4 Large monitors (> 1 440 px)

Operational data tables — Bookings, Schedules, and Forecasts — expand to the full available width so every column (Consignee, Route, Status, etc.) is visible without horizontal scrolling on 16-inch and 24-inch monitors.

Form and wizard pages (New Booking Request, New Forecast, Account Settings) use their own internal centred column with a maximum width (800 px – 1 100 px depending on the form) for comfortable reading. The surrounding page background fills the full screen width.

The sidebar brand bar and the main page header share the same precise height, producing a continuous visual "horizon line" across the top of the interface.

KPI summary cards on the Dashboard distribute evenly across all available columns — on very wide monitors each card grows proportionally rather than leaving empty space on the right.

---

## 8. Getting Help

If you have questions about a specific booking, voyage, or space allocation, contact your shipping agency coordinator directly. The system will also send you email confirmations for all booking actions — keep these for reference.

---

*This document is a working draft and will be updated as features are finalized.*
