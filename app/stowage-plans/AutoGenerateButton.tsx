'use client';

import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function AutoGenerateButton() {
  const router = useRouter();
  return (
    <button
      className={styles.btnAutoGen}
      onClick={() => router.push('/stowage-plans/new?mode=auto')}
      title="Create a draft stowage plan — select voyage and configure zone temperatures"
    >
      ⚡ Auto-Generate Plan
    </button>
  );
}
