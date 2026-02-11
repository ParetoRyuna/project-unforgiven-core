'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TicketWallet from '@/components/TicketWallet';
import { cn } from '@/lib/utils';

const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

const TICKET_STORAGE_PREFIX = 'unforgiven:ticket:';

function shortKey(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function NftWalletPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [hasTicket, setHasTicket] = useState(false);
  const walletKey = publicKey?.toBase58() ?? null;
  const skipPersistRef = useRef(false);

  useEffect(() => {
    if (!walletKey) {
      skipPersistRef.current = true;
      setHasTicket(false);
      return;
    }
    try {
      skipPersistRef.current = true;
      const stored = window.localStorage.getItem(`${TICKET_STORAGE_PREFIX}${walletKey}`);
      setHasTicket(stored === '1');
    } catch {
      setHasTicket(false);
    }
  }, [walletKey]);

  useEffect(() => {
    if (!walletKey) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      const storageKey = `${TICKET_STORAGE_PREFIX}${walletKey}`;
      if (hasTicket) {
        window.localStorage.setItem(storageKey, '1');
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage errors (privacy mode, quota, etc.).
    }
  }, [hasTicket, walletKey]);

  const handleReleaseComplete = useCallback(() => {
    setHasTicket(false);
    router.push('/resale-success');
  }, [router]);

  if (!publicKey) {
    return (
      <>
        <div
          className="fixed inset-0 bg-zinc-950 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgba(220,38,38,0.18),transparent_50%)] bg-[length:100%_100%] pointer-events-none -z-10"
          aria-hidden
        />
        <div
          className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(234,88,12,0.2),transparent)] pointer-events-none -z-10"
          aria-hidden
        />

        <main className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <Card className={cn('glass-panel', 'bg-black/60 border-white/10 w-full max-w-md')}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10">
                <Sparkles className="h-5 w-5 text-orange-300" aria-hidden />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">NFT Wallet Locked</h1>
                <p className="text-sm text-zinc-400 mt-1">Connect your wallet to view your ticket NFT.</p>
              </div>
              <WalletMultiButton className="!bg-black !text-white !font-bold !uppercase !tracking-widest !h-12 !px-6 !w-full !rounded-lg !border !border-orange-500/50 !transition-all !duration-300 hover:!bg-zinc-900 !flex !justify-center !items-center wallet-adapter-button-trigger">
                CONNECT WALLET
              </WalletMultiButton>
              <Button
                variant="ghost"
                className="w-full text-zinc-400"
                onClick={() => router.push('/')}
              >
                Back to Event
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  if (!hasTicket) {
    return (
      <>
        <div
          className="fixed inset-0 bg-zinc-950 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgba(220,38,38,0.18),transparent_50%)] bg-[length:100%_100%] pointer-events-none -z-10"
          aria-hidden
        />
        <div
          className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(234,88,12,0.2),transparent)] pointer-events-none -z-10"
          aria-hidden
        />

        <main className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <Card className={cn('glass-panel', 'bg-black/60 border-white/10 w-full max-w-md')}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-900">
                <ShieldCheck className="h-5 w-5 text-zinc-400" aria-hidden />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">No Ticket NFT Found</h1>
                <p className="text-sm text-zinc-400 mt-1">Buy a ticket to mint your access NFT.</p>
              </div>
              <Button className="w-full shadow-glow-burnt" onClick={() => router.push('/')}
              >
                Go to Ticketing
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-zinc-950 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgba(220,38,38,0.18),transparent_50%)] bg-[length:100%_100%] pointer-events-none -z-10"
        aria-hidden
      />
      <div
        className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(234,88,12,0.2),transparent)] pointer-events-none -z-10"
        aria-hidden
      />

      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              className="gap-2 text-zinc-400"
              onClick={() => router.push('/')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">NFT Wallet</div>
          </div>

          <Card className={cn('glass-panel', 'bg-black/60 border-sky-500/20 overflow-hidden')}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-sky-200/70">Access NFT</p>
                  <h1 className="mt-2 text-2xl font-black text-white">LE SSERAFIM VIP Access</h1>
                </div>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Minted
                </span>
              </div>

              <div className="holo-ticket border border-white/10 shadow-[0_0_25px_rgba(56,189,248,0.2)]">
                <div className="relative z-10 p-5">
                  <div className="flex items-center gap-2 text-xs text-slate-300/80">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden />
                    Verified holder NFT
                  </div>
                  <div className="mt-3 text-sm text-slate-200/80">
                    VIP Standing • Soundcheck • Early Entry
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] text-slate-300/70">
                    <div>
                      <p className="uppercase tracking-[0.25em] text-slate-400/60">Owner</p>
                      <p className="mt-1 font-mono text-white/90">{shortKey(walletKey ?? '')}</p>
                    </div>
                    <div className="text-right">
                      <p className="uppercase tracking-[0.25em] text-slate-400/60">Token ID</p>
                      <p className="mt-1 font-mono text-white/90">#LE-2026-889</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.25em] text-slate-400/60">Seat</p>
                      <p className="mt-1 font-semibold text-white/90">VIP Standing</p>
                    </div>
                    <div className="text-right">
                      <p className="uppercase tracking-[0.25em] text-slate-400/60">Status</p>
                      <p className="mt-1 font-semibold text-emerald-300">Active • Tradable</p>
                    </div>
                  </div>
                </div>
                <div className="holo-scanline" aria-hidden />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
              <Sparkles className="h-3 w-3" aria-hidden />
              Atomic Resale
            </div>
            <TicketWallet
              hasTicket={hasTicket}
              onReleaseComplete={handleReleaseComplete}
              ownerLabel={`You • ${shortKey(walletKey ?? '')}`}
            />
          </div>
        </motion.div>
      </main>
    </>
  );
}
