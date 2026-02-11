'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SALES_MIN = 0;
const SALES_MAX = 20000;
const TIME_MIN = 0;
const TIME_MAX = 48;

export interface SimulationPanelProps {
  /** Current simulated sales. null = use real chain data. */
  simulatedSold: number | null;
  /** Current simulated time elapsed in hours (0–48). null = use real chain data. */
  simulatedTime: number | null;
  /** Target sales derived from chain params and time. */
  targetSales: number;
  /** Current chain items sold (for display when simulation is off). */
  chainSales: number;
  /** Called when user changes sliders. (sold, time) — pass null to reset to real. */
  onChange: (sold: number | null, time: number | null) => void;
  className?: string;
}

export function SimulationPanel({
  simulatedSold,
  simulatedTime,
  targetSales,
  chainSales,
  onChange,
  className,
}: SimulationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const sold = simulatedSold ?? chainSales;
  const time = simulatedTime ?? 0;
  const salesDelta = sold - targetSales;

  const handleSoldChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextSold = Number(e.target.value);
      onChange(nextSold, simulatedTime);
    },
    [onChange, simulatedTime]
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      onChange(simulatedSold, v);
    },
    [onChange, simulatedSold]
  );

  const handleReset = useCallback(() => {
    onChange(null, null);
  }, [onChange]);

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md shadow-xl transition-all duration-200',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-zinc-200 hover:bg-white/5 rounded-t-xl"
      >
        <span className="flex items-center gap-2">
          <span className="text-amber-400">⛓</span>
          Chain Simulator
        </span>
        {collapsed ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-white/10">
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Simulated Sales (0–20,000)</span>
              <span className="font-mono text-amber-400/90">
                {Math.round(sold).toLocaleString()}
              </span>
            </label>
            <input
              type="range"
              min={SALES_MIN}
              max={SALES_MAX}
              value={Math.max(SALES_MIN, Math.min(SALES_MAX, sold))}
              onChange={handleSoldChange}
              className="w-full h-2 rounded-full appearance-none bg-zinc-700 accent-amber-500"
            />
            <div className="text-[10px] text-zinc-500">
              Δ vs target: {salesDelta >= 0 ? '+' : ''}{Math.round(salesDelta).toLocaleString()} (target {Math.round(targetSales).toLocaleString()})
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Time Elapsed (0–48h)</span>
              <span className="font-mono text-emerald-400/90">{time}h</span>
            </label>
            <input
              type="range"
              min={TIME_MIN}
              max={TIME_MAX}
              value={time}
              onChange={handleTimeChange}
              className="w-full h-2 rounded-full appearance-none bg-zinc-700 accent-emerald-500"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to demo chain data
          </Button>
        </div>
      )}
    </div>
  );
}
