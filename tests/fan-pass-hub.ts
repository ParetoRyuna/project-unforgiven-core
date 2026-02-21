import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

import { quoteHubDecision, resetHubDecisionCacheForTests } from '../services/fan-pass-hub/src/decision_engine.ts';
import {
  anchorCurrentSnapshot,
  clearPersistedFanPassHubGraphStoreForTests,
  exportWalletGraph,
  ingestGraphEvent,
  reinitializeFanPassHubGraphStoreForTests,
  resetFanPassHubGraphStoreForTests,
  upsertRelationEdge,
} from '../services/fan-pass-hub/src/graph_store.ts';
import { SolanaAdapter } from '../services/fan-pass-hub/src/chain_adapter.ts';
import { executeFanPassWorkflow, getFanPassCatalog } from '../services/fan-pass-hub/src/hub_workflow.ts';

const WALLET_A = '11111111111111111111111111111111';
const WALLET_B = 'So11111111111111111111111111111111111111112';

describe('Fan Pass Hub', () => {
  const storePath = path.join('/tmp', `wanwan-fan-pass-test-${process.pid}.json`);

  beforeEach(() => {
    process.env.HUB_GRAPH_STORE_PATH = storePath;
    clearPersistedFanPassHubGraphStoreForTests();
    reinitializeFanPassHubGraphStoreForTests();
    resetFanPassHubGraphStoreForTests();
    resetHubDecisionCacheForTests();
  });

  afterEach(() => {
    resetHubDecisionCacheForTests();
    clearPersistedFanPassHubGraphStoreForTests();
    reinitializeFanPassHubGraphStoreForTests();
  });

  it('keeps quote decision deterministic for same input under same snapshot version', async () => {
    ingestGraphEvent({
      wallet: WALLET_A,
      event_type: 'view',
      asset_id: 'asset:launch:alpha',
    });

    const input = {
      wallet: WALLET_A,
      action_type: 'purchase' as const,
      asset_id: 'asset:launch:alpha',
      context: {
        amount_lamports: '1500000000',
        channel: 'landing',
      },
    };
    const first = await quoteHubDecision(input);
    const second = await quoteHubDecision(input);

    expect(second).to.deep.equal(first);
    expect(first.snapshot_version).to.equal(second.snapshot_version);
  });

  it('blocks invalid verified proof ownership mismatch', async () => {
    const quote = await quoteHubDecision({
      wallet: WALLET_A,
      action_type: 'purchase',
      asset_id: 'asset:music:beta',
      proofs: [{ claimData: { owner: WALLET_B, provider: 'github' } }],
    });

    expect(quote.decision).to.equal('block');
    expect(quote.reason_codes).to.include('shield_status_400');
    expect(quote.signature_payload).to.equal(null);
  });

  it('updates reputation score using events and relations', () => {
    ingestGraphEvent({
      wallet: WALLET_A,
      event_type: 'verify',
      asset_id: 'campaign:fanpass',
    });
    ingestGraphEvent({
      wallet: WALLET_A,
      event_type: 'purchase',
      asset_id: 'drop:001',
      value_lamports: '1000000000',
    });
    upsertRelationEdge({
      from_wallet: WALLET_A,
      to_id: 'creator:wanwan',
      edge_type: 'user_creator',
      weight: 70,
    });

    const exported = exportWalletGraph(WALLET_A);
    expect(exported.events.length).to.equal(2);
    expect(exported.relations.length).to.equal(1);
    expect(exported.reputation.score).to.be.greaterThan(60);
    expect(exported.reputation.trust_tier).to.not.equal('low');
  });

  it('anchors snapshot hash and keeps export lookup consistent', async () => {
    ingestGraphEvent({
      wallet: WALLET_A,
      event_type: 'task_complete',
      asset_id: 'quest:rankup',
    });
    const adapter = new SolanaAdapter({ mockMode: true });
    const receipt = await anchorCurrentSnapshot(adapter);
    const exported = exportWalletGraph(WALLET_A);

    expect(receipt.snapshot_hash_hex).to.equal(exported.reputation.snapshot_hash_hex);
    expect(exported.latest_anchor?.snapshot_version).to.equal(exported.reputation.snapshot_version);
    expect(exported.latest_anchor?.mode).to.equal('mock');
  });

  it('restores events and relations from persisted graph store after reinitialize', () => {
    ingestGraphEvent({
      wallet: WALLET_A,
      event_type: 'purchase',
      asset_id: 'drop:persisted',
      value_lamports: '2300000000',
    });
    upsertRelationEdge({
      from_wallet: WALLET_A,
      to_id: 'community:inner-circle',
      edge_type: 'user_community',
      weight: 55,
    });
    const before = exportWalletGraph(WALLET_A);
    expect(fs.existsSync(storePath)).to.equal(true);

    reinitializeFanPassHubGraphStoreForTests();
    const after = exportWalletGraph(WALLET_A);

    expect(after.events.length).to.equal(before.events.length);
    expect(after.relations.length).to.equal(before.relations.length);
    expect(after.reputation.snapshot_hash_hex).to.equal(before.reputation.snapshot_hash_hex);
  });

  it('exposes business catalog and executes purchase workflow end-to-end', async () => {
    const catalog = getFanPassCatalog();
    expect(catalog.releases.length).to.be.greaterThan(0);
    expect(catalog.memberships.length).to.be.greaterThan(0);
    expect(catalog.tasks.length).to.be.greaterThan(0);

    const release = catalog.releases[0];
    const result = await executeFanPassWorkflow({
      wallet: WALLET_A,
      workflow_kind: 'purchase_release',
      item_id: release.id,
    });

    expect(result.quote.decision).to.not.equal('block');
    expect(result.executed).to.equal(true);
    expect(result.event_result).to.not.equal(null);
    expect(result.relation_result).to.not.equal(null);
    expect(result.export_snapshot.events.length).to.be.greaterThan(0);
  });

  it('returns step-up on sensitive membership workflow without proof', async () => {
    const catalog = getFanPassCatalog();
    const membership = catalog.memberships[0];
    const result = await executeFanPassWorkflow({
      wallet: WALLET_A,
      workflow_kind: 'upgrade_membership',
      item_id: membership.id,
    });

    expect(result.executed).to.equal(false);
    expect(result.needs_step_up).to.equal(true);
    expect(result.quote.decision).to.equal('step_up');
    expect(result.event_result).to.equal(null);
  });
});
