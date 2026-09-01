"use client";

import { useState } from "react";
import {
  Database,
  Gauge,
  Loader2,
  MoonStar,
  PlayCircle,
  RefreshCw,
  Ruler,
  ShieldCheck,
  Timer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FilterLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/Dialog";
import { SectionCard } from "@/components/dashboard/insight-widgets";
import { formatDay } from "@/components/map/map-shared";
import type { TrackSettingsResponse } from "@/types";

const STAY_RADIUS_OPTIONS = [40, 60, 80, 120, 200, 300];
const MIN_STAY_OPTIONS = [2, 3, 5, 10, 15, 30];
const MASJID_RADIUS_OPTIONS = [50, 100, 150, 250, 400];
const RETENTION_OPTIONS = [
  { value: 0, label: "Keep forever" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "6 months" },
  { value: 365, label: "1 year" },
];

export function MapSettingsTab({
  status,
  loading,
  onChanged,
}: {
  status: TrackSettingsResponse | null;
  loading?: boolean;
  onChanged: (next: TrackSettingsResponse) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const settings = status?.settings;
  const stats = status?.stats;

  async function save(patch: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const next = await api<TrackSettingsResponse>("/api/track/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      onChanged(next);
      toast.success(
        next.rebuiltDays
          ? `Saved · ${next.rebuiltDays} day${
              next.rebuiltDays === 1 ? "" : "s"
            } re-analysed`
          : "Saved"
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save setting"
      );
    } finally {
      setBusy(null);
    }
  }

  async function resolveNames() {
    setBusy("resolve");
    try {
      const result = await api<{ resolved: number; remaining: number }>(
        "/api/track/resolve",
        { method: "POST" }
      );
      toast.success(
        result.resolved > 0
          ? `Named ${result.resolved} stop${result.resolved === 1 ? "" : "s"}${
              result.remaining > 0 ? ` · ${result.remaining} left` : ""
            }`
          : "Nothing left to name"
      );
      const refreshed = await api<TrackSettingsResponse>("/api/track/settings");
      onChanged(refreshed);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Lookup failed"
      );
    } finally {
      setBusy(null);
    }
  }

  async function wipe() {
    setBusy("wipe");
    try {
      const next = await api<TrackSettingsResponse>("/api/track/settings", {
        method: "DELETE",
      });
      onChanged(next);
      setConfirmWipe(false);
      toast.success(
        `Deleted ${next.removed?.points ?? 0} fixes and ${
          next.removed?.visits ?? 0
        } stops`
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not delete data"
      );
    } finally {
      setBusy(null);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </>
        ) : (
          "Tracking settings are unavailable right now."
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Recording"
        description="Nothing is recorded while this is off."
      >
        <div className="space-y-1">
          <ToggleRow
            icon={ShieldCheck}
            title="Location tracking"
            description="Master switch. Turning it off also stops any tab that is still recording."
            checked={settings.enabled}
            disabled={busy === "enabled"}
            onChange={(value) => void save({ enabled: value }, "enabled")}
          />
          <ToggleRow
            icon={PlayCircle}
            title="Start automatically"
            description="Begin recording as soon as you open the Map page."
            checked={settings.autoStart}
            disabled={!settings.enabled || busy === "autoStart"}
            onChange={(value) => void save({ autoStart: value }, "autoStart")}
          />
          <ToggleRow
            icon={Gauge}
            title="High accuracy"
            description="Use GPS rather than the coarse network position. More precise, more battery."
            checked={settings.highAccuracy}
            disabled={!settings.enabled || busy === "highAccuracy"}
            onChange={(value) =>
              void save({ highAccuracy: value }, "highAccuracy")
            }
          />
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            A website cannot read your position in the background. Positions
            arrive only while the TrackDash tab or installed app is open and the
            screen is on — so open the Map before you set off, and leave it open
            for the walk.
          </span>
        </div>
      </SectionCard>

      <SectionCard
        title="What counts as a visit"
        description="Changing either of the first two re-analyses your last 30 days so the history matches."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FilterLabel>
              <Ruler className="mr-1 inline h-3 w-3" />
              Stay radius
            </FilterLabel>
            <Select
              value={String(settings.stayRadiusMeters)}
              disabled={busy === "stayRadiusMeters"}
              onValueChange={(value) =>
                void save(
                  { stayRadiusMeters: Number(value) },
                  "stayRadiusMeters"
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAY_RADIUS_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              How far your fixes may drift and still count as standing still.
              Raise it if indoor GPS keeps splitting one visit in two.
            </p>
          </div>

          <div>
            <FilterLabel>
              <Timer className="mr-1 inline h-3 w-3" />
              Minimum stay
            </FilterLabel>
            <Select
              value={String(settings.minStayMinutes)}
              disabled={busy === "minStayMinutes"}
              onValueChange={(value) =>
                void save({ minStayMinutes: Number(value) }, "minStayMinutes")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MIN_STAY_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shorter stops are treated as passing through. Lower it to catch a
              quick Fajar; raise it to stop traffic lights appearing.
            </p>
          </div>

          <div>
            <FilterLabel>
              <MoonStar className="mr-1 inline h-3 w-3" />
              Masjid radius
            </FilterLabel>
            <Select
              value={String(settings.masjidRadiusMeters)}
              disabled={busy === "masjidRadiusMeters"}
              onValueChange={(value) =>
                void save(
                  { masjidRadiusMeters: Number(value) },
                  "masjidRadiusMeters"
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MASJID_RADIUS_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              How close a stop must be to a mapped masjid to count as a visit to
              it. Only affects stops named from now on.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Your data"
        description="Everything recorded against this account."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={busy === "resolve"}
            onClick={() => void resolveNames()}
            disabled={(stats?.unresolvedVisits ?? 0) === 0}
          >
            <RefreshCw className="h-4 w-4" />
            Name pending stops
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DataFact
            icon={Database}
            label="GPS fixes"
            value={(stats?.pointCount ?? 0).toLocaleString("en-IN")}
          />
          <DataFact
            icon={MoonStar}
            label="Stops"
            value={(stats?.visitCount ?? 0).toLocaleString("en-IN")}
          />
          <DataFact
            icon={RefreshCw}
            label="Awaiting a name"
            value={String(stats?.unresolvedVisits ?? 0)}
          />
          <DataFact
            icon={Timer}
            label="Tracking since"
            value={
              stats?.firstTrackedDate ? formatDay(stats.firstTrackedDate) : "—"
            }
          />
        </div>

        <div className="mt-4 max-w-xs">
          <FilterLabel>Keep history for</FilterLabel>
          <Select
            value={String(settings.retentionDays)}
            disabled={busy === "retentionDays"}
            onValueChange={(value) =>
              void save({ retentionDays: Number(value) }, "retentionDays")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Older fixes and their stops are deleted automatically the next time
            new positions arrive.
          </p>
        </div>
      </SectionCard>

      <section className="overflow-hidden rounded-2xl border border-rose-600/30 bg-card shadow-sm dark:border-rose-400/30">
        <header className="border-b border-rose-600/20 bg-rose-500/8 px-4 py-3 dark:border-rose-400/20 sm:px-5">
          <h3 className="text-sm font-bold tracking-tight text-rose-900 dark:text-rose-200">
            Erase location history
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Removes every fix and every stop. Your prayer records are untouched.
          </p>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">
            This cannot be undone. Export anything you want to keep from the
            Journeys tab first.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmWipe(true)}
            disabled={(stats?.pointCount ?? 0) === 0}
          >
            <Trash2 className="h-4 w-4" />
            Delete everything
          </Button>
        </div>
      </section>

      <Dialog
        isOpen={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Delete all location history?"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmWipe(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={busy === "wipe"}
              onClick={() => void wipe()}
            >
              <Trash2 className="h-4 w-4" />
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {(stats?.pointCount ?? 0).toLocaleString("en-IN")} GPS fixes and{" "}
          {(stats?.visitCount ?? 0).toLocaleString("en-IN")} stops will be
          removed immediately and cannot be recovered. Your prayer checklist,
          Kaza records and category entries are not affected.
        </p>
      </Dialog>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl px-1 py-2.5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/12 text-teal-800 dark:text-teal-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </div>
  );
}

function DataFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
