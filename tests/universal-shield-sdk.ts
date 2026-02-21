import { expect } from "chai";
import {
  activateUniversalShield,
  buildExecuteShieldRequest,
  buildShieldPayloadV0,
  calculateShieldQuote,
  serializeShieldPayloadV0,
} from "../packages/universal-shield-sdk/src/index.ts";

const USER = "11111111111111111111111111111111";

describe("Universal Shield SDK", () => {
  it("serializes payload deterministically with frozen 141-byte layout", () => {
    const input = {
      userPubkey: USER,
      initialPrice: 1_000_000_000n,
      salesVelocityBps: 5_000,
      timeElapsed: 12n,
      mode: "verified" as const,
      attestations: [
        { provider: "github", data: { commit_count: 60 } },
        { provider: "spotify", data: { playtime_hours: 12 } },
      ],
      nonce: 11n,
      proofPlaceholder: {
        proofHashHex: "ab".repeat(32),
        issuedAt: 1_700_000_000_000,
      },
    };

    const p1 = buildShieldPayloadV0(input);
    const p2 = buildShieldPayloadV0(input);

    const b1 = serializeShieldPayloadV0(p1.payload);
    const b2 = serializeShieldPayloadV0(p2.payload);

    expect(Buffer.from(b1).toString("hex")).to.equal(Buffer.from(b2).toString("hex"));
    expect(b1.length).to.equal(141);
    expect(b1[0]).to.equal(0);
    expect(b1[57]).to.equal(70);
  });

  it("includes proof placeholder and anti-resale policy in quote output", () => {
    const quote = activateUniversalShield({
      userPubkey: USER,
      initialPrice: 1_000_000_000n,
      salesVelocityBps: 5_000,
      timeElapsed: 12n,
      mode: "guest",
    });

    expect(quote.proof_placeholder.provider).to.equal("reclaim");
    expect(quote.proof_placeholder.schemaVersion).to.equal("v0");
    expect(quote.proof_placeholder.proofHashHex).to.have.length(64);
    expect(quote.antiResalePolicy.maxTicketsPerWallet).to.equal(1);
    expect(quote.antiResalePolicy.cooldownSeconds).to.equal(86_400);
  });

  it("matches Rust fixture vectors (3 cases)", () => {
    const vectors = [
      {
        label: "score-0",
        attestations: [] as Record<string, unknown>[],
        expected: 120_000_000_000n,
        isInfinite: false,
        blocked: true,
      },
      {
        label: "score-50",
        attestations: [
          { provider: "spotify", data: { playtime_hours: 12 } },
          { provider: "twitter", data: { account_age_days: 500, activity_score: 80 } },
        ],
        expected: 4_109_890_666n,
        isInfinite: false,
        blocked: false,
      },
      {
        label: "score-90",
        attestations: [
          { provider: "github", data: { commit_count: 80 } },
          { provider: "spotify", data: { playtime_hours: 12 } },
          { provider: "twitter", data: { account_age_days: 700, activity_score: 99 } },
        ],
        expected: 997_977_140n,
        isInfinite: false,
        blocked: false,
      },
    ];

    for (const v of vectors) {
      const quote = calculateShieldQuote({
        userPubkey: USER,
        initialPrice: 1_000_000_000n,
        salesVelocityBps: 5_000,
        timeElapsed: 12n,
        mode: "verified",
        attestations: v.attestations,
        proofPlaceholder: {
          proofHashHex: "00".repeat(32),
          issuedAt: 1_700_000_000_000,
        },
      });

      expect(quote.finalPrice, v.label).to.equal(v.expected);
      expect(quote.isInfinite, v.label).to.equal(v.isInfinite);
      expect(quote.blocked, v.label).to.equal(v.blocked);
    }
  });

  it("builds execute request with oracle signature for non-blocked user", async () => {
    const req = await buildExecuteShieldRequest(
      {
        userPubkey: USER,
        initialPrice: 1_000_000_000n,
        salesVelocityBps: 5_000,
        timeElapsed: 12n,
        mode: "verified",
        attestations: [
          { provider: "github", data: { commit_count: 80 } },
          { provider: "spotify", data: { playtime_hours: 12 } },
          { provider: "twitter", data: { account_age_days: 700, activity_score: 99 } },
        ],
      },
      (payloadBytes) => {
        const sig = new Uint8Array(64);
        sig.set(payloadBytes.slice(0, 32), 0);
        sig.set(payloadBytes.slice(0, 32), 32);
        return sig;
      },
    );

    expect(req.quote.blocked).to.equal(false);
    expect(req.oracleSignature.length).to.equal(64);
    expect(req.oracleSignatureHex.startsWith("0x")).to.equal(true);
  });

  it("rejects execute request when shield marks payload as blocked", async () => {
    let err: Error | null = null;
    try {
      await buildExecuteShieldRequest(
        {
          userPubkey: USER,
          initialPrice: 1_000_000_000n,
          salesVelocityBps: 5_000,
          timeElapsed: 12n,
          mode: "bot_suspected",
        },
        () => new Uint8Array(64),
      );
    } catch (e) {
      err = e as Error;
    }
    expect(err).to.not.equal(null);
    expect(err?.message).to.equal("shield blocked this payload; execute request denied");
  });
});
