'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';
import { Loader2 } from 'lucide-react';

export interface IdentityVerifierProps {
  onVerifySuccess: (proof: unknown | null) => void;
  disabled?: boolean;
}

type Status = 'idle' | 'verifying' | 'verified' | 'failed';

const DEMO_APP_ID = '6d3f6753-7ee6-49ee-a545-62d1b1822619';
const STORAGE_KEY = 'unforgiven.reclaimProof';

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

export default function IdentityVerifier({ onVerifySuccess, disabled }: IdentityVerifierProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [proofRequest, setProofRequest] = useState<ReclaimProofRequest | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [connectingReclaim, setConnectingReclaim] = useState(false);
  const [reclaimReady, setReclaimReady] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const restoreOnceRef = useRef(false);

  const appId = process.env.NEXT_PUBLIC_RECLAIM_APP_ID ?? DEMO_APP_ID;
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
      }
    } catch {
      // ignore restore errors
    }
  }, [onVerifySuccess]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const APP_ID = process.env.NEXT_PUBLIC_RECLAIM_APP_ID;
      if (!APP_ID || isPlaceholderAppId(APP_ID)) {
        if (mounted) {
          setProofRequest(null);
          setReclaimReady(false);
          setError('Reclaim 未配置，请配置 NEXT_PUBLIC_RECLAIM_APP_ID 与 Provider。');
        }
        return;
      }
      if (isPlaceholderProviderId(providerId)) {
        if (mounted) {
          setError('Reclaim Provider ID 未配置，请配置 NEXT_PUBLIC_RECLAIM_PROVIDER_ID。');
          setProofRequest(null);
          setReclaimReady(false);
        }
        return;
      }
      try {
        const request = await ReclaimProofRequest.init(appId, '', providerId, {
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
          setError(null);
        }
      } catch (e) {
        if (mounted) {
          setProofRequest(null);
          setReclaimReady(false);
          const msg =
            e instanceof Error && e.message.includes('Provider ID does not exist')
              ? 'Reclaim Provider ID 不存在或未启用，请到 Reclaim 控制台确认 Provider 已创建并与此 App 绑定。'
              : 'Reclaim 初始化失败，请检查网络或使用服务端验证流程。';
          setError(msg);
        }
      }
    };
    init();
    return () => { mounted = false; };
  }, [appId, providerId]);

  const handleVerify = useCallback(async (force = false) => {
    if (status === 'verified' && !force) return;
    setError(null);
    setConnectingReclaim(true);

    if (!proofRequest) {
      await new Promise((r) => setTimeout(r, 600));
      setConnectingReclaim(false);
      setError('Reclaim 未就绪，请配置 NEXT_PUBLIC_RECLAIM_APP_ID 与 NEXT_PUBLIC_RECLAIM_PROVIDER_ID。');
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

  const handleReverify = useCallback(() => {
    setStatus('idle');
    setError(null);
    setProofPreview(null);
    setShowProof(false);
    onVerifySuccess(null);
    handleVerify(true);
  }, [handleVerify, onVerifySuccess]);

  const handleReset = useCallback(() => {
    if (typeof window === 'undefined') return;
    setIsResetting(true);
    localStorage.removeItem('unforgiven_proof');
    localStorage.removeItem('unforgiven_status');
    localStorage.removeItem(STORAGE_KEY);
    onVerifySuccess(null);
    window.location.href = window.location.href;
  }, [onVerifySuccess]);

  if (status === 'verified') {
    return (
      <div className="glass-panel rounded-xl p-4 w-full max-w-sm border border-teal/30 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-teal font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              身份已验证 (Spotify zkTLS)
            </p>
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
            <button
              type="button"
              onClick={handleReverify}
              className="text-[10px] font-medium text-teal-300/80 hover:text-teal-200"
            >
              Re-verify (Scan Spotify)
            </button>
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
          'Reclaim 未配置'
        ) : (
          '验证身份 (Spotify)'
        )}
      </button>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}

