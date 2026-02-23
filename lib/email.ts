// ============================================================================
// EMAIL UTILITY — Gmail SMTP via nodemailer
// Credentials come from .env.local: EMAIL_USER / EMAIL_PASSWORD
// ============================================================================

import nodemailer from 'nodemailer';

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

  const text = `
Stowage Plan Notification
─────────────────────────
Plan:    ${opts.planNumber}
Vessel:  ${opts.vesselName}
Voyage:  ${opts.voyageNumber}
${noteBlock}
This stowage plan has been marked as sent and is now locked for review.

A PDF version of the plan will be attached in a future release.

─────────────────────────
Reefer Stowage Planner System
  `.trim();

  await transporter.sendMail({
    from,
    to: toAddress,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
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
