"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  type AppNavItem,
  type AppNavSection,
} from "@/lib/app-nav";

type SidebarProps = {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  sidebarWidth: number;
  onNavigate?: () => void;
  isMobileDrawer?: boolean;
  navSections: AppNavSection[];
};

export function Sidebar({
  expanded,
  onExpandChange,
  sidebarWidth,
  onNavigate,
  isMobileDrawer = false,
  navSections,
}: SidebarProps) {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const showFullSidebar = isMobileDrawer || expanded || isHovered;
  const currentWidth = isMobileDrawer
    ? 280
    : expanded
      ? sidebarWidth
      : isHovered
        ? 280
        : sidebarWidth;

  const renderItem = (item: AppNavItem) => {
    const Icon = item.icon;
    const active = isNavItemActive(pathname, item.href);

    const content = (
      <span
        className={cn(
          "relative flex w-full items-center rounded-lg text-sm font-semibold transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground hover:bg-muted",
          showFullSidebar ? "gap-3 px-3 py-2.5" : "justify-center px-2 py-2.5"
        )}
        style={
          active
            ? {
                backgroundColor: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
              }
            : undefined
        }
        aria-current={active ? "page" : undefined}
      >
        {active ? (
          <span
            className="absolute inset-y-1 left-0 w-1 rounded-full bg-emerald-300"
            aria-hidden
          />
        ) : null}
        <Icon
          className="h-5 w-5 shrink-0"
          strokeWidth={active ? 2.5 : 2.25}
        />
        {showFullSidebar ? (
          <span className="truncate">{item.label}</span>
        ) : null}
      </span>
    );

    if (item.onClick) {
      return (
        <button
          type="button"
          key={item.label}
          className="w-full text-left"
          onClick={() => {
            item.onClick?.();
            onNavigate?.();
          }}
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        href={item.href!}
        key={item.href}
        onClick={() => onNavigate?.()}
        className="block"
      >
        {content}
      </Link>
    );
  };

  return (
    <aside
      className="flex h-full flex-col overflow-hidden border-r border-border bg-card shadow-lg transition-[width] duration-300"
      style={{ width: currentWidth }}
      onMouseEnter={() => !isMobileDrawer && !expanded && setIsHovered(true)}
      onMouseLeave={() => !isMobileDrawer && setIsHovered(false)}
    >
      <div
        className={cn(
          "shrink-0 border-b border-white/10",
          showFullSidebar
            ? "flex min-h-[3.5rem] items-center gap-2 py-3 pl-3 pr-2"
            : "flex min-h-[3.5rem] items-center justify-center px-2 py-2"
        )}
        /* Darkened from 28%/36%: white text needed 4.5:1 and the lighter
           emerald stop was only reaching ~3.3:1. */
        style={{
          background:
            "linear-gradient(to right, hsl(173 80% 24%), hsl(160 70% 28%))",
        }}
      >
        {showFullSidebar ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/20">
                <Activity className="h-4 w-4" />
              </span>
              <p className="min-w-0 truncate text-left text-sm font-bold leading-tight text-white">
                TrackDash
              </p>
            </div>
            {!isMobileDrawer ? (
              <button
                type="button"
                onClick={() => onExpandChange(!expanded)}
                className="shrink-0 rounded-md p-1.5 text-white hover:bg-white/20"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={() => onExpandChange(true)}
            className="rounded-md p-2 text-white hover:bg-white/20"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="app-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden py-3 pl-2 pr-1.5">
        <div className="space-y-1">
          {navSections.map((section, idx) => (
            <div
              key={section.title ?? `nav-${idx}`}
              className={idx > 0 ? "mt-2 border-t border-border pt-3" : ""}
            >
              {section.title && showFullSidebar ? (
                <p
                  className="pb-1.5 pl-3 text-[10px] font-black uppercase tracking-widest"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {section.title}
                </p>
              ) : null}
              <div className="space-y-1">
                {section.items.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}
