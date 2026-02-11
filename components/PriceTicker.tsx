'use client';

import { useEffect, useRef, useState } from 'react';

const FALLBACK_PRICE = 150.0;
const REFRESH_MS = 30_000;
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return FALLBACK_PRICE.toFixed(2);
  return value.toFixed(2);
}

type PriceTickerProps = {
  variant?: 'fixed' | 'inline';
};

export default function PriceTicker({ variant = 'fixed' }: PriceTickerProps) {
  const [price, setPrice] = useState<number>(FALLBACK_PRICE);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchPrice = async () => {
      try {
        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;
        const response = await fetch(COINGECKO_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('CoinGecko response not ok');
        const data = (await response.json()) as {
          solana?: { usd?: number };
        };
        const nextPrice = data?.solana?.usd;
        if (typeof nextPrice === 'number' && Number.isFinite(nextPrice)) {
          if (mounted) setPrice(nextPrice);
          return;
        }
        if (mounted) setPrice(FALLBACK_PRICE);
      } catch {
        if (mounted) setPrice(FALLBACK_PRICE);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, REFRESH_MS);

    return () => {
      mounted = false;
      inFlightRef.current?.abort();
      clearInterval(interval);
    };
  }, []);

  const wrapperClass =
    variant === 'fixed'
      ? 'fixed bottom-4 left-4 z-30 max-w-[92vw]'
      : 'w-fit';

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-200/80 shadow-lg backdrop-blur-md">
        <img
          src="/partners/coingecko-mark.png"
          alt="CoinGecko"
          className="h-4 w-4"
          loading="lazy"
        />
        <span className="text-zinc-300">Powered by CoinGecko</span>
        <span className="h-3 w-px bg-white/20" aria-hidden />
        <span className="text-white">SOL: ${formatUsd(price)}</span>
      </div>
    </div>
  );
}
