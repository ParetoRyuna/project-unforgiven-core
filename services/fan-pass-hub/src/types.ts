export const HUB_DECISIONS = ['allow', 'block', 'step_up'] as const;
export type HubDecision = (typeof HUB_DECISIONS)[number];

export const HUB_ACTION_TYPES = [
  'view',
  'verify',
  'purchase',
  'resale',
  'task_complete',
  'membership_upgrade',
  'claim',
] as const;
export type HubActionType = (typeof HUB_ACTION_TYPES)[number];

export const GRAPH_EVENT_TYPES = [
  'view',
  'verify',
  'purchase',
  'resale',
  'task_complete',
  'membership_upgrade',
  'claim',
  'quote',
] as const;
export type GraphEventType = (typeof GRAPH_EVENT_TYPES)[number];

export const RELATION_EDGE_TYPES = ['user_creator', 'user_community', 'user_asset'] as const;
export type RelationEdgeType = (typeof RELATION_EDGE_TYPES)[number];

export type RiskSignalType = 'high_velocity' | 'resale_anomaly' | 'low_relation_density' | 'operator_flag';

export type RiskSignal = {
  signal: RiskSignalType;
  weight: number;
  source: 'behavior' | 'relation' | 'operator';
};

export type DecisionContext = {
  channel?: string;
  campaign_id?: string;
  amount_lamports?: string;
  metadata?: Record<string, unknown>;
};

export type GraphEvent = {
  event_id: string;
  wallet: string;
  event_type: GraphEventType;
  asset_id: string;
  decision?: HubDecision;
  value_lamports?: string;
  context?: DecisionContext;
  occurred_at: number;
  ingested_at: number;
};

export type GraphEventIngestInput = {
  wallet: string;
  event_type: GraphEventType;
  asset_id: string;
  decision?: HubDecision;
  value_lamports?: string;
  context?: DecisionContext;
  occurred_at?: number;
};

export type RelationEdge = {
  edge_id: string;
  from_wallet: string;
  to_id: string;
  edge_type: RelationEdgeType;
  weight: number;
  metadata?: Record<string, unknown>;
  updated_at: number;
};

export type RelationEdgeUpsertInput = {
  from_wallet: string;
  to_id: string;
  edge_type: RelationEdgeType;
  weight: number;
  metadata?: Record<string, unknown>;
};

export type TrustTier = 'low' | 'medium' | 'high';

export type ReputationSnapshot = {
  wallet: string;
  score: number;
  trust_tier: TrustTier;
  event_count: number;
  relation_strength: number;
  risk_signals: RiskSignal[];
  snapshot_version: number;
  snapshot_hash_hex: string;
  anchored_at: number | null;
};

export type SignaturePayload = {
  payload_hex: string;
  oracle_signature_hex: string;
  oracle_pubkey: string;
  uniq_key: string;
  nonce: string;
  attestation_expiry: string;
};

export type HubDecisionQuoteRequest = {
  wallet: string;
  action_type: HubActionType;
  asset_id: string;
  context?: DecisionContext;
  proofs?: Record<string, unknown>[];
  risk_signals?: RiskSignal[];
};

export type HubDecisionQuoteResponse = {
  decision: HubDecision;
  tier: 'verified' | 'guest' | 'bot_suspected';
  final_price_lamports: string;
  signature_payload: SignaturePayload | null;
  ttl_seconds: number;
  snapshot_version: number;
  snapshot_hash_hex: string;
  risk_signals: RiskSignal[];
  reason_codes: string[];
};

export type SnapshotAnchorRequest = {
  snapshot_hash_hex: string;
  snapshot_version: number;
  generated_at: number;
};

export type SnapshotAnchorReceipt = {
  snapshot_hash_hex: string;
  snapshot_version: number;
  anchor_tx_signature: string;
  anchored_at: number;
  mode: 'mock' | 'onchain';
  chain: 'solana';
};

export type FanPassRelease = {
  id: string;
  title: string;
  artist: string;
  base_price_lamports: string;
  max_supply: number;
  tag: string;
};

export type FanPassMembershipTier = {
  id: string;
  title: string;
  required_reputation_score: number;
  community_id: string;
  monthly_price_lamports: string;
};

export type FanPassTask = {
  id: string;
  title: string;
  creator_id: string;
  reward_points: number;
  action_hint: string;
};

export type FanPassCatalog = {
  releases: FanPassRelease[];
  memberships: FanPassMembershipTier[];
  tasks: FanPassTask[];
  metrics: {
    release_sold_count_by_id: Record<string, number>;
  };
};

export const FAN_PASS_WORKFLOW_KINDS = ['purchase_release', 'upgrade_membership', 'complete_task'] as const;
export type FanPassWorkflowKind = (typeof FAN_PASS_WORKFLOW_KINDS)[number];

export type ExecuteFanPassWorkflowInput = {
  wallet: string;
  workflow_kind: FanPassWorkflowKind;
  item_id: string;
  proofs?: Record<string, unknown>[];
};

export type ExecuteFanPassWorkflowResult = {
  workflow_kind: FanPassWorkflowKind;
  item_id: string;
  quote: HubDecisionQuoteResponse;
  executed: boolean;
  needs_step_up: boolean;
  event_result: {
    event_id: string;
    ingest_status: 'ok';
    snapshot_version: number;
  } | null;
  relation_result: {
    edge_id: string;
    updated_at: number;
    snapshot_version: number;
  } | null;
  export_snapshot: {
    wallet: string;
    events: GraphEvent[];
    relations: RelationEdge[];
    reputation: ReputationSnapshot;
    latest_anchor: SnapshotAnchorReceipt | null;
  };
};
