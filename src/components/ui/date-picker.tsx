"use client";

import * as React from "react";
import { format, isValid, parseISO } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DatePickerProps = {
  value?: Date | string | null;
  /** Preferred for TrackDash ISO date fields (`yyyy-MM-dd`). */
  onChange?: (iso: string | undefined) => void;
  onDateChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** Minimum selectable calendar day as ISO `yyyy-MM-dd`. */
  minIso?: string;
  maxIso?: string;
};

function toDate(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return isValid(value) ? value : undefined;
  const parsed = parseISO(value.length === 10 ? `${value}T00:00:00` : value);
  return isValid(parsed) ? parsed : undefined;
}

function toIso(date: Date | undefined): string | undefined {
  if (!date || !isValid(date)) return undefined;
  return format(date, "yyyy-MM-dd");
}

/** Shadcn-style date picker (Popover + Calendar), ISO-friendly for filters. */
export function DatePicker({
  value,
  onChange,
  onDateChange,
  placeholder = "Pick a date",
  className,
  disabled,
  clearable = false,
  minIso,
  maxIso,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = React.useMemo(() => toDate(value), [value]);
  const minDate = React.useMemo(() => toDate(minIso), [minIso]);
  const maxDate = React.useMemo(() => toDate(maxIso), [maxIso]);

  function handleSelect(selected: Date | undefined) {
    onDateChange?.(selected);
    onChange?.(toIso(selected));
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onDateChange?.(undefined);
    onChange?.(undefined);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "relative w-full justify-start overflow-hidden pr-8 text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {date ? format(date, "dd MMM yyyy") : placeholder}
          </span>
          {clearable && date && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          initialFocus
        />
        <div className="flex items-center justify-between gap-2 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const today = new Date();
              today.setHours(12, 0, 0, 0);
              if (minDate && today < minDate) return;
              if (maxDate && today > maxDate) return;
              handleSelect(today);
            }}
          >
            Today
          </Button>
          {clearable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                onDateChange?.(undefined);
                onChange?.(undefined);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
