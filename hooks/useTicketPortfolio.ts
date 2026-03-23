'use client';

import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  buildCancelTicketListingInstruction,
  buildFillTicketListingInstruction,
  buildListTicketInstruction,
  fetchActiveListings,
  fetchOwnedTickets,
  fetchProtocolState,
  solToLamports,
  type OwnedTicketView,
  type TicketListingSnapshot,
} from '@/lib/unforgiven-v2-client';

type PortfolioActionResult = {
  signature?: string;
  error?: string;
};

async function sendWalletTransaction(input: {
  connection: ReturnType<typeof useConnection>['connection'];
  wallet: ReturnType<typeof useWallet>;
  instructions: Transaction['instructions'];
}): Promise<string> {
  const { connection, wallet, instructions } = input;
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  const tx = new Transaction();
  for (const instruction of instructions) tx.add(instruction);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  });

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return signature;
}

export function useTicketPortfolio(programId: PublicKey | null) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [ownedTickets, setOwnedTickets] = useState<OwnedTicketView[]>([]);
  const [marketListings, setMarketListings] = useState<TicketListingSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMint, setActionMint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!programId) {
      setOwnedTickets([]);
      setMarketListings([]);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const [tickets, listings] = await Promise.all([
        wallet.publicKey ? fetchOwnedTickets(connection, programId, wallet.publicKey) : Promise.resolve([]),
        fetchActiveListings(connection, programId),
      ]);
      setOwnedTickets(tickets);
      setMarketListings(listings);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load ticket portfolio');
    } finally {
      setLoading(false);
    }
  }, [connection, programId, wallet.publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const listTicket = useCallback(async (
    ticketMint: string,
    askPriceSol: number,
  ): Promise<PortfolioActionResult> => {
    if (!programId || !wallet.publicKey) {
      return { error: 'Wallet not connected' };
    }

    setActionMint(ticketMint);
    setError(null);
    try {
      const { listIx } = buildListTicketInstruction({
        programId,
        sellerPubkey: wallet.publicKey,
        ticketMint: new PublicKey(ticketMint),
        askPriceLamports: solToLamports(askPriceSol),
      });
      const signature = await sendWalletTransaction({
        connection,
        wallet,
        instructions: [listIx],
      });
      await refresh();
      return { signature };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to list ticket';
      setError(message);
      return { error: message };
    } finally {
      setActionMint(null);
    }
  }, [connection, programId, refresh, wallet]);

  const cancelListing = useCallback(async (ticketMint: string): Promise<PortfolioActionResult> => {
    if (!programId || !wallet.publicKey) {
      return { error: 'Wallet not connected' };
    }

    setActionMint(ticketMint);
    setError(null);
    try {
      const cancelIx = buildCancelTicketListingInstruction({
        programId,
        sellerPubkey: wallet.publicKey,
        ticketMint: new PublicKey(ticketMint),
      });
      const signature = await sendWalletTransaction({
        connection,
        wallet,
        instructions: [cancelIx],
      });
      await refresh();
      return { signature };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to cancel listing';
      setError(message);
      return { error: message };
    } finally {
      setActionMint(null);
    }
  }, [connection, programId, refresh, wallet]);

  const buyListing = useCallback(async (
    listing: TicketListingSnapshot,
  ): Promise<PortfolioActionResult> => {
    if (!programId || !wallet.publicKey) {
      return { error: 'Wallet not connected' };
    }

    setActionMint(listing.mint.toBase58());
    setError(null);
    try {
      const protocolState = await fetchProtocolState(connection, programId);
      if (!protocolState.globalAuthority) {
        throw new Error('Protocol treasury is missing on this cluster');
      }

      const fillIx = buildFillTicketListingInstruction({
        programId,
        buyerPubkey: wallet.publicKey,
        sellerPubkey: listing.seller,
        feeRecipientPubkey: protocolState.globalAuthority,
        ticketMint: listing.mint,
      });
      const signature = await sendWalletTransaction({
        connection,
        wallet,
        instructions: [fillIx],
      });
      await refresh();
      return { signature };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to buy listed ticket';
      setError(message);
      return { error: message };
    } finally {
      setActionMint(null);
    }
  }, [connection, programId, refresh, wallet]);

  return {
    ownedTickets,
    marketListings,
    loading,
    actionMint,
    error,
    refresh,
    listTicket,
    cancelListing,
    buyListing,
  };
}
