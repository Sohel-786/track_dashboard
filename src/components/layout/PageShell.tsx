import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Full-bleed page shell — no max-width (ValveComplainTrace style). */
export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-page min-w-0 space-y-5 sm:space-y-6", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex w-full shrink-0 sm:w-auto [&_button]:w-full sm:[&_button]:w-auto">
          {action}
        </div>
      ) : null}
    </div>
  );
}
