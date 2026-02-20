'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deactivateContract } from '@/app/actions/contract';
import styles from './page.module.css';

export default function DeactivateButton({
  contractId,
  contractNumber,
}: {
  contractId: string;
  contractNumber: string;
}) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDeactivate = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await deactivateContract(contractId);
      if (result.success) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setErrorMsg(result.error || 'Failed to deactivate contract');
      }
    });
  };

  return (
    <>
      <button className={styles.btnDanger} onClick={() => setShowConfirm(true)}>
        Deactivate
      </button>

      {showConfirm && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setShowConfirm(false)}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Deactivate Contract</h3>
            <p className={styles.modalBody}>
              Are you sure you want to deactivate contract <strong>{contractNumber}</strong>?
              The contract will be marked as inactive but preserved for audit purposes.
            </p>

            {errorMsg && <div className={styles.modalError}>{errorMsg}</div>}

            <div className={styles.modalActions}>
              <button className={styles.btnModalCancel} onClick={() => setShowConfirm(false)} disabled={isPending}>
                Cancel
              </button>
              <button className={styles.btnModalDanger} onClick={handleDeactivate} disabled={isPending}>
                {isPending ? 'Deactivating...' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
