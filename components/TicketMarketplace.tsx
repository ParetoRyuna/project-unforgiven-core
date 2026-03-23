'use client';

import { Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { lamportsToSol, type TicketListingSnapshot } from '@/lib/unforgiven-v2-client';

type TicketMarketplaceProps = {
  listings: TicketListingSnapshot[];
  currentWallet?: string | null;
  actionMint?: string | null;
  onBuyListing?: (listing: TicketListingSnapshot) => Promise<{ error?: string }>;
};

function shortKey(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function TicketMarketplace({
  listings,
  currentWallet,
  actionMint,
  onBuyListing,
}: TicketMarketplaceProps) {
  if (listings.length === 0) return null;

  return (
    <div className="space-y-3">
      {listings.map((listing) => {
        const mint = listing.mint.toBase58();
        const isOwnListing = currentWallet != null && listing.seller.toBase58() === currentWallet;
        const loading = actionMint === mint;
        return (
          <article
            key={listing.address.toBase58()}
            className="glass-panel rounded-2xl border border-orange-400/20 bg-black/45 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-orange-300/80">
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                  Resale Marketplace
                </div>
                <h3 className="mt-2 text-xl font-black text-white">LE SSERAFIM VIP Access</h3>
                <p className="mt-1 text-xs font-mono text-zinc-400">Mint {shortKey(mint)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Ask</p>
                <p className="mt-1 text-2xl font-black text-white">
                  {lamportsToSol(listing.askPriceLamports).toFixed(3)} SOL
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 text-[11px] text-zinc-400">
              <div>
                <p className="uppercase tracking-[0.22em] text-zinc-500">Seller</p>
                <p className="mt-1 font-mono text-white/90">{shortKey(listing.seller.toBase58())}</p>
              </div>
              <Button
                className="shadow-glow-burnt"
                disabled={loading || isOwnListing || !onBuyListing}
                onClick={() => onBuyListing?.(listing)}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Buying...
                  </>
                ) : isOwnListing ? (
                  'Your Listing'
                ) : (
                  'Buy Listed Ticket'
                )}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
