'use client';

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { ComputeBudgetProgram, PublicKey, Transaction } from '@solana/web3.js';
import {
  buildExecuteInstructions,
  fetchProtocolState,
  hexToBytes,
  normalizeSignedProofPayload,
  parseExecutionEventFromLogs,
  type ProtocolState,
  type ShieldExecutionEvent,
  type ShieldMode,
  type ShieldQuote,
  type ShieldScoreApiResponse,
  shieldQuoteFromApiResponse,
} from '@/lib/unforgiven-v2-client';

type QuoteRequestResult = {
  quote: ShieldQuote;
  warning: string | null;
};

type ExecuteResult = {
  txSignature?: string;
  event?: ShieldExecutionEvent | null;
  ticketMint?: string;
  error?: string;
};

function formatFetchError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const error = (body as { error?: unknown }).error;
    const reason = (body as { reason?: unknown }).reason;
    if (typeof error === 'string' && error.length > 0) {
      return reason && typeof reason === 'string' ? `${error} (${reason})` : error;
    }
  }
  return `shield-score failed (${status})`;
}

const DEMO_QUOTE_MODE = typeof process.env.NEXT_PUBLIC_DEMO_QUOTE_MODE === 'string'
  ? process.env.NEXT_PUBLIC_DEMO_QUOTE_MODE.toLowerCase()
  : 'live';
const USE_FIXTURE_QUOTE = DEMO_QUOTE_MODE === 'fixture';
const DEMO_INITIAL_PRICE_LAMPORTS = '200000000';
const DEMO_SALES_VELOCITY_BPS = '500';
const DEMO_TIME_ELAPSED_SECS = '1';
const GUARDED_CLAIM_DEMO_PATH = '/demo/guarded-claim';
const GUARDED_CLAIM_PRICE_CAP_LAMPORTS = 500_000_000n;

function isGuardedClaimDemo(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === GUARDED_CLAIM_DEMO_PATH;
}

async function requestShieldQuote(
  walletBase58: string,
  desiredMode: ShieldMode,
  proof: unknown,
): Promise<QuoteRequestResult> {
  const signedProofs = normalizeSignedProofPayload(proof);

  async function attempt(mode: ShieldMode): Promise<ShieldQuote> {
    const url = USE_FIXTURE_QUOTE ? '/api/demo/quote-fixture' : '/api/shield-score';
    const guardedClaimDemo = isGuardedClaimDemo();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: USE_FIXTURE_QUOTE
        ? JSON.stringify({
            wallet: walletBase58,
            ...(guardedClaimDemo
              ? {
                  initial_price: DEMO_INITIAL_PRICE_LAMPORTS,
                  sales_velocity_bps: DEMO_SALES_VELOCITY_BPS,
                  time_elapsed: DEMO_TIME_ELAPSED_SECS,
                }
              : {}),
          })
        : JSON.stringify({
            wallet: walletBase58,
            mode,
            reclaim_attestations: mode === 'verified' ? signedProofs : [],
            ...(guardedClaimDemo
              ? {
                  initial_price: DEMO_INITIAL_PRICE_LAMPORTS,
                  sales_velocity_bps: DEMO_SALES_VELOCITY_BPS,
                  time_elapsed: DEMO_TIME_ELAPSED_SECS,
                }
              : {}),
          }),
    });

    const raw = await res.text();
    let body: ShieldScoreApiResponse | Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(`${url} returned non-JSON: ${raw.slice(0, 160)}`);
    }

    if (!res.ok) {
      throw new Error(formatFetchError(res.status, body));
    }

    const quote = shieldQuoteFromApiResponse(body as ShieldScoreApiResponse, mode);
    if (guardedClaimDemo && quote.finalPriceLamports > GUARDED_CLAIM_PRICE_CAP_LAMPORTS) {
      throw new Error(
        `Guarded-claim demo quote exceeds temporary cap: ${quote.finalPriceLamports.toString()} lamports (> 0.5 SOL)`,
      );
    }
    return quote;
  }

  if (USE_FIXTURE_QUOTE) {
    return { quote: await attempt('guest'), warning: null };
  }

  if (desiredMode === 'verified') {
    try {
      return { quote: await attempt('verified'), warning: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'verified quote failed';
      return {
        quote: await attempt('guest'),
        warning: `Verified quote unavailable, fell back to guest mode: ${message}`,
      };
    }
  }

  return { quote: await attempt(desiredMode), warning: null };
}

export function useShieldFlow(programId: PublicKey | null) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [quote, setQuote] = useState<ShieldQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationWarning, setVerificationWarning] = useState<string | null>(null);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);
  const [lastExecutionEvent, setLastExecutionEvent] = useState<ShieldExecutionEvent | null>(null);
  const [protocolState, setProtocolState] = useState<ProtocolState | null>(null);

  const refreshProtocolState = useCallback(async () => {
    if (!programId) {
      setProtocolState(null);
      return null;
    }
    const nextState = await fetchProtocolState(connection, programId);
    setProtocolState(nextState);
    return nextState;
  }, [connection, programId]);

  const refreshQuote = useCallback(async (
    desiredMode: ShieldMode,
    proof: unknown,
  ): Promise<ShieldQuote | null> => {
    if (!wallet.publicKey) {
      setQuote(null);
      setVerificationWarning(null);
      setError(null);
      return null;
    }

    setQuoteLoading(true);
    setError(null);
    try {
      const result = await requestShieldQuote(wallet.publicKey.toBase58(), desiredMode, proof);
      setQuote(result.quote);
      setVerificationWarning(result.warning);
      await refreshProtocolState();
      return result.quote;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Failed to load shield quote';
      setQuote(null);
      setVerificationWarning(null);
      setError(message);
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }, [refreshProtocolState, wallet.publicKey]);

  const executeShield = useCallback(async (
    desiredMode: ShieldMode,
    proof: unknown,
  ): Promise<ExecuteResult> => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      const message = 'Wallet not connected';
      setError(message);
      return { error: message };
    }
    if (!programId) {
      const message = 'Program ID not configured';
      setError(message);
      return { error: message };
    }

    setExecuteLoading(true);
    setError(null);
    try {
      const activeQuote = (await refreshQuote(desiredMode, proof)) ?? quote;
      if (!activeQuote) {
        throw new Error('Shield quote unavailable');
      }
      if (activeQuote.blocked) {
        throw new Error('Shield policy blocked this execution for the current mode');
      }

      const nextProtocolState = (await refreshProtocolState()) ?? protocolState;
      if (!nextProtocolState?.adminConfigExists) {
        throw new Error('Admin config is missing on this cluster. Run v2 initialization first.');
      }
      if (!nextProtocolState.globalAuthority) {
        throw new Error('Global config is missing on this cluster. Run v2 initialization first.');
      }

      const payloadBytes = hexToBytes(activeQuote.payloadHex);
      const oracleSignatureBytes = hexToBytes(activeQuote.oracleSignatureHex);
      if (payloadBytes.length !== 141 || oracleSignatureBytes.length !== 64) {
        throw new Error(
          `Quote payload/signature length mismatch: payload=${payloadBytes.length} (expected 141), signature=${oracleSignatureBytes.length} (expected 64). This can cause on-chain Access violation.`,
        );
      }
      const oraclePubkeyBytes = new PublicKey(activeQuote.oraclePubkey).toBytes();
      const { ed25519Ix, executeIx, ticketMintPda } = buildExecuteInstructions({
        programId,
        userPubkey: wallet.publicKey,
        treasuryPubkey: nextProtocolState.globalAuthority,
        payloadBytes,
        oracleSignatureBytes,
        oraclePubkeyBytes,
      });

      const tx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 900_000 }),
        ed25519Ix,
        executeIx,
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signedTx = await wallet.signTransaction(tx);
      const txSignature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      await connection.confirmTransaction(
        { signature: txSignature, blockhash, lastValidBlockHeight },
        'confirmed',
      );

      const detail = await connection.getTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      const event = parseExecutionEventFromLogs(detail?.meta?.logMessages);

      setLastTxSignature(txSignature);
      setLastExecutionEvent(event);
      return { txSignature, event, ticketMint: ticketMintPda.toBase58() };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Shield execution failed';
      setError(message);
      return { error: message };
    } finally {
      setExecuteLoading(false);
    }
  }, [connection, programId, protocolState, quote, refreshProtocolState, refreshQuote, wallet]);

  return {
    quote,
    quoteLoading,
    executeLoading,
    error,
    verificationWarning,
    protocolState,
    lastTxSignature,
    lastExecutionEvent,
    refreshQuote,
    refreshProtocolState,
    executeShield,
  };
}
