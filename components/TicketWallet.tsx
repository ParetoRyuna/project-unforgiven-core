'use client';

import { useMemo, useState } from 'react';
import { Loader2, Ticket, Wallet2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { lamportsToSol, type OwnedTicketView } from '@/lib/unforgiven-v2-client';

export interface TicketWalletProps {
  tickets: OwnedTicketView[];
  actionMint?: string | null;
  onListTicket?: (ticketMint: string, askPriceSol: number) => Promise<{ error?: string }>;
  onCancelListing?: (ticketMint: string) => Promise<{ error?: string }>;
  ownerLabel?: string;
}

function shortKey(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function TicketWallet({
  tickets,
  actionMint,
  onListTicket,
  onCancelListing,
  ownerLabel,
}: TicketWalletProps) {
  const [draftByMint, setDraftByMint] = useState<Record<string, string>>({});

  const cards = useMemo(() => tickets.map((ticket) => {
    const mint = ticket.mint.toBase58();
    const suggested = lamportsToSol(ticket.lastSalePriceLamports).toFixed(3);
    return {
      ...ticket,
      mint,
      suggested,
      askValue: draftByMint[mint] ?? suggested,
    };
  }), [draftByMint, tickets]);

  if (cards.length === 0) return null;

  return (
    <div className="space-y-4">
      {cards.map((ticket) => {
        const loading = actionMint === ticket.mint;
        const listed = !!ticket.listing;
        return (
          <article
            key={ticket.mint}
            className={cn(
              'glass-panel rounded-2xl border p-5 shadow-[0_0_25px_rgba(56,189,248,0.12)]',
              listed ? 'border-emerald-400/30 bg-emerald-950/10' : 'border-white/10 bg-black/45',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-sky-200/70">
                  <Ticket className="h-3.5 w-3.5" aria-hidden />
                  On-chain Receipt
                </div>
                <h3 className="mt-2 text-xl font-black text-white">UNFORGIVEN Access Receipt</h3>
                <p className="mt-1 text-xs font-mono text-zinc-400">Mint {shortKey(ticket.mint)}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  listed ? 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-300' : 'border border-sky-400/30 bg-sky-500/10 text-sky-200',
                )}
              >
                {listed ? 'LISTED' : 'HELD'}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-[11px] text-zinc-300/80">
              <div>
                <p className="uppercase tracking-[0.24em] text-zinc-500">Owner</p>
                <p className="mt-1 font-mono text-white/90">
                  {ownerLabel ?? shortKey(ticket.currentHolder.toBase58())}
                </p>
              </div>
              <div className="text-right">
                <p className="uppercase tracking-[0.24em] text-zinc-500">Receipt</p>
                <p className="mt-1 font-mono text-white/90">{shortKey(ticket.address.toBase58())}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.24em] text-zinc-500">Primary Price</p>
                <p className="mt-1 font-semibold text-white">
                  {lamportsToSol(ticket.purchasePriceLamports).toFixed(3)} SOL
                </p>
              </div>
              <div className="text-right">
                <p className="uppercase tracking-[0.24em] text-zinc-500">Last Sale</p>
                <p className="mt-1 font-semibold text-white">
                  {lamportsToSol(ticket.lastSalePriceLamports).toFixed(3)} SOL
                </p>
              </div>
              <div>
                <p className="uppercase tracking-[0.24em] text-zinc-500">Nonce</p>
                <p className="mt-1 font-mono text-white/90">#{ticket.nonce.toString()}</p>
              </div>
              <div className="text-right">
                <p className="uppercase tracking-[0.24em] text-zinc-500">Resales</p>
                <p className="mt-1 font-semibold text-white">{ticket.resaleCount.toString()}</p>
              </div>
            </div>

            {listed && ticket.listing ? (
              <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">Live Listing</p>
                    <p className="mt-1 text-lg font-black text-white">
                      {lamportsToSol(ticket.listing.askPriceLamports).toFixed(3)} SOL
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-emerald-400/30 text-emerald-200"
                    disabled={loading || !onCancelListing}
                    onClick={() => onCancelListing?.(ticket.mint)}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Canceling...
                      </>
                    ) : (
                      'Cancel Listing'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-zinc-400">
                  <Wallet2 className="h-3.5 w-3.5" aria-hidden />
                  Create Resale Listing
                </div>
                <div className="mt-3 flex gap-3">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={ticket.askValue}
                    onChange={(event) => {
                      setDraftByMint((current) => ({
                        ...current,
                        [ticket.mint]: event.target.value,
                      }));
                    }}
                    className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
                    placeholder={ticket.suggested}
                  />
                  <Button
                    className="shadow-glow-burnt"
                    disabled={loading || !onListTicket}
                    onClick={() => {
                      const ask = Number(ticket.askValue || ticket.suggested);
                      if (!Number.isFinite(ask) || ask <= 0) return;
                      void onListTicket?.(ticket.mint, ask);
                    }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Listing...
                      </>
                    ) : (
                      'List Receipt'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
