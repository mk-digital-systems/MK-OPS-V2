import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
