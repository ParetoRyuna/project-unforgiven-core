'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TicketWallet from '@/components/TicketWallet';
import TicketMarketplace from '@/components/TicketMarketplace';
import { useUnforgivenProgram } from '@/hooks/useUnforgivenProgram';
import { useTicketPortfolio } from '@/hooks/useTicketPortfolio';
import { cn } from '@/lib/utils';

const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

function shortKey(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function NftWalletPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { programId } = useUnforgivenProgram();
  const {
    ownedTickets,
    marketListings,
    actionMint,
    error,
    listTicket,
    cancelListing,
    buyListing,
  } = useTicketPortfolio(programId);
  const walletKey = publicKey?.toBase58() ?? null;
  const visibleListings = marketListings.filter((listing) => listing.seller.toBase58() !== walletKey);

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
                <h1 className="text-xl font-bold text-white">Ticket Wallet Locked</h1>
                <p className="text-sm text-zinc-400 mt-1">Connect your wallet to inspect on-chain tickets.</p>
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
          className="w-full max-w-3xl space-y-6"
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
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">On-chain Wallet</div>
          </div>

          <Card className={cn('glass-panel', 'bg-black/60 border-sky-500/20 overflow-hidden')}>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-sky-200/70">Ticket Portfolio</p>
                  <h1 className="mt-2 text-2xl font-black text-white">LE SSERAFIM VIP Access</h1>
                </div>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {ownedTickets.length > 0 ? 'Owned' : 'Watching'}
                </span>
              </div>
              <div className="grid gap-3 text-[11px] text-zinc-400 md:grid-cols-3">
                <div>
                  <p className="uppercase tracking-[0.24em] text-zinc-500">Wallet</p>
                  <p className="mt-1 font-mono text-white/90">{shortKey(walletKey ?? '')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.24em] text-zinc-500">Owned Tickets</p>
                  <p className="mt-1 text-white font-semibold">{ownedTickets.length}</p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.24em] text-zinc-500">Live Listings</p>
                  <p className="mt-1 text-white font-semibold">{visibleListings.length}</p>
                </div>
              </div>
              {error ? <p className="text-sm text-amber-400">{error}</p> : null}
            </CardContent>
          </Card>

          {ownedTickets.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Your Tickets
              </div>
              <TicketWallet
                tickets={ownedTickets}
                actionMint={actionMint}
                onListTicket={listTicket}
                onCancelListing={cancelListing}
                ownerLabel={`You • ${shortKey(walletKey ?? '')}`}
              />
            </div>
          ) : (
            <Card className={cn('glass-panel', 'bg-black/60 border-white/10')}>
              <CardContent className="p-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-900">
                  <ShieldCheck className="h-5 w-5 text-zinc-400" aria-hidden />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">No On-chain Ticket Yet</h2>
                  <p className="text-sm text-zinc-400 mt-1">Buy from primary sale or grab one from the resale market below.</p>
                </div>
                <Button className="w-full shadow-glow-burnt" onClick={() => router.push('/')}>
                  Go to Ticketing
                </Button>
              </CardContent>
            </Card>
          )}

          {visibleListings.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
                <Sparkles className="h-3 w-3" aria-hidden />
                Live Resale Market
              </div>
              <TicketMarketplace
                listings={visibleListings}
                currentWallet={walletKey}
                actionMint={actionMint}
                onBuyListing={buyListing}
              />
            </div>
          ) : null}
        </motion.div>
      </main>
    </>
  );
}
