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
            : "Make up missed prayers from previous days. Click a date square (dd/mm/yyyy), review what was missed, and mark each Kaza as you complete it."
        }
      />

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
        </TabsList>

        <TabsContent value="today" className="space-y-6">
          <NamazTracker onChanged={bump} />
          <div className="border-t border-border pt-6">
            <NamazDashboard refreshKey={refreshKey} />
          </div>
        </TabsContent>

        <TabsContent value="kaza">
          <NamazKaza refreshKey={refreshKey} onChanged={bump} active />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
