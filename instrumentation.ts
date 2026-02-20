// instrumentation.ts — runs once on server startup (Next.js instrumentation hook).
// Only executes in the Node.js runtime (not the Edge runtime), so Mongoose is safe to use.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCleanupJob } = await import('./lib/cron/cleanup');
    startCleanupJob();
  }
}
