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
}

export function buildEmailHtml(options: BuildEmailHtmlOptions): string {
  const { title, heading, body, ctaText, ctaUrl, footerNote } = options;

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
                ⚓ Reefer Stowage Planner
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
  const from = `"Reefer Stowage Planner" <${process.env.EMAIL_USER?.replace(/'/g, '')}>`;
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3001';
  const confirmUrl = `${baseUrl}/confirm/${opts.confirmToken}`;

  const toAddress = opts.to.name
    ? `"${opts.to.name}" <${opts.to.email}>`
    : opts.to.email;

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
