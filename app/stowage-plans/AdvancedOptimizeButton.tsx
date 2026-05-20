'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

type ServiceStatus = 'checking' | 'online' | 'offline';

export default function AdvancedOptimizeButton() {
  const [status, setStatus] = useState<ServiceStatus>('checking');
  const router = useRouter();

  const engineUrl = process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL
    ?? 'http://localhost:8001';

  const checkHealth = async () => {
    try {
      const res = await fetch(`${engineUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      setStatus(res.ok ? 'online' : 'offline');
    } catch {
      setStatus('offline');
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const dotColor = status === 'online'
    ? '#22c55e'
    : status === 'offline'
    ? '#ef4444'
    : '#94a3b8';

  const tooltip = status === 'online'
    ? 'OR-Tools optimizer service running'
    : status === 'offline'
    ? 'Service offline — run: cd stowage-optimizer && venv\\Scripts\\activate && uvicorn api:app --port 8001'
    : 'Checking optimizer service...';

  return (
    <button
      className={styles.btnOptimize}
      onClick={() => router.push('/stowage-plans/optimize')}
      disabled={status === 'offline'}
      title={tooltip}
    >
      <span
        className={styles.serviceDot}
        style={{ background: dotColor }}
      />
      🔬 Advanced Optimize
    </button>
  );
}
