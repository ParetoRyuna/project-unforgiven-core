'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const RECEIVED_SOL = 0.95;
const PROTOCOL_FEE_RATE = 0.05;

export default function ResaleSuccessPage() {
  const router = useRouter();

  return (
    <>
      <div
        className="fixed inset-0 bg-zinc-950 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgba(16,185,129,0.18),transparent_50%)] bg-[length:100%_100%] pointer-events-none -z-10"
        aria-hidden
      />
      <div
        className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(45,212,191,0.2),transparent)] pointer-events-none -z-10"
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
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Resale Receipt</div>
          </div>

          <Card className={cn('glass-panel', 'bg-black/60 border-emerald-400/20 overflow-hidden')}>
            <CardContent className="p-6 space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">Resale Complete</h1>
                <p className="text-sm text-zinc-400 mt-1">Atomic transfer executed and funds settled.</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-left">
                <div className="flex items-center justify-between text-sm text-emerald-200">
                  <span>Funds Received</span>
                  <span className="font-mono text-white">{RECEIVED_SOL.toFixed(2)} SOL</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
                  <span>Protocol fee</span>
                  <span>{Math.round(PROTOCOL_FEE_RATE * 100)}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>Settlement</span>
                  <span>Instant</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.35em] text-emerald-300/80">
                <Sparkles className="h-3 w-3" aria-hidden />
                Receipt Stored On-Chain
              </div>
            </CardContent>
          </Card>

          <Button className="w-full shadow-glow-burnt" onClick={() => router.push('/')}
          >
            Return to Event
          </Button>
        </motion.div>
      </main>
    </>
  );
}
