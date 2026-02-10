'use client';

import { useRouter } from 'next/navigation';
import styles from './VoyageSelector.module.css';

interface Voyage {
  _id: string;
  voyageNumber: string;
  status: string;
}

interface VoyageSelectorProps {
  vesselId: string;
  voyages: Voyage[];
  currentVoyageId?: string;
}

export default function VoyageSelector({ vesselId, voyages, currentVoyageId }: VoyageSelectorProps) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const voyageId = e.target.value;
    if (voyageId) {
      router.push(`/vessels/${vesselId}?voyageId=${voyageId}`);
    } else {
      router.push(`/vessels/${vesselId}`);
    }
  }

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>Voyage</label>
      <select
        className={styles.select}
        value={currentVoyageId || ''}
        onChange={handleChange}
      >
        <option value="">— No voyage selected —</option>
        {voyages.map((v) => (
          <option key={v._id} value={v._id}>
            {v.voyageNumber} · {v.status}
          </option>
        ))}
      </select>
    </div>
  );
}
