import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import PushSubscription from "@/models/PushSubscription";

/**
 * Web Push delivery.
 *
 * VAPID identifies this server to the browser's push service; the keypair is
 * generated once and lives in the environment. Without it the app still works —
 * push simply stays unavailable and the UI says so, rather than the routes
 * throwing on every request.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Path opened when the notification is tapped. */
  url: string;
  /** Collapse key — a newer notification replaces an older one with same tag. */
  tag?: string;
  /** Extra data forwarded to the service worker (e.g. the prayer to mark). */
  data?: Record<string, unknown>;
  /** Buttons rendered on the notification itself. */
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
  renotify?: boolean;
};

let configured: boolean | null = null;

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

/** True when the deployment holds a usable VAPID keypair. */
export function isPushConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }

  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@trackdash.local";

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("[push] Invalid VAPID configuration:", error);
    configured = false;
  }
  return configured;
}

export type SendResult = {
  sent: number;
  failed: number;
  removed: number;
};

/**
 * Deliver one payload to every device a user has registered.
 *
 * A push service answers 404/410 when the browser has thrown the subscription
 * away (app uninstalled, permission revoked, storage cleared). Those endpoints
 * are deleted here so a dead device is never retried.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<SendResult> {
  if (!isPushConfigured()) return { sent: 0, failed: 0, removed: 0 };

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (subscriptions.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const body = JSON.stringify(payload);
  const now = new Date();
  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const target: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webpush.sendNotification(target, body, {
          TTL: 60 * 60,
          urgency: "high",
        });
        sent += 1;
        await PushSubscription.updateOne(
          { _id: sub._id },
          { $set: { lastSuccessAt: now, failureCount: 0 } }
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          removed += 1;
          return;
        }
        failed += 1;
        console.error(
          `[push] Delivery failed (${status ?? "unknown"}) for ${sub.endpoint.slice(0, 48)}…`
        );
        await PushSubscription.updateOne(
          { _id: sub._id },
          { $set: { lastFailureAt: now }, $inc: { failureCount: 1 } }
        );
      }
    })
  );

  return { sent, failed, removed };
}
