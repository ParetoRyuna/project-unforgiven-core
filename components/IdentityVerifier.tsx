'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export interface IdentityVerifierProps {
  onVerifySuccess: (proof: unknown | null) => void;
  /** Callback when simulator selects a tier (1=Fan, 2=Guest, 3=Scalper). */
  setTier?: (tier: 1 | 2 | 3 | null) => void;
  disabled?: boolean;
}

type Status = 'idle' | 'verifying' | 'verified' | 'failed';

const DEMO_APP_ID = '6d3f6753-7ee6-49ee-a545-62d1b1822619';
const STORAGE_KEY = 'unforgiven.reclaimProof';
const WHITELISTED_WALLETS = ['4aPf...MpRA'];

/** Robust mock of Reclaim zkTLS proof - mimics real API structure for sign-alpha/route.ts */
function createDummyProof(): Record<string, unknown> {
  return {
    identifier: 'unforgiven-simulation-fan',
    claimData: {
      provider: 'spotify',
      parameters: 'listening_history',
      owner: 'simulation-mode',
      timestampS: String(Math.floor(Date.now() / 1000)),
      context: JSON.stringify({
        contextAddress: 'simulation',
        contextMessage: 'Simulation Console - Verified Fan (Tier 1)',
        extractedParameters: { pageTitle: 'Spotify', ianaLinkUrl: 'https://spotify.com' },
      }),
      identifier: 'unforgiven-simulation',
    },
  };
}

function createWhitelistProof(walletAddress: string): Record<string, unknown> {
  return {
    identifier: 'unforgiven-whitelist-fan',
    claimData: {
      provider: 'solana-civic-sas',
      parameters: 'whitelist',
      owner: walletAddress,
      timestampS: String(Math.floor(Date.now() / 1000)),
      context: JSON.stringify({
        contextAddress: walletAddress,
        contextMessage: 'Auto-verified via Solana Civic/SAS whitelist',
      }),
      identifier: 'unforgiven-whitelist',
    },
  };
}

function isPlaceholderAppId(id: string | undefined): boolean {
  if (!id || id.length < 10) return true;
  const lower = id.toLowerCase();
  return lower.includes('your') || lower.includes('placeholder') || lower === 'demo';
}

function isPlaceholderProviderId(id: string | undefined): boolean {
  if (!id) return true;
  const lower = id.toLowerCase();
  return lower.includes('your') || lower.includes('placeholder') || lower === 'demo' || lower === 'spotify-username';
}

export default function IdentityVerifier({ onVerifySuccess, setTier, disabled }: IdentityVerifierProps) {
  const wallet = useWallet();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [proofRequest, setProofRequest] = useState<ReclaimProofRequest | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [connectingReclaim, setConnectingReclaim] = useState(false);
  const [reclaimReady, setReclaimReady] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [autoVerified, setAutoVerified] = useState(false);
  const [autoVerifyEnabled, setAutoVerifyEnabled] = useState(true);
  const restoreOnceRef = useRef(false);

  const appId = process.env.NEXT_PUBLIC_RECLAIM_APP_ID ?? DEMO_APP_ID;
  const appSecret = process.env.NEXT_PUBLIC_RECLAIM_APP_SECRET ?? '';
  const providerId = process.env.NEXT_PUBLIC_RECLAIM_PROVIDER_ID ?? '';

  useEffect(() => {
    if (restoreOnceRef.current) return;
    restoreOnceRef.current = true;
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        setStatus('verified');
        setProofPreview(JSON.stringify(parsed, null, 2));
        onVerifySuccess(parsed);
        setTier?.(1);
      }
    } catch {
      // ignore restore errors
    }
  }, [onVerifySuccess, setTier]);

  useEffect(() => {
    if (!autoVerifyEnabled) return;
    if (!wallet.connected || !wallet.publicKey) return;
    const walletAddress = wallet.publicKey.toBase58();
    if (!WHITELISTED_WALLETS.includes(walletAddress)) return;
    if (!autoVerified) setAutoVerified(true);
    setTier?.(1);
    if (status === 'verified') return;

    const proof = createWhitelistProof(walletAddress);
    setStatus('verified');
    setError(null);
    setProofPreview(JSON.stringify(proof, null, 2));
    onVerifySuccess(proof);
  }, [autoVerified, autoVerifyEnabled, onVerifySuccess, setTier, status, wallet.connected, wallet.publicKey]);

  const runDevFallback = useCallback(() => {
    const DUMMY_PROOF = createDummyProof();
    setStatus('verified');
    setError(null);
    setProofPreview(JSON.stringify(DUMMY_PROOF, null, 2));
    setConnectingReclaim(false);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DUMMY_PROOF));
      }
    } catch {
      // ignore
    }
    onVerifySuccess(DUMMY_PROOF);
    setTier?.(1);
  }, [onVerifySuccess, setTier]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const APP_ID = process.env.NEXT_PUBLIC_RECLAIM_APP_ID;
      if (!APP_ID || isPlaceholderAppId(APP_ID)) {
        console.warn('[IdentityVerifier] NEXT_PUBLIC_RECLAIM_APP_ID missing or placeholder, using Dev Mode');
        if (mounted) {
          setProofRequest(null);
          setReclaimReady(false);
          setError('Reclaim 未配置，请使用下方 Simulation Console 或配置环境变量。');
        }
        return;
      }
      if (!appSecret) {
        if (mounted) {
          setError('Reclaim app secret 未配置，可使用 Simulation Console 演示。');
          setProofRequest(null);
          setReclaimReady(false);
        }
        return;
      }
      if (isPlaceholderProviderId(providerId)) {
        if (mounted) {
          setError('Reclaim Provider ID 未配置，请使用 Simulation Console。');
          setProofRequest(null);
          setReclaimReady(false);
        }
        return;
      }
      try {
        const request = await ReclaimProofRequest.init(appId, appSecret, providerId, {
          useAppClip: true,
          useBrowserExtension: true,
          preferredLocale: 'zh-CN',
          log: process.env.NODE_ENV === 'development',
        });
        request.setModalOptions({
          title: '验证身份 (Spotify)',
          description: '桌面端扫码或使用扩展；移动端会自动打开 App Clip',
          darkTheme: true,
          showExtensionInstallButton: true,
        });
        if (mounted) {
          setProofRequest(request);
          setReclaimReady(true);
        }
      } catch (e) {
        if (mounted) {
          console.group('Reclaim Init Debug');
          console.log('App ID:', process.env.NEXT_PUBLIC_RECLAIM_APP_ID);
          console.log('Provider ID:', process.env.NEXT_PUBLIC_RECLAIM_PROVIDER_ID);
          console.error('Init Error Details:', e);
          if (e instanceof Error) {
            console.error('Error name:', e.name);
            console.error('Error message:', e.message);
            console.error('Error stack:', e.stack);
          }
          console.groupEnd();
          setProofRequest(null);
          setReclaimReady(false);
          const msg =
            e instanceof Error && e.message.includes('Provider ID does not exist')
              ? 'Reclaim Provider ID 不存在或未启用，请到 Reclaim 控制台确认 Provider 已创建并与此 App 绑定。'
              : 'Reclaim 初始化失败 (网络/CORS)，请使用 Simulation Console。';
          setError(msg);
        }
      }
    };
    init();
    return () => { mounted = false; };
  }, [appId, appSecret, providerId]);

  const handleVerify = useCallback(async (force = false) => {
    if (status === 'verified' && !force) return;
    setError(null);
    setAutoVerified(false);
    setConnectingReclaim(true);

    if (!proofRequest) {
      await new Promise((r) => setTimeout(r, 600));
      if (typeof window !== 'undefined') {
        console.warn('[IdentityVerifier] No Reclaim request, use Simulation Console');
      }
      setConnectingReclaim(false);
      setError('Reclaim 未就绪，请使用 Simulation Console。');
      return;
    }

    setStatus('verifying');
    try {
      await proofRequest.triggerReclaimFlow();
      setConnectingReclaim(false);
      await proofRequest.startSession({
        onSuccess: (proofs: unknown) => {
          const proof = Array.isArray(proofs) ? proofs[0] ?? proofs : proofs;
          setStatus('verified');
          const finalProof = proof ?? { claimData: { context: 'zkTLS verified' } };
          setProofPreview(JSON.stringify(finalProof, null, 2));
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(finalProof));
            }
          } catch {
            // ignore storage errors
          }
          onVerifySuccess(finalProof);
        },
        onError: (err: Error) => {
          const msg = err?.message || 'Verification failed';
          setError(msg);
          setStatus('failed');
          setConnectingReclaim(false);
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed';
      setError(msg);
      setStatus('failed');
      setConnectingReclaim(false);
    }
  }, [proofRequest, status, onVerifySuccess]);

  const handleSimulatorFan = useCallback(() => {
    runDevFallback();
  }, [runDevFallback]);

  const handleSimulatorGuest = useCallback(() => {
    setStatus('idle');
    setError(null);
    setProofPreview(null);
    onVerifySuccess(null);
    setTier?.(2);
  }, [onVerifySuccess, setTier]);

  const handleSimulatorScalper = useCallback(() => {
    setStatus('idle');
    setError(null);
    setProofPreview(null);
    onVerifySuccess(null);
    setTier?.(3);
  }, [onVerifySuccess, setTier]);

  const handleReverify = useCallback(() => {
    setAutoVerifyEnabled(false);
    setAutoVerified(false);
    setStatus('idle');
    setError(null);
    setProofPreview(null);
    setShowProof(false);
    onVerifySuccess(null);
    setTier?.(null);
    handleVerify(true);
  }, [handleVerify, onVerifySuccess, setTier]);

  const handleReset = useCallback(() => {
    console.log('🔴 Disconnect button clicked - Resetting state...');
    if (typeof window === 'undefined') return;
    setIsResetting(true);
    localStorage.removeItem('unforgiven_proof');
    localStorage.removeItem('unforgiven_status');
    localStorage.removeItem(STORAGE_KEY);
    setTier?.(null);
    onVerifySuccess(null);
    window.location.href = window.location.href;
  }, [onVerifySuccess, setTier]);

  if (status === 'verified') {
    return (
      <div className="glass-panel rounded-xl p-4 w-full max-w-sm border border-teal/30 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-teal font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              身份已验证 (Spotify zkTLS)
            </p>
            {autoVerified && (
              <span className="inline-flex items-center gap-2 text-[11px] text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full w-fit">
                ✅ Verified via Solana Civic/SAS
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="shrink-0 text-xs font-medium text-red-400 border border-red-500/30 rounded-md px-2 py-1 hover:bg-red-500/10 hover:text-red-300 transition-colors relative z-50 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Disconnect and reset verification"
            disabled={isResetting}
          >
            {isResetting ? 'Resetting...' : 'DISCONNECT'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-neutral-500 text-xs">Tier 1 粉丝模式已解锁</p>
          <div className="flex items-center gap-2">
            {autoVerified && (
              <button
                type="button"
                onClick={handleReverify}
                className="text-[10px] font-medium text-teal-300/80 hover:text-teal-200"
              >
                Re-verify (Scan Spotify)
              </button>
            )}
            {proofPreview && (
              <button
                type="button"
                onClick={() => setShowProof((s) => !s)}
                className="text-[10px] uppercase tracking-[0.25em] text-teal-300/80 hover:text-teal-200"
              >
                {showProof ? 'Hide Details' : 'Tech Details'}
              </button>
            )}
          </div>
        </div>
        {proofPreview && showProof && (
          <pre className="text-[10px] leading-4 text-neutral-400 bg-black/30 border border-white/10 rounded-lg p-2 max-h-40 overflow-auto">
            {proofPreview}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-4 w-full max-w-sm space-y-4">
      <p className="text-sm text-neutral-400">验证身份以解锁粉丝票价 (Spotify 听歌记录)</p>

      <button
        type="button"
        onClick={() => handleVerify()}
        disabled={disabled || status === 'verifying' || connectingReclaim || !reclaimReady}
        className="w-full py-3 rounded-lg bg-burnt text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#e05500] transition glow-border flex items-center justify-center gap-2"
      >
        {connectingReclaim ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Connecting to Reclaim...
          </>
        ) : status === 'verifying' ? (
          '验证中... 请扫码或使用扩展'
        ) : !reclaimReady ? (
          'Reclaim 不可用，请用 Simulation Console'
        ) : (
          '验证身份 (Spotify)'
        )}
      </button>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          🛠️ Simulation Console
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSimulatorFan}
            className="border-emerald-600 text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300"
            aria-label="Simulate Verified Fan (Tier 1)"
          >
            😇 Verified Fan
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSimulatorGuest}
            className="border-zinc-600 text-zinc-400 hover:bg-zinc-800/50"
            aria-label="Simulate Guest (Tier 2)"
          >
            😐 Guest User
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSimulatorScalper}
            className="border-red-600 text-red-400 hover:bg-red-950/40 hover:text-red-300"
            aria-label="Simulate Scalper (Tier 3)"
          >
            🤖 Scalper Bot
          </Button>
        </div>
      </div>
    </div>
  );
}
