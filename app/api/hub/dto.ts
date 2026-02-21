import { PublicKey } from '@solana/web3.js';

import { HUB_ACTION_TYPES, type HubDecisionQuoteRequest, type RiskSignal } from '@/services/fan-pass-hub/src/types';

export class InputValidationError extends Error {}

function asObject(input: unknown, name: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InputValidationError(`${name} must be an object`);
  }
  return input as Record<string, unknown>;
}

function asString(input: unknown, name: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new InputValidationError(`${name} must be a non-empty string`);
  }
  return input.trim();
}

function asOptionalString(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input !== 'string' || input.trim().length === 0) return undefined;
  return input.trim();
}

function parseWallet(input: unknown): string {
  const wallet = asString(input, 'wallet');
  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    throw new InputValidationError('wallet must be a valid Solana public key');
  }
}

function parseRiskSignals(input: unknown): RiskSignal[] | undefined {
  if (input == null) return undefined;
  if (!Array.isArray(input)) throw new InputValidationError('risk_signals must be an array');
  return input.map((raw, index) => {
    const item = asObject(raw, `risk_signals[${index}]`);
    const signal = asString(item.signal, `risk_signals[${index}].signal`) as RiskSignal['signal'];
    const source = asString(item.source, `risk_signals[${index}].source`) as RiskSignal['source'];
    const weight = Number(item.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new InputValidationError(`risk_signals[${index}].weight must be between 0 and 100`);
    }
    return { signal, source, weight };
  });
}

function parseProofs(input: unknown): Record<string, unknown>[] | undefined {
  if (input == null) return undefined;
  if (!Array.isArray(input)) throw new InputValidationError('proofs must be an array');
  return input.map((raw, index) => asObject(raw, `proofs[${index}]`));
}

function parseContext(input: unknown): HubDecisionQuoteRequest['context'] {
  if (input == null) return undefined;
  const obj = asObject(input, 'context');
  const amountLamportsRaw = asOptionalString(obj.amount_lamports);
  if (amountLamportsRaw && !/^\d+$/.test(amountLamportsRaw)) {
    throw new InputValidationError('context.amount_lamports must be a decimal string');
  }
  const metadata =
    obj.metadata && typeof obj.metadata === 'object' && !Array.isArray(obj.metadata)
      ? (obj.metadata as Record<string, unknown>)
      : undefined;
  return {
    channel: asOptionalString(obj.channel),
    campaign_id: asOptionalString(obj.campaign_id),
    amount_lamports: amountLamportsRaw,
    metadata,
  };
}

export function parseHubDecisionQuoteBody(body: unknown): HubDecisionQuoteRequest {
  const obj = asObject(body, 'body');
  const actionType = asString(obj.action_type, 'action_type') as HubDecisionQuoteRequest['action_type'];
  if (!HUB_ACTION_TYPES.includes(actionType)) {
    throw new InputValidationError(`action_type must be one of: ${HUB_ACTION_TYPES.join(', ')}`);
  }
  return {
    wallet: parseWallet(obj.wallet),
    action_type: actionType,
    asset_id: asString(obj.asset_id, 'asset_id'),
    context: parseContext(obj.context),
    proofs: parseProofs(obj.proofs),
    risk_signals: parseRiskSignals(obj.risk_signals),
  };
}
