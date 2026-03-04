#!/usr/bin/env node

const { PublicKey } = require('@solana/web3.js');

const DEFAULT_SHIELD_API_BASE = 'http://127.0.0.1:3100';
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_STEP_UP_THRESHOLD_LAMPORTS = 20_000_000_000n;

function parseApiBase(apiBase) {
  const value = (apiBase || process.env.SHIELD_API_BASE || DEFAULT_SHIELD_API_BASE).trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid SHIELD_API_BASE: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`SHIELD_API_BASE must use http/https: ${value}`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function normalizeWallet(wallet) {
  if (typeof wallet !== 'string' || wallet.trim().length === 0) {
    throw new Error('wallet must be a non-empty base58 string');
  }
  try {
    return new PublicKey(wallet.trim()).toBase58();
  } catch {
    throw new Error(`invalid wallet public key: ${wallet}`);
  }
}

function normalizeQuantity(quantity) {
  if (quantity == null) return 1;
  const n = Number(quantity);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('quantity must be a positive integer');
  }
  return n;
}

function normalizeRetryCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RETRY_COUNT;
  return Math.max(0, Math.floor(parsed));
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.floor(parsed);
}

function normalizeStepUpThreshold(value) {
  if (value == null) return DEFAULT_STEP_UP_THRESHOLD_LAMPORTS;
  try {
    return BigInt(value);
  } catch {
    throw new Error(`invalid step-up threshold lamports: ${value}`);
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.name === 'AbortError') return true;
  if (typeof error.status === 'number') return error.status >= 500;
  return true;
}

function parseTier(userMode) {
  if (userMode === 2) return 'verified';
  if (userMode === 1) return 'guest';
  return 'bot_suspected';
}

function parsePriceLamports(shieldBody) {
  const raw = shieldBody?.payload?.initial_price ?? '0';
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function parseDignityScore(shieldBody) {
  const fromPayload = shieldBody?.payload?.dignity_score;
  const fromTop = shieldBody?.dignity_score;
  const score = Number(fromPayload ?? fromTop ?? 0);
  if (!Number.isFinite(score)) return 0;
  return score;
}

function parseTtlSeconds(shieldBody, nowSec) {
  const expiryRaw = shieldBody?.payload?.attestation_expiry;
  if (!expiryRaw) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry)) return null;
  return Math.max(0, Math.floor(expiry - nowSec));
}

function buildDecisionResult(input, shieldBody, options) {
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const priceLamports = parsePriceLamports(shieldBody);
  const dignityScore = parseDignityScore(shieldBody);
  const userMode = Number(shieldBody?.payload?.user_mode ?? 1);
  const tier = parseTier(userMode);
  const ttlSeconds = parseTtlSeconds(shieldBody, nowSec);

  let decision = 'allow';
  const reasonCodes = [];

  if (dignityScore <= 20) {
    decision = 'block';
    reasonCodes.push('low_dignity');
  } else if (priceLamports > options.stepUpThresholdLamports) {
    decision = 'step_up';
    reasonCodes.push('surge_protection');
  } else if (tier === 'bot_suspected') {
    decision = 'step_up';
    reasonCodes.push('bot_suspected_tier');
  } else {
    reasonCodes.push('allow_default');
  }

  return {
    decision,
    reason_codes: reasonCodes,
    final_price_lamports: priceLamports.toString(),
    payload_hex: shieldBody?.payload_hex ?? null,
    oracle_signature_hex: shieldBody?.oracle_signature_hex ?? null,
    oracle_pubkey: shieldBody?.oracle_pubkey ?? null,
    ttl_seconds: ttlSeconds,
    tier,
    ticket_id: input.ticketId,
    quantity: input.quantity,
  };
}

async function fetchShieldQuote(wallet, attestations = [], options = {}) {
  const apiBase = parseApiBase(options.apiBase);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }
  const retryCount = normalizeRetryCount(options.retryCount ?? process.env.PLUGIN_RETRY_COUNT);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs ?? process.env.PLUGIN_TIMEOUT_MS);

  let lastError = null;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${apiBase}/api/shield-score`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet, mode: 'guest', reclaim_attestations: attestations }),
        signal: controller.signal,
      });
      const raw = await res.text();
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new Error(`shield returned non-JSON body (status=${res.status})`);
      }
      if (!res.ok) {
        const error = new Error(`shield failed (${res.status}): ${JSON.stringify(body)}`);
        error.status = res.status;
        error.body = body;
        throw error;
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt >= retryCount || !isRetryableError(error)) break;
      const backoff = 200 * (2 ** attempt);
      await waitMs(backoff);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('shield request failed');
}

async function antiBotTicketPlugin(input, options = {}) {
  const payload = input && typeof input === 'object' ? input : {};
  const wallet = normalizeWallet(payload.wallet);
  const ticketId = typeof payload.ticketId === 'string' && payload.ticketId.trim().length > 0
    ? payload.ticketId.trim()
    : 'ticket_unknown';
  const quantity = normalizeQuantity(payload.quantity);
  const attestations = Array.isArray(payload.attestations) ? payload.attestations : [];
  const stepUpThresholdLamports = normalizeStepUpThreshold(
    options.stepUpThresholdLamports ?? process.env.PLUGIN_STEP_UP_THRESHOLD_LAMPORTS,
  );

  const shield = await fetchShieldQuote(wallet, attestations, options);
  const result = buildDecisionResult(
    { wallet, ticketId, quantity },
    shield,
    {
      nowMs: options.nowMs,
      stepUpThresholdLamports,
    },
  );

  console.info(
    JSON.stringify({
      event: 'plugin_ticket_decision',
      wallet,
      tier: result.tier,
      decision: result.decision,
      price_lamports: result.final_price_lamports,
      reason_codes: result.reason_codes,
      ticket_id: ticketId,
      quantity,
    }),
  );

  return result;
}

if (require.main === module) {
  const wallet = process.argv[2] || '11111111111111111111111111111111';
  antiBotTicketPlugin({ wallet, ticketId: 'show_001', quantity: 1 })
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(
        JSON.stringify({
          event: 'plugin_ticket_error',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      process.exit(1);
    });
}

module.exports = {
  antiBotTicketPlugin,
  fetchShieldQuote,
  normalizeWallet,
  parseApiBase,
  buildDecisionResult,
};
