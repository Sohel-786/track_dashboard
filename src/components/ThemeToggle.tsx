"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  variant = "default",
}: {
  variant?: "default" | "onDark";
}) {
  const { theme, setTheme } = useTheme();
  const onDark = variant === "onDark";

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        onDark
          ? "border border-white/15 bg-white/5 text-white hover:bg-white/15"
          : "border border-border bg-background hover:bg-accent hover:text-accent-foreground"
      )}
      aria-label="Toggle theme"
    >
      <Sun
        className={cn(
          "h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0",
          onDark && "text-white"
        )}
      />
      <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}
