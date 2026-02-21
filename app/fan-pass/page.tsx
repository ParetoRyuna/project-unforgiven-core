'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';

import type {
  ExecuteFanPassWorkflowResult,
  FanPassCatalog,
  FanPassMembershipTier,
  FanPassRelease,
  FanPassTask,
  FanPassWorkflowKind,
  SnapshotAnchorReceipt,
} from '@/services/fan-pass-hub/src/types';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

type FlowLog = {
  id: string;
  title: string;
  at: number;
  status: 'success' | 'blocked' | 'step_up' | 'error';
  details: string;
};

type WorkflowState = {
  quoteDecision: ExecuteFanPassWorkflowResult['quote']['decision'];
  quoteTier: ExecuteFanPassWorkflowResult['quote']['tier'];
  finalPrice: string;
  reputationScore: number;
  trustTier: string;
  snapshotHash: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? `Request failed (${response.status})`));
  return payload as T;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error ?? `Request failed (${response.status})`));
  return payload as T;
}

function toSolString(lamports: string): string {
  const value = Number(lamports);
  if (!Number.isFinite(value)) return lamports;
  return (value / 1_000_000_000).toFixed(3);
}

function statusColor(status: FlowLog['status']): string {
  if (status === 'success') return 'text-emerald-300 border-emerald-900/60 bg-emerald-950/30';
  if (status === 'blocked') return 'text-red-300 border-red-900/60 bg-red-950/30';
  if (status === 'step_up') return 'text-amber-300 border-amber-900/60 bg-amber-950/30';
  return 'text-zinc-300 border-zinc-700 bg-zinc-900/40';
}

export default function FanPassPage() {
  const wallet = useWallet();
  const [catalog, setCatalog] = useState<FanPassCatalog | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState | null>(null);
  const [latestAnchor, setLatestAnchor] = useState<SnapshotAnchorReceipt | null>(null);
  const [logs, setLogs] = useState<FlowLog[]>([]);

  const walletBase58 = useMemo(() => wallet.publicKey?.toBase58() ?? '', [wallet.publicKey]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const payload = await getJson<FanPassCatalog>('/api/fan-pass/catalog');
      setCatalog(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'failed to load catalog');
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const pushLog = useCallback((entry: FlowLog) => {
    setLogs((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const runWorkflow = useCallback(
    async (kind: FanPassWorkflowKind, itemId: string, title: string) => {
      if (!walletBase58) {
        setError('Connect wallet first');
        return;
      }
      setRunning(true);
      setError(null);
      try {
        const result = await postJson<ExecuteFanPassWorkflowResult>('/api/fan-pass/workflow/execute', {
          wallet: walletBase58,
          workflow_kind: kind,
          item_id: itemId,
        });

        setWorkflowState({
          quoteDecision: result.quote.decision,
          quoteTier: result.quote.tier,
          finalPrice: result.quote.final_price_lamports,
          reputationScore: result.export_snapshot.reputation.score,
          trustTier: result.export_snapshot.reputation.trust_tier,
          snapshotHash: result.export_snapshot.reputation.snapshot_hash_hex,
        });

        const status: FlowLog['status'] =
          result.quote.decision === 'allow'
            ? 'success'
            : result.quote.decision === 'step_up'
              ? 'step_up'
              : 'blocked';
        const details =
          result.quote.decision === 'allow'
            ? `Executed. Price ${toSolString(result.quote.final_price_lamports)} SOL`
            : result.quote.decision === 'step_up'
              ? 'Needs proof step-up before execution'
              : 'Blocked by shield/risk policy';
        pushLog({
          id: `${kind}:${itemId}:${Date.now()}`,
          title,
          at: Date.now(),
          status,
          details,
        });
        await loadCatalog();
      } catch (runError) {
        const message = runError instanceof Error ? runError.message : 'workflow failed';
        setError(message);
        pushLog({
          id: `${kind}:${itemId}:${Date.now()}`,
          title,
          at: Date.now(),
          status: 'error',
          details: message,
        });
      } finally {
        setRunning(false);
      }
    },
    [loadCatalog, pushLog, walletBase58],
  );

  const runDailyAnchorNow = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const receipt = await postJson<SnapshotAnchorReceipt>('/api/graph/snapshots/anchor', {});
      setLatestAnchor(receipt);
      pushLog({
        id: `anchor:${Date.now()}`,
        title: 'Anchor Snapshot',
        at: Date.now(),
        status: 'success',
        details: `tx ${receipt.anchor_tx_signature.slice(0, 18)}... (${receipt.mode})`,
      });
    } catch (anchorError) {
      const message = anchorError instanceof Error ? anchorError.message : 'anchor failed';
      setError(message);
      pushLog({
        id: `anchor:${Date.now()}`,
        title: 'Anchor Snapshot',
        at: Date.now(),
        status: 'error',
        details: message,
      });
    } finally {
      setRunning(false);
    }
  }, [pushLog]);

  return (
    <div className="min-h-screen bg-[#060606] text-zinc-100 px-4 py-5">
      <div className="space-y-4">
        <section className="rounded-xl border border-orange-900/50 bg-black/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-orange-300/80">Fan Pass Hub</p>
          <h1 className="mt-1 text-xl font-black">Sales + Membership + Tasks</h1>
          <p className="mt-2 text-xs text-zinc-400">
            Week-1 business flow page. One click runs quote decision, event ingestion, and relation update.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <WalletMultiButton className="!h-10 !rounded-md !bg-zinc-900 !text-xs !font-bold !text-white !px-4" />
            <button
              onClick={runDailyAnchorNow}
              disabled={running}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Run Anchor Now
            </button>
            <Link href="/" className="text-xs text-zinc-400 underline underline-offset-4">
              Back
            </Link>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 break-all">Wallet: {walletBase58 || 'Not connected'}</p>
        </section>

        {workflowState && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs font-semibold">Latest Decision</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
              <p>Decision: {workflowState.quoteDecision}</p>
              <p>Tier: {workflowState.quoteTier}</p>
              <p>Price: {toSolString(workflowState.finalPrice)} SOL</p>
              <p>Reputation: {workflowState.reputationScore}</p>
              <p>Trust Tier: {workflowState.trustTier}</p>
              <p className="col-span-2 break-all">Snapshot: {workflowState.snapshotHash}</p>
            </div>
          </section>
        )}

        {latestAnchor && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs font-semibold">Latest Anchor</p>
            <p className="mt-1 text-xs text-zinc-300">Mode: {latestAnchor.mode}</p>
            <p className="mt-1 text-xs text-zinc-300 break-all">Tx: {latestAnchor.anchor_tx_signature}</p>
          </section>
        )}

        {error && (
          <section className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Release Sales</p>
            <p className="text-[11px] text-zinc-500">{loadingCatalog ? 'Loading...' : 'Active drops'}</p>
          </div>
          <div className="mt-3 space-y-2">
            {(catalog?.releases ?? []).map((release: FanPassRelease) => {
              const sold = catalog?.metrics.release_sold_count_by_id[release.id] ?? 0;
              return (
                <article key={release.id} className="rounded-md border border-zinc-700 bg-black/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{release.title}</p>
                      <p className="text-xs text-zinc-400">{release.artist}</p>
                    </div>
                    <button
                      disabled={running || !walletBase58}
                      onClick={() => runWorkflow('purchase_release', release.id, `Purchase ${release.title}`)}
                      className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                    >
                      Purchase
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">
                    Price {toSolString(release.base_price_lamports)} SOL · Sold {sold}/{release.max_supply}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <p className="text-xs font-semibold">Membership Upgrade</p>
          <div className="mt-3 space-y-2">
            {(catalog?.memberships ?? []).map((membership: FanPassMembershipTier) => (
              <article key={membership.id} className="rounded-md border border-zinc-700 bg-black/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{membership.title}</p>
                    <p className="text-xs text-zinc-400">
                      Need score {membership.required_reputation_score} · {toSolString(membership.monthly_price_lamports)} SOL/mo
                    </p>
                  </div>
                  <button
                    disabled={running || !walletBase58}
                    onClick={() => runWorkflow('upgrade_membership', membership.id, `Upgrade ${membership.title}`)}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Upgrade
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <p className="text-xs font-semibold">Task Engine</p>
          <div className="mt-3 space-y-2">
            {(catalog?.tasks ?? []).map((task: FanPassTask) => (
              <article key={task.id} className="rounded-md border border-zinc-700 bg-black/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{task.title}</p>
                    <p className="text-xs text-zinc-400">
                      Reward {task.reward_points} points · {task.action_hint}
                    </p>
                  </div>
                  <button
                    disabled={running || !walletBase58}
                    onClick={() => runWorkflow('complete_task', task.id, `Complete ${task.title}`)}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Complete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
          <p className="text-xs font-semibold">Activity Feed</p>
          <div className="mt-3 space-y-2">
            {logs.length === 0 && <p className="text-xs text-zinc-500">No activity yet.</p>}
            {logs.map((entry) => (
              <article key={entry.id} className={`rounded-md border px-3 py-2 text-xs ${statusColor(entry.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{entry.title}</p>
                  <p className="text-[10px] text-zinc-400">{new Date(entry.at).toLocaleTimeString()}</p>
                </div>
                <p className="mt-1">{entry.details}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
