import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const variantStyles = {
  default:
    "bg-orange-600/90 text-white border-orange-500/40 shadow-[0_0_10px_rgba(234,88,12,0.3)]",
  secondary: "bg-zinc-800 text-zinc-300 border-zinc-700",
  destructive:
    "bg-red-950/80 text-red-400 border-red-500/40",
  outline: "border border-zinc-700 text-zinc-400 bg-transparent",
};

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
