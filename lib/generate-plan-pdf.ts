// lib/generate-plan-pdf.ts
// Generates a stowage-plan PDF using pdf-lib (pure JS, no native dependencies).
// Returns a Buffer suitable for attaching to an email via nodemailer.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface PlanPdfZone {
  zoneId: string;
  coolingSectionIds: string[];
  assignedTemperature: number;
}

export interface PlanPdfCargoRow {
  compartmentId: string;
  zoneId: string;
  assignedTemperature: number;
  cargoType: string;
  bookingRef: string;
  quantity: number;
}

export interface PlanPdfPortCall {
  sequence: number;
  portCode: string;
  portName: string;
  eta?: string;
  etd?: string;
  operations: string[];
  status?: string;
}

export interface PlanPdfData {
  planNumber: string;
  vesselName: string;
  voyageNumber: string;
  generatedAt: Date;
  temperatureZones: PlanPdfZone[];
  cargoRows: PlanPdfCargoRow[];
  portCalls: PlanPdfPortCall[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | Date): string {
  if (!d) return '-';
  try {
    return new Date(d as string).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return '-'; }
}

function fmtTemp(t: number): string {
  return `${t > 0 ? '+' : ''}${t} C`;
}

// Truncate string so it fits within `maxPx` pixels at an average of `charPx` per char.
function trunc(s: string, maxPx: number, charPx = 5.2): string {
  const max = Math.floor(maxPx / charPx);
  return s.length <= max ? s : s.slice(0, max - 2) + '..';
}

// ── PDF generation ───────────────────────────────────────────────────────────

export async function generatePlanPdf(data: PlanPdfData): Promise<Buffer> {
  const A4_W = 595.28;
  const A4_H = 841.89;
  const MARGIN = 40;
  const CW = A4_W - MARGIN * 2; // 515.28

  const ROW_H  = 15;   // data row height
  const HEAD_H = 17;   // table header row height
  const SEC_H  = 17;   // section title bar height

  const C_DARK  = rgb(0.07, 0.08, 0.15);
  const C_ACNT  = rgb(0.055, 0.647, 0.914);
  const C_MUTED = rgb(0.39,  0.455, 0.545);
  const C_LIGHT = rgb(0.945, 0.961, 0.976);
  const C_MID   = rgb(0.882, 0.910, 0.937);
  const C_TEXT  = rgb(0.118, 0.180, 0.314);
  const C_ALT   = rgb(0.973, 0.984, 0.996);
  const C_WHITE = rgb(1,     1,     1    );

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  // Mutable drawing state — updated by newPage() and every draw call.
  let page: PDFPage = doc.addPage([A4_W, A4_H]);
  let y = A4_H - MARGIN;  // top-down current position (is the actual pdf-lib y value)

  const newPage = () => {
    page = doc.addPage([A4_W, A4_H]);
    y = A4_H - MARGIN;
  };

  const ensure = (need: number) => {
    if (y - need < 55) newPage();
  };

  // Draw a filled rectangle whose top is at `topY`.
  const rect = (x: number, topY: number, w: number, h: number, color: ReturnType<typeof rgb>) => {
    page.drawRectangle({ x, y: topY - h, width: w, height: h, color });
  };

  // Draw text; `topY` is the top of the intended row, `size` is font size.
  // Baseline is placed at topY - rowH * 0.72 (visually centres typical cap letters).
  const txt = (
    str: string,
    x: number,
    topY: number,
    rowH: number,
    size: number,
    font: PDFFont = regular,
    color: ReturnType<typeof rgb> = C_TEXT,
  ) => {
    const baseline = topY - rowH * 0.72 + size * 0.1;
    page.drawText(str, { x, y: baseline, size, font, color });
  };

  const hline = (lineY: number) => {
    page.drawLine({
      start: { x: MARGIN, y: lineY },
      end:   { x: MARGIN + CW, y: lineY },
      thickness: 0.4,
      color: C_MID,
    });
  };

  // ── Header block ──────────────────────────────────────────────────────────
  const HDR = 68;
  rect(MARGIN, y, CW, HDR, C_DARK);
  txt(data.planNumber,                               MARGIN + 14, y,        HDR * 0.45, 18, bold,    C_WHITE);
  txt(`${data.vesselName}  -  ${data.voyageNumber}`, MARGIN + 14, y - 26,   18,         10, regular, C_ACNT);
  txt(`Generated ${fmtDate(data.generatedAt)}`,      MARGIN + 14, y - 46,   14,          8, regular, C_MUTED);
  txt('STOWAGE PLAN',                                MARGIN + CW - 85, y,   HDR * 0.45,  8, bold,    C_MUTED);
  y -= HDR + 10;

  // ── Section title ─────────────────────────────────────────────────────────
  const section = (title: string) => {
    ensure(SEC_H + ROW_H + 10);
    y -= 8;
    rect(MARGIN, y, CW, SEC_H, C_LIGHT);
    txt(title.toUpperCase(), MARGIN + 6, y, SEC_H, 7.5, bold, C_MUTED);
    y -= SEC_H + 4;
  };

  // ── Table ─────────────────────────────────────────────────────────────────
  type Col = { label: string; w: number };

  const table = (cols: Col[], rows: string[][]) => {
    ensure(HEAD_H + ROW_H);
    // Header row
    rect(MARGIN, y, CW, HEAD_H, C_MID);
    let cx = MARGIN;
    for (const col of cols) {
      txt(col.label, cx + 4, y, HEAD_H, 7.5, bold, C_MUTED);
      cx += col.w;
    }
    y -= HEAD_H;

    // Data rows
    for (let i = 0; i < rows.length; i++) {
      ensure(ROW_H + 2);
      if (i % 2 === 1) rect(MARGIN, y, CW, ROW_H, C_ALT);
      cx = MARGIN;
      for (let c = 0; c < cols.length; c++) {
        const cell = trunc(rows[i][c] ?? '-', cols[c].w - 8);
        txt(cell, cx + 4, y, ROW_H, 8, regular, C_TEXT);
        cx += cols[c].w;
      }
      hline(y - ROW_H);
      y -= ROW_H;
    }
    y -= 8;
  };

  // ── Port Rotation ─────────────────────────────────────────────────────────
  const scheduled = data.portCalls.filter(p => p.status !== 'CANCELLED');
  if (scheduled.length > 0) {
    section('Port Rotation');
    table(
      [
        { label: '#',          w: 24  },
        { label: 'Code',       w: 52  },
        { label: 'Port',       w: 170 },
        { label: 'ETA',        w: 82  },
        { label: 'ETD',        w: 82  },
        { label: 'Operations', w: CW - 410 },
      ],
      scheduled.map(p => [
        String(p.sequence),
        p.portCode,
        p.portName,
        fmtDate(p.eta),
        fmtDate(p.etd),
        p.operations.join(' / '),
      ])
    );
  }

  // ── Temperature Zones ─────────────────────────────────────────────────────
  if (data.temperatureZones.length > 0) {
    section('Temperature Zone Configuration');
    table(
      [
        { label: 'Zone',             w: 90  },
        { label: 'Cooling Sections', w: 245 },
        { label: 'Set Temperature',  w: CW - 335 },
      ],
      data.temperatureZones.map(z => [
        z.zoneId,
        z.coolingSectionIds.join(', '),
        fmtTemp(z.assignedTemperature),
      ])
    );
  }

  // ── Cargo Assignment ──────────────────────────────────────────────────────
  section('Cargo Assignment');
  if (data.cargoRows.length > 0) {
    table(
      [
        { label: 'Compartment', w: 78  },
        { label: 'Zone',        w: 72  },
        { label: 'Temp',        w: 52  },
        { label: 'Cargo Type',  w: 120 },
        { label: 'Booking Ref', w: 130 },
        { label: 'Pallets',     w: CW - 452 },
      ],
      data.cargoRows.map(r => [
        r.compartmentId,
        r.zoneId,
        fmtTemp(r.assignedTemperature),
        r.cargoType.replace(/_/g, ' '),
        r.bookingRef,
        String(r.quantity),
      ])
    );

    const totalPallets = data.cargoRows.reduce((s, r) => s + r.quantity, 0);
    ensure(20);
    txt(`Total pallets assigned: ${totalPallets}`, MARGIN + 4, y, 14, 8.5, bold, C_TEXT);
    y -= 18;
  } else {
    ensure(20);
    txt('No cargo positions assigned.', MARGIN + 6, y, 14, 8.5, regular, C_MUTED);
    y -= 18;
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const pages = doc.getPages();
  const pageCount = pages.length;
  for (let i = 0; i < pageCount; i++) {
    const p = pages[i];
    p.drawLine({
      start: { x: MARGIN,      y: 34 },
      end:   { x: A4_W - MARGIN, y: 34 },
      thickness: 0.4,
      color: C_MID,
    });
    p.drawText('Reefer Stowage Planner - Confidential', {
      x: MARGIN, y: 20, size: 7, font: regular, color: C_MUTED,
    });
    p.drawText(`${data.planNumber}  -  Page ${i + 1} of ${pageCount}`, {
      x: A4_W - MARGIN - 130, y: 20, size: 7, font: regular, color: C_MUTED,
    });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
