'use client';

import { useRef, useEffect } from 'react';
import styles from './CompartmentContextMenu.module.css';

export interface ContextMenuCompartment {
  sectionId: string;
  holdNumber: number;
  level: string;
  cargoType?: string;
  cargoShortLabel?: string;
  palletsLoaded: number;
  palletsCapacity: number;
  setTemperature?: number;
  zoneId?: string;
  isFull?: boolean;
}

interface Props {
  compartment: ContextMenuCompartment;
  position: { x: number; y: number };
  onClose: () => void;
  onTransfer: (compartment: ContextMenuCompartment) => void;
  onAddCargo: (compartment: ContextMenuCompartment) => void;
  onReduceCargo: (compartment: ContextMenuCompartment) => void;
  onDetails: (compartment: ContextMenuCompartment) => void;
  isLocked?: boolean;
}

export default function CompartmentContextMenu({
  compartment, position, onClose,
  onTransfer, onAddCargo, onReduceCargo, onDetails,
  isLocked = false,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isEmpty = compartment.palletsLoaded === 0;
  const isFull  = compartment.palletsLoaded >= compartment.palletsCapacity;

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${position.x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${position.y - rect.height}px`;
    }
  }, [position]);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ top: position.y, left: position.x }}
      >
        <div className={styles.menuHeader}>
          <span className={styles.menuSectionId}>
            {compartment.cargoShortLabel ?? compartment.cargoType ?? '—'}
          </span>
          <span className={styles.menuLocation}>
            Hold {compartment.holdNumber}-{compartment.level}
          </span>
          {compartment.setTemperature !== undefined && (
            <span className={styles.menuTemp}>
              ♨ {compartment.setTemperature > 0 ? '+' : ''}{compartment.setTemperature}°
            </span>
          )}
        </div>

        <div className={styles.menuDivider} />

        <button
          className={styles.menuItem}
          onClick={() => { onTransfer(compartment); onClose(); }}
          disabled={isLocked || isEmpty}
          title={isEmpty ? 'No cargo to transfer' : undefined}
        >
          <span className={styles.menuIcon}>⇄</span>
          Transfer Cargo
        </button>

        <button
          className={styles.menuItem}
          onClick={() => { onAddCargo(compartment); onClose(); }}
          disabled={isLocked || isFull}
          title={isFull ? 'Compartment is full' : undefined}
        >
          <span className={styles.menuIcon}>+</span>
          Add Cargo
        </button>

        <button
          className={`${styles.menuItem} ${styles.menuItemDanger}`}
          onClick={() => { onReduceCargo(compartment); onClose(); }}
          disabled={isLocked || isEmpty}
          title={isEmpty ? 'No cargo to reduce' : undefined}
        >
          <span className={styles.menuIcon}>−</span>
          Reduce / Cancel Cargo
        </button>

        <div className={styles.menuDivider} />

        <button
          className={styles.menuItem}
          onClick={() => { onDetails(compartment); onClose(); }}
        >
          <span className={styles.menuIcon}>···</span>
          Details
          <span className={styles.menuChevron}>›</span>
        </button>
      </div>
    </>
  );
}
