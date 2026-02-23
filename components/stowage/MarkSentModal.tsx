'use client';

import { useState, useTransition } from 'react';
import { markPlanSent } from '@/app/actions/stowage-plan';
import styles from './MarkSentModal.module.css';

interface Recipient {
  id: string;
  label: string;
  sublabel: string;
  email: string;
  role: 'CAPTAIN' | 'CC';
  checked: boolean;
}

interface MarkSentModalProps {
  planId: string;
  planNumber: string;
  vesselName: string;
  onSuccess: () => void;
  onClose: () => void;
}

function vesselSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function buildRecipients(vesselName: string): Recipient[] {
  const base = 'oldemar.chaves';
  const domain = 'gmail.com';
  const slug = vesselSlug(vesselName);

  return [
    {
      id: 'captain',
      label: 'Captain',
      sublabel: vesselName,
      email: `${base}+${slug}@${domain}`,
      role: 'CAPTAIN',
      checked: true,
    },
    {
      id: 'planner',
      label: 'Planner',
      sublabel: 'Shipping planner office',
      email: `${base}+planner@${domain}`,
      role: 'CC',
      checked: true,
    },
    {
      id: 'stevedore',
      label: 'Stevedore',
      sublabel: 'Port stevedore team',
      email: `${base}+stevedore@${domain}`,
      role: 'CC',
      checked: false,
    },
  ];
}

export default function MarkSentModal({
  planId,
  planNumber,
  vesselName,
  onSuccess,
  onClose,
}: MarkSentModalProps) {
  const [recipients, setRecipients] = useState<Recipient[]>(() => buildRecipients(vesselName));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = (id: string) => {
    setRecipients(prev =>
      prev.map(r => r.id === id ? { ...r, checked: !r.checked } : r)
    );
  };

  const captainChecked = recipients.find(r => r.id === 'captain')?.checked ?? false;
  const anyChecked = recipients.some(r => r.checked);
  const canSubmit = captainChecked && anyChecked && !isPending;

  const handleSubmit = () => {
    setError(null);
    const selected = recipients
      .filter(r => r.checked)
      .map(r => ({ name: r.label, email: r.email, role: r.role }));

    startTransition(async () => {
      const result = await markPlanSent({
        planId,
        recipients: selected,
        note: note.trim() || undefined,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error ?? 'Failed to send plan');
      }
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Send &amp; Lock Plan</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.subtitle}>
          Plan <strong>{planNumber}</strong> will be locked once sent.
          Select who should receive this notification.
        </p>

        <div className={styles.recipientList}>
          {recipients.map(r => (
            <label
              key={r.id}
              className={`${styles.recipientRow} ${r.checked ? styles.recipientChecked : ''} ${r.id === 'captain' ? styles.recipientCaptain : ''}`}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={r.checked}
                onChange={() => toggle(r.id)}
                disabled={isPending}
              />
              <div className={styles.recipientInfo}>
                <span className={styles.recipientLabel}>{r.label}</span>
                <span className={styles.recipientSub}>{r.sublabel}</span>
              </div>
              <span className={styles.recipientEmail}>{r.email}</span>
            </label>
          ))}
        </div>

        {!captainChecked && (
          <p className={styles.captainWarning}>Captain must be included as a recipient.</p>
        )}

        <div className={styles.field}>
          <label className={styles.label}>
            Note <span className={styles.optional}>(optional)</span>
          </label>
          <input
            className={styles.input}
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Sent after captain confirmation call"
            maxLength={300}
            disabled={isPending}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className={styles.btnConfirm}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isPending ? 'Sending…' : '✉ Send & Lock Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
