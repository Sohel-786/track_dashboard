"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
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
import { cn } from "@/lib/utils";

type TodayPayload = NamazDayStatus & {
  schedule: NamazScheduleSnapshot;
  madhabId?: NamazMadhabId;
};

/** Today-only on-time checklist with Ahmedabad prayer windows (server clock). */
export function NamazTracker({ onChanged }: { onChanged?: () => void }) {
  const [day, setDay] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [kazaExtras, setKazaExtras] = useState<
    Record<string, { sunnah: boolean; tasbeeh: boolean }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
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

  const slotByPrayer = useMemo(() => {
    const map = new Map<string, NamazPrayerScheduleSlot>();
    for (const s of day?.schedule?.schedule ?? []) map.set(s.prayer, s);
    return map;
  }, [day]);

  const madhabId =
    day?.madhabId ?? day?.schedule?.location?.madhabId ?? "hanafi";

  async function upsert(
    prayer: NamazPrayerDay,
    patch: Partial<NamazPrayerDay>
  ) {
    const key = prayer.prayer;
    setBusyKey(key);
    try {
      const prayed = patch.prayed ?? prayer.prayed;
      const next = await api<TodayPayload>("/api/namaz", {
        method: "PUT",
        body: JSON.stringify({
          prayer: prayer.prayer,
          prayed,
          sunnah: prayed ? (patch.sunnah ?? prayer.sunnah) : false,
          tasbeeh: prayed ? (patch.tasbeeh ?? prayer.tasbeeh) : false,
        }),
      });
      setDay(next);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusyKey(null);
    }
  }

  async function markKaza(prayer: NamazPrayerDay) {
    if (!day) return;
    const key = `kaza:${prayer.prayer}`;
    setBusyKey(key);
    const extras = kazaExtras[prayer.prayer] ?? {
      sunnah: false,
      tasbeeh: false,
    };
    try {
      await api("/api/namaz/kaza", {
        method: "PUT",
        body: JSON.stringify({
          date: day.date,
          prayer: prayer.prayer,
          sunnah: extras.sunnah,
          tasbeeh: extras.tasbeeh,
        }),
      });
      const next = await api<TodayPayload>("/api/namaz");
      setDay(next);
      toast.success(`${prayer.label} marked as Kaza`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save Kaza");
    } finally {
      setBusyKey(null);
    }
  }

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
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          Today’s checklist
        </p>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight sm:text-xl">
          {day
            ? format(parseISO(`${day.date}T00:00:00`), "EEEE, MMM d")
            : "Loading…"}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Mark Fard only while the prayer window is open. After end time, use{" "}
          <span className="font-semibold text-foreground">Mark Kaza</span> on
          the card. Past-day make-ups live under the{" "}
          <span className="font-semibold text-foreground">Kaza</span> tab.
          Window rules use your saved madhab (apply from Namaz times above).
        </p>
      </div>

      {loading || !day ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading prayers...
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-800 dark:text-emerald-200">
              On time {day.prayedCount}/5
            </span>
            {day.kazaCount > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-900 dark:text-amber-200">
                Kaza today {day.kazaCount}
              </span>
            ) : null}
            {day.missedCount > 0 ? (
              <span className="rounded-full bg-rose-500/15 px-3 py-1 text-rose-800 dark:text-rose-200">
                Needs Kaza {day.missedCount}
              </span>
            ) : null}
            {day.pendingCount > 0 ? (
              <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-900 dark:text-sky-200">
                Upcoming / open {day.pendingCount}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {day.prayers.map((prayer) => (
              <PrayerCard
                key={prayer.prayer}
                prayer={prayer}
                slot={slotByPrayer.get(prayer.prayer)}
                busy={
                  busyKey === prayer.prayer ||
                  busyKey === `kaza:${prayer.prayer}`
                }
                kazaSunnah={kazaExtras[prayer.prayer]?.sunnah ?? false}
                kazaTasbeeh={kazaExtras[prayer.prayer]?.tasbeeh ?? false}
                onKazaExtraChange={(patch) =>
                  setKazaExtras((prev) => ({
                    ...prev,
                    [prayer.prayer]: {
                      sunnah:
                        patch.sunnah ?? prev[prayer.prayer]?.sunnah ?? false,
                      tasbeeh:
                        patch.tasbeeh ?? prev[prayer.prayer]?.tasbeeh ?? false,
                    },
                  }))
                }
                onTogglePrayed={() =>
                  void upsert(prayer, { prayed: !prayer.prayed })
                }
                onToggleSunnah={() => {
                  if (!prayer.prayed) {
                    void upsert(prayer, { prayed: true, sunnah: true });
                    return;
                  }
                  void upsert(prayer, { sunnah: !prayer.sunnah });
                }}
                onToggleTasbeeh={() => {
                  if (!prayer.prayed) {
                    void upsert(prayer, { prayed: true, tasbeeh: true });
                    return;
                  }
                  void upsert(prayer, { tasbeeh: !prayer.tasbeeh });
                }}
                onMarkKaza={() => void markKaza(prayer)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PrayerCard({
  prayer,
  slot,
  busy,
  kazaSunnah,
  kazaTasbeeh,
  onKazaExtraChange,
  onTogglePrayed,
  onToggleSunnah,
  onToggleTasbeeh,
  onMarkKaza,
}: {
  prayer: NamazPrayerDay;
  slot?: NamazPrayerScheduleSlot;
  busy: boolean;
  kazaSunnah: boolean;
  kazaTasbeeh: boolean;
  onKazaExtraChange: (patch: {
    sunnah?: boolean;
    tasbeeh?: boolean;
  }) => void;
  onTogglePrayed: () => void;
  onToggleSunnah: () => void;
  onToggleTasbeeh: () => void;
  onMarkKaza: () => void;
}) {
  const meta = NAMAZ_PRAYER_META[prayer.prayer as NamazPrayer];
  const onTime = prayer.status === "prayed";
  const kazaDone = prayer.status === "kaza";
  const missed = prayer.status === "missed";
  const upcoming = prayer.status === "upcoming";
  const open = prayer.status === "open" || slot?.phase === "open";
  const canToggle = Boolean(slot?.canMarkOnTime);
  const canKaza = missed && Boolean(slot?.canMarkKaza);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card shadow-sm transition",
        onTime && "border-emerald-300/70 dark:border-emerald-800",
        kazaDone && "border-amber-300/70 dark:border-amber-800",
        missed && "border-rose-300/60 dark:border-rose-900",
        open &&
          !onTime &&
          !kazaDone &&
          "border-teal-300/70 dark:border-teal-800",
        !onTime && !kazaDone && !missed && !open && "border-border"
      )}
    >
      <div className={cn("h-1.5 w-full bg-gradient-to-r", meta.accent)} />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                meta.accentSoft
              )}
            >
              {slot?.phase === "open"
                ? "Window open"
                : slot?.phase === "ended"
                  ? "Window ended"
                  : "Upcoming"}
            </p>
            <h3 className="mt-2 text-lg font-bold tracking-tight">
              {prayer.label}
            </h3>
            <p className="text-sm text-muted-foreground" dir="rtl">
              {prayer.arabic}
            </p>
          </div>
          {onTime ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              <Check className="h-3 w-3" /> On time
            </span>
          ) : kazaDone ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <Check className="h-3 w-3" /> Kaza
            </span>
          ) : missed ? (
            <span className="rounded-full bg-rose-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
              Missed
            </span>
          ) : upcoming ? (
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Soon
            </span>
          ) : (
            <span className="rounded-full bg-teal-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-800 dark:text-teal-200">
              Open
            </span>
          )}
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

        {canKaza ? (
          <div className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100">
              Window closed — pray as Kaza today
            </p>
            <div className="grid grid-cols-2 gap-2">
              <OptionalToggle
                label="Sunnah"
                active={kazaSunnah}
                disabled={busy}
                onClick={() => onKazaExtraChange({ sunnah: !kazaSunnah })}
              />
              <OptionalToggle
                label="Tasbeeh"
                active={kazaTasbeeh}
                disabled={busy}
                onClick={() => onKazaExtraChange({ tasbeeh: !kazaTasbeeh })}
                icon
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onMarkKaza}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border border-amber-500/50 bg-amber-600 px-3 py-3 text-left text-white transition hover:bg-amber-700",
                busy && "opacity-70"
              )}
            >
              <span className="text-sm font-semibold">Mark Kaza (Fard)</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/40 bg-white/15">
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </span>
            </button>
          </div>
        ) : null}

        {!canKaza ? (
          <>
            <button
              type="button"
              disabled={busy || !canToggle || kazaDone}
              onClick={onTogglePrayed}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition",
                onTime
                  ? "border-emerald-400/60 bg-emerald-500/10"
                  : kazaDone
                    ? "border-amber-400/50 bg-amber-500/10"
                    : "border-border bg-background hover:bg-muted/60",
                (!canToggle || kazaDone) && "cursor-not-allowed opacity-60"
              )}
            >
              <span className="text-sm font-semibold">
                {kazaDone ? "Completed (Kaza)" : "Prayed (Fard)"}
              </span>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md border",
                  onTime
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : kazaDone
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-border bg-card"
                )}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : onTime || kazaDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : null}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <OptionalToggle
                label="Sunnah"
                active={prayer.sunnah}
                disabled={busy || (!canToggle && !kazaDone) || kazaDone}
                onClick={onToggleSunnah}
              />
              <OptionalToggle
                label="Tasbeeh"
                active={prayer.tasbeeh}
                disabled={busy || (!canToggle && !kazaDone) || kazaDone}
                onClick={onToggleTasbeeh}
                icon
              />
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

function OptionalToggle({
  label,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition",
        active
          ? "border-teal-400/50 bg-teal-500/10 text-teal-900 dark:text-teal-100"
          : "border-border bg-background text-muted-foreground hover:bg-muted/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {icon ? <Sparkles className="h-3 w-3" /> : null}
        {label}
      </span>
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded border",
          active
            ? "border-teal-500 bg-teal-500 text-white"
            : "border-border"
        )}
      >
        {active ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  );
}
