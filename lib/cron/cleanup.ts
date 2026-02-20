// Session cleanup cron job.
// Runs every 10 minutes and marks sessions as offline if lastActivity is
// older than INACTIVITY_WINDOW. This handles the case where the user closed
// the browser without logging out (zombie sessions).

import cron from 'node-cron';
import connectDB from '../db/connect';
import { UserModel } from '../db/schemas';

const INACTIVITY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function startCleanupJob() {
  // Run every 10 minutes: */10 * * * *
  cron.schedule('*/10 * * * *', async () => {
    try {
      await connectDB();

      const cutoff = new Date(Date.now() - INACTIVITY_WINDOW_MS);

      const result = await UserModel.updateMany(
        { isOnline: true, lastActivity: { $lt: cutoff } },
        { $set: { isOnline: false, sessionToken: null } }
      );

      if (result.modifiedCount > 0) {
        console.log(
          `[cleanup] Marked ${result.modifiedCount} user(s) offline` +
          ` (inactive > 15 min at ${new Date().toISOString()})`
        );
      }
    } catch (err) {
      console.error('[cleanup] Error running session cleanup:', err);
    }
  });

  console.log('[cleanup] Session cleanup job registered (every 10 minutes)');
}
