"use client";

import { Activity, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AuthUser } from "@/types";
import { cn } from "@/lib/utils";

type HeaderProps = {
  user: AuthUser;
  onToggleMobile?: () => void;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function Header({ user, onToggleMobile }: HeaderProps) {
  const { logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-teal-900/20 bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 px-3 text-white shadow-md sm:h-16 sm:px-4 lg:h-[4.25rem] lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {onToggleMobile ? (
          <button
            type="button"
            onClick={onToggleMobile}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white shadow-sm transition hover:bg-white/10 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}

        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:h-10 sm:w-10">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight sm:text-base">
              TrackDash
            </p>
            <p className="hidden truncate text-[11px] text-white/70 sm:block">
              Personal progress tracker
            </p>
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <ThemeToggle variant="onDark" />

        <div className="hidden h-8 w-px bg-white/15 sm:block" />

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-bold ring-1 ring-white/25 sm:h-10 sm:w-10 sm:text-sm"
            )}
            aria-hidden
          >
            {initials(user.name)}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold leading-tight">
              {user.name}
            </p>
            <p className="truncate text-[11px] capitalize text-white/70">
              {user.role} · @{user.username}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300/40 bg-rose-500/15 px-2.5 text-xs font-bold text-white transition hover:bg-rose-500/25 sm:px-3"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
