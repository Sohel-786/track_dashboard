"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Loader2, MapPin, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import type { NamazPrayerScheduleSlot, NamazScheduleSnapshot } from "@/types";
import {
  NAMAZ_MADHABS,
  type NamazMadhabId,
  getNamazMadhab,
} from "@/lib/namaz-madhab";
import { NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import { cn } from "@/lib/utils";

type NextFocus =
  | {
      kind: "open" | "upcoming";
      slot: NamazPrayerScheduleSlot;
      targetMs: number;
      caption: string;
    }
  | {
      kind: "next-fajar";
      slot: NamazPrayerScheduleSlot;
      targetMs: number;
      caption: string;
    };

function resolveFocus(
  schedule: NamazPrayerScheduleSlot[],
  nowMs: number
): NextFocus | null {
  if (!schedule.length) return null;

  const withMs = schedule.map((s) => ({
    slot: s,
    start: new Date(s.startsAt).getTime(),
    end: new Date(s.endsAt).getTime(),
  }));

  const open = withMs.find((s) => nowMs >= s.start && nowMs <= s.end);
  if (open) {
    return {
      kind: "open",
      slot: open.slot,
      targetMs: open.end,
      caption: "Window open · ends",
    };
  }

  const upcoming = withMs.find((s) => nowMs < s.start);
  if (upcoming) {
    return {
      kind: "upcoming",
      slot: upcoming.slot,
      targetMs: upcoming.start,
      caption: "Next namaz · starts",
    };
  }

  // After today's last window closed — next is tomorrow's Fajar (Isha end).
  const isha = withMs.find((s) => s.slot.prayer === "isha");
  if (isha) {
    return {
      kind: "next-fajar",
      slot: {
        ...isha.slot,
        prayer: "fajar",
        label: "Fajar",
        arabic: NAMAZ_PRAYER_META.fajar.arabic,
        startsAt: isha.slot.endsAt,
        startsAtLabel: isha.slot.endsAtLabel,
        phase: "upcoming",
        canMarkOnTime: false,
        canMarkKaza: false,
      },
      targetMs: isha.end,
      caption: "Next namaz · tomorrow’s Fajar",
    };
  }

  return null;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Dedicated prayer-times board: next namaz + Madhab selector for times only.
 * Madhab here previews / drives displayed times; optional save syncs checklist.
 */
export function NamazTimesPanel({
  initialMadhabId,
  onScheduleSynced,
}: {
  initialMadhabId?: NamazMadhabId;
  /** Fired when user saves madhab so checklist windows stay aligned. */
  onScheduleSynced?: () => void;
}) {
  const [madhabId, setMadhabId] = useState<NamazMadhabId>(
    initialMadhabId ?? "hanafi"
  );
  const [savedMadhabId, setSavedMadhabId] = useState<NamazMadhabId | null>(
    initialMadhabId ?? null
  );
  const [schedule, setSchedule] = useState<NamazScheduleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockLabel, setClockLabel] = useState("");

  // Sync initial madhab from parent once checklist loads.
  useEffect(() => {
    if (!initialMadhabId) return;
    setMadhabId(initialMadhabId);
    setSavedMadhabId(initialMadhabId);
  }, [initialMadhabId]);

  const loadTimes = useCallback(async (madhab: NamazMadhabId) => {
    setLoading(true);
    try {
      const data = await api<NamazScheduleSnapshot>(
        `/api/namaz/schedule?madhab=${madhab}`
      );
      setSchedule(data);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Failed to load prayer times"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTimes(madhabId);
    const id = window.setInterval(() => void loadTimes(madhabId), 60_000);
    return () => window.clearInterval(id);
  }, [loadTimes, madhabId]);

  useEffect(() => {
    if (!schedule?.serverNow) return;
    const anchor = new Date(schedule.serverNow).getTime();
    const started = Date.now();
    const tick = () => {
      const approx = anchor + (Date.now() - started);
      setNowMs(approx);
      setClockLabel(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: schedule.location.timeZone,
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).format(new Date(approx))
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [schedule?.serverNow, schedule?.location.timeZone]);

  const focus = useMemo(
    () => (schedule ? resolveFocus(schedule.schedule, nowMs) : null),
    [schedule, nowMs]
  );

  const madhabMeta = getNamazMadhab(madhabId);
  const previewDirty =
    savedMadhabId != null && madhabId !== savedMadhabId;

  async function onMadhabChange(next: NamazMadhabId) {
    setMadhabId(next);
  }

  async function saveMadhabForChecklist() {
    if (!previewDirty || busy) return;
    setBusy(true);
    try {
      await api("/api/namaz/preferences", {
        method: "PUT",
        body: JSON.stringify({ madhab: madhabId }),
      });
      setSavedMadhabId(madhabId);
      toast.success(
        `${madhabMeta.label} saved — checklist windows updated`
      );
      onScheduleSynced?.();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Could not save madhab"
      );
    } finally {
      setBusy(false);
    }
  }

  const focusMeta = focus
    ? NAMAZ_PRAYER_META[focus.slot.prayer as NamazPrayer]
    : null;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      aria-label="Namaz times"
    >
      <div className="border-b border-border bg-gradient-to-br from-teal-500/10 via-card to-card px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              Namaz times
            </p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">
              Next namaz
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Live Ahmedabad schedule via adhan. Madhab here is for these times
              only — save it if you also want checklist windows to match.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <label
                  htmlFor="times-madhab"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Madhab for times
                </label>
                <select
                  id="times-madhab"
                  disabled={busy || loading}
                  value={madhabId}
                  onChange={(e) =>
                    void onMadhabChange(e.target.value as NamazMadhabId)
                  }
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none ring-teal-500/40 focus:ring-2 disabled:opacity-60"
                >
                  {NAMAZ_MADHABS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.arabic})
                    </option>
                  ))}
                </select>
              </div>
              {previewDirty ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveMadhabForChecklist()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Apply to checklist
                </button>
              ) : null}
            </div>
            <p className="mt-2 max-w-lg text-[11px] text-muted-foreground">
              {madhabMeta.asrRule}
            </p>
          </div>

          <div className="min-w-[15rem] rounded-xl border border-border bg-background/70 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold">
              <MapPin className="h-3.5 w-3.5 text-teal-600" />
              {schedule?.location.city ?? "Ahmedabad"}, India
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              <span className="tabular-nums font-semibold text-foreground">
                {clockLabel || "—"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {schedule
                ? `${schedule.location.method} · ${schedule.location.madhab}`
                : "Loading…"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.15fr_1fr]">
        <div className="border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          {loading && !schedule ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading next namaz…
            </div>
          ) : focus && focusMeta ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    focus.kind === "open"
                      ? "bg-teal-500/15 text-teal-800 dark:text-teal-200"
                      : "bg-sky-500/15 text-sky-900 dark:text-sky-200"
                  )}
                >
                  {focus.kind === "open" ? "Praying now" : "Up next"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {focus.caption}
                </span>
              </div>

              <div>
                <div
                  className={cn(
                    "mb-2 h-1.5 w-16 rounded-full bg-gradient-to-r",
                    focusMeta.accent
                  )}
                />
                <h3 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {focus.slot.label}
                </h3>
                <p
                  className="mt-1 text-lg text-muted-foreground"
                  dir="rtl"
                >
                  {focus.slot.arabic}
                </p>
              </div>

              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {focus.kind === "open" ? "Ends at" : "Starts at"}
                  </p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">
                    {focus.kind === "open"
                      ? focus.slot.endsAtLabel
                      : focus.slot.startsAtLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {focus.kind === "open" ? "Time left" : "Countdown"}
                  </p>
                  <p className="mt-0.5 font-mono text-xl font-bold tabular-nums tracking-tight text-teal-700 dark:text-teal-300">
                    {formatCountdown(focus.targetMs - nowMs)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-10 text-sm text-muted-foreground">
              No schedule available.
            </p>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Today’s timetable
          </p>
          <ul className="space-y-1.5">
            {(schedule?.schedule ?? []).map((slot) => {
              const meta = NAMAZ_PRAYER_META[slot.prayer as NamazPrayer];
              const start = new Date(slot.startsAt).getTime();
              const end = new Date(slot.endsAt).getTime();
              const livePhase =
                nowMs < start
                  ? "upcoming"
                  : nowMs > end
                    ? "ended"
                    : "open";
              const active =
                focus?.kind !== "next-fajar" &&
                focus?.slot.prayer === slot.prayer;
              return (
                <li
                  key={slot.prayer}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition",
                    active
                      ? "border-teal-400/50 bg-teal-500/10"
                      : "border-transparent bg-muted/30"
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{slot.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {livePhase === "open"
                        ? "Open"
                        : livePhase === "ended"
                          ? "Ended"
                          : "Upcoming"}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-bold">{slot.startsAtLabel}</p>
                    <p className="text-[10px] text-muted-foreground">
                      → {slot.endsAtLabel}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "hidden h-8 w-1 shrink-0 rounded-full bg-gradient-to-b sm:block",
                      meta.accent
                    )}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
