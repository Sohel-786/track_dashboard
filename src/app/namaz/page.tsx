"use client";

import { useState } from "react";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { NamazTracker } from "@/components/namaz/NamazTracker";
import { NamazKaza, usePastKazaCount } from "@/components/namaz/NamazKaza";
import { NamazDashboard } from "@/components/namaz/NamazDashboard";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type NamazTab = "today" | "kaza" | "insights";

const TAB_COPY: Record<NamazTab, string> = {
  today:
    "Ahmedabad prayer times and today’s checklist. Every prayer of today can be recorded as prayed on time — or as Kaza — right up to midnight.",
  kaza:
    "Make up prayers from days that have already closed. Filter by date or prayer, open a day in place, and record each make-up.",
  insights:
    "On-time rate, consistency, streaks and extras — measured only over days that have finished.",
};

export default function NamazPage() {
  const [tab, setTab] = useState<NamazTab>("today");
  const [refreshKey, setRefreshKey] = useState(0);
  const pastKazaCount = usePastKazaCount(refreshKey);

  function bump() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <PageShell>
      <PageHeader title="Namaz" description={TAB_COPY[tab]} />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as NamazTab)}
        className="space-y-6"
      >
        <TabsList aria-label="Namaz sections">
          <TabsTrigger value="today">
            <span className="text-sm font-bold tracking-tight">Today</span>
            <span className="text-[10px] font-medium opacity-70">Checklist</span>
          </TabsTrigger>
          <TabsTrigger value="kaza" className="group">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold tracking-tight">
              Kaza
              {pastKazaCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-900 group-data-[state=active]:bg-amber-600 group-data-[state=active]:text-white dark:text-amber-200">
                  {pastKazaCount > 99 ? "99+" : pastKazaCount}
                </span>
              ) : null}
            </span>
            <span className="text-[10px] font-medium opacity-70">Past days</span>
          </TabsTrigger>
          <TabsTrigger value="insights">
            <span className="text-sm font-bold tracking-tight">Insights</span>
            <span className="text-[10px] font-medium opacity-70">Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <NamazTracker onChanged={bump} />
        </TabsContent>

        <TabsContent value="kaza">
          <NamazKaza refreshKey={refreshKey} onChanged={bump} active />
        </TabsContent>

        <TabsContent value="insights">
          <NamazDashboard refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
