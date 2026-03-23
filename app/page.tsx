'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { useUnforgivenProgram } from '@/hooks/useUnforgivenProgram';
import { useShieldFlow } from '@/hooks/useShieldFlow';
import { useTicketPortfolio } from '@/hooks/useTicketPortfolio';
import InitializeButton from '@/components/InitializeButton';
import IdentityVerifier from '@/components/IdentityVerifier';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion, tapScale } from '@/components/ui/motion';
import { Loader2, LogOut } from 'lucide-react';
import { TicketCard } from '@/components/ui/ticket-card';
import TicketWallet from '@/components/TicketWallet';
import TicketMarketplace from '@/components/TicketMarketplace';
import { Skeleton } from '@/components/ui/skeleton';
import PriceTicker from '@/components/PriceTicker';
import { cn } from '@/lib/utils';
import {
  lamportsToSol,
  normalizeSignedProofPayload,
  type ShieldMode,
} from '@/lib/unforgiven-v2-client';

const EVENT = {
  name: 'UNFORGIVEN v2',
  venue: 'VRGDA + zkTLS + on-chain fairness execution',
  date: 'Live Solana devnet demo • Guarded Claim',
  posterUrl: '/posters/lesserafim-unforgiven.png',
} as const;

const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

const WalletDisconnectButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletDisconnectButton),
  { ssr: false }
);

const DEFAULT_SOL = 1.0;

const stagger = {
  animate: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const itemEntrance = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function LandingView() {
  return (
    <motion.div
      className="w-full max-w-2xl"
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={itemEntrance} className="w-full">
        <Card className={cn('glass-panel overflow-hidden', 'bg-black/60 backdrop-blur-md border border-red-950/50')}>
          <div className="relative aspect-[3/2] w-full bg-zinc-900">
            <Image
              src={EVENT.posterUrl}
              alt={EVENT.name}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="absolute inset-0 h-full w-full object-cover opacity-70 z-0"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute top-3 left-3 z-10 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
              COLOSSEUM DEMO
            </div>
          </div>
          <CardContent className="p-6 text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              VRGDA + zkTLS, enforced on-chain
            </h1>
            <p className="text-zinc-400 text-sm">{EVENT.venue}</p>
            <p className="text-zinc-500 text-xs">{EVENT.date}</p>
            <p className="text-zinc-400 text-sm">
              Connect your wallet to run the guarded claim flow and inspect the signed execution path on Solana devnet.
            </p>
            <div className="pt-2 flex justify-center w-full">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg blur opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                <WalletMultiButton className="!bg-black !text-white !font-bold !uppercase !tracking-widest !h-14 !px-8 !w-full !rounded-lg !border !border-orange-500/50 !transition-all !duration-300 hover:!bg-zinc-900 !flex !justify-center !items-center wallet-adapter-button-trigger">
                  ENTER DEMO
                </WalletMultiButton>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const [showDebug, setShowDebug] = useState(false);
  const { program, programId } = useUnforgivenProgram();
  const [proofData, setProofData] = useState<unknown>(null);
  const [nowSec, setNowSec] = useState(0);
  const walletKey = publicKey?.toBase58() ?? null;
  const signedProofs = normalizeSignedProofPayload(proofData);
  const desiredMode: ShieldMode = signedProofs.length > 0 ? 'verified' : 'guest';
  const {
    quote,
    quoteLoading,
    executeLoading,
    error,
    verificationWarning,
    protocolState,
    lastTxSignature,
    lastExecutionEvent,
    refreshQuote,
    executeShield,
  } = useShieldFlow(programId);
  const {
    ownedTickets,
    marketListings,
    actionMint,
    error: ticketError,
    refresh: refreshPortfolio,
    listTicket,
    cancelListing,
    buyListing,
  } = useTicketPortfolio(programId);

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const interval = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!wallet.publicKey) return;
    refreshQuote(desiredMode, proofData);
    const interval = setInterval(() => {
      refreshQuote(desiredMode, proofData);
    }, 30_000);
    return () => clearInterval(interval);
  }, [desiredMode, proofData, refreshQuote, wallet.publicKey]);

  const tierLevel = desiredMode === 'verified' ? 1 : 2;
  const tierBadgeLabel = tierLevel === 1 ? 'Tier 1: Verified zkTLS' : 'Tier 2: Guest path';
  const faceValueSol = quote ? lamportsToSol(quote.initialPriceLamports) : DEFAULT_SOL;
  const depositSol = quote ? lamportsToSol(quote.surchargeLamports) : 0;
  const currentTotalSol = quote ? lamportsToSol(quote.finalPriceLamports) : DEFAULT_SOL;
  const totalVariant = tierLevel === 1 && depositSol === 0 ? 'low' : null;
  const depositLabel =
    tierLevel === 1 ? 'zkTLS-weighted fairness adjustment' : 'heat-weighted VRGDA premium';
  const quoteExpiresInSec = quote ? Math.max(0, Number(quote.attestationExpiry) - nowSec) : null;
  const quoteNotReady = !quote && quoteLoading;
  const protocolMissingAdmin = !!protocolState && !protocolState.adminConfigExists;
  const protocolMissingGlobal = !!protocolState && !protocolState.globalConfigExists;
  const ownsTicket = ownedTickets.length > 0;
  const visibleListings = marketListings.filter((listing) => listing.seller.toBase58() !== walletKey);
  const stateError = error;
  const animatedDepositRef = useRef(0);
  const [animatedDeposit, setAnimatedDeposit] = useState(0);

  const handleBuyTicket = useCallback(async () => {
    if (!wallet.publicKey) {
      return alert('钱包已断开，请重新连接或刷新页面后再试。');
    }

    if (!quote) {
      return alert('Shield quote 尚未准备好，请稍等片刻再试。');
    }

    try {
      const result = await executeShield(desiredMode, proofData);
      if (result.txSignature) {
        await Promise.all([
          refreshQuote(desiredMode, proofData),
          refreshPortfolio(),
        ]);
        const paidSol = result.event ? lamportsToSol(result.event.finalPriceLamports) : currentTotalSol;
        alert(`Execution succeeded. Shield verified the signed payload and minted the on-chain receipt.\nTX: ${result.txSignature.slice(0, 20)}...\nMint: ${result.ticketMint?.slice(0, 12) ?? 'pending'}...\nFinal Price: ${paidSol.toFixed(3)} SOL`);
      }
      if (result.error) {
        alert(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(msg);
    }
  }, [currentTotalSol, desiredMode, executeShield, proofData, quote, refreshPortfolio, refreshQuote, wallet]);

  const loading = executeLoading;
  const payDisabled =
    executeLoading ||
    quoteLoading ||
    !quote ||
    quote.blocked ||
    protocolMissingAdmin ||
    protocolMissingGlobal ||
    ownsTicket;

  useEffect(() => {
    const from = animatedDepositRef.current;
    const to = depositSol;
    if (!Number.isFinite(to) || from === to) return;
    const delta = Math.abs(to - from);
    const duration = Math.min(900, 300 + delta * 220);
    const start = performance.now();
    let frame = 0;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const value = from + (to - from) * easeOut(progress);
      animatedDepositRef.current = value;
      setAnimatedDeposit(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [depositSol]);

  const pricingReady = !!quote;
  const ticketDefaultSol = DEFAULT_SOL;
  const quoteModeHint =
    desiredMode === 'verified'
      ? 'Wallet-bound zkTLS / Reclaim proof accepted'
      : 'Guest path: no zkTLS weight applied';
  const clusterLabel = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet').toUpperCase();

  // 门禁：仅以 publicKey 为唯一依据。无 publicKey 绝不渲染 Dashboard，避免 connected=true 但 publicKey=null 的“薛定谔状态”
  if (!wallet.publicKey) {
    return (
      <>
        {/* 1. Background: Flame Rises — red/orange glow */}
        <div
          className="fixed inset-0 bg-zinc-950 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgba(220,38,38,0.18),transparent_50%)] bg-[length:100%_100%] pointer-events-none -z-10"
          aria-hidden
        />
        <div
          className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(234,88,12,0.2),transparent)] pointer-events-none -z-10"
          aria-hidden
        />

        <main className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <LandingView />
        </main>
        <PriceTicker />
      </>
    );
  }

  return (
    <>
      {/* 1. Background: Flame Rises — red/orange glow */}
      <div
        className="fixed inset-0 bg-zinc-950 bg-[radial-gradient(ellipse_80%_70%_at_50%_-10%,rgba(220,38,38,0.18),transparent_50%)] bg-[length:100%_100%] pointer-events-none -z-10"
        aria-hidden
      />
      <div
        className="fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(234,88,12,0.2),transparent)] pointer-events-none -z-10"
        aria-hidden
      />

      {/* 2. Main content: always on top, clickable */}
      <main className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
        <motion.div
          className="flex flex-col items-center gap-8 w-full max-w-md"
          variants={stagger}
          initial="initial"
          animate="animate"
        >
          {/* Event Hero — Ticketmaster-style */}
          <motion.div variants={itemEntrance} className="w-full">
            <Card className={cn('glass-panel overflow-hidden', 'bg-black/60 backdrop-blur-md border border-red-950/50')}>
              <div className="relative aspect-[3/2] w-full bg-zinc-900">
                <Image
                  src={EVENT.posterUrl}
                  alt={EVENT.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="absolute inset-0 h-full w-full object-cover opacity-60 z-0"
                  priority
                />
                <div className="absolute top-2 right-2 z-10 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white shadow-lg">
                  FULL-CHAIN DEMO
                </div>
                <div className="absolute top-3 left-3 z-10">
                  <WalletDisconnectButton className="!glass-panel !rounded-full !px-3 !py-2 !text-xs !font-semibold !text-zinc-200 hover:!text-white !bg-black/40 !border !border-white/10 !shadow-glow-burnt-sm">
                    <span className="flex items-center gap-1">
                      <LogOut className="h-3.5 w-3.5" aria-hidden />
                      Exit
                    </span>
                  </WalletDisconnectButton>
                </div>
              </div>
              <CardContent className="p-4">
                <h1 className="text-lg font-bold tracking-tight text-white line-clamp-2">
                  {EVENT.name}
                </h1>
                <p className="text-zinc-400 text-sm mt-1">{EVENT.venue}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{EVENT.date}</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Identity — always visible */}
          <motion.div variants={itemEntrance} className="w-full">
            <Card className={cn('glass-panel overflow-hidden', 'bg-black/40 backdrop-blur-md border border-white/10 shadow-glow-burnt-sm')}>
                <CardContent className="p-0">
                  <IdentityVerifier onVerifySuccess={setProofData} />
                </CardContent>
            </Card>
          </motion.div>

          {/* Ticket section — always visible */}
          <motion.div variants={itemEntrance} className="w-full space-y-3">
            {connected && (
              <p className="text-sm text-zinc-500 font-mono">
                {publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}
              </p>
            )}
            {connected && proofData && (
              <div className="rounded-lg bg-teal/10 px-4 py-2 border border-teal/30">
                <p className="text-teal text-xs font-medium">Verified mode (Tier 1)</p>
                <p className="text-zinc-500 text-xs mt-0.5">zkTLS proof accepted · lower VRGDA pressure</p>
              </div>
            )}

            {/* Ticket: loading/error Card, or TicketCard (data/default) */}
            {ownsTicket ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <TicketWallet
                  tickets={ownedTickets}
                  actionMint={actionMint}
                  onListTicket={listTicket}
                  onCancelListing={cancelListing}
                  ownerLabel={walletKey ? `${walletKey.slice(0, 8)}...${walletKey.slice(-6)}` : undefined}
                />
              </motion.div>
            ) : quoteNotReady ? (
              <Card className={cn('glass-panel', 'bg-zinc-900/50 border-zinc-800')}>
                <CardContent className="p-6 space-y-3">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">正在同步 Shield Quote...</p>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ) : stateError && !quote ? (
              <Card className={cn('glass-panel', 'border-red-500/30 bg-red-950/20')}>
                <CardContent className="p-6">
                  <p className="text-red-300 text-sm">Shield quote 获取失败</p>
                  <p className="text-red-400/80 text-xs mt-1">{stateError}</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <p className={cn(
                  'text-xs font-medium px-2 py-1 rounded-md border w-fit',
                  tierLevel === 1 && 'text-emerald-400 border-emerald-600/50 bg-emerald-950/20',
                  tierLevel === 2 && 'text-zinc-400 border-zinc-600 bg-zinc-900/50'
                )}>
                  {tierBadgeLabel}
                </p>
                <p className="text-xs text-zinc-500">{quoteModeHint}</p>
                {verificationWarning ? (
                  <p className="text-xs text-amber-400">{verificationWarning}</p>
                ) : null}
                <>
                  <TicketCard
                    tier={tierLevel}
                    title="Guarded Claim Access Receipt"
                    description="Oracle-signed VRGDA quote with zkTLS-weighted execution."
                    basePrice={pricingReady ? faceValueSol : ticketDefaultSol}
                    deposit={pricingReady ? animatedDeposit : 0}
                    total={pricingReady ? faceValueSol + animatedDeposit : ticketDefaultSol}
                    depositLabel={depositLabel}
                    totalVariant={totalVariant}
                  />
                  <Card className={cn('glass-panel', 'bg-black/40 backdrop-blur-md border border-white/10 shadow-glow-burnt-sm')}>
                    <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider">Network</p>
                        <p className="text-white font-medium">{clusterLabel}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider">Dignity</p>
                        <p className="text-white font-medium">{quote?.dignityScore ?? '--'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider">Heat</p>
                        <p className="text-white font-medium">
                          {quote ? `${Number(quote.effectiveVelocityBps) / 100}%` : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider">TTL</p>
                        <p className="text-white font-medium">
                          {quoteExpiresInSec != null ? `${quoteExpiresInSec}s` : '--'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-zinc-500 text-xs uppercase tracking-wider">Protocol</p>
                        <p className={cn(
                          'font-medium',
                          protocolMissingAdmin ? 'text-amber-400' : 'text-emerald-400'
                        )}>
                          {protocolState == null
                            ? 'Checking cluster readiness...'
                            : protocolMissingAdmin
                              ? 'Admin config missing on this cluster'
                              : protocolMissingGlobal
                                ? 'Admin config ready, global config pending'
                                : 'Ready for v2 execution'}
                        </p>
                      </div>
                      {lastTxSignature ? (
                        <div className="col-span-2">
                          <p className="text-zinc-500 text-xs uppercase tracking-wider">Last Tx (on-chain)</p>
                          <p className="font-mono text-xs text-zinc-300 break-all">{lastTxSignature}</p>
                          <a
                            href={`https://explorer.solana.com/tx/${lastTxSignature}?cluster=${(process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-orange-400 hover:text-orange-300 mt-1 inline-block"
                          >
                            View on Solana Explorer →
                          </a>
                        </div>
                      ) : null}
                      {lastExecutionEvent ? (
                        <div className="col-span-2">
                          <p className="text-zinc-500 text-xs uppercase tracking-wider">Last Final Price</p>
                          <p className="text-white font-medium">
                            {lamportsToSol(lastExecutionEvent.finalPriceLamports).toFixed(3)} SOL
                          </p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  <motion.div className="w-full" {...tapScale}>
                    <Button
                      variant="default"
                      size="lg"
                      className="w-full shadow-glow-burnt"
                      onClick={handleBuyTicket}
                      disabled={payDisabled}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Processing...
                        </>
                      ) : (
                        ownsTicket ? 'Receipt Already Held' : 'Execute Guarded Claim'
                      )}
                    </Button>
                  </motion.div>
                  {ownsTicket ? (
                    <p className="text-sm text-amber-400">This wallet already holds an on-chain receipt. List it on resale before running the claim again.</p>
                  ) : null}
                  {quote?.blocked ? (
                    <p className="text-red-400 text-sm">The current mode is marked high risk by Shield, so the chain will reject execution.</p>
                  ) : null}
                  {stateError ? <p className="text-red-400 text-sm">{stateError}</p> : null}
                </>
              </>
            )}
            {ticketError ? <p className="text-sm text-amber-400">{ticketError}</p> : null}
            {visibleListings.length > 0 ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Secondary Market Simulation</p>
                <TicketMarketplace
                  listings={visibleListings}
                  currentWallet={walletKey}
                  actionMint={actionMint}
                  onBuyListing={buyListing}
                />
              </div>
            ) : null}

          </motion.div>

          {/* Debug (Admin) — bottom, toggleable */}
          <motion.div variants={itemEntrance} className="w-full pt-4 border-t border-zinc-800/50">
            <button
              type="button"
              onClick={() => setShowDebug((d) => !d)}
              className="text-xs text-zinc-500 hover:text-zinc-400"
            >
              {showDebug ? '▼ Hide Debug' : '▶ Debug'}
            </button>
            {showDebug && (
              <div className="mt-2 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">管理员操作区</p>
                <InitializeButton
                  program={program}
                  programId={programId}
                  onInitialized={async () => {
                    await Promise.all([
                      refreshQuote(desiredMode, proofData),
                      refreshPortfolio(),
                    ]);
                  }}
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      </main>
      <PriceTicker />
    </>
  );
}
