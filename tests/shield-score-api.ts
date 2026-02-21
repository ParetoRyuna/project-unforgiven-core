import { expect } from "chai";
import {
  computeDignityScore,
  computeUniqKey,
  serializeShieldPayloadV0,
  validateAttestationWalletOwnership,
} from "../lib/shield_score.ts";
import { computeDignityScore as computeDignityFromAttestations } from "../services/dignity-scoring/src/index.ts";

describe("Shield Score API helpers", () => {
  it("computes adapter score for github+spotify+twitter", () => {
    const score = computeDignityScore(
      [
        { provider: "github", data: { commit_count: 80 } },
        { provider: "spotify", data: { playtime_hours: 12 } },
        { provider: "twitter", data: { account_age_days: 700, activity_score: 88 } },
      ],
      "verified",
    );

    expect(score.githubPoints).to.equal(40);
    expect(score.spotifyPoints).to.equal(30);
    expect(score.twitterPoints).to.equal(20);
    expect(score.totalScore).to.equal(90);
    expect(score.adapterMask).to.equal(0b111);
  });

  it("scores dignity from raw attestations via dignity-scoring service", () => {
    const raw = computeDignityFromAttestations([
      { provider: "github", data: { commit_count: 80 } },
      { provider: "spotify", data: { playtime_hours: 12 } },
      { provider: "twitter", data: { account_age_days: 700, activity_score: 88 } },
    ]);

    expect(raw.totalScore).to.equal(90);
    expect(raw.adapterMask).to.equal(0b111);
  });

  it("validates attestation wallet ownership and rejects mismatches", () => {
    const wallet = "11111111111111111111111111111111";
    const ok = validateAttestationWalletOwnership(
      [{ claimData: { owner: wallet, provider: "github" } }],
      wallet,
    );
    expect(ok.valid).to.equal(true);

    const bad = validateAttestationWalletOwnership(
      [{ claimData: { owner: "So11111111111111111111111111111111111111112", provider: "github" } }],
      wallet,
    );
    expect(bad.valid).to.equal(false);
  });

  it("keeps uniq key deterministic and payload length frozen", () => {
    const proofHash = new Uint8Array(32).fill(9);
    const wallet = new Uint8Array(32).fill(7);
    const uniq1 = computeUniqKey(proofHash, wallet);
    const uniq2 = computeUniqKey(proofHash, wallet);
    expect(uniq1).to.equal(uniq2);

    const payload = {
      policy_version: 0,
      user_pubkey: new Uint8Array(32).fill(1),
      initial_price: 1_000_000_000n,
      sales_velocity_bps: 5_000n,
      time_elapsed: 12n,
      dignity_score: 90,
      adapter_mask: 0b111,
      user_mode: 2,
      zk_provider: 1,
      zk_proof_hash: new Uint8Array(32).fill(2),
      scoring_model_hash: new Uint8Array(32).fill(3),
      attestation_expiry: 1_700_000_000n,
      nonce: 99n,
    };

    const bytes = serializeShieldPayloadV0(payload);
    expect(bytes.length).to.equal(141);
    expect(bytes[57]).to.equal(90);
    expect(bytes[58]).to.equal(0b111);
  });
});
