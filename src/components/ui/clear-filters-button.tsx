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
        "h-10 shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30",
        className
      )}
    >
      <X className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
