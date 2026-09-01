"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Loader2,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import {
  describeDevice,
  getServiceWorkerRegistration,
  pushSupportedInBrowser,
  urlBase64ToUint8Array,
} from "@/lib/push-client";
import { cn } from "@/lib/utils";

type PushStatus = {
  supported: boolean;
  vapidPublicKey: string | null;
  enabled: boolean;
  intervalMinutes: number;
  /** Last tick of the reminder job; null when nothing has ever called it. */
  schedulerLastRunAt: string | null;
  schedulerRunning: boolean;
  deviceCount: number;
  devices: Array<{
    id: string;
    device: string;
    endpointTail: string;
    createdAt?: string;
    lastSuccessAt?: string | null;
  }>;
};

/**
 * How often to *repeat* a nudge while a prayer is still unmarked.
 *
 * It never delays the first one: the "it's prayer time" notification goes out
 * when the window opens, and this is the gap before the first reminder after it.
 */
const INTERVALS = [
  { minutes: 30, label: "30m" },
  { minutes: 60, label: "1h" },
  { minutes: 120, label: "2h" },
];

/** "2h ago" / "just now" — enough to see whether the job is alive. */
function sinceLabel(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Device-level reminder control.
 *
 * "On" means three things are true at once: the browser granted permission,
 * this device has a push endpoint registered, and the account has reminders
 * enabled. The switch drives all three so the user never has to reason about
 * them separately.
 */
export function NamazNotifications() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [browserOk, setBrowserOk] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [thisDeviceOn, setThisDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const syncLocalState = useCallback(async () => {
    if (!pushSupportedInBrowser()) {
      setBrowserOk(false);
      return;
    }
    setBrowserOk(true);
    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      setThisDeviceOn(Boolean(subscription));
    } catch {
      setThisDeviceOn(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setStatus(await api<PushStatus>("/api/push"));
    } catch {
      setStatus(null);
    }
    await syncLocalState();
  }, [syncLocalState]);

  useEffect(() => {
    void load();
  }, [load]);

  const live =
    Boolean(status?.enabled) && thisDeviceOn && permission === "granted";

  async function enable() {
    if (!status?.vapidPublicKey) {
      toast.error("Push is not configured on the server");
      return;
    }
    setBusy(true);
    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        toast.error(
          granted === "denied"
            ? "Notifications are blocked for this site in your browser settings"
            : "Notification permission was not granted"
        );
        return;
      }

      const registration = await getServiceWorkerRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.vapidPublicKey),
        }));

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      setStatus(
        await api<PushStatus>("/api/push", {
          method: "POST",
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            device: describeDevice(),
          }),
        })
      );
      setThisDeviceOn(true);
      toast.success("Prayer reminders on");
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not turn on reminders"
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      await subscription?.unsubscribe();

      setStatus(
        await api<PushStatus>("/api/push", {
          method: "DELETE",
          body: JSON.stringify(endpoint ? { endpoint } : { all: true }),
        })
      );
      setThisDeviceOn(false);
      toast.success("Prayer reminders off");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not turn off");
    } finally {
      setBusy(false);
    }
  }

  async function changeInterval(minutes: number) {
    const previous = status;
    setStatus((s) => (s ? { ...s, intervalMinutes: minutes } : s));
    try {
      setStatus(
        await api<PushStatus>("/api/push", {
          method: "PATCH",
          body: JSON.stringify({ intervalMinutes: minutes }),
        })
      );
    } catch {
      setStatus(previous);
      toast.error("Could not change the interval");
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await api("/api/push/test", { method: "POST" });
      toast.success("Test sent");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  if (!status?.supported || !browserOk) return null;

  const blocked = permission === "denied";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3 shadow-sm sm:p-4",
        live
          ? "border-emerald-500/50 dark:border-emerald-400/50"
          : "border-border"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            live
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          {live ? (
            <BellRing className="h-5 w-5" />
          ) : blocked ? (
            <BellOff className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-tight">Prayer reminders</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            {blocked ? (
              "Blocked in browser settings"
            ) : live ? (
              <>
                <Smartphone className="h-3 w-3" />
                {status.deviceCount} device{status.deviceCount === 1 ? "" : "s"}
              </>
            ) : (
              "Off"
            )}
          </p>
        </div>

        {live ? (
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {INTERVALS.map((option) => (
              <button
                key={option.minutes}
                type="button"
                onClick={() => void changeInterval(option.minutes)}
                aria-pressed={status.intervalMinutes === option.minutes}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-bold tabular-nums transition",
                  status.intervalMinutes === option.minutes
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {live ? (
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={testing}
            aria-label="Send a test notification"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        ) : null}

        <button
          type="button"
          role="switch"
          aria-checked={live}
          aria-label="Prayer reminders"
          disabled={busy || blocked}
          onClick={() => void (live ? disable() : enable())}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
            live ? "bg-emerald-700 dark:bg-emerald-500" : "bg-muted",
            (busy || blocked) && "cursor-not-allowed opacity-60"
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform dark:bg-slate-100",
              live ? "translate-x-6" : "translate-x-1"
            )}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin text-slate-600" />
            ) : null}
          </span>
        </button>
      </div>

      {/*
        The switch being on is only half of it — something outside the app has to
        call the reminder job on a schedule, and when nothing does, the toggle,
        the permission and the test button all still look perfectly healthy. Say
        so plainly rather than letting the prayer times pass in silence.
      */}
      {live && !status.schedulerRunning ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/12 dark:text-amber-100">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Prayer times are not being watched, so no reminder will arrive.
            Something has to call{" "}
            <code className="font-mono">/api/notifications/run</code> every
            minute —{" "}
            {status.schedulerLastRunAt
              ? `it was last called ${sinceLabel(status.schedulerLastRunAt)}.`
              : "it has never been called."}{" "}
            Test notifications skip that job, which is why they still arrive.
          </span>
        </p>
      ) : null}
    </div>
  );
}
