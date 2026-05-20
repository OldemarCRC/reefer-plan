'use client';

import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function AutoGenerateButton({ isDemo = false }: { isDemo?: boolean }) {
  const router = useRouter();
  return (
    <button
      className={styles.btnAutoGen}
      onClick={() => router.push('/stowage-plans/new?mode=auto')}
      disabled={isDemo}
      title={isDemo ? 'Not available in demo mode' : 'Create a draft stowage plan — select voyage and configure zone temperatures'}
    >
      ⚡ Auto-Generate Plan
    </button>
  );
}
