import JobRun from "@/models/JobRun";

export const JOB_NOTIFICATIONS = "notifications";
export const JOB_TRACK_MAINTENANCE = "track-maintenance";

/**
 * How stale the scheduler heartbeat may get before the UI calls it dead.
 *
 * Generous on purpose: the recommended tick is a minute and GitHub Actions can
 * run twenty minutes late under load, so this only trips when nothing has
 * called the job for the better part of an hour.
 */
export const SCHEDULER_STALE_AFTER_MINUTES = 45;

/** Stamp a tick. Never throws — a heartbeat must not fail the job it measures. */
export async function recordJobRun(key: string, now = new Date()) {
  try {
    await JobRun.updateOne(
      { key },
      { $set: { lastRunAt: now }, $inc: { runCount: 1 } },
      { upsert: true }
    );
  } catch (error) {
    console.error(`[job] Could not record run for ${key}:`, error);
  }
}

export async function getLastJobRun(key: string): Promise<Date | null> {
  const row = await JobRun.findOne({ key }).select("lastRunAt").lean();
  return row?.lastRunAt ?? null;
}

/**
 * Take the right to run a paced job, atomically.
 *
 * The reminder sweep wants to run every minute; naming a map stay costs a
 * rate-limited OpenStreetMap round trip and must not. The update only matches a
 * row whose last run is already older than the gap, so one caller per gap wins
 * and every other tick is a no-op — including two ticks that overlap.
 */
export async function claimPacedJob(
  key: string,
  minGapMinutes: number,
  now = new Date()
): Promise<boolean> {
  const dueBefore = new Date(now.getTime() - minGapMinutes * 60_000);

  const claimed = await JobRun.findOneAndUpdate(
    { key, lastRunAt: { $lte: dueBefore } },
    { $set: { lastRunAt: now }, $inc: { runCount: 1 } },
    { new: true }
  ).lean();
  if (claimed) return true;

  try {
    // No row yet — the unique index makes the insert itself the claim.
    await JobRun.create({ key, lastRunAt: now, runCount: 1 });
    return true;
  } catch {
    return false;
  }
}
