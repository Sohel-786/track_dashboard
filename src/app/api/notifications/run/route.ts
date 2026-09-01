import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import connectDB from "@/lib/mongodb";
import { fail, ok } from "@/lib/api-helpers";
import { runNamazReminders } from "@/lib/namaz-reminders";
import { isPushConfigured } from "@/lib/push";
import { runTrackMaintenance } from "@/lib/track-service";
import {
  JOB_NOTIFICATIONS,
  JOB_TRACK_MAINTENANCE,
  claimPacedJob,
  recordJobRun,
} from "@/lib/job-runs";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Reminder timing must be evaluated live — never served from a cache. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Shortest gap between two map-upkeep passes.
 *
 * The reminder sweep wants to run every minute so a prayer is announced on its
 * own time rather than at the next coarse tick. Naming a stay does not: it
 * costs a rate-limited OpenStreetMap round trip, and hammering a free service
 * once a minute is the fastest way to lose access to it. So the two are paced
 * apart — every tick sweeps reminders, roughly every fourth one does the map.
 */
const TRACK_MAINTENANCE_GAP_MINUTES = 15;

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The job runs unauthenticated (a scheduler calls it), so the shared secret is
 * the only thing standing between the internet and a notification flood. It is
 * compared in constant time and accepted from a header, a bearer token, or a
 * query string — whichever the scheduler in use can send.
 */
function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("x-cron-secret")?.trim();
  if (header && safeEquals(header, secret)) return true;

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.startsWith("Bearer ") && safeEquals(auth.slice(7).trim(), secret)) {
    return true;
  }

  const query = request.nextUrl.searchParams.get("key")?.trim();
  if (query && safeEquals(query, secret)) return true;

  return false;
}

async function handle(request: NextRequest) {
  // Throttled before the secret check so guessing costs the caller, not the DB.
  // Generous enough for a once-a-minute scheduler with retries, tight enough
  // that brute-forcing the secret is not worth anyone's time.
  const limited = rateLimit(`cron:${clientIp(request.headers)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) return fail("Too many requests", 429);

  if (!process.env.CRON_SECRET?.trim()) {
    return fail("CRON_SECRET is not configured on this server", 503);
  }
  if (!isAuthorizedCron(request)) {
    return fail("Unauthorized", 401);
  }

  await connectDB();

  const now = new Date();

  /**
   * The heartbeat is stamped before any work, and whatever else this call does.
   * Its job is to answer "is anything calling this endpoint at all?" — which is
   * the question worth answering when a user reports that no reminder ever
   * arrives, and it must still be answered on a tick that finds nothing to send.
   */
  await recordJobRun(JOB_NOTIFICATIONS, now);

  const push = isPushConfigured() ? await runNamazReminders(now) : null;

  /**
   * Reminders are the job's first duty, but not its only one: the map's backlog
   * of unnamed stops is worked off here too, rather than making someone wait for
   * it when they open the page. It runs on its own slower pace — see above.
   */
  const trackDue = await claimPacedJob(
    JOB_TRACK_MAINTENANCE,
    TRACK_MAINTENANCE_GAP_MINUTES,
    now
  );
  const track = trackDue ? await runTrackMaintenance() : null;

  return ok({
    ranAt: now.toISOString(),
    /** Null when the deployment has no VAPID keypair — reminders are off. */
    ...(push ?? { pushConfigured: false }),
    /** Null on the ticks between map passes — not a failure. */
    track,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
