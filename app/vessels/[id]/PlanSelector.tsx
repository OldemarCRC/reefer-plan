'use client';

import { useRouter } from 'next/navigation';
import styles from './VoyageSelector.module.css';

interface Plan {
  _id: string;
  planNumber: string;
  status: string;
}

interface PlanSelectorProps {
  vesselId: string;
  voyageId: string;
  plans: Plan[];
  currentPlanId?: string;
}

export default function PlanSelector({ vesselId, voyageId, plans, currentPlanId }: PlanSelectorProps) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const planId = e.target.value;
    router.push(`/vessels/${vesselId}?voyageId=${voyageId}&planId=${planId}`);
  }

  return (
    <div className={styles.wrapper}>
      <label className={styles.label}>Draft</label>
      <select
        className={styles.select}
        value={currentPlanId || plans[0]?._id || ''}
        onChange={handleChange}
      >
        {plans.map((p) => (
          <option key={p._id} value={p._id}>
            {p.planNumber} · {p.status}
          </option>
        ))}
      </select>
    </div>
  );
}
