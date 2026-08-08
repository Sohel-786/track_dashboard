"use client";

import { useState } from "react";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { NamazTracker } from "@/components/namaz/NamazTracker";
import { NamazKaza, usePastKazaCount } from "@/components/namaz/NamazKaza";
import { NamazDashboard } from "@/components/namaz/NamazDashboard";
import { cn } from "@/lib/utils";

type NamazTab = "today" | "kaza";

export default function NamazPage() {
  const [tab, setTab] = useState<NamazTab>("today");
  const [refreshKey, setRefreshKey] = useState(0);
  const pastKazaCount = usePastKazaCount(refreshKey);

  function bump() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <PageShell>
      <PageHeader
        title="Namaz"
        description={
          tab === "today"
            ? "Ahmedabad next namaz, Madhab for times, and today’s checklist. Same-day Kaza on cards; past days under the Kaza tab."
            : "Make up missed prayers from previous days. Pick a date pill, review what was missed, and mark each Kaza as you complete it."
        }
      />

      <div
        className="flex w-full gap-1 rounded-2xl border border-border bg-muted/40 p-1 sm:w-auto sm:max-w-md"
        role="tablist"
        aria-label="Namaz sections"
      >
        <TabButton
          active={tab === "today"}
          onClick={() => setTab("today")}
          label="Today"
          hint="Checklist"
        />
        <TabButton
          active={tab === "kaza"}
          onClick={() => setTab("kaza")}
          label="Kaza"
          hint="Past days"
          badge={pastKazaCount > 0 ? pastKazaCount : undefined}
        />
      </div>

      {tab === "today" ? (
        <>
          <NamazTracker onChanged={bump} />
          <div className="border-t border-border pt-6">
            <NamazDashboard refreshKey={refreshKey} />
          </div>
        </>
      ) : (
        <NamazKaza refreshKey={refreshKey} onChanged={bump} active />
      )}
    </PageShell>
  );
}

function TabButton({
  active,
  onClick,
  label,
  hint,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl px-4 py-2 text-center transition",
        active
          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-bold tracking-tight">
        {label}
        {badge != null ? (
          <span
            className={cn(
              "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              active
                ? "bg-amber-600 text-white"
                : "bg-amber-500/20 text-amber-900 dark:text-amber-200"
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[10px] font-medium opacity-70">{hint}</span>
    </button>
  );
}
