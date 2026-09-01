import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PushSubscription from "@/models/PushSubscription";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/api-helpers";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";
import {
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  MAX_REMINDER_INTERVAL_MINUTES,
  MIN_REMINDER_INTERVAL_MINUTES,
} from "@/lib/namaz-reminders";
import {
  JOB_NOTIFICATIONS,
  SCHEDULER_STALE_AFTER_MINUTES,
  getLastJobRun,
} from "@/lib/job-runs";

/**
 * The server POSTs to whatever endpoint it is given, so an unvalidated value
 * turns this route into a blind SSRF gadget aimed at the internal network.
 * Real push services are always public HTTPS hosts — anything else is refused.
 */
function isPublicHttpsEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return false;
  }

  // IPv6 literals and any IPv4 literal in a private / loopback / link-local range.
  if (host.startsWith("[")) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  }

  // Must look like a real domain name.
  return host.includes(".");
}

/** Browser-issued endpoints are long; cap them so a bad client cannot bloat the DB. */
const subscribeSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine(isPublicHttpsEndpoint, "Unsupported push endpoint"),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
  device: z.string().max(200).optional(),
});

const prefsSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z
    .number()
    .int()
    .min(MIN_REMINDER_INTERVAL_MINUTES)
    .max(MAX_REMINDER_INTERVAL_MINUTES)
    .optional(),
});

async function statusFor(userId: string) {
  const [user, devices, lastJobRun] = await Promise.all([
    User.findById(userId)
      .select("namazRemindersEnabled namazReminderIntervalMinutes")
      .lean(),
    PushSubscription.find({ userId })
      .select("endpoint device createdAt lastSuccessAt")
      .sort({ createdAt: -1 })
      .lean(),
    getLastJobRun(JOB_NOTIFICATIONS),
  ]);

  /**
   * Permission granted, device registered, and still nothing arrives — that is
   * almost always a scheduler nobody set up, not a delivery problem. Reporting
   * the last tick lets the UI say so instead of leaving the user guessing.
   */
  const schedulerRunning =
    lastJobRun !== null &&
    Date.now() - lastJobRun.getTime() <=
      SCHEDULER_STALE_AFTER_MINUTES * 60_000;

  return {
    /** False when the deployment has no VAPID keypair — UI hides the toggle. */
    supported: isPushConfigured(),
    vapidPublicKey: getVapidPublicKey(),
    enabled: user?.namazRemindersEnabled ?? true,
    intervalMinutes:
      user?.namazReminderIntervalMinutes ?? DEFAULT_REMINDER_INTERVAL_MINUTES,
    /** Last tick of `/api/notifications/run`, or null if it never ran. */
    schedulerLastRunAt: lastJobRun ? lastJobRun.toISOString() : null,
    schedulerRunning,
    deviceCount: devices.length,
    devices: devices.map((d) => ({
      id: String(d._id),
      device: d.device || "This device",
      /** Endpoint tail only — enough to match a device, useless if leaked. */
      endpointTail: d.endpoint.slice(-12),
      createdAt: d.createdAt,
      lastSuccessAt: d.lastSuccessAt,
    })),
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    await connectDB();
    return ok(await statusFor(session.sub));
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Register (or refresh) this device's push endpoint for the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!isPushConfigured()) {
      return fail("Push notifications are not configured on this server", 503);
    }

    await connectDB();
    const parsed = subscribeSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid push subscription");

    const { endpoint, keys, device } = parsed.data;

    /**
     * The endpoint is unique across the whole collection: re-registering the
     * same browser must move it to the current user, not create a duplicate.
     */
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: session.sub,
          p256dh: keys.p256dh,
          auth: keys.auth,
          device: device?.slice(0, 200) ?? "",
          failureCount: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Registering a device is an explicit opt-in to reminders.
    await User.findByIdAndUpdate(session.sub, {
      $set: { namazRemindersEnabled: true },
    });

    return ok(await statusFor(session.sub), { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Toggle reminders on/off or change the repeat interval. */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    const parsed = prefsSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid reminder settings");

    const update: Record<string, unknown> = {};
    if (parsed.data.enabled !== undefined) {
      update.namazRemindersEnabled = parsed.data.enabled;
    }
    if (parsed.data.intervalMinutes !== undefined) {
      update.namazReminderIntervalMinutes = parsed.data.intervalMinutes;
    }
    if (Object.keys(update).length === 0) return fail("Nothing to update");

    await User.findByIdAndUpdate(session.sub, { $set: update });
    return ok(await statusFor(session.sub));
  } catch (error) {
    return authErrorResponse(error);
  }
}

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000).optional(),
  /** Remove every device for this account. */
  all: z.boolean().optional(),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectDB();

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) return fail("Invalid unsubscribe payload");

    if (parsed.data.all || !parsed.data.endpoint) {
      await PushSubscription.deleteMany({ userId: session.sub });
    } else {
      // Scoped to this user so an endpoint cannot be deleted on someone's behalf.
      await PushSubscription.deleteOne({
        userId: session.sub,
        endpoint: parsed.data.endpoint,
      });
    }

    /**
     * Turning this phone off must not silence the user's other devices — the
     * account-level flag only flips once nothing is left to notify.
     */
    const remaining = await PushSubscription.countDocuments({
      userId: session.sub,
    });
    if (remaining === 0) {
      await User.findByIdAndUpdate(session.sub, {
        $set: { namazRemindersEnabled: false },
      });
    }

    return ok(await statusFor(session.sub));
  } catch (error) {
    return authErrorResponse(error);
  }
}
