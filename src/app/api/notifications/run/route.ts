import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import connectDB from "@/lib/mongodb";
import { fail, ok } from "@/lib/api-helpers";
import { runNamazReminders } from "@/lib/namaz-reminders";
import { isPushConfigured } from "@/lib/push";
import { runTrackMaintenance } from "@/lib/track-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Reminder timing must be evaluated live — never served from a cache. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  // Throttle before the secret check so guessing costs the caller, not the DB.
  const limited = rateLimit(`cron:${clientIp(request.headers)}`, {
    limit: 30,
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

  /**
   * Reminders are the job's first duty, but not its only one: naming a stay
   * costs a rate-limited OpenStreetMap round trip, so the map's backlog is
   * worked off here too rather than making someone wait for it when they open
   * the page. Both run on the same 15-minute tick.
   */
  const push = isPushConfigured()
    ? await runNamazReminders(new Date())
    : null;

  const track = await runTrackMaintenance();

  return ok({
    ranAt: new Date().toISOString(),
    /** Null when the deployment has no VAPID keypair — reminders are off. */
    ...(push ?? { pushConfigured: false }),
    track,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
