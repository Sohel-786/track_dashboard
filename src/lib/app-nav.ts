import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListChecks,
  Tags,
  Users,
} from "lucide-react";
import type { AuthUser } from "@/types";

export type AppNavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
};

export type AppNavSection = {
  title?: string;
  items: AppNavItem[];
};

export function buildAppNavSections(user: AuthUser | null): AppNavSection[] {
  const main: AppNavSection = {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/entries", label: "Entries", icon: ListChecks },
    ],
  };

  const masters: AppNavSection = {
    title: "Master",
    items: [{ href: "/categories", label: "Categories", icon: Tags }],
  };

  if (user?.role === "admin") {
    masters.items.push({ href: "/users", label: "Users", icon: Users });
  }

  return [main, masters];
}

export function isNavItemActive(pathname: string, href?: string) {
  if (!href) return false;
  const path = href.replace(/\/$/, "") || "/";
  const current = pathname.replace(/\/$/, "") || "/";
  if (current === path) return true;
  if (path !== "/" && current.startsWith(`${path}/`)) return true;
  return false;
}
