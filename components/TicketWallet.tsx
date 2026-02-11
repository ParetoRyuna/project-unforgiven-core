"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SwapStatus = "idle" | "scanning" | "match" | "swap" | "success";

type ToastTone = "info" | "success";

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface TicketWalletProps {
  hasTicket: boolean;
  onReleaseComplete?: () => void;
  priceSol?: number;
  feeRate?: number;
  ownerLabel?: string;
}

const MATCHED_BUYER = "8x...F2a";
const QUEUE_POSITION = 1;
const DEFAULT_PRICE = 1.0;
const DEFAULT_FEE_RATE = 0.05;

function formatSol(value: number, digits: number = 2): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(digits);
}

export default function TicketWallet({
  hasTicket,
  onReleaseComplete,
  priceSol = DEFAULT_PRICE,
  feeRate = DEFAULT_FEE_RATE,
  ownerLabel = "You • 0xA1..9B3",
}: TicketWalletProps) {
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cardVisible, setCardVisible] = useState(true);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const timeoutRef = useRef<number[]>([]);
  const toastIdRef = useRef(0);

  const feeSol = useMemo(() => priceSol * feeRate, [priceSol, feeRate]);
  const receivedSol = useMemo(() => priceSol - feeSol, [priceSol, feeSol]);
  const showMatchBadge = status === "match" || status === "swap";

  const clearTimers = useCallback(() => {
    timeoutRef.current.forEach((id) => window.clearTimeout(id));
    timeoutRef.current = [];
  }, []);

  const pushTimer = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutRef.current.push(id);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone, duration = 1400) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToast({ id, message, tone });
    pushTimer(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, duration);
  }, [pushTimer]);

  const resetFlow = useCallback(() => {
    clearTimers();
    setStatus("idle");
    setToast(null);
    setCardVisible(true);
  }, [clearTimers]);

  const handleRelease = useCallback(() => {
    if (status !== "idle") return;
    setStatus("scanning");

    pushTimer(() => {
      setStatus("match");
      showToast(`Match confirmed · Buyer ${MATCHED_BUYER} (Queue #${QUEUE_POSITION})`, "success", 1400);
    }, 1000);

    pushTimer(() => {
      setStatus("swap");
    }, 2000);

    pushTimer(() => {
      setStatus("success");
      showToast(
        `+${formatSol(receivedSol)} SOL received (${Math.round(feeRate * 100)}% protocol fee).`,
        "success",
        1800
      );
      setCardVisible(false);
    }, 3000);

    pushTimer(() => {
      onReleaseComplete?.();
      resetFlow();
    }, 3600);
  }, [status, showToast, pushTimer, onReleaseComplete, resetFlow]);

  useEffect(() => {
    if (!hasTicket) {
      resetFlow();
    }
  }, [hasTicket, resetFlow]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  if (!hasTicket) return null;

  const isBusy = status !== "idle";
  const buttonLabel =
    status === "scanning"
      ? "🔍 Scanning Waitlist..."
      : status === "swap"
        ? "⚡ Executing Atomic Swap..."
        : "Release to Waitlist (Atomic Swap)";

  return (
    <div className="relative w-full max-w-md space-y-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "absolute -top-2 left-1/2 z-20 w-[95%] -translate-x-1/2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md",
              toast.tone === "success"
                ? "border-emerald-400/40 bg-emerald-950/70 text-emerald-200"
                : "border-sky-400/30 bg-sky-950/70 text-sky-200"
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {cardVisible && (
          <motion.div
            key="ticket-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="group"
          >
            <div className="holo-ticket border border-white/10 shadow-[0_0_25px_rgba(56,189,248,0.15)]">
              <div className="relative z-10 p-6">
                <AnimatePresence>
                  {showMatchBadge && (
                    <motion.div
                      key="match-badge"
                      initial={{ opacity: 0, y: -6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.96 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="absolute right-5 top-16 rounded-2xl border border-emerald-300/30 bg-emerald-950/60 px-3 py-2 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.35)] backdrop-blur-md"
                    >
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.22em]">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        Match Found
                      </div>
                      <div className="mt-0.5 text-[10px] text-emerald-200/80 font-mono">
                        Buyer {MATCHED_BUYER}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-sky-200/70">P2P Atomic Swap</p>
                    <h3 className="mt-2 text-2xl font-black text-white tracking-tight">
                      LE SSERAFIM VIP Access
                    </h3>
                  </div>
                  <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                    HOLOGRAPHIC
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-slate-200/80">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-slate-300/60">Asset</p>
                    <p className="mt-1 font-semibold text-white">VIP Standing • Soundcheck</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-slate-300/60">Queue</p>
                    <p className="mt-1 font-semibold text-white">50,000+ demand</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-slate-300/60">Owner</p>
                    <p className="mt-1 font-mono text-white/90">{ownerLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-slate-300/60">Status</p>
                    <p className="mt-1 font-semibold text-emerald-300">Held • Tradable</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-slate-300/70">
                  <span>Atomic Swap</span>
                  <button
                    type="button"
                    onClick={() => setShowTechDetails((s) => !s)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold text-slate-200/80 hover:text-white"
                  >
                    {showTechDetails ? "Hide Details" : "Tech Details"}
                  </button>
                </div>
                {showTechDetails && (
                  <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.25em] text-slate-300/60">Protocol Fee</p>
                      <p className="mt-2 text-xs text-white/80">
                        Price: {formatSol(priceSol)} SOL - Fee: {formatSol(feeSol)} SOL = You get:{" "}
                        <span className="font-semibold text-emerald-300">{formatSol(receivedSol)} SOL</span>
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-slate-300/80">
                      <p className="font-semibold text-white">Matching Engine</p>
                      <p className="mt-1">
                        High demand detected. Order routed to waitlist queue for instant fulfillment.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="holo-scanline" aria-hidden />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div whileTap={{ scale: 0.98 }}>
        <Button
          size="lg"
          className="w-full shadow-glow-burnt disabled:opacity-70"
          onClick={handleRelease}
          disabled={isBusy}
        >
          {status === "scanning" || status === "swap" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {buttonLabel}
            </>
          ) : (
            buttonLabel
          )}
        </Button>
      </motion.div>

      
    </div>
  );
}
