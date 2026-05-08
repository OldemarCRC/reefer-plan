import styles from './CapacityBar.module.css';

interface CapacityBarProps {
  bookedPallets: number;
  estimatedPallets: number;
  totalCapacity: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export default function CapacityBar({
  bookedPallets,
  estimatedPallets,
  totalCapacity,
  showLabel = true,
  size = 'md',
}: CapacityBarProps) {
  if (totalCapacity === 0) {
    return (
      <div className={styles.root}>
        <div className={`${styles.track} ${styles[size]}`} />
        {showLabel && <span className={styles.label}>—</span>}
      </div>
    );
  }

  const bookedPct   = Math.min(100, (bookedPallets / totalCapacity) * 100);
  const estimatePct = Math.min((estimatedPallets / totalCapacity) * 100, 100 - bookedPct);

  const fmt = (n: number) => n.toLocaleString();

  const label =
    size === 'md'
      ? `${fmt(bookedPallets)} booked · ${fmt(estimatedPallets)} est. / ${fmt(totalCapacity)} pallets`
      : `${fmt(bookedPallets)} + ${fmt(estimatedPallets)} est.`;

  return (
    <div className={styles.root}>
      <div className={`${styles.track} ${styles[size]}`}>
        {bookedPct > 0 && (
          <div className={styles.booked} style={{ width: `${bookedPct}%` }} />
        )}
        {estimatePct > 0 && (
          <div className={styles.estimate} style={{ width: `${estimatePct}%` }} />
        )}
      </div>
      {showLabel && <span className={styles.label}>{label}</span>}
    </div>
  );
}
