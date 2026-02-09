'use client';

import { useRouter } from 'next/navigation';
import styles from '@/app/page.module.css';

interface ClickablePlanRowProps {
  planId: string;
  children: React.ReactNode;
}

export function ClickablePlanRow({ planId, children }: ClickablePlanRowProps) {
  const router = useRouter();

  return (
    <tr
      className={styles.clickableRow}
      onClick={() => router.push(`/stowage-plans/${planId}`)}
    >
      {children}
    </tr>
  );
}
