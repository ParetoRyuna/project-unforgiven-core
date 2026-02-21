import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import type { ChainAdapter } from './chain_adapter.ts';
import type {
  GraphEvent,
  GraphEventIngestInput,
  RelationEdge,
  RelationEdgeUpsertInput,
  ReputationSnapshot,
  RiskSignal,
  SnapshotAnchorReceipt,
  TrustTier,
} from './types.ts';

type HubGraphState = {
  events: Map<string, GraphEvent>;
  relations: Map<string, RelationEdge>;
  snapshotVersion: number;
  anchorBySnapshotVersion: Map<number, SnapshotAnchorReceipt>;
  loadedFromDisk: boolean;
  storagePath: string;
};

const HUB_GRAPH_STORE_KEY = '__fanPassHubGraphStoreV1';

type PersistedGraphState = {
  schema_version: 1;
  snapshot_version: number;
  events: GraphEvent[];
  relations: RelationEdge[];
  anchors: SnapshotAnchorReceipt[];
  updated_at: number;
};

function resolveStoragePath(): string {
  const configured = process.env.HUB_GRAPH_STORE_PATH?.trim();
  if (configured && configured.length > 0) return configured;
  return '/tmp/wanwan-fan-pass-graph.json';
}

function defaultState(): HubGraphState {
  return {
    events: new Map<string, GraphEvent>(),
    relations: new Map<string, RelationEdge>(),
    snapshotVersion: 1,
    anchorBySnapshotVersion: new Map<number, SnapshotAnchorReceipt>(),
    loadedFromDisk: false,
    storagePath: resolveStoragePath(),
  };
}

function readPersistedState(storagePath: string): PersistedGraphState | null {
  if (!fs.existsSync(storagePath)) return null;
  try {
    const raw = fs.readFileSync(storagePath, 'utf8');
    const parsed = JSON.parse(raw) as PersistedGraphState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.events) || !Array.isArray(parsed.relations) || !Array.isArray(parsed.anchors)) return null;
    if (!Number.isFinite(parsed.snapshot_version)) return null;
    return parsed;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'fan_pass_store_load_failed',
        path: storagePath,
        error: error instanceof Error ? error.message : 'unknown',
      }),
    );
    return null;
  }
}

function writePersistedState(state: HubGraphState): void {
  const payload: PersistedGraphState = {
    schema_version: 1,
    snapshot_version: state.snapshotVersion,
    events: [...state.events.values()].sort((a, b) => a.event_id.localeCompare(b.event_id)),
    relations: [...state.relations.values()].sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
    anchors: [...state.anchorBySnapshotVersion.values()].sort((a, b) => a.snapshot_version - b.snapshot_version),
    updated_at: Date.now(),
  };

  const dirname = path.dirname(state.storagePath);
  fs.mkdirSync(dirname, { recursive: true });
  const tempPath = `${state.storagePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload), 'utf8');
  fs.renameSync(tempPath, state.storagePath);
}

function hydrateStateIfNeeded(state: HubGraphState): void {
  if (state.loadedFromDisk) return;
  const persisted = readPersistedState(state.storagePath);
  if (persisted) {
    state.events = new Map(persisted.events.map((event) => [event.event_id, event]));
    state.relations = new Map(persisted.relations.map((edge) => [edge.edge_id, edge]));
    state.anchorBySnapshotVersion = new Map(
      persisted.anchors.map((anchor) => [anchor.snapshot_version, anchor]),
    );
    state.snapshotVersion = Math.max(1, Math.floor(persisted.snapshot_version));
  }
  state.loadedFromDisk = true;
}

function getState(): HubGraphState {
  const globalRef = globalThis as typeof globalThis & {
    [HUB_GRAPH_STORE_KEY]?: HubGraphState;
  };
  if (!globalRef[HUB_GRAPH_STORE_KEY]) {
    globalRef[HUB_GRAPH_STORE_KEY] = defaultState();
  }
  const state = globalRef[HUB_GRAPH_STORE_KEY] as HubGraphState;
  const expectedPath = resolveStoragePath();
  if (state.storagePath !== expectedPath) {
    state.storagePath = expectedPath;
    state.loadedFromDisk = false;
  }
  hydrateStateIfNeeded(state);
  return state;
}

function stableCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableCopy(item));
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableCopy(obj[key]);
      return acc;
    }, {});
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableCopy(value));
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextSnapshotVersion(state: HubGraphState): number {
  state.snapshotVersion += 1;
  return state.snapshotVersion;
}

function eventWeight(eventType: GraphEvent['event_type']): number {
  switch (eventType) {
    case 'verify':
      return 6;
    case 'purchase':
      return 8;
    case 'task_complete':
      return 5;
    case 'membership_upgrade':
      return 7;
    case 'claim':
      return 3;
    case 'resale':
      return -4;
    case 'quote':
      return 1;
    case 'view':
    default:
      return 1;
  }
}

function trustTier(score: number): TrustTier {
  if (score >= 80) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function computeRiskSignals(walletEvents: GraphEvent[], relationStrength: number): RiskSignal[] {
  const now = Date.now();
  const inLastHour = walletEvents.filter((event) => now - event.ingested_at <= 60 * 60 * 1000);
  const resaleCount = walletEvents.filter((event) => event.event_type === 'resale').length;
  const purchaseCount = walletEvents.filter((event) => event.event_type === 'purchase').length;

  const signals: RiskSignal[] = [];
  if (inLastHour.length >= 20) {
    signals.push({ signal: 'high_velocity', weight: 20, source: 'behavior' });
  }
  if (resaleCount >= 3 && purchaseCount === 0) {
    signals.push({ signal: 'resale_anomaly', weight: 30, source: 'behavior' });
  }
  if (walletEvents.length >= 8 && relationStrength < 10) {
    signals.push({ signal: 'low_relation_density', weight: 12, source: 'relation' });
  }
  return signals;
}

function currentSnapshotHashHex(state: HubGraphState): string {
  const events = [...state.events.values()]
    .sort((a, b) => a.event_id.localeCompare(b.event_id))
    .map((event) => ({
      ...event,
      context: event.context ? stableCopy(event.context) : undefined,
    }));
  const relations = [...state.relations.values()]
    .sort((a, b) => a.edge_id.localeCompare(b.edge_id))
    .map((edge) => ({
      ...edge,
      metadata: edge.metadata ? stableCopy(edge.metadata) : undefined,
    }));
  return sha256Hex(
    stableStringify({
      snapshot_version: state.snapshotVersion,
      events,
      relations,
    }),
  );
}

function walletEvents(state: HubGraphState, wallet: string): GraphEvent[] {
  return [...state.events.values()].filter((event) => event.wallet === wallet);
}

function walletRelations(state: HubGraphState, wallet: string): RelationEdge[] {
  return [...state.relations.values()].filter((edge) => edge.from_wallet === wallet);
}

export function ingestGraphEvent(input: GraphEventIngestInput): {
  event_id: string;
  ingest_status: 'ok';
  snapshot_version: number;
} {
  const state = getState();
  const eventId = randomUUID();
  const now = Date.now();
  const event: GraphEvent = {
    event_id: eventId,
    wallet: input.wallet,
    event_type: input.event_type,
    asset_id: input.asset_id,
    decision: input.decision,
    value_lamports: input.value_lamports,
    context: input.context,
    occurred_at: input.occurred_at ?? now,
    ingested_at: now,
  };
  state.events.set(eventId, event);
  const version = nextSnapshotVersion(state);
  writePersistedState(state);
  return {
    event_id: eventId,
    ingest_status: 'ok',
    snapshot_version: version,
  };
}

export function upsertRelationEdge(input: RelationEdgeUpsertInput): {
  edge_id: string;
  updated_at: number;
  snapshot_version: number;
} {
  const state = getState();
  const id = sha256Hex(`${input.from_wallet}:${input.edge_type}:${input.to_id}`).slice(0, 40);
  const now = Date.now();
  const next: RelationEdge = {
    edge_id: id,
    from_wallet: input.from_wallet,
    to_id: input.to_id,
    edge_type: input.edge_type,
    weight: clamp(Math.round(input.weight), 0, 100),
    metadata: input.metadata,
    updated_at: now,
  };
  state.relations.set(id, next);
  const version = nextSnapshotVersion(state);
  writePersistedState(state);
  return {
    edge_id: id,
    updated_at: now,
    snapshot_version: version,
  };
}

export function getReputationSnapshot(wallet: string, extraSignals?: RiskSignal[]): ReputationSnapshot {
  const state = getState();
  const events = walletEvents(state, wallet);
  const relations = walletRelations(state, wallet);
  const relationStrength = relations.reduce((sum, edge) => sum + edge.weight, 0);
  const behaviorScore = events.reduce((sum, event) => sum + eventWeight(event.event_type), 0);
  const derivedSignals = computeRiskSignals(events, relationStrength);
  const mergedSignals = [...derivedSignals, ...(extraSignals ?? [])];
  const penalty = mergedSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const score = clamp(Math.round(50 + behaviorScore + relationStrength * 0.5 - penalty), 0, 100);
  const snapshotHashHex = currentSnapshotHashHex(state);
  const anchor = state.anchorBySnapshotVersion.get(state.snapshotVersion) ?? null;

  return {
    wallet,
    score,
    trust_tier: trustTier(score),
    event_count: events.length,
    relation_strength: relationStrength,
    risk_signals: mergedSignals,
    snapshot_version: state.snapshotVersion,
    snapshot_hash_hex: snapshotHashHex,
    anchored_at: anchor?.anchored_at ?? null,
  };
}

export async function anchorCurrentSnapshot(adapter: ChainAdapter): Promise<SnapshotAnchorReceipt> {
  const state = getState();
  const snapshotHashHex = currentSnapshotHashHex(state);
  const receipt = await adapter.anchorSnapshot({
    snapshot_hash_hex: snapshotHashHex,
    snapshot_version: state.snapshotVersion,
    generated_at: Date.now(),
  });
  state.anchorBySnapshotVersion.set(state.snapshotVersion, receipt);
  writePersistedState(state);
  return receipt;
}

export function exportWalletGraph(wallet: string): {
  wallet: string;
  events: GraphEvent[];
  relations: RelationEdge[];
  reputation: ReputationSnapshot;
  latest_anchor: SnapshotAnchorReceipt | null;
} {
  const state = getState();
  const reputation = getReputationSnapshot(wallet);
  const latestAnchor = state.anchorBySnapshotVersion.get(state.snapshotVersion) ?? null;
  return {
    wallet,
    events: walletEvents(state, wallet).sort((a, b) => a.ingested_at - b.ingested_at),
    relations: walletRelations(state, wallet).sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
    reputation,
    latest_anchor: latestAnchor,
  };
}

export function getAssetEventCountByType(eventType: GraphEvent['event_type']): Record<string, number> {
  const state = getState();
  const counts: Record<string, number> = {};
  for (const event of state.events.values()) {
    if (event.event_type !== eventType) continue;
    counts[event.asset_id] = (counts[event.asset_id] ?? 0) + 1;
  }
  return counts;
}

export function resetFanPassHubGraphStoreForTests(): void {
  const state = getState();
  state.events.clear();
  state.relations.clear();
  state.snapshotVersion = 1;
  state.anchorBySnapshotVersion.clear();
  writePersistedState(state);
}

export function reinitializeFanPassHubGraphStoreForTests(): void {
  const globalRef = globalThis as typeof globalThis & {
    [HUB_GRAPH_STORE_KEY]?: HubGraphState;
  };
  delete globalRef[HUB_GRAPH_STORE_KEY];
}

export function clearPersistedFanPassHubGraphStoreForTests(): void {
  const storagePath = resolveStoragePath();
  fs.rmSync(storagePath, { force: true });
}
