'use client';

import { useState, useTransition } from 'react';
import { markPlanSent } from '@/app/actions/stowage-plan';
import styles from './MarkSentModal.module.css';

interface MarkSentModalProps {
  planId: string;
  planNumber: string;
  onSuccess: () => void;
  onClose: () => void;
}

export default function MarkSentModal({ planId, planNumber, onSuccess, onClose }: MarkSentModalProps) {
  const [captainName, setCaptainName] = useState('');
  const [captainEmail, setCaptainEmail] = useState('');
  const [ccText, setCcText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    setError(null);
    const ccEmails = ccText
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      const result = await markPlanSent({
        planId,
        captainName: captainName.trim(),
        captainEmail: captainEmail.trim(),
        ccEmails: ccEmails.length > 0 ? ccEmails : undefined,
        note: note.trim() || undefined,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error ?? 'Failed to mark plan as sent');
      }
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Mark Plan as Sent</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.subtitle}>
          Plan <strong>{planNumber}</strong> will be locked once marked as sent.
          Record who received it to maintain the communication log.
        </p>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label}>Captain name <span className={styles.required}>*</span></label>
            <input
              className={styles.input}
              type="text"
              value={captainName}
              onChange={e => setCaptainName(e.target.value)}
              placeholder="e.g. Capt. Ramón García"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Captain email <span className={styles.required}>*</span></label>
            <input
              className={styles.input}
              type="email"
              value={captainEmail}
              onChange={e => setCaptainEmail(e.target.value)}
              placeholder="captain@shipowner.com"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>CC recipients <span className={styles.optional}>(optional)</span></label>
            <textarea
              className={styles.textarea}
              value={ccText}
              onChange={e => setCcText(e.target.value)}
              placeholder="One email per line, or comma-separated&#10;agent@port.com&#10;planner@agency.com"
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Note <span className={styles.optional}>(optional)</span></label>
            <input
              className={styles.input}
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Sent via WhatsApp + email"
            />
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className={styles.btnConfirm}
            onClick={handleSubmit}
            disabled={isPending || !captainName.trim() || !captainEmail.trim()}
          >
            {isPending ? 'Saving…' : '✉ Mark as Sent & Lock'}
          </button>
        </div>
      </div>
    </div>
  );
}
