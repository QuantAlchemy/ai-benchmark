import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const activeValue = value ?? internalValue;

  return (
    <TabsContext.Provider
      value={{
        value: activeValue,
        onValueChange: (next) => {
          setInternalValue(next);
          onValueChange?.(next);
        },
      }}
    >
      <div data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      role="tablist"
      className={cn("bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-md p-1", className)}
      {...props}
    />
  );
}

function TabsTrigger({ value, className, ...props }: React.ComponentProps<"button"> & { value: string }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used within Tabs");
  const active = context.value === value;

  return (
    <button
      type="button"
      data-slot="tabs-trigger"
      role="tab"
      aria-selected={active}
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-background text-foreground shadow-xs" : "hover:text-foreground",
        className,
      )}
      onClick={() => context.onValueChange(value)}
      {...props}
    />
  );
}

function TabsContent({ value, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsContent must be used within Tabs");
  if (context.value !== value) return null;

  return <div data-slot="tabs-content" role="tabpanel" className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
