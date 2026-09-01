"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/client-api";
import { MapLiveTab } from "@/components/map/MapLiveTab";
import { MapJourneysTab } from "@/components/map/MapJourneysTab";
import { MapPlacesTab } from "@/components/map/MapPlacesTab";
import { MapMasjidsTab } from "@/components/map/MapMasjidsTab";
import { MapSettingsTab } from "@/components/map/MapSettingsTab";
import type { TrackSettingsResponse } from "@/types";

type MapTab = "live" | "journeys" | "masjids" | "places" | "settings";

export default function MapPage() {
  const [tab, setTab] = useState<MapTab>("live");
  const [status, setStatus] = useState<TrackSettingsResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const next = await api<TrackSettingsResponse>("/api/track/settings");
      setStatus(next);
    } catch (error) {
      // A 401 already redirects to /login inside the API client.
      if (error instanceof ApiError && error.status !== 401) {
        toast.error(error.message);
      }
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const bump = useCallback(() => setRefreshKey((key) => key + 1), []);

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Map</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Where you went, how far you travelled, and how long you stayed —
          including every masjid visit.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as MapTab)}
        className="space-y-6"
      >
        <TabsList aria-label="Map sections">
          <TabsTrigger value="live">
            <span className="text-sm font-bold tracking-tight">Live</span>
          </TabsTrigger>
          <TabsTrigger value="journeys">
            <span className="text-sm font-bold tracking-tight">Journeys</span>
          </TabsTrigger>
          <TabsTrigger value="masjids">
            <span className="text-sm font-bold tracking-tight">Masjids</span>
          </TabsTrigger>
          <TabsTrigger value="places">
            <span className="text-sm font-bold tracking-tight">Places</span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <span className="text-sm font-bold tracking-tight">Settings</span>
          </TabsTrigger>
        </TabsList>

        {/*
          Only the visible tab is mounted. That matters more here than usual: a
          hidden Leaflet map measures its container as zero and would have to be
          re-measured on every switch, and a hidden Live tab would keep polling.
        */}
        <TabsContent value="live">
          <MapLiveTab
            settings={status?.settings ?? null}
            onSettingsChanged={setStatus}
            onChanged={bump}
          />
        </TabsContent>

        <TabsContent value="journeys">
          <MapJourneysTab refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="masjids">
          <MapMasjidsTab refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="places">
          <MapPlacesTab refreshKey={refreshKey} onChanged={bump} />
        </TabsContent>

        <TabsContent value="settings">
          <MapSettingsTab
            status={status}
            loading={loadingStatus}
            onChanged={setStatus}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
