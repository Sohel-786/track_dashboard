"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useIsBelowLg } from "@/hooks/use-media-query";
import { buildAppNavSections } from "@/lib/app-nav";
import { cn } from "@/lib/utils";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import type { AuthUser } from "@/types";

const COLLAPSED_W = 64;
const EXPANDED_W = 280;

function readSidebarPinned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("trackdash.sidebarPinned") === "1";
  } catch {
    return false;
  }
}

export function AppChrome({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const isBelowLg = useIsBelowLg();
  const [sidebarPinned, setSidebarPinned] = useState(readSidebarPinned);
  const [mobileOpen, setMobileOpen] = useState(false);

  /** Drawer only mounts open on small screens — no sync effect needed. */
  const drawerOpen = isBelowLg && mobileOpen;

  const handleSidebarExpand = (expanded: boolean) => {
    setSidebarPinned(expanded);
    try {
      localStorage.setItem(
        "trackdash.sidebarPinned",
        expanded ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  };

  const navSections = useMemo(() => buildAppNavSections(user), [user]);

  const layoutWidth = sidebarPinned ? EXPANDED_W : COLLAPSED_W;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <AnimatePresence>
        {drawerOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[49] bg-black/60 backdrop-blur-md lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <div
        className="hidden shrink-0 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] lg:block"
        style={{ width: layoutWidth }}
        aria-hidden
      />

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
          drawerOpen
            ? "pointer-events-auto max-lg:translate-x-0"
            : "pointer-events-none max-lg:-translate-x-full",
          "max-lg:shadow-2xl lg:pointer-events-auto lg:translate-x-0"
        )}
        aria-hidden={isBelowLg && !mobileOpen}
      >
        <Sidebar
          expanded={isBelowLg ? true : sidebarPinned}
          isMobileDrawer={isBelowLg}
          navSections={navSections}
          onExpandChange={handleSidebarExpand}
          sidebarWidth={
            isBelowLg ? EXPANDED_W : sidebarPinned ? EXPANDED_W : COLLAPSED_W
          }
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          onToggleMobile={() => setMobileOpen((o) => !o)}
        />
        {/* Page sits one step behind cards so every panel reads as raised. */}
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
