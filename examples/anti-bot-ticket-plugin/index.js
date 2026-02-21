#!/usr/bin/env node

const SHIELD_API_BASE = process.env.SHIELD_API_BASE || "http://127.0.0.1:3100";

async function fetchShieldQuote(wallet, attestations = []) {
  const res = await fetch(`${SHIELD_API_BASE}/api/shield-score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, mode: "guest", reclaim_attestations: attestations }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`shield failed (${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function antiBotTicketPlugin({ wallet, ticketId, quantity = 1, attestations = [] }) {
  const shield = await fetchShieldQuote(wallet, attestations);
  const priceLamports = BigInt(shield?.payload?.initial_price ?? "0");
  const blocked = (shield?.dignity_score ?? 0) <= 20;
  if (blocked) return { decision: "block", reason: "low_dignity", priceLamports: priceLamports.toString() };
  if (priceLamports > 20_000_000_000n) {
    return { decision: "step_up", reason: "surge_protection", priceLamports: priceLamports.toString() };
  }
  return {
    decision: "allow",
    ticketId,
    quantity,
    priceLamports: priceLamports.toString(),
    payloadHex: shield.payload_hex,
    oracleSignatureHex: shield.oracle_signature_hex,
    oraclePubkey: shield.oracle_pubkey,
  };
}

if (require.main === module) {
  const wallet = process.argv[2] || "11111111111111111111111111111111";
  antiBotTicketPlugin({ wallet, ticketId: "show_001", quantity: 1 })
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { antiBotTicketPlugin };
