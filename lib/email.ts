// ============================================================================
// EMAIL UTILITY — Gmail SMTP via nodemailer
// Credentials come from .env.local: EMAIL_USER / EMAIL_PASSWORD
// ============================================================================

import nodemailer from 'nodemailer';

// ============================================================================
// HTML EMAIL TEMPLATE
// Dark maritime theme. Inline CSS only (Gmail/Outlook compatible).
// ============================================================================

export interface BuildEmailHtmlOptions {
  title: string;
  heading: string;
  body: string;        // HTML string for the main content area
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  logoText?: string;   // override default "⚓ Reefer Stowage Planner"
}

export function buildEmailHtml(options: BuildEmailHtmlOptions): string {
  const { title, heading, body, ctaText, ctaUrl, footerNote, logoText } = options;
  const logo = logoText ?? '⚓ Reefer Stowage Planner';

  const ctaBlock = ctaText && ctaUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0 8px;">
      <tr>
        <td align="center">
          <a href="${ctaUrl}"
             style="display: inline-block; padding: 14px 32px; background: #3b82f6; color: #ffffff;
                    text-decoration: none; border-radius: 6px; font-family: Inter, sans-serif;
                    font-size: 15px; font-weight: 600; letter-spacing: 0.02em;">
            ${ctaText}
          </a>
        </td>
      </tr>
    </table>` : '';

  const footerNoteBlock = footerNote ? `
    <p style="margin: 8px 0 0; color: #64748b; font-size: 12px;">${footerNote}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0A1628; font-family: Inter, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A1628; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding: 0 0 24px;">
              <span style="font-family: 'Space Grotesk', Arial, sans-serif; font-size: 20px;
                           font-weight: 700; color: #ffffff; letter-spacing: 0.04em;">
                ${logo}
              </span>
            </td>
          </tr>

          <!-- Content card -->
          <tr>
            <td style="background-color: #0F1F3D; border-radius: 12px; padding: 40px 40px 32px;">

              <!-- Heading -->
              <h1 style="margin: 0 0 20px; font-family: 'Space Grotesk', Arial, sans-serif;
                          font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                ${heading}
              </h1>

              <!-- Body -->
              <div style="font-family: Inter, Arial, sans-serif; font-size: 15px;
                          line-height: 1.7; color: #cbd5e1;">
                ${body}
              </div>

              ${ctaBlock}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 8px 0;" align="center">
              <p style="margin: 0; color: #64748b; font-family: Inter, Arial, sans-serif;
                         font-size: 12px; line-height: 1.6; text-align: center;">
                This is an automated message from Reefer Stowage Planner. Do not reply to this email.
              </p>
              ${footerNoteBlock}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER?.replace(/'/g, ''),
    pass: process.env.EMAIL_PASSWORD?.replace(/'/g, ''),
  },
});

export interface EmailRecipient {
  name?: string;
  email: string;
}

export interface SendPlanNotificationOptions {
  to: EmailRecipient;        // captain — main To: address
  cc?: EmailRecipient[];     // planners, stevedores, etc.
  planNumber: string;
  vesselName: string;
  voyageNumber: string;
  note?: string;
  pdfBuffer?: Buffer;        // stowage plan PDF attachment (optional)
}

export async function sendPlanNotification(opts: SendPlanNotificationOptions): Promise<void> {
  const from = `"Reefer Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;

  const toAddress = opts.to.name
    ? `"${opts.to.name}" <${opts.to.email}>`
    : opts.to.email;

  const ccAddresses = (opts.cc ?? []).map(r =>
    r.name ? `"${r.name}" <${r.email}>` : r.email
  );

  const subject = `Stowage Plan ${opts.planNumber} — ${opts.vesselName} / ${opts.voyageNumber}`;

  const noteBlock = opts.note ? `\nNote from planner: ${opts.note}\n` : '';

  const pdfNote = opts.pdfBuffer
    ? 'The stowage plan PDF is attached to this email.'
    : 'A PDF attachment will be available in a future release.';

  const text = `
Stowage Plan Notification
-------------------------
Plan:    ${opts.planNumber}
Vessel:  ${opts.vesselName}
Voyage:  ${opts.voyageNumber}
${noteBlock}
This stowage plan has been marked as sent and is now locked for review.

${pdfNote}

-------------------------
Reefer Stowage Planner System
  `.trim();

  await transporter.sendMail({
    from,
    to: toAddress,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
    subject,
    text,
    attachments: opts.pdfBuffer ? [{
      filename: `${opts.planNumber}.pdf`,
      content: opts.pdfBuffer,
      contentType: 'application/pdf',
    }] : undefined,
  });
}

// ============================================================================
// USER ACCOUNT CONFIRMATION EMAIL
// Sent when an admin creates a new user account
// ============================================================================

export interface SendUserConfirmationOptions {
  to: EmailRecipient;
  confirmToken: string;
  role?: string;
}

function formatRoleLabel(role?: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrator',
    SHIPPING_PLANNER: 'Shipping Planner',
    STEVEDORE: 'Stevedore',
    CHECKER: 'Checker',
    EXPORTER: 'Exporter',
    VIEWER: 'Viewer',
  };
  return role ? (labels[role] ?? role) : 'User';
}

export async function sendUserConfirmationEmail(opts: SendUserConfirmationOptions): Promise<void> {
  const emailUser = process.env.EMAIL_USER?.replace(/'/g, '');
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';
  const confirmUrl = `${baseUrl}/confirm/${opts.confirmToken}`;

  const toAddress = opts.to.name
    ? `"${opts.to.name}" <${opts.to.email}>`
    : opts.to.email;

  if (opts.role === 'EXPORTER') {
    const agencyName = process.env.AGENCY_NAME ?? 'Reefer Lines';
    const displayName = opts.to.name ?? opts.to.email;
    const subject = `Your ${agencyName} Shipper Portal access is ready — set your password`;

    const html = buildEmailHtml({
      title: subject,
      logoText: `⚓ ${agencyName} Shipper Portal`,
      heading: `Welcome to the ${agencyName} Shipper Portal`,
      body: `
        <p style="margin: 0 0 14px;">Hi ${displayName},</p>
        <p style="margin: 0 0 14px;">Welcome to the <strong>${agencyName} Shipper Portal</strong> — your portal for:</p>
        <ul style="margin: 0 0 14px; padding-left: 22px;">
          <li style="margin-bottom: 8px;">View upcoming sailing schedules</li>
          <li style="margin-bottom: 8px;">Submit space estimates for future voyages</li>
        </ul>
        <p style="margin: 0 0 14px;">Click the button below to set your password and access your account.</p>
        <p style="margin: 0 0 14px;">Your invitation link expires in 48 hours.</p>
        <p style="margin: 16px 0 0; color: #94a3b8; font-size: 13px;">If you weren't expecting this email, you can safely ignore it.</p>
      `,
      ctaText: 'Set My Password',
      ctaUrl: confirmUrl,
    });

    const text = `
Hi ${displayName},

Welcome to the ${agencyName} Shipper Portal — your portal for:
  - View upcoming sailing schedules
  - Submit space estimates for future voyages

Click the link below to set your password and access your account:

  ${confirmUrl}

Your invitation link expires in 48 hours.

If you weren't expecting this email, you can safely ignore it.

-------------------------
${agencyName} Shipper Portal
    `.trim();

    await transporter.sendMail({
      from: `"${agencyName} Shipper Portal" <${emailUser}>`,
      to: toAddress,
      subject,
      text,
      html,
    });
    return;
  }

  // Non-EXPORTER roles — existing plain-text template
  const from = `"Reefer Stowage Planner" <${emailUser}>`;
  const roleLabel = formatRoleLabel(opts.role);
  const subject = `Your Reefer Stowage Planner account is ready — set your password`;

  const text = `
Welcome to Reefer Stowage Planner, ${opts.to.name ?? opts.to.email}!

An administrator has created a ${roleLabel} account for you. To activate it and set your password, please visit the link below:

  ${confirmUrl}

This link is valid for 7 days. If you did not request an account, please contact your system administrator.

-------------------------
Reefer Stowage Planner System
  `.trim();

  await transporter.sendMail({
    from,
    to: toAddress,
    subject,
    text,
  });
}

// Build the vessel-specific captain email address from the vessel name.
// "ACONCAGUA BAY" → "oldemar.chaves+aconcagua_bay@gmail.com"
export function vesselCaptainEmail(vesselName: string): string {
  const base = process.env.EMAIL_USER?.replace(/'/g, '') ?? 'oldemar.chaves@gmail.com';
  const [localPart, domain] = base.split('@');
  const slug = vesselName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${localPart}+${slug}@${domain}`;
}

// ============================================================================
// BOOKING LIFECYCLE EMAILS
// ============================================================================

export interface BookingEmailData {
  bookingId: string;
  bookingNumber: string;
  voyageNumber: string;
  vesselName?: string;
  serviceCode: string;
  polPortName: string;
  podPortName: string;
  cargoType: string;
  requestedQuantity: number;
  shipperName: string;
}

export interface BookingStatusEmailData {
  bookingId: string;
  bookingNumber: string;
  voyageNumber: string;
  vesselName?: string;
  serviceCode: string;
  polPortName: string;
  podPortName: string;
  cargoType: string;
  requestedQuantity: number;
  confirmedQuantity?: number;
  standbyQuantity?: number;
  rejectedQuantity?: number;
  newStatus: 'CONFIRMED' | 'PARTIAL' | 'REJECTED' | 'STANDBY';
  rejectionReason?: string;
}

function formatCargoType(raw: string): string {
  return raw.split('_').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

function bookingDetailTable(rows: [string, string][]): string {
  const rowHtml = rows.map(([label, value]) => `
      <tr>
        <td style="padding: 7px 0; color: #94a3b8; font-size: 13px; width: 160px; vertical-align: top;">${label}</td>
        <td style="padding: 7px 0; color: #f1f5f9; font-size: 13px; font-weight: 500;">${value}</td>
      </tr>`).join('');
  return `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;
    border-top: 1px solid #1e3a5f; border-bottom: 1px solid #1e3a5f;">
    <tbody>${rowHtml}
    </tbody>
  </table>`;
}

// 2A — New booking request — to shipper/client
export async function sendBookingReceivedToShipper(
  to: EmailRecipient,
  data: BookingEmailData
): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

  const html = buildEmailHtml({
    title: `Booking Request Received — ${data.bookingNumber}`,
    heading: 'Your booking request has been received',
    body: `
      <p>Thank you${to.name ? `, ${to.name}` : ''}. We have received your booking request and it is currently under review.</p>
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['Service', data.serviceCode],
        ['Route', `${data.polPortName} → ${data.podPortName}`],
        ['Cargo Type', formatCargoType(data.cargoType)],
        ['Quantity Requested', `${data.requestedQuantity} pallets`],
      ])}
      <p style="margin: 4px 0 0;">
        <span style="display: inline-block; background: #1e3a5f; color: #93c5fd; font-size: 12px;
                     font-weight: 600; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.05em;">
          STATUS: PENDING
        </span>
      </p>
    `,
    ctaText: 'View Your Booking',
    ctaUrl: `${baseUrl}/shipper/bookings/${data.bookingId}`,
    footerNote: 'You will receive another email when your request is reviewed.',
  });

  const toAddress = to.name ? `"${to.name}" <${to.email}>` : to.email;
  await transporter.sendMail({
    from,
    to: toAddress,
    subject: `Booking Request Received — ${data.bookingNumber}`,
    html,
    text: `Your booking request ${data.bookingNumber} has been received and is pending review.\nVessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} | Route: ${data.polPortName} → ${data.podPortName}`,
  });
}

// 2A (planner path) — Booking created on behalf of shipper by a planner/admin
export async function sendBookingCreatedOnBehalf(
  to: EmailRecipient,
  data: BookingEmailData,
  plannerName: string
): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

  const html = buildEmailHtml({
    title: `A booking has been created on your behalf — ${data.bookingNumber}`,
    heading: 'A booking was created for your company',
    body: `
      <p>A booking has been submitted by <strong style="color: #f1f5f9;">${plannerName}</strong> on behalf of your company.</p>
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['Service', data.serviceCode],
        ['Route', `${data.polPortName} → ${data.podPortName}`],
        ['Cargo Type', formatCargoType(data.cargoType)],
        ['Quantity Requested', `${data.requestedQuantity} pallets`],
      ])}
      <p style="margin: 4px 0 0;">
        <span style="display: inline-block; background: #1e3a5f; color: #93c5fd; font-size: 12px;
                     font-weight: 600; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.05em;">
          STATUS: PENDING
        </span>
      </p>
    `,
    ctaText: 'View Booking',
    ctaUrl: `${baseUrl}/shipper/bookings/${data.bookingId}`,
    footerNote: 'You will receive another email when your booking is reviewed.',
  });

  const toAddress = to.name ? `"${to.name}" <${to.email}>` : to.email;
  await transporter.sendMail({
    from,
    to: toAddress,
    subject: `A booking has been created on your behalf — ${data.bookingNumber}`,
    html,
    text: `A booking (${data.bookingNumber}) has been submitted by ${plannerName} on behalf of your company.\nVessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} | Route: ${data.polPortName} → ${data.podPortName}`,
  });
}

// 2A — New booking request — to planners
export async function sendBookingReceivedToPlanners(
  planners: EmailRecipient[],
  data: BookingEmailData
): Promise<void> {
  if (planners.length === 0) return;
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

  const html = buildEmailHtml({
    title: `New Booking Request — ${data.bookingNumber} — Action Required`,
    heading: 'A new booking request requires your review',
    body: `
      <p>A new booking request has been submitted and is awaiting your confirmation.</p>
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['Service', data.serviceCode],
        ['Route', `${data.polPortName} → ${data.podPortName}`],
        ['Cargo Type', formatCargoType(data.cargoType)],
        ['Quantity Requested', `${data.requestedQuantity} pallets`],
        ['Submitted By', data.shipperName],
      ])}
    `,
    ctaText: 'Review Booking',
    ctaUrl: `${baseUrl}/bookings`,
  });

  await Promise.all(planners.map(planner => {
    const toAddress = planner.name ? `"${planner.name}" <${planner.email}>` : planner.email;
    return transporter.sendMail({
      from,
      to: toAddress,
      subject: `New Booking Request — ${data.bookingNumber} — Action Required`,
      html,
      text: `New booking ${data.bookingNumber} requires review.\nShipper: ${data.shipperName} | Vessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} | Route: ${data.polPortName} → ${data.podPortName}`,
    });
  }));
}

// 2B — Booking status changed — to shipper/client
export async function sendBookingStatusChanged(
  to: EmailRecipient,
  data: BookingStatusEmailData
): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

  const subjectMap: Record<string, string> = {
    CONFIRMED: `Booking Confirmed — ${data.bookingNumber}`,
    PARTIAL:   `Booking Partially Confirmed — ${data.bookingNumber}`,
    REJECTED:  `Booking Not Accepted — ${data.bookingNumber}`,
    STANDBY:   `Booking on Standby — ${data.bookingNumber}`,
  };
  const headingMap: Record<string, string> = {
    CONFIRMED: 'Your booking has been confirmed',
    PARTIAL:   'Your booking has been partially confirmed',
    REJECTED:  'Your booking could not be accepted',
    STANDBY:   'Your booking is on standby',
  };
  const badgeStyle: Record<string, { bg: string; fg: string }> = {
    CONFIRMED: { bg: '#14532d', fg: '#86efac' },
    PARTIAL:   { bg: '#78350f', fg: '#fde68a' },
    REJECTED:  { bg: '#7f1d1d', fg: '#fca5a5' },
    STANDBY:   { bg: '#1e3a5f', fg: '#93c5fd' },
  };

  const badge = badgeStyle[data.newStatus] ?? { bg: '#1e3a5f', fg: '#93c5fd' };

  let statusMessage = '';
  if (data.newStatus === 'CONFIRMED') {
    statusMessage = `<p>Your full quantity of <strong style="color: #f1f5f9;">${data.requestedQuantity} pallets</strong> has been confirmed.</p>`;
  } else if (data.newStatus === 'PARTIAL') {
    const conf = data.confirmedQuantity ?? 0;
    const stby = data.standbyQuantity ?? (data.requestedQuantity - conf);
    statusMessage = `<p><strong style="color: #f1f5f9;">${conf}</strong> of your requested <strong style="color: #f1f5f9;">${data.requestedQuantity} pallets</strong> have been confirmed. <strong style="color: #f1f5f9;">${stby} pallets</strong> remain on standby.</p>`;
  } else if (data.newStatus === 'REJECTED') {
    statusMessage = `<p>Unfortunately your booking could not be accepted.</p>`;
    if (data.rejectionReason) {
      statusMessage += `<p style="background: #1a0f0f; border-left: 3px solid #ef4444; padding: 10px 14px;
        border-radius: 4px; color: #fca5a5; font-size: 13px; margin: 12px 0 0;">${data.rejectionReason}</p>`;
    }
  } else {
    statusMessage = `<p>Your booking is on standby. You will be notified if space becomes available.</p>`;
  }

  const html = buildEmailHtml({
    title: subjectMap[data.newStatus] ?? data.bookingNumber,
    heading: headingMap[data.newStatus] ?? 'Booking status updated',
    body: `
      ${statusMessage}
      <p style="margin: 16px 0 8px;">
        <span style="display: inline-block; background: ${badge.bg}; color: ${badge.fg}; font-size: 12px;
                     font-weight: 600; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.05em;">
          STATUS: ${data.newStatus}
        </span>
      </p>
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['Route', `${data.polPortName} → ${data.podPortName}`],
        ['Cargo Type', formatCargoType(data.cargoType)],
      ])}
    `,
    ctaText: 'View Booking Details',
    ctaUrl: `${baseUrl}/shipper/bookings/${data.bookingId}`,
  });

  const toAddress = to.name ? `"${to.name}" <${to.email}>` : to.email;
  await transporter.sendMail({
    from,
    to: toAddress,
    subject: subjectMap[data.newStatus] ?? `Booking ${data.bookingNumber} — status update`,
    html,
    text: `Your booking ${data.bookingNumber} status: ${data.newStatus}.\nVessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`,
  });
}

// ============================================================================
// SECURITY NOTIFICATION EMAILS
// ============================================================================

function formatUtcDateTime(d: Date): { date: string; time: string } {
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });
  return { date, time };
}

// 3A — Password change notification
export async function sendPasswordChangedNotification(to: EmailRecipient): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const { date, time } = formatUtcDateTime(new Date());

  const html = buildEmailHtml({
    title: 'Your password has been changed — Reefer Stowage Planner',
    heading: 'Password changed successfully',
    body: `
      <p>Your password was changed on <strong style="color: #f1f5f9;">${date}</strong> at <strong style="color: #f1f5f9;">${time} UTC</strong>.</p>
      <p style="background: #0c2340; border-left: 3px solid #f59e0b; padding: 10px 14px;
                border-radius: 4px; color: #fde68a; font-size: 13px; margin: 16px 0 0;">
        If you did not make this change, contact your administrator immediately.
      </p>
    `,
    footerNote: 'If this was you, no action is needed.',
  });

  const toAddress = to.name ? `"${to.name}" <${to.email}>` : to.email;
  await transporter.sendMail({
    from,
    to: toAddress,
    subject: 'Your password has been changed — Reefer Stowage Planner',
    html,
    text: `Your password was changed on ${date} at ${time} UTC. If you did not make this change, contact your administrator immediately.`,
  });
}

// 3B — Failed login warning (5th attempt)
export async function sendFailedLoginWarning(to: EmailRecipient): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const { date, time } = formatUtcDateTime(new Date());

  const html = buildEmailHtml({
    title: 'Multiple failed login attempts — Reefer Stowage Planner',
    heading: 'Unusual login activity detected',
    body: `
      <p>We detected <strong style="color: #f1f5f9;">5 failed login attempts</strong> on your account on <strong style="color: #f1f5f9;">${date}</strong> at <strong style="color: #f1f5f9;">${time} UTC</strong>.</p>
      <p style="background: #0c2340; border-left: 3px solid #ef4444; padding: 10px 14px;
                border-radius: 4px; color: #fca5a5; font-size: 13px; margin: 16px 0 0;">
        Your account has been temporarily rate-limited. If this was not you, consider contacting your administrator to review access.
      </p>
    `,
  });

  const toAddress = to.name ? `"${to.name}" <${to.email}>` : to.email;
  await transporter.sendMail({
    from,
    to: toAddress,
    subject: 'Multiple failed login attempts — Reefer Stowage Planner',
    html,
    text: `We detected 5 failed login attempts on your account on ${date} at ${time} UTC. Your account has been temporarily rate-limited.`,
  });
}

// ============================================================================
// BOOKING CANCELLATION EMAILS
// ============================================================================

export interface BookingCancelledShipperData {
  bookingNumber: string;
  voyageNumber: string;
  vesselName?: string;
  cancelledBy: string;
}

export interface BookingCancelledPlannerData {
  bookingNumber: string;
  voyageNumber: string;
  vesselName?: string;
  shipperName: string;
  cancelledBy: string;
}

export async function sendBookingCancelledToShipper(
  toEmail: string,
  data: BookingCancelledShipperData
): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const { date, time } = formatUtcDateTime(new Date());

  const html = buildEmailHtml({
    title: `Booking Cancelled — ${data.bookingNumber}`,
    heading: 'Your booking has been cancelled',
    body: `
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
      ])}
      <p>This booking was cancelled by <strong style="color: #f1f5f9;">${data.cancelledBy}</strong> on ${date} at ${time} UTC.</p>
    `,
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Booking Cancelled — ${data.bookingNumber}`,
    html,
    text: `Booking ${data.bookingNumber} — Vessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} — was cancelled by ${data.cancelledBy} on ${date} at ${time} UTC.`,
  });
}

export async function sendBookingCancelledToPlanners(
  planners: EmailRecipient[],
  data: BookingCancelledPlannerData
): Promise<void> {
  if (planners.length === 0) return;
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';
  const { date, time } = formatUtcDateTime(new Date());

  const html = buildEmailHtml({
    title: `Booking Cancelled by Shipper — ${data.bookingNumber}`,
    heading: 'A booking has been cancelled',
    body: `
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['Shipper', data.shipperName],
      ])}
      <p>Cancelled by <strong style="color: #f1f5f9;">${data.cancelledBy}</strong> on ${date} at ${time} UTC.</p>
    `,
    ctaText: 'View Bookings',
    ctaUrl: `${baseUrl}/bookings`,
  });

  await Promise.all(planners.map(planner => {
    const toAddress = planner.name ? `"${planner.name}" <${planner.email}>` : planner.email;
    return transporter.sendMail({
      from,
      to: toAddress,
      subject: `Booking Cancelled by Shipper — ${data.bookingNumber}`,
      html,
      text: `Booking ${data.bookingNumber} — Vessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} — was cancelled by ${data.cancelledBy}.`,
    });
  }));
}

// ============================================================================
// BOOKING MODIFICATION EMAILS
// ============================================================================

export interface BookingModifiedShipperData {
  bookingId: string;
  bookingNumber: string;
  voyageNumber: string;
  vesselName?: string;
  newQuantity: number;
  modifiedBy: string;
}

export interface BookingModifiedPlannerData {
  bookingNumber: string;
  voyageNumber: string;
  vesselName?: string;
  shipperName: string;
  newQuantity: number;
  modifiedBy: string;
}

export async function sendBookingModifiedToShipper(
  toEmail: string,
  data: BookingModifiedShipperData
): Promise<void> {
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

  const html = buildEmailHtml({
    title: `Booking Updated — ${data.bookingNumber}`,
    heading: 'Your booking has been updated',
    body: `
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['New Quantity', `${data.newQuantity} pallets`],
      ])}
      <p>The requested quantity has been updated to <strong style="color: #f1f5f9;">${data.newQuantity} pallets</strong> by <strong style="color: #f1f5f9;">${data.modifiedBy}</strong>.</p>
    `,
    ctaText: 'View Booking',
    ctaUrl: `${baseUrl}/shipper/bookings/${data.bookingId}`,
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `Booking Updated — ${data.bookingNumber}`,
    html,
    text: `Booking ${data.bookingNumber} — Vessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} — quantity updated to ${data.newQuantity} pallets by ${data.modifiedBy}.`,
  });
}

export async function sendBookingModifiedToPlanners(
  planners: EmailRecipient[],
  data: BookingModifiedPlannerData
): Promise<void> {
  if (planners.length === 0) return;
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';

  const html = buildEmailHtml({
    title: `Booking Modified by Shipper — ${data.bookingNumber}`,
    heading: 'A booking has been modified',
    body: `
      ${bookingDetailTable([
        ['Booking Number', data.bookingNumber],
        ['Vessel / Voyage', `${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber}`],
        ['Shipper', data.shipperName],
        ['New Quantity', `${data.newQuantity} pallets`],
      ])}
      <p>Modified by <strong style="color: #f1f5f9;">${data.modifiedBy}</strong>.</p>
    `,
    ctaText: 'View Bookings',
    ctaUrl: `${baseUrl}/bookings`,
  });

  await Promise.all(planners.map(planner => {
    const toAddress = planner.name ? `"${planner.name}" <${planner.email}>` : planner.email;
    return transporter.sendMail({
      from,
      to: toAddress,
      subject: `Booking Modified by Shipper — ${data.bookingNumber}`,
      html,
      text: `Booking ${data.bookingNumber} — Vessel / Voyage: ${data.vesselName ? `${data.vesselName} / ` : ''}${data.voyageNumber} — quantity updated to ${data.newQuantity} pallets by ${data.modifiedBy}.`,
    });
  }));
}
