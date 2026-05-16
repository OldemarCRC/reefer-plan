'use client';

import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function AdvancedOptimizeButton() {
  const router = useRouter();
  return (
    <button
      className={styles.btnOptimize}
      onClick={() => router.push('/stowage-plans/optimize')}
      title="Generate 5 alternative stowage plans using OR-Tools optimizer"
    >
      🔬 Advanced Optimize
    </button>
  );
}
