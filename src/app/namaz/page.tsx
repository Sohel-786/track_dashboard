"use client";

import { useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { NamazTracker } from "@/components/namaz/NamazTracker";
import { NamazKaza, usePastKazaCount } from "@/components/namaz/NamazKaza";
import { NamazDashboard } from "@/components/namaz/NamazDashboard";
import { NamazNotifications } from "@/components/namaz/NamazNotifications";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type NamazTab = "today" | "kaza" | "insights";

export default function NamazPage() {
  const [tab, setTab] = useState<NamazTab>("today");
  const [refreshKey, setRefreshKey] = useState(0);
  const pastKazaCount = usePastKazaCount(refreshKey);

  function bump() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Namaz</h1>

      <NamazNotifications />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as NamazTab)}
        className="space-y-6"
      >
        <TabsList aria-label="Namaz sections">
          <TabsTrigger value="today">
            <span className="text-sm font-bold tracking-tight">Today</span>
          </TabsTrigger>
          <TabsTrigger value="kaza" className="group">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold tracking-tight">
              Kaza
              {pastKazaCount > 0 ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-900 group-data-[state=active]:bg-amber-700 group-data-[state=active]:text-white dark:bg-amber-400/20 dark:text-amber-200 dark:group-data-[state=active]:bg-amber-400 dark:group-data-[state=active]:text-amber-950">
                  {pastKazaCount > 99 ? "99+" : pastKazaCount}
                </span>
              ) : null}
            </span>
          </TabsTrigger>
          <TabsTrigger value="insights">
            <span className="text-sm font-bold tracking-tight">Insights</span>
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
