'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';
import styles from './login.module.css';

const initialState = { error: null as string | null };

export default function LoginClient() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo / title */}
        <div className={styles.logo}>
          <svg viewBox="0 0 40 40" fill="none" className={styles.logoIcon}>
            <rect width="40" height="40" rx="8" fill="var(--color-blue)" fillOpacity="0.15" />
            <path
              d="M6 28l1.2-2.4C9.4 21.2 13.8 18 18.8 18h2.4c5 0 9.4 3.2 11.6 7.6L34 28"
              stroke="var(--color-cyan-light)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M8 18V10a2 2 0 012-2h20a2 2 0 012 2v8"
              stroke="var(--color-blue-light)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line x1="12" y1="14" x2="28" y2="14" stroke="var(--color-blue-light)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="18" x2="28" y2="18" stroke="var(--color-blue-light)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <h1 className={styles.title}>Reefer Planner</h1>
            <p className={styles.subtitle}>Shore-based Stowage Planning</p>
          </div>
        </div>

        {/* Form */}
        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={styles.input}
              placeholder="you@company.com"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={styles.input}
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <div className={styles.error} role="alert">
              {state.error}
            </div>
          )}

          <button type="submit" className={styles.submitBtn} disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
