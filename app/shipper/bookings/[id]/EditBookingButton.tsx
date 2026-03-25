'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingQuantity } from '@/app/actions/booking';
import styles from '../../shipper.module.css';

export default function EditBookingButton({
  bookingId,
  bookingNumber,
  requestedQuantity,
}: {
  bookingId: string;
  bookingNumber: string;
  requestedQuantity: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [qty, setQty] = useState(requestedQuantity);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function handleSave() {
    if (qty < 1) { setError('Quantity must be at least 1'); return; }
    setError('');
    startTransition(async () => {
      const result = await updateBookingQuantity({
        bookingId,
        requestedQuantity: qty,
        notes: notes.trim() || undefined,
      });
      if (!result.success) { setError(result.error ?? 'Failed to update'); return; }
      router.refresh();
      setOpen(false);
    });
  }

  function handleCancel() {
    if (!confirm(`Cancel booking ${bookingNumber}? This cannot be undone.`)) return;
    setError('');
    startTransition(async () => {
      const result = await updateBookingQuantity({
        bookingId,
        requestedQuantity,
        status: 'CANCELLED',
      });
      if (!result.success) { setError(result.error ?? 'Failed to cancel'); return; }
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <>
      <button
        className={styles.btnSecondary}
        onClick={() => setOpen(true)}
        style={{ fontSize: 'var(--text-sm)', padding: '6px 14px' }}
      >
        Edit
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', width: '100%', maxWidth: '480px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 var(--space-1) 0', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)' }}>Edit Booking</h3>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              {bookingNumber}
            </p>

            {error && (
              <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Requested Pallets</label>
              <input
                type="number"
                className={styles.formInput}
                min={1}
                max={10000}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Notes (optional)</label>
              <textarea
                className={styles.formInput}
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                maxLength={1000}
                placeholder="Add a note to this booking..."
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
              <button
                style={{ padding: '6px 12px', fontSize: 'var(--text-sm)', background: 'var(--color-danger-muted)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginRight: 'auto' }}
                disabled={isPending}
                onClick={handleCancel}
              >
                Cancel Booking
              </button>
              <button
                style={{ padding: '6px 14px', fontSize: 'var(--text-sm)', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Dismiss
              </button>
              <button
                className={styles.btnPrimary}
                disabled={isPending}
                onClick={handleSave}
              >
                {isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
