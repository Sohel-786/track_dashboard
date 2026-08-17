"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  History,
  Loader2,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { format, parseISO } from "date-fns";
import { api, ApiError } from "@/lib/client-api";
import type {
  NamazDayStatus,
  NamazPrayerDay,
  NamazPrayerScheduleSlot,
  NamazScheduleSnapshot,
} from "@/types";
import { NAMAZ_PRAYER_META, type NamazPrayer } from "@/lib/namaz";
import { type NamazMadhabId } from "@/lib/namaz-madhab";
import { NamazTimesPanel } from "@/components/namaz/NamazTimesPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TodayPayload = NamazDayStatus & {
  schedule: NamazScheduleSnapshot;
  madhabId?: NamazMadhabId;
};

type Extras = { sunnah: boolean; tasbeeh: boolean; zamaat: boolean };

const NO_EXTRAS: Extras = { sunnah: false, tasbeeh: false, zamaat: false };

/** Stable React/list id when overnight Isha and today's Isha both appear. */
function prayerRowKey(
  prayer: Pick<NamazPrayerDay, "prayer" | "logDate" | "isOvernightCarryover">,
  fallbackDate: string
) {
  return [
    prayer.logDate ?? fallbackDate,
    prayer.prayer,
    prayer.isOvernightCarryover ? "overnight" : "today",
  ].join(":");
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Today's checklist. On-time marking stays available for the rest of the day
 * even after a window closes, so a prayer offered in time can still be ticked;
 * Kaza sits beside it for the ones that were genuinely late.
 */
export function NamazTracker({ onChanged }: { onChanged?: () => void }) {
  const [day, setDay] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [draftExtras, setDraftExtras] = useState<Record<string, Extras>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const data = await api<TodayPayload>("/api/namaz");
      setDay(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load namaz");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Local clock anchored to the server instant, for grace countdowns.
  useEffect(() => {
    if (!day?.schedule?.serverNow) return;
    const anchor = new Date(day.schedule.serverNow).getTime();
    const started = Date.now();
    const tick = () => setNowMs(anchor + (Date.now() - started));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [day?.schedule?.serverNow]);

  const madhabId =
    day?.madhabId ?? day?.schedule?.location?.madhabId ?? "hanafi";

  const counts = useMemo(() => {
    const prayers = day?.prayers ?? [];
    return {
      onTime: prayers.filter((p) => p.status === "prayed").length,
      kaza: prayers.filter((p) => p.status === "kaza").length,
      grace: prayers.filter((p) => p.status === "grace").length,
      open: prayers.filter((p) => p.status === "open").length,
      upcoming: prayers.filter((p) => p.status === "upcoming").length,
      total: prayers.length,
    };
  }, [day]);

  function extrasFor(rowKey: string, prayer: NamazPrayerDay): Extras {
    if (prayer.prayed) {
      return {
        sunnah: prayer.sunnah,
        tasbeeh: prayer.tasbeeh,
        zamaat: Boolean(prayer.zamaat),
      };
    }
    return draftExtras[rowKey] ?? NO_EXTRAS;
  }

  function setDraft(rowKey: string, patch: Partial<Extras>) {
    setDraftExtras((prev) => ({
      ...prev,
      [rowKey]: { ...(prev[rowKey] ?? NO_EXTRAS), ...patch },
    }));
  }

  /** Write an on-time completion (or clear it) for one row. */
  async function saveOnTime(
    prayer: NamazPrayerDay,
    prayed: boolean,
    extras: Extras
  ) {
    const rowKey = prayerRowKey(prayer, day?.date ?? "today");
    setBusyKey(rowKey);
    try {
      const next = await api<TodayPayload>("/api/namaz", {
        method: "PUT",
        body: JSON.stringify({
          prayer: prayer.prayer,
          prayed,
          sunnah: prayed && extras.sunnah,
          tasbeeh: prayed && extras.tasbeeh,
          zamaat: prayed && extras.zamaat,
          date: prayer.logDate ?? day?.date,
        }),
      });
      setDay(next);
      if (prayed) toast.success(`${prayer.label} recorded as prayed on time`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusyKey(null);
    }
  }

  async function markKaza(prayer: NamazPrayerDay, extras: Extras) {
    if (!day) return;
    const rowKey = prayerRowKey(prayer, day.date);
    setBusyKey(rowKey);
    try {
      await api("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          date: prayer.logDate ?? day.date,
          prayer: prayer.prayer,
          ...extras,
        }),
      });
      setDay(await api<TodayPayload>("/api/namaz"));
      toast.success(`${prayer.label} marked as Kaza`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save Kaza");
    } finally {
      setBusyKey(null);
    }
  }

  async function undoKaza(prayer: NamazPrayerDay) {
    if (!day) return;
    const rowKey = prayerRowKey(prayer, day.date);
    setBusyKey(rowKey);
    try {
      await api("/api/namaz/kaza", {
        method: "DELETE",
        body: JSON.stringify({
          date: prayer.logDate ?? day.date,
          prayer: prayer.prayer,
        }),
      });
      setDay(await api<TodayPayload>("/api/namaz"));
      toast.success(`${prayer.label} Kaza undone`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not undo");
    } finally {
      setBusyKey(null);
    }
  }

  const dayEndsMs = day?.schedule?.dayEndsAt
    ? new Date(day.schedule.dayEndsAt).getTime()
    : null;

  return (
    <section className="space-y-4">
      <NamazTimesPanel
        initialMadhabId={madhabId}
        onScheduleSynced={() => {
          void load();
          onChanged?.();
        }}
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              Today’s checklist
            </p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">
              {day
                ? format(parseISO(`${day.date}T00:00:00`), "EEEE, d MMMM yyyy")
                : "Loading…"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every prayer of today stays editable until midnight. Once a window
              closes you can still record it as{" "}
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                prayed on time
              </span>{" "}
              if you prayed it and forgot to tick, or as{" "}
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                Kaza
              </span>{" "}
              if it was late. Anything still unmarked when the day ends moves to
              the <span className="font-semibold text-foreground">Kaza</span>{" "}
              tab.
            </p>
          </div>
          {dayEndsMs ? (
            <div className="shrink-0 rounded-xl border border-border bg-muted/40 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Day closes in
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                {formatCountdown(dayEndsMs - nowMs)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {loading || !day ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading prayers...
        </div>
      ) : (
        <>
          <DayProgressBar
            onTime={counts.onTime}
            kaza={counts.kaza}
            grace={counts.grace}
            total={counts.total}
          />

          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <Chip tone="emerald">
              On time {counts.onTime}/{counts.total}
            </Chip>
            {counts.kaza > 0 ? (
              <Chip tone="amber">Kaza today {counts.kaza}</Chip>
            ) : null}
            {counts.grace > 0 ? (
              <Chip tone="rose">Needs marking {counts.grace}</Chip>
            ) : null}
            {counts.open > 0 ? <Chip tone="teal">Window open</Chip> : null}
            {counts.upcoming > 0 ? (
              <Chip tone="slate">Upcoming {counts.upcoming}</Chip>
            ) : null}
            {day.schedule?.overnightIsha ? (
              <Chip tone="indigo">Overnight Isha until Fajar</Chip>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {day.prayers.map((prayer) => {
              const rowKey = prayerRowKey(prayer, day.date);
              return (
                <PrayerCard
                  key={rowKey}
                  prayer={prayer}
                  slot={prayer.slot ?? null}
                  busy={busyKey === rowKey}
                  nowMs={nowMs}
                  extras={extrasFor(rowKey, prayer)}
                  onExtrasChange={(patch) => {
                    if (!prayer.prayed) {
                      setDraft(rowKey, patch);
                      return;
                    }
                    if (prayer.isKaza) {
                      toast.error(
                        "Undo the Kaza first to change its extras."
                      );
                      return;
                    }
                    void saveOnTime(prayer, true, {
                      ...extrasFor(rowKey, prayer),
                      ...patch,
                    });
                  }}
                  onMarkOnTime={() =>
                    void saveOnTime(prayer, true, extrasFor(rowKey, prayer))
                  }
                  onClearOnTime={() =>
                    void saveOnTime(prayer, false, NO_EXTRAS)
                  }
                  onMarkKaza={() =>
                    void markKaza(prayer, extrasFor(rowKey, prayer))
                  }
                  onUndoKaza={() => void undoKaza(prayer)}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

const CHIP_TONES = {
  emerald: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  amber: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  rose: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
  teal: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  indigo: "bg-indigo-500/15 text-indigo-900 dark:text-indigo-200",
  slate: "bg-muted text-muted-foreground",
} as const;

function Chip({
  tone,
  children,
}: {
  tone: keyof typeof CHIP_TONES;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("rounded-full px-3 py-1", CHIP_TONES[tone])}>
      {children}
    </span>
  );
}

function DayProgressBar({
  onTime,
  kaza,
  grace,
  total,
}: {
  onTime: number;
  kaza: number;
  grace: number;
  total: number;
}) {
  if (total === 0) return null;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500 transition-all" style={{ width: seg(onTime) }} />
        <div className="bg-amber-500 transition-all" style={{ width: seg(kaza) }} />
        <div className="bg-rose-500/70 transition-all" style={{ width: seg(grace) }} />
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
        {onTime + kaza} of {total} prayers recorded today
        {grace > 0 ? ` · ${grace} still waiting for you` : ""}
      </p>
    </div>
  );
}

function PrayerCard({
  prayer,
  slot,
  busy,
  nowMs,
  extras,
  onExtrasChange,
  onMarkOnTime,
  onClearOnTime,
  onMarkKaza,
  onUndoKaza,
}: {
  prayer: NamazPrayerDay;
  slot: NamazPrayerScheduleSlot | null;
  busy: boolean;
  nowMs: number;
  extras: Extras;
  onExtrasChange: (patch: Partial<Extras>) => void;
  onMarkOnTime: () => void;
  onClearOnTime: () => void;
  onMarkKaza: () => void;
  onUndoKaza: () => void;
}) {
  const meta = NAMAZ_PRAYER_META[prayer.prayer as NamazPrayer];
  const onTime = prayer.status === "prayed";
  const kazaDone = prayer.status === "kaza";
  const grace = prayer.status === "grace";
  const upcoming = prayer.status === "upcoming";
  const open = prayer.status === "open";
  const done = onTime || kazaDone;

  const graceLeft =
    grace && slot?.graceEndsAt
      ? new Date(slot.graceEndsAt).getTime() - nowMs
      : null;

  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition",
        onTime && "border-emerald-300/70 dark:border-emerald-800",
        kazaDone && "border-amber-300/70 dark:border-amber-800",
        grace && "border-rose-300/70 dark:border-rose-900",
        open &&
          (prayer.isOvernightCarryover
            ? "border-indigo-300/70 dark:border-indigo-800"
            : "border-teal-300/70 dark:border-teal-800"),
        !done && !grace && !open && "border-border"
      )}
    >
      <div className={cn("h-1.5 w-full bg-gradient-to-r", meta.accent)} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                meta.accentSoft
              )}
            >
              {prayer.isOvernightCarryover
                ? "Overnight · still on time"
                : slot?.phase === "open"
                  ? "Window open"
                  : slot?.phase === "ended"
                    ? "Window ended"
                    : "Upcoming"}
            </p>
            <h3 className="mt-2 text-lg font-bold tracking-tight">
              {prayer.label}
            </h3>
            {prayer.isOvernightCarryover && prayer.logDate ? (
              <p className="mt-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                From {format(parseISO(`${prayer.logDate}T00:00:00`), "EEE d MMM")}{" "}
                · until Fajar
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground" dir="rtl">
              {prayer.arabic}
            </p>
          </div>
          <StatusBadge
            onTime={onTime}
            kaza={kazaDone}
            grace={grace}
            upcoming={upcoming}
          />
        </div>

        {slot ? (
          <div className="rounded-xl bg-muted/40 px-3 py-2 text-[11px] tabular-nums text-muted-foreground">
            <div className="flex justify-between gap-2">
              <span>Starts</span>
              <span className="font-semibold text-foreground">
                {slot.startsAtLabel}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span>Ends</span>
              <span className="font-semibold text-foreground">
                {slot.endsAtLabel}
              </span>
            </div>
          </div>
        ) : null}

        {grace ? (
          <p className="flex items-start gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-2.5 py-2 text-[11px] font-medium text-rose-900 dark:text-rose-100">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Window closed at {slot?.endsAtLabel ?? "—"}. Still yours to record
              {graceLeft != null ? (
                <>
                  {" "}
                  for{" "}
                  <span className="font-mono font-bold tabular-nums">
                    {formatCountdown(graceLeft)}
                  </span>
                </>
              ) : (
                " until midnight"
              )}
              .
            </span>
          </p>
        ) : null}

        <div className="mt-auto space-y-2">
          {/* Extras apply to whichever completion is recorded next. */}
          <div className="grid grid-cols-1 gap-2">
            <OptionalToggle
              label="Sunnah"
              active={extras.sunnah}
              disabled={busy || upcoming || kazaDone}
              onClick={() => onExtrasChange({ sunnah: !extras.sunnah })}
            />
            <OptionalToggle
              label="Tasbeeh"
              active={extras.tasbeeh}
              disabled={busy || upcoming || kazaDone}
              onClick={() => onExtrasChange({ tasbeeh: !extras.tasbeeh })}
              icon={Sparkles}
            />
            <OptionalToggle
              label="With Zamaat"
              active={extras.zamaat}
              disabled={busy || upcoming || kazaDone}
              onClick={() => onExtrasChange({ zamaat: !extras.zamaat })}
              icon={Users}
            />
          </div>

          {kazaDone ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-3">
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Completed as Kaza
                </span>
                <History className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={busy}
                onClick={onUndoKaza}
                className="w-full"
              >
                {!busy ? <Undo2 className="h-3.5 w-3.5" /> : null}
                Undo — I prayed it on time
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy || upcoming}
                onClick={onTime ? onClearOnTime : onMarkOnTime}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition",
                  onTime
                    ? "border-emerald-400/60 bg-emerald-500/10"
                    : grace
                      ? "border-emerald-500/60 bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border-border bg-background hover:bg-muted/60",
                  (busy || upcoming) && "cursor-not-allowed opacity-60"
                )}
              >
                <span className="text-sm font-semibold">
                  {onTime
                    ? "Prayed on time"
                    : grace
                      ? "I prayed it on time"
                      : "Prayed (Fard)"}
                </span>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md border",
                    onTime
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : grace
                        ? "border-white/40 bg-white/15 text-white"
                        : "border-border bg-card"
                  )}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : onTime ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : null}
                </span>
              </button>

              {grace && !onTime ? (
                <Button
                  type="button"
                  variant="amber"
                  loading={busy}
                  onClick={onMarkKaza}
                  className="w-full"
                >
                  {!busy ? <Clock3 className="h-4 w-4" /> : null}
                  It was late — mark Kaza
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({
  onTime,
  kaza,
  grace,
  upcoming,
}: {
  onTime: boolean;
  kaza: boolean;
  grace: boolean;
  upcoming: boolean;
}) {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide";
  if (onTime) {
    return (
      <span className={cn(base, "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>
        <Check className="h-3 w-3" /> On time
      </span>
    );
  }
  if (kaza) {
    return (
      <span className={cn(base, "bg-amber-500/15 text-amber-800 dark:text-amber-200")}>
        <Check className="h-3 w-3" /> Kaza
      </span>
    );
  }
  if (grace) {
    return (
      <span className={cn(base, "bg-rose-500/15 text-rose-700 dark:text-rose-300")}>
        Unmarked
      </span>
    );
  }
  if (upcoming) {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>Soon</span>
    );
  }
  return (
    <span className={cn(base, "bg-teal-500/15 text-teal-800 dark:text-teal-200")}>
      Open
    </span>
  );
}

function OptionalToggle({
  label,
  active,
  disabled,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: typeof Sparkles;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-between rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition",
        active
          ? "border-teal-400/50 bg-teal-500/10 text-teal-900 dark:text-teal-100"
          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </span>
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded border",
          active ? "border-teal-500 bg-teal-500 text-white" : "border-border"
        )}
      >
        {active ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  );
}
