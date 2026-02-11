import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantStyles = {
  default:
    "bg-orange-600 text-white hover:bg-orange-500 border border-orange-500/30 shadow-[0_0_15px_rgba(234,88,12,0.2)]",
  outline:
    "border border-zinc-800 bg-transparent text-zinc-200 hover:bg-zinc-800/50 hover:border-zinc-700",
  ghost: "text-zinc-300 hover:bg-white/5 hover:text-white",
  destructive:
    "bg-red-950/80 text-red-400 border border-red-500/30 hover:bg-red-900/50",
};

const sizeStyles = {
  default: "h-10 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-sm",
  lg: "h-12 rounded-lg px-8 text-base",
  icon: "h-10 w-10",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
