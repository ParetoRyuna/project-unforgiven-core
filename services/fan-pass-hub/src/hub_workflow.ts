import { exportWalletGraph, getAssetEventCountByType, ingestGraphEvent, upsertRelationEdge } from './graph_store.ts';
import { quoteHubDecision } from './decision_engine.ts';
import type {
  ExecuteFanPassWorkflowInput,
  ExecuteFanPassWorkflowResult,
  FanPassCatalog,
  FanPassMembershipTier,
  FanPassRelease,
  FanPassTask,
  GraphEventType,
  HubActionType,
} from './types.ts';

const RELEASES: FanPassRelease[] = [
  {
    id: 'release:flame-rises-genesis-pass',
    title: 'FLAME RISES Genesis Pass',
    artist: 'LE SSERAFIM',
    base_price_lamports: '1200000000',
    max_supply: 5000,
    tag: 'music',
  },
  {
    id: 'release:director-cut-cinema-pass',
    title: 'Director Cut Cinema Pass',
    artist: 'UNFORGIVEN Studio',
    base_price_lamports: '1600000000',
    max_supply: 3000,
    tag: 'movie',
  },
];

const MEMBERSHIPS: FanPassMembershipTier[] = [
  {
    id: 'membership:core',
    title: 'Core Fan',
    required_reputation_score: 40,
    community_id: 'community:core-fans',
    monthly_price_lamports: '700000000',
  },
  {
    id: 'membership:inner-circle',
    title: 'Inner Circle',
    required_reputation_score: 70,
    community_id: 'community:inner-circle',
    monthly_price_lamports: '1300000000',
  },
];

const TASKS: FanPassTask[] = [
  {
    id: 'task:stream-party',
    title: 'Join Weekly Stream Party',
    creator_id: 'creator:wanwan',
    reward_points: 8,
    action_hint: 'stream + live chat check-in',
  },
  {
    id: 'task:campus-invite',
    title: 'Invite 3 New Fans',
    creator_id: 'creator:wanwan',
    reward_points: 12,
    action_hint: 'share referral + first login',
  },
];

function actionAndEventForWorkflow(kind: ExecuteFanPassWorkflowInput['workflow_kind']): {
  actionType: HubActionType;
  eventType: GraphEventType;
} {
  switch (kind) {
    case 'purchase_release':
      return { actionType: 'purchase', eventType: 'purchase' };
    case 'upgrade_membership':
      return { actionType: 'membership_upgrade', eventType: 'membership_upgrade' };
    case 'complete_task':
      return { actionType: 'task_complete', eventType: 'task_complete' };
    default:
      return { actionType: 'view', eventType: 'view' };
  }
}

function findRelease(id: string): FanPassRelease {
  const item = RELEASES.find((release) => release.id === id);
  if (!item) throw new Error('release item not found');
  return item;
}

function findMembership(id: string): FanPassMembershipTier {
  const item = MEMBERSHIPS.find((tier) => tier.id === id);
  if (!item) throw new Error('membership item not found');
  return item;
}

function findTask(id: string): FanPassTask {
  const item = TASKS.find((task) => task.id === id);
  if (!item) throw new Error('task item not found');
  return item;
}

function amountLamportsForWorkflow(input: ExecuteFanPassWorkflowInput): string {
  if (input.workflow_kind === 'purchase_release') {
    return findRelease(input.item_id).base_price_lamports;
  }
  if (input.workflow_kind === 'upgrade_membership') {
    return findMembership(input.item_id).monthly_price_lamports;
  }
  return '100000000';
}

function relationUpdateForWorkflow(input: ExecuteFanPassWorkflowInput): {
  to_id: string;
  edge_type: 'user_creator' | 'user_community' | 'user_asset';
  weight: number;
  metadata: Record<string, unknown>;
} {
  if (input.workflow_kind === 'purchase_release') {
    const release = findRelease(input.item_id);
    return {
      to_id: release.id,
      edge_type: 'user_asset',
      weight: 12,
      metadata: { source: 'purchase_release', artist: release.artist, tag: release.tag },
    };
  }
  if (input.workflow_kind === 'upgrade_membership') {
    const tier = findMembership(input.item_id);
    return {
      to_id: tier.community_id,
      edge_type: 'user_community',
      weight: 18,
      metadata: { source: 'upgrade_membership', tier: tier.title },
    };
  }
  const task = findTask(input.item_id);
  return {
    to_id: task.creator_id,
    edge_type: 'user_creator',
    weight: Math.max(5, Math.min(25, task.reward_points)),
    metadata: { source: 'complete_task', task: task.title },
  };
}

function ensureValidWorkflowItem(input: ExecuteFanPassWorkflowInput): void {
  if (input.workflow_kind === 'purchase_release') {
    findRelease(input.item_id);
    return;
  }
  if (input.workflow_kind === 'upgrade_membership') {
    findMembership(input.item_id);
    return;
  }
  findTask(input.item_id);
}

export function getFanPassCatalog(): FanPassCatalog {
  return {
    releases: RELEASES,
    memberships: MEMBERSHIPS,
    tasks: TASKS,
    metrics: {
      release_sold_count_by_id: getAssetEventCountByType('purchase'),
    },
  };
}

export async function executeFanPassWorkflow(input: ExecuteFanPassWorkflowInput): Promise<ExecuteFanPassWorkflowResult> {
  ensureValidWorkflowItem(input);
  const { actionType, eventType } = actionAndEventForWorkflow(input.workflow_kind);
  const amountLamports = amountLamportsForWorkflow(input);

  const quote = await quoteHubDecision({
    wallet: input.wallet,
    action_type: actionType,
    asset_id: input.item_id,
    context: {
      amount_lamports: amountLamports,
      channel: 'fan-pass-hub',
      campaign_id: 'week-1-business-flow',
    },
    proofs: input.proofs,
  });

  ingestGraphEvent({
    wallet: input.wallet,
    event_type: 'quote',
    asset_id: input.item_id,
    decision: quote.decision,
    value_lamports: quote.final_price_lamports,
    context: {
      channel: 'fan-pass-hub',
      campaign_id: 'week-1-business-flow',
      metadata: {
        action_type: actionType,
        tier: quote.tier,
      },
    },
  });

  const needsStepUp = quote.decision === 'step_up';
  const blocked = quote.decision === 'block';
  if (blocked || needsStepUp) {
    return {
      workflow_kind: input.workflow_kind,
      item_id: input.item_id,
      quote,
      executed: false,
      needs_step_up: needsStepUp,
      event_result: null,
      relation_result: null,
      export_snapshot: exportWalletGraph(input.wallet),
    };
  }

  const eventResult = ingestGraphEvent({
    wallet: input.wallet,
    event_type: eventType,
    asset_id: input.item_id,
    decision: quote.decision,
    value_lamports: quote.final_price_lamports,
    context: {
      channel: 'fan-pass-hub',
      campaign_id: 'week-1-business-flow',
      metadata: {
        workflow_kind: input.workflow_kind,
      },
    },
  });

  const relation = relationUpdateForWorkflow(input);
  const relationResult = upsertRelationEdge({
    from_wallet: input.wallet,
    to_id: relation.to_id,
    edge_type: relation.edge_type,
    weight: relation.weight,
    metadata: relation.metadata,
  });

  return {
    workflow_kind: input.workflow_kind,
    item_id: input.item_id,
    quote,
    executed: true,
    needs_step_up: false,
    event_result: eventResult,
    relation_result: relationResult,
    export_snapshot: exportWalletGraph(input.wallet),
  };
}
