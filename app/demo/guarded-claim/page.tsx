'use client';

import { useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProgramId } from '@/hooks/useProgramId';
import { useShieldFlow } from '@/hooks/useShieldFlow';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { lamportsToSol } from '@/lib/unforgiven-v2-client';

const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as string;
const showExplorerLink = process.env.NEXT_PUBLIC_DEMO_EXPLORER_LINK !== '0';
const quoteSourceLabel =
  (typeof process.env.NEXT_PUBLIC_DEMO_QUOTE_MODE === 'string' &&
   process.env.NEXT_PUBLIC_DEMO_QUOTE_MODE.toLowerCase() === 'fixture')
    ? 'Pre-signed fixture (demo stability)'
    : 'Live oracle';

const FLOW_STEPS = [
  'Request quote',
  'Receive signed payload',
  'Build transaction',
  'Ed25519 verify',
  'execute_shield',
  'On-chain result',
];

function Row({
  label,
  value,
  status,
}: { label: string; value: React.ReactNode; status?: 'ok' | 'warn' | 'err' }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-2 border-b border-zinc-800/80 last:border-0">
      <span className="text-zinc-500 text-xs uppercase tracking-wider w-36 shrink-0">{label}</span>
      <span
        className={
          status === 'ok'
            ? 'text-emerald-400 text-sm'
            : status === 'err'
              ? 'text-red-400 text-sm'
              : status === 'warn'
                ? 'text-amber-400 text-sm'
                : 'text-zinc-300 text-sm'
        }
      >
        {value}
      </span>
    </div>
  );
}

function Badge({ label, value, status }: { label: string; value: string; status?: 'ok' | 'warn' | 'err' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
        status === 'ok'
          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
          : status === 'err'
            ? 'bg-red-950/40 text-red-400 border border-red-900/50'
            : status === 'warn'
              ? 'bg-amber-950/40 text-amber-400 border border-amber-800/50'
              : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700'
      }`}
    >
      <span className="text-zinc-500">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

export default function GuardedClaimDemoPage() {
  const wallet = useWallet();
  const programId = useProgramId();
  const {
    quote,
    quoteLoading,
    executeLoading,
    error,
    protocolState,
    lastTxSignature,
    lastExecutionEvent,
    refreshQuote,
    executeShield,
  } = useShieldFlow(programId);

  useEffect(() => {
    if (!wallet.publicKey) return;
    refreshQuote('guest', null);
  }, [wallet.publicKey, refreshQuote]);

  const handleClaim = useCallback(async () => {
    await executeShield('guest', null);
  }, [executeShield]);

  const protocolReady =
    protocolState?.adminConfigExists && protocolState?.globalAuthority;
  const claimDisabled =
    executeLoading ||
    quoteLoading ||
    !quote ||
    quote.blocked ||
    !protocolReady ||
    !wallet.publicKey;

  const executionStatus = lastTxSignature
    ? 'Success'
    : executeLoading
      ? 'Submitting…'
      : error && !quoteLoading
        ? 'Failed'
        : 'Idle';

  const recordingStatus = lastTxSignature
    ? 'Success — see tx below'
    : protocolState == null
      ? 'Checking…'
      : !protocolReady
        ? 'Blocked: missing config (init chain)'
        : quoteLoading
          ? 'Quote loading…'
          : !quote && error
            ? 'Quote unavailable'
            : !quote
              ? 'Quote not ready'
              : quote.blocked
                ? 'Quote blocked (policy)'
                : showExplorerLink
                  ? 'Ready to record (devnet)'
                  : 'Local validator mode (ready)';

  const envShort = showExplorerLink ? cluster : `${cluster} (local)`;
  const quoteShort = quoteLoading ? 'loading' : quote && !quote.blocked ? 'ready' : quote?.blocked ? 'blocked' : !quote && error ? 'failed' : 'not ready';
  const protocolShort = protocolState == null ? 'checking' : protocolReady ? 'ready' : 'missing config';

  if (!wallet.publicKey) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-300">
        <header className="border-b border-zinc-800 px-6 py-3 w-full">
          <h1 className="text-lg font-semibold text-white">UNFORGIVEN Guarded Claim</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Fairness middleware · execution guardrail demo</p>
        </header>
        <main className="p-6 w-full flex-1">
          <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4 max-w-lg">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Connect</p>
            <p className="text-amber-400/90 text-sm mb-3">Wallet not connected</p>
            <WalletMultiButton className="!bg-zinc-800 !text-zinc-200 !rounded !h-10 !text-sm" />
            <p className="text-zinc-600 text-xs mt-3">
              No SOL? Use devnet faucet or airdrop to your wallet. Deployer (funded): <span className="font-mono text-zinc-500">EhTP…66gBo</span>
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-300 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 w-full shrink-0">
        <h1 className="text-lg font-semibold text-white">UNFORGIVEN Guarded Claim</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Fairness middleware · execution guardrail demo</p>
      </header>

      <main className="flex-1 p-6 w-full min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 h-full max-w-[1400px] mx-auto">
          {/* Left: Execution Console */}
          <section className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/80">
              <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Execution console</h2>
            </div>

            {/* Status bar */}
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
              {(recordingStatus.startsWith('Ready') || recordingStatus.startsWith('Local validator') || recordingStatus.startsWith('Success')) && (
                <p className="text-emerald-400 font-medium text-sm mb-2">{recordingStatus}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge label="Environment" value={envShort} status={undefined} />
                <Badge
                  label="Quote"
                  value={quoteShort}
                  status={quote && !quote.blocked ? 'ok' : !quote && error ? 'err' : quote?.blocked ? 'warn' : undefined}
                />
                <Badge
                  label="Protocol"
                  value={protocolShort}
                  status={protocolReady ? 'ok' : protocolState != null && !protocolReady ? 'warn' : undefined}
                />
                <Badge
                  label="Execution"
                  value={executionStatus.toLowerCase()}
                  status={executionStatus === 'Success' ? 'ok' : executionStatus === 'Failed' ? 'err' : undefined}
                />
              </div>
            </div>

            <div className="px-4 divide-y-0">
              <Row label="Connect" value={<WalletMultiButton className="!bg-zinc-800 !text-zinc-200 !rounded !h-9 !text-sm !inline-flex" />} />
              <Row label="Quote source" value={quoteSourceLabel} />
              <Row
                label="Quote status"
                value={
                  quoteLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Requesting…
                    </span>
                  ) : quote && !quote.blocked ? (
                    <span>
                      <span className="text-emerald-400">Quote ready</span>
                      <span className="block text-zinc-500 text-xs mt-0.5">payload + signature loaded</span>
                    </span>
                  ) : quote?.blocked ? (
                    'Blocked by policy'
                  ) : !quote && error ? (
                    <span className="text-red-400">Failed: {error}</span>
                  ) : (
                    'Not ready'
                  )
                }
                status={quote && !quote.blocked ? 'ok' : !quote && error ? 'err' : undefined}
              />
              {executionStatus === 'Failed' && error && (
                <Row
                  label="Execution error"
                  value={error}
                  status="err"
                />
              )}
            </div>

            <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/60">
              {executionStatus === 'Failed' && error && (error.includes('debit') || error.includes('prior credit') || error.includes('Insufficient')) && (
                <p className="py-2 text-amber-400/90 text-xs mb-2">
                  Devnet 钱包可能没有 SOL。请先领水：<code className="bg-zinc-800 px-1 rounded">solana airdrop 2</code>，或使用 devnet 水龙头。Deployer (有 SOL): EhTP…66gBo
                </p>
              )}
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1.5">Action</p>
              <Button
                className="w-full !bg-zinc-700 hover:!bg-zinc-600 !text-white"
                onClick={handleClaim}
                disabled={claimDisabled}
                title={claimDisabled ? (quoteLoading ? 'Waiting for quote' : !quote ? 'Quote required' : quote.blocked ? 'Quote blocked' : !protocolReady ? 'Chain not initialized' : '') : undefined}
              >
                {executeLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting…
                  </>
                ) : (
                  'Execute claim'
                )}
              </Button>
            </div>

            {/* Result area (always reserved) */}
            <div className="px-4 py-3 border-t border-zinc-800 space-y-2 min-h-[120px] bg-zinc-900/30">
              <p className="text-zinc-500 text-xs uppercase tracking-wider">Transaction signature</p>
              {lastTxSignature ? (
                <p className="font-mono text-xs text-zinc-300 break-all">{lastTxSignature}</p>
              ) : (
                <p className="text-zinc-600 text-xs">—</p>
              )}
              <p className="text-zinc-500 text-xs uppercase tracking-wider pt-1">Explorer link</p>
              {lastTxSignature && showExplorerLink ? (
                <a
                  href={`https://explorer.solana.com/tx/${lastTxSignature}?cluster=${cluster}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300"
                >
                  View on Solana Explorer →
                </a>
              ) : lastTxSignature && !showExplorerLink ? (
                <p className="text-xs text-amber-400/90">Local validator — no Explorer link</p>
              ) : (
                <p className="text-zinc-600 text-xs">—</p>
              )}
              <p className="text-zinc-500 text-xs uppercase tracking-wider pt-1">Execution cost</p>
              {lastExecutionEvent ? (
                <p className="text-zinc-300 text-xs">{lamportsToSol(lastExecutionEvent.finalPriceLamports).toFixed(4)} SOL</p>
              ) : (
                <p className="text-zinc-600 text-xs">—</p>
              )}
            </div>
          </section>

          {/* Right: Flow */}
          <section className="rounded border border-zinc-800 bg-zinc-900/40 p-4 h-fit">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-4">Flow</h2>
            <div className="space-y-4">
              {FLOW_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-800/80 text-zinc-400 text-xs font-medium">
                    {i + 1}
                  </span>
                  <p className="text-sm text-zinc-300 font-mono">{step}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
