'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmUserAccount } from '@/app/actions/user';
import styles from './confirm.module.css';

export default function ConfirmClient({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPwd) { setError('Passwords do not match'); return; }
    setError(null);

    startTransition(async () => {
      const result = await confirmUserAccount(token, password);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push('/login'), 3000);
      } else {
        setError(result.error ?? 'Confirmation failed. The link may have expired.');
      }
    });
  };

  if (success) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.title}>Account Activated</h1>
          <p className={styles.body}>
            Your password has been set. You are being redirected to the login page…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logoArea}>
          <span className={styles.logoText}>Reefer Planner</span>
        </div>

        <h1 className={styles.title}>Set Your Password</h1>
        <p className={styles.body}>
          Welcome! Choose a password to activate your account.
          You only need to do this once.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>New Password</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Confirm Password</label>
            <input
              className={styles.input}
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Repeat your password"
              minLength={8}
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={styles.btnSubmit}
            disabled={isPending || !password || !confirmPwd}
          >
            {isPending ? 'Activating…' : 'Activate Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
