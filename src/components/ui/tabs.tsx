"use client";

import * as React from "react";
import * as TabsPrimitives from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitives.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitives.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitives.List
    ref={ref}
    className={cn(
      "inline-flex h-auto w-full items-center justify-center gap-1 rounded-2xl border border-border bg-muted p-1 text-muted-foreground sm:w-auto sm:max-w-md",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitives.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitives.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-11 flex-1 flex-col items-center justify-center whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold tracking-tight ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitives.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitives.Content
    ref={ref}
    className={cn(
      "mt-0 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitives.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
