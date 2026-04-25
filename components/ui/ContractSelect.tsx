'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './ContractSelect.module.css';

export interface ContractSelectItem {
  id: string;
  contractNumber: string;
  serviceCode: string;
  clientName: string;
  clientType?: string;
  cargoType?: string;
  polCode: string;
  podCode: string;
  polName?: string;
  podName?: string;
  weeklyPallets?: number;
  shipperNames?: string[];
}

interface ContractSelectProps {
  contracts: ContractSelectItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export default function ContractSelect({
  contracts,
  value,
  onChange,
  placeholder = 'Select a contract…',
}: ContractSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = contracts.find((c) => c.id === value) ?? null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
  }

  function buildLine1(c: ContractSelectItem): string {
    if (c.clientType === 'CONSIGNEE') {
      const shippers = c.shipperNames?.length ? c.shipperNames.join(', ') : '—';
      return `${shippers} → ${c.clientName}`;
    }
    return c.shipperNames?.join(', ') ?? c.clientName ?? '—';
  }

  function buildLine2(c: ContractSelectItem): string {
    const route = c.polName && c.podName
      ? `${c.polName} → ${c.podName}`
      : `${c.polCode} → ${c.podCode}`;
    const parts = [route];
    if (c.cargoType) parts.push(c.cargoType.replace(/_/g, ' '));
    if (c.weeklyPallets) parts.push(`${c.weeklyPallets} pal/wk`);
    return parts.join(' · ');
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles['trigger--open'] : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className={styles.triggerContent}>
            <span className={styles.triggerMain}>
              <span className={styles.triggerLine1}>{buildLine1(selected)}</span>
              <span className={styles.triggerTag}>{selected.contractNumber}</span>
            </span>
            <span className={styles.triggerSub}>{buildLine2(selected)}</span>
          </span>
        ) : (
          <span className={styles.triggerPlaceholder}>{placeholder}</span>
        )}
        <span className={styles.triggerChevron} aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className={styles.panel} role="listbox">
          {contracts.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === value}
              className={`${styles.option} ${c.id === value ? styles['option--selected'] : ''}`}
              onMouseDown={() => handleSelect(c.id)}
            >
              <div className={styles.optionHeader}>
                <div className={styles.optionLine1}>{buildLine1(c)}</div>
                <span className={styles.optionTag}>{c.contractNumber}</span>
              </div>
              <div className={styles.optionLine2}>{buildLine2(c)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
