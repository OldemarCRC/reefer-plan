'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfigureZonesModal, { type ZoneConfig } from '@/components/vessel/ConfigureZonesModal';
import styles from './page.module.css';

interface ConfigureZonesButtonProps {
  planId: string | null;
  hasVoyage: boolean;
  zones: ZoneConfig[];
}

export default function ConfigureZonesButton({
  planId,
  hasVoyage,
  zones,
}: ConfigureZonesButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const disabled = !hasVoyage || !planId;

  const title = !hasVoyage
    ? 'Select a voyage to configure temperature zones'
    : !planId
    ? 'No stowage plan found — create one first'
    : undefined;

  function handleSuccess() {
    // Refresh the server component so SVG + zone table repaint with new temps
    router.refresh();
  }

  return (
    <>
      <button
        className={styles.btnSecondary}
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        title={title}
      >
        Configure Zones
      </button>

      {planId && (
        <ConfigureZonesModal
          planId={planId}
          zones={zones}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
