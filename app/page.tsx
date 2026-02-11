'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { useUnforgivenProgram } from '@/hooks/useUnforgivenProgram';
import { useBuyTicket } from '@/hooks/useBuyTicket';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { calculateVrgdaPrice } from '@/app/utils/vrgda';
import InitializeButton from '@/components/InitializeButton';
import IdentityVerifier from '@/components/IdentityVerifier';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion, tapScale } from '@/components/ui/motion';
import { Loader2, LogOut } from 'lucide-react';
import { TicketCard } from '@/components/ui/ticket-card';
import TicketWallet from '@/components/TicketWallet';
import { Skeleton } from '@/components/ui/skeleton';
import { SimulationPanel } from '@/components/SimulationPanel';
import JCurveChart from '@/components/JCurveChart';
import PriceTicker from '@/components/PriceTicker';
import { cn } from '@/lib/utils';

const EVENT = {
  name: "2026 LE SSERAFIM TOUR 'FLAME RISES' IN HONG KONG",
  venue: 'AsiaWorld-Expo, Arena',
  date: 'Saturday, Oct 02, 2026 • 19:00',
  posterUrl: '/posters/lesserafim-unforgiven.png',
} as const;

const LIVE_QUEUE_AHEAD = 14_392;

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

const LAMPORTS_PER_SOL = new BN(1_000_000_000);
const STATE_REFRESH_MS = 5_000;
const DEFAULT_SOL = 1.0;
const DEMO_ITEMS_SOLD_TIER3 = '8888';
const TARGET_SALES_PER_HOUR = 500;
const TICKET_STORAGE_PREFIX = 'unforgiven:ticket:';

type AccessTier = 'fan' | 'guest' | 'scalper';

function formatSol(value: number, digits: number = 2): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(digits);
}

function lamportsToSol(lamports: BN): number {
  return Number(lamports.toString()) / LAMPORTS_PER_SOL.toNumber();
}

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
            <img
              src={EVENT.posterUrl}
              alt={EVENT.name}
              className="absolute inset-0 w-full h-full object-cover opacity-70 z-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute top-3 left-3 z-10 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
              🔴 LIMITED PRESALE
            </div>
          </div>
          <CardContent className="p-6 text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              2026 TOUR 'FLAME RISES' IN HONG KONG
            </h1>
            <p className="text-zinc-400 text-sm">{EVENT.venue}</p>
            <p className="text-zinc-500 text-xs">{EVENT.date}</p>
            <p className="text-zinc-400 text-sm">
              Connect your Solana wallet to access the exclusive presale.
            </p>
            <div className="pt-2 flex justify-center w-full">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg blur opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                <WalletMultiButton className="!bg-black !text-white !font-bold !uppercase !tracking-widest !h-14 !px-8 !w-full !rounded-lg !border !border-orange-500/50 !transition-all !duration-300 hover:!bg-zinc-900 !flex !justify-center !items-center wallet-adapter-button-trigger">
                  CONNECT TO ENTER
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
  const { connection } = useConnection();
  const { program, programId } = useUnforgivenProgram();
  const [currentTier, setCurrentTier] = useState<1 | 2 | 3 | null>(null);
  const { buyTicket, loading: buyLoading, error: buyError } = useBuyTicket();
  const [proofData, setProofData] = useState<unknown>(null);
  const [scalperMode, setScalperMode] = useState(false);
  const [nowSec, setNowSec] = useState(0);
  const [hasTicket, setHasTicket] = useState(false);
  const walletKey = publicKey?.toBase58() ?? null;

  const handleSetTier = useCallback((tier: 1 | 2 | 3 | null) => {
    setCurrentTier(tier);
    if (tier === 2 || tier === 3) setProofData(null);
  }, []);

  const [globalState, setGlobalState] = useState<{
    basePrice: BN;
    targetRateBps: BN;
    startTime: BN;
    itemsSold: BN;
  } | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const [simulatedSold, setSimulatedSold] = useState<number | null>(null);
  const [simulatedTime, setSimulatedTime] = useState<number | null>(null);

  const refreshGlobalState = useCallback(async () => {
    if (!program) return;
    setStateLoading(true);
    try {
      const [globalStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        program.programId
      );
      const account = await program.account.globalState.fetch(globalStatePda);
      setGlobalState({
        basePrice: account.basePrice as BN,
        targetRateBps: account.targetRateBps as BN,
        startTime: account.startTime as BN,
        itemsSold: account.itemsSold as BN,
      });
      setStateError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch global state';
      setGlobalState(null);
      setStateError(msg);
    } finally {
      setStateLoading(false);
    }
  }, [program]);

  useEffect(() => {
    if (!program) return;
    refreshGlobalState();
    const interval = setInterval(refreshGlobalState, STATE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [program, refreshGlobalState]);

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const interval = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!walletKey) {
      setHasTicket(false);
      return;
    }
    try {
      const stored = window.localStorage.getItem(`${TICKET_STORAGE_PREFIX}${walletKey}`);
      setHasTicket(stored === '1');
    } catch {
      setHasTicket(false);
    }
  }, [walletKey]);

  useEffect(() => {
    if (!walletKey) return;
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

  const isFan = !!proofData;
  const activeTier: AccessTier = isFan ? 'fan' : scalperMode ? 'scalper' : 'guest';
  const tierLevel = currentTier !== null ? currentTier : (isFan ? 1 : scalperMode ? 3 : 2);
  const tierBadgeLabel =
    tierLevel === 1 ? 'Tier 1: Verified Fan' : tierLevel === 2 ? 'Tier 2: Guest' : 'Tier 3: High Risk Strategy Active';
  const defaultBaseLamports = new BN(1_000_000_000);
  const faceValueLamports =
    tierLevel === 3
      ? defaultBaseLamports
      : globalState?.basePrice ?? defaultBaseLamports;
  const vrgdaQuote = faceValueLamports
    ? calculateVrgdaPrice({
        basePrice: faceValueLamports,
        targetRateBps: globalState?.targetRateBps ?? new BN(0),
        startTime: globalState?.startTime ?? new BN(0),
        itemsSold: tierLevel === 3 ? new BN(0) : (globalState?.itemsSold ?? new BN(0)),
        tierLevel,
        now: new BN(nowSec),
        customSold: simulatedSold,
        customTimeElapsedHours: simulatedTime,
      })
    : null;
  const depositLamports = vrgdaQuote?.deposit ?? new BN(0);
  const faceValueSol = faceValueLamports ? lamportsToSol(faceValueLamports) : 0;
  const depositSol = lamportsToSol(depositLamports);
  const itemsSoldDisplay =
    tierLevel === 3
      ? DEMO_ITEMS_SOLD_TIER3
      : simulatedSold != null
        ? String(simulatedSold)
        : globalState
          ? globalState.itemsSold.toString()
          : '0';
  const currentSales =
    simulatedSold != null
      ? simulatedSold
      : globalState
        ? Number(globalState.itemsSold.toString())
        : 0;
  const timeElapsedHours =
    simulatedTime != null
      ? simulatedTime
      : globalState
        ? Math.max(0, (nowSec - Number(globalState.startTime.toString())) / 3600)
        : 0;
  const targetSales = timeElapsedHours * TARGET_SALES_PER_HOUR;
  const simulationActive = simulatedSold !== null || simulatedTime !== null;
  const baselineQuote =
    simulationActive && faceValueLamports && (tierLevel === 2 || tierLevel === 3) && globalState
      ? calculateVrgdaPrice({
          basePrice: faceValueLamports,
          targetRateBps: globalState.targetRateBps,
          startTime: globalState.startTime,
          itemsSold: tierLevel === 3 ? new BN(0) : globalState.itemsSold,
          tierLevel,
          now: new BN(nowSec),
          customSold: 0,
          customTimeElapsedHours: 0,
        })
      : null;
  const baselineTotalSol =
    baselineQuote != null ? faceValueSol + lamportsToSol(baselineQuote.deposit) : 0;
  const currentTotalSol = faceValueSol + depositSol;
  const salesDelta = currentSales - targetSales;
  const totalVariant =
    simulationActive && baselineQuote != null && (tierLevel === 2 || tierLevel === 3)
      ? currentTotalSol > baselineTotalSol
        ? 'high'
        : currentTotalSol < baselineTotalSol
          ? 'low'
          : null
      : null;
  const depositLabel = depositSol === 0 ? 'Waived for Verified Fan' : 'High Risk Surcharge';
  const auctionNotStarted =
    !!stateError &&
    /account.*not|does not exist|not found|was not found/i.test(stateError);
  const buyButtonLabel = faceValueLamports
    ? `Pay ${formatSol(faceValueSol, 1)} SOL + Deposit`
    : 'Pay Face Value + Deposit';
  const animatedDepositRef = useRef(0);
  const [animatedDeposit, setAnimatedDeposit] = useState(0);

  const isBuying = buyLoading;

  const handleBuyTicket = useCallback(async () => {
    console.log('👆 Buy button clicked');

    if (!wallet.publicKey) {
      return alert('钱包已断开，请重新连接或刷新页面后再试。');
    }

    if (!program) {
      return alert('系统正在连接 Solana 节点，请稍等 2 秒后再次点击！');
    }

    try {
      const result = await buyTicket({
        connection,
        wallet,
        program,
        apiBaseUrl: '/api',
        proof: proofData ?? undefined,
        mode: scalperMode && !proofData ? 'scalper' : undefined,
      });
      if (result.txSignature) {
        setHasTicket(true);
        alert(`购票成功! TX: ${result.txSignature.slice(0, 20)}...`);
        refreshGlobalState();
      }
      if (result.error) {
        alert(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('👆 Buy ticket error:', err);
      alert(msg);
      setHasTicket(false);
    }
  }, [connected, publicKey, program, programId, connection, wallet, buyTicket, proofData, scalperMode, refreshGlobalState]);

  const handleRefund = useCallback(() => {
    setHasTicket(false);
  }, []);

  const loading = isBuying;
  const payDisabled = isBuying;
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

  const pricingReady = !stateLoading && (globalState || tierLevel === 2 || tierLevel === 3);
  const ticketHasData = pricingReady && !!vrgdaQuote;
  const ticketDefaultSol = DEFAULT_SOL;

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
                <img
                  src={EVENT.posterUrl}
                  alt={EVENT.name}
                  className="absolute inset-0 w-full h-full object-cover opacity-60 z-0"
                />
                <div className="absolute top-2 right-2 z-10 rounded-md bg-red-600 px-2 py-1 text-xs font-bold text-white shadow-lg">
                  🔴 SELLING FAST
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
                  <IdentityVerifier onVerifySuccess={setProofData} setTier={handleSetTier} />
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
                <p className="text-teal text-xs font-medium">Fan Mode (Tier 1)</p>
                <p className="text-zinc-500 text-xs mt-0.5">zkTLS 验证已通过 · 押金减免</p>
              </div>
            )}

            {/* Ticket: loading/error Card, or TicketCard (data/default) */}
            {hasTicket ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <TicketWallet hasTicket={hasTicket} onReleaseComplete={handleRefund} />
              </motion.div>
            ) : stateLoading ? (
              <Card className={cn('glass-panel', 'bg-zinc-900/50 border-zinc-800')}>
                <CardContent className="p-6 space-y-3">
                  <p className="text-zinc-400 text-xs uppercase tracking-wider">正在同步链上数据...</p>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ) : (auctionNotStarted || (!globalState && stateError)) && !(proofData || currentTier != null) ? (
              auctionNotStarted ? (
                <Card className={cn('glass-panel', 'bg-zinc-900/50 border-zinc-800')}>
                  <CardContent className="p-6 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <p className="text-zinc-500 text-xs mt-1">拍卖尚未开始 · GlobalState 尚未初始化</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className={cn('glass-panel', 'border-red-500/30 bg-red-950/20')}>
                  <CardContent className="p-6">
                    <p className="text-red-300 text-sm">链上数据同步失败</p>
                    <p className="text-red-400/80 text-xs mt-1">{stateError}</p>
                  </CardContent>
                </Card>
              )
            ) : (
              <>
                <p className={cn(
                  'text-xs font-medium px-2 py-1 rounded-md border w-fit',
                  tierLevel === 1 && 'text-emerald-400 border-emerald-600/50 bg-emerald-950/20',
                  tierLevel === 2 && 'text-zinc-400 border-zinc-600 bg-zinc-900/50',
                  tierLevel === 3 && 'text-red-400 border-red-600/50 bg-red-950/20'
                )}>
                  {tierBadgeLabel}
                </p>
                {simulationActive && (
                  <p className="text-xs font-semibold px-2 py-1 rounded-md border border-amber-500/60 bg-amber-950/40 text-amber-400 w-fit">
                    ⚠️ SIMULATION MODE
                  </p>
                )}
                {scalperMode && (
                  <p className="text-sm text-red-400/90 font-medium">
                    👥 {LIVE_QUEUE_AHEAD.toLocaleString()} people ahead of you
                  </p>
                )}
                <>
                  <TicketCard
                    tier={tierLevel}
                    title="VIP STANDING (Soundcheck Access)"
                    description="Includes early entry and exclusive laminate."
                    basePrice={ticketHasData ? faceValueSol : ticketDefaultSol}
                    deposit={ticketHasData ? animatedDeposit : 0}
                    total={ticketHasData ? faceValueSol + animatedDeposit : ticketDefaultSol}
                    itemsSold={itemsSoldDisplay}
                    depositLabel={depositLabel}
                    totalVariant={totalVariant}
                  />
                  <JCurveChart
                    currentSales={currentSales}
                    targetSales={targetSales}
                    tier={tierLevel}
                  />
                  {!proofData && (
                    <label className="flex items-center gap-2 text-sm text-zinc-400">
                      <input
                        type="checkbox"
                        checked={scalperMode}
                        onChange={(e) => setScalperMode(e.target.checked)}
                        className="rounded border-zinc-600 bg-zinc-800 text-orange-600 focus:ring-orange-500/50"
                      />
                      Scalper Mode (Tier 3)
                    </label>
                  )}

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
                        'Secure VIP Tickets'
                      )}
                    </Button>
                  </motion.div>
                  {buyError && (
                    <p className="text-red-400 text-sm">{buyError}</p>
                  )}
                </>
              </>
            )}

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
                <InitializeButton program={program} programId={programId} />
              </div>
            )}
          </motion.div>
        </motion.div>
      </main>

      <SimulationPanel
        simulatedSold={simulatedSold}
        simulatedTime={simulatedTime}
        onChange={(sold, time) => {
          setSimulatedSold(sold);
          setSimulatedTime(time);
        }}
      />
      <PriceTicker />
    </>
  );
}
