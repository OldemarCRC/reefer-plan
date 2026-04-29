'use client';

import { useState, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/layout/AppShell';
import { changePassword } from '@/app/actions/user';
import styles from './account.module.css';

export default function AccountPage() {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const userId = (session?.user as any)?.id ?? '';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setMsg({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }

    startTransition(async () => {
      const result = await changePassword(userId, currentPassword, newPassword);
      if (result.success) {
        setMsg({ type: 'success', text: 'Password changed successfully' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMsg({ type: 'error', text: result.error ?? 'Failed to change password' });
      }
    });
  }

  const roleLabel: Record<string, string> = {
    ADMIN: 'Administrator',
    SHIPPING_PLANNER: 'Shipping Planner',
    STEVEDORE: 'Stevedore',
    CHECKER: 'Checker',
    EXPORTER: 'Exporter',
    VIEWER: 'Viewer',
  };

  const role = (session?.user as any)?.role ?? '';

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Account Settings</h1>
        </div>

        <div className={styles.grid}>
          {/* User info card */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Profile</h2>
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Name</span>
              <span className={styles.profileValue}>{session?.user?.name ?? '—'}</span>
            </div>
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Email</span>
              <span className={styles.profileValue}>{session?.user?.email ?? '—'}</span>
            </div>
            <div className={styles.profileRow}>
              <span className={styles.profileLabel}>Role</span>
              <span className={styles.profileValue}>{roleLabel[role] ?? role}</span>
            </div>
          </div>

          {/* Change password card */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Change Password</h2>

            {msg && (
              <div className={msg.type === 'success' ? styles.success : styles.error}>
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="current">Current Password</label>
                <input
                  id="current"
                  type="password"
                  className={styles.input}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="newpwd">New Password</label>
                <input
                  id="newpwd"
                  type="password"
                  className={styles.input}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="confirmpwd">Confirm New Password</label>
                <input
                  id="confirmpwd"
                  type="password"
                  className={styles.input}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <button
                type="submit"
                className={styles.btnSubmit}
                disabled={isPending || !currentPassword || !newPassword || !confirmPassword}
              >
                {isPending ? 'Saving...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
