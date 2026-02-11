'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import { computeVrgdaFinalPriceSol } from '@/app/utils/vrgda';
import { cn } from '@/lib/utils';

type JCurveChartProps = {
  currentSales: number;
  targetSales: number;
  tier: 1 | 2 | 3;
  basePriceSol?: number;
  variant?: 'full' | 'mini';
  className?: string;
};

const DATA_POINTS = 50;

function buildChartData(
  currentSales: number,
  targetSales: number,
  tier: 1 | 2 | 3,
  basePriceSol: number
) {
  const maxSales = Math.max(10, Math.ceil(Math.max(currentSales, targetSales) * 1.4));
  const step = maxSales / (DATA_POINTS - 1);

  return Array.from({ length: DATA_POINTS }, (_, index) => {
    const sales = Number((index * step).toFixed(2));
    return {
      sales,
      price: Number(computeVrgdaFinalPriceSol({
        basePriceSol,
        sales,
        target: targetSales,
        tierLevel: tier,
      }).toFixed(4)),
    };
  });
}

export default function JCurveChart({
  currentSales,
  targetSales,
  tier,
  basePriceSol = 1,
  variant = 'full',
  className,
}: JCurveChartProps) {
  const safeBase = Number.isFinite(basePriceSol) ? basePriceSol : 1;
  const data = buildChartData(currentSales, targetSales, tier, safeBase);
  const currentPrice = computeVrgdaFinalPriceSol({
    basePriceSol: safeBase,
    sales: currentSales,
    target: targetSales,
    tierLevel: tier,
  });
  const strokeColor = tier === 3 ? '#ef4444' : tier === 1 ? '#22c55e' : '#f97316';
  const isMini = variant === 'mini';

  return (
    <div
      className={cn(
        isMini
          ? 'h-full w-full'
          : 'glass-panel rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4',
        className
      )}
    >
      {!isMini && (
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs uppercase tracking-wider text-zinc-400">VRGDA J-Curve</p>
          <p className="text-xs text-zinc-500">Price vs. Sales</p>
        </div>
      )}
      <div className={cn(isMini ? 'h-full w-full' : 'h-52 w-full')}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={isMini ? { top: 4, right: 2, left: 0, bottom: 0 } : { top: 8, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="burntOrangeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={isMini ? 0.35 : 0.55} />
                <stop offset="95%" stopColor="#ea580c" stopOpacity={isMini ? 0.02 : 0.05} />
              </linearGradient>
            </defs>
            {!isMini && (
              <>
                <XAxis
                  dataKey="sales"
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(value) => `${Number(value).toFixed(2)}`}
                />
                <Tooltip
                  formatter={(value: number) => `${Number(value).toFixed(2)} SOL`}
                  labelFormatter={(value) => `Sales: ${value}`}
                  contentStyle={{
                    background: 'rgba(9, 9, 11, 0.85)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#e4e4e7',
                    fontSize: '12px',
                  }}
                />
              </>
            )}
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={isMini ? 2 : 2.5}
              fill="url(#burntOrangeFill)"
              fillOpacity={1}
            />
            {!isMini && (
              <ReferenceDot
                x={currentSales}
                y={currentPrice}
                r={5}
                fill="#f8fafc"
                stroke={strokeColor}
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
