import { expect } from "chai";

import { evaluateShieldRateLimit } from "../services/shield-oracle/src/rate_limit.ts";
import { claimProofIdentifierForReplayProtection } from "../services/shield-oracle/src/proof_replay_store.ts";
import { verifyReclaimProofBundle } from "../services/shield-oracle/src/reclaim_verify.ts";

const WALLET = "11111111111111111111111111111111";
const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

function proof(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    identifier: "proof-1",
    claimData: {
      identifier: "proof-1",
      provider: "github",
      owner: WALLET,
      context: JSON.stringify({ walletAddress: WALLET }),
    },
    ...overrides,
  };
}

describe("Shield oracle hardening policies", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("fails closed for rate limiting in production when Redis is unavailable", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;
    delete process.env.SHIELD_RATE_LIMIT_REQUIRE_REDIS;

    const decision = await evaluateShieldRateLimit({ ip: "127.0.0.1", wallet: WALLET });
    expect(decision.ok).to.equal(false);
    expect(decision.reason).to.equal("backend_unavailable");
    expect(decision.scope).to.equal("ip");
  });

  it("fails closed for replay store in production when Redis is unavailable", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;
    delete process.env.RECLAIM_REPLAY_REQUIRE_REDIS;

    const result = await claimProofIdentifierForReplayProtection(`proof-${Date.now()}`);
    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.reason).to.equal("backend_unavailable");
    }
  });

  it("requires a non-empty provider allowlist in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.RECLAIM_ALLOWED_PROVIDERS;

    const result = await verifyReclaimProofBundle(
      { walletBase58: WALLET, attestations: [proof()] },
      {
        verifyProofFn: async () => true,
        claimProofIdentifierFn: async () => ({ ok: true }),
      },
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.status).to.equal(503);
      expect(result.reason).to.equal("provider_allowlist_required");
    }
  });

  it("rejects proofs from providers outside the allowlist", async () => {
    process.env.NODE_ENV = "production";
    process.env.RECLAIM_ALLOWED_PROVIDERS = "github";

    const result = await verifyReclaimProofBundle(
      {
        walletBase58: WALLET,
        attestations: [
          proof({
            claimData: {
              identifier: "proof-2",
              provider: "twitter",
              owner: WALLET,
              context: JSON.stringify({ walletAddress: WALLET }),
            },
          }),
        ],
      },
      {
        verifyProofFn: async () => true,
        claimProofIdentifierFn: async () => ({ ok: true }),
      },
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.status).to.equal(400);
      expect(result.reason).to.equal("provider_not_allowlisted");
    }
  });

  it("rejects non-structured context strings even if wallet text is present", async () => {
    process.env.NODE_ENV = "production";
    process.env.RECLAIM_ALLOWED_PROVIDERS = "github";
    process.env.RECLAIM_REQUIRE_CONTEXT_MATCH = "1";

    const result = await verifyReclaimProofBundle(
      {
        walletBase58: WALLET,
        attestations: [
          proof({
            identifier: "proof-3",
            claimData: {
              identifier: "proof-3",
              provider: "github",
              owner: WALLET,
              context: `wallet=${WALLET}`,
            },
          }),
        ],
      },
      {
        verifyProofFn: async () => true,
        claimProofIdentifierFn: async () => ({ ok: true }),
      },
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.status).to.equal(400);
      expect(result.reason).to.equal("context_wallet_mismatch");
    }
  });
});
