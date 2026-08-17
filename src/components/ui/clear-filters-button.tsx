"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** maintenX-style clear control — render only when filters are active. */
export function ClearFiltersButton({
  onClick,
  label = "Clear filters",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 border-rose-300 text-rose-700 hover:bg-rose-500/10 hover:text-rose-800 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10 dark:hover:text-rose-200",
        className
      )}
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
