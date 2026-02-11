"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export interface TicketCardProps {
  tier: number;
  price?: number | string;
  title?: string;
  className?: string;
  /** When provided, show receipt breakdown with CountUp for each */
  basePrice?: number;
  deposit?: number;
  total?: number;
  itemsSold?: string;
  depositLabel?: string;
  /** e.g. "Includes early entry and exclusive laminate." */
  description?: string;
  /** When set (e.g. simulation): 'high' = red (price spike), 'low' = green (price drop). */
  totalVariant?: 'high' | 'low' | null;
}

export function TicketCard({
  tier,
  price,
  title = "GENERAL ACCESS",
  className,
  basePrice,
  deposit = 0,
  total,
  itemsSold,
  depositLabel,
  description,
  totalVariant,
}: TicketCardProps) {
  const hasBreakdown = typeof total === "number";
  const displayTotal = hasBreakdown ? total : (typeof price === "number" ? price : Number(price) || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={className}
    >
      <Card className={cn("glass-panel", "bg-zinc-900/50 border-orange-500/20 backdrop-blur border shadow-glow-burnt-sm")}>
        <CardHeader className="flex flex-row items-center justify-between space-y-1">
          <CardTitle className="text-xl font-bold tracking-tighter text-white">
            {title}
          </CardTitle>
          <Badge variant={tier === 1 ? "default" : "destructive"}>
            {tier === 1 ? "VERIFIED FAN" : "HIGH RISK"}
          </Badge>
        </CardHeader>
        {description && (
          <p className="px-6 text-zinc-500 text-sm -mt-2">{description}</p>
        )}
        <CardContent className="space-y-4">
          {hasBreakdown && typeof basePrice === "number" ? (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Ticket Face Value</span>
                  <span className="font-mono text-zinc-200">
                    <CountUp value={basePrice} decimals={2} suffix=" SOL" />
                  </span>
                </div>
                <div className={cn("flex items-start justify-between text-sm")}>
                  <div>
                    <span
                      className={cn(
                        deposit > 0
                          ? "text-red-400 animate-pulse"
                          : deposit < 0
                            ? "text-emerald-400"
                            : "text-zinc-400"
                      )}
                    >
                      Dynamic Surge Pricing
                    </span>
                    <p
                      className={cn(
                        "text-xs mt-0.5",
                        deposit > 0
                          ? "text-red-500/90"
                          : deposit < 0
                            ? "text-emerald-500/90"
                            : "text-zinc-500"
                      )}
                    >
                      Demand-Based Adjustment
                      {depositLabel ? ` · ${depositLabel}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      deposit > 0
                        ? "text-red-400 animate-pulse"
                        : deposit < 0
                          ? "text-emerald-400"
                          : "text-zinc-400"
                    )}
                  >
                    <CountUp
                      value={Math.abs(deposit)}
                      decimals={2}
                      prefix={deposit > 0 ? "+" : deposit < 0 ? "-" : ""}
                      suffix=" SOL"
                    />
                  </span>
                </div>
              </div>
              <div className={cn(
                "border-t border-zinc-800 pt-3 flex items-center justify-between",
                tier === 3 && "scale-110 origin-right"
              )}>
                <span className={cn("text-sm", tier === 3 ? "text-red-400 font-medium" : "text-zinc-300")}>
                  Total Due
                </span>
                <div className={cn(
                  "text-2xl font-black font-mono",
                  tier === 3 ? "text-red-400" : totalVariant === "high" ? "text-red-400" : totalVariant === "low" ? "text-emerald-400" : "text-white"
                )}>
                  <CountUp value={displayTotal} decimals={2} />{" "}
                  <span className={cn("text-sm font-normal", tier === 3 ? "text-red-500/90" : totalVariant === "high" ? "text-red-500/90" : totalVariant === "low" ? "text-emerald-500/90" : "text-zinc-500")}>
                    SOL
                  </span>
                </div>
              </div>
              {itemsSold != null && (
                <p className="text-zinc-500 text-xs">
                  已售 {itemsSold} 张 · Demand-Based Curve
                </p>
              )}
            </>
          ) : (
            <div className="text-4xl font-black text-white font-mono">
              {typeof displayTotal === "number" ? (
                <>
                  <CountUp value={displayTotal} decimals={2} />{" "}
                  <span className="text-sm text-zinc-500">SOL</span>
                </>
              ) : (
                <>
                  {price} <span className="text-sm text-zinc-500">SOL</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
