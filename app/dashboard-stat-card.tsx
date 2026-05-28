'use client';

import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface StatCardProps {
  label: string;
  value: number;
  accent?: string;
  href?: string;
}

export default function StatCard({ label, value, accent, href }: StatCardProps) {
  const router = useRouter();

  return (
    <div
      className={`${styles.statCard} ${href ? styles.statCardClickable : ''}`}
      onClick={() => href && router.push(href)}
      style={{ cursor: href ? 'pointer' : 'default' }}
      title={href ? `View ${label}` : undefined}
    >
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${accent ? styles[`accent_${accent}`] : ''}`}>
        {value}
      </span>
    </div>
  );
}
