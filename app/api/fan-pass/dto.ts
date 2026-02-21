import { PublicKey } from '@solana/web3.js';

import {
  FAN_PASS_WORKFLOW_KINDS,
  type ExecuteFanPassWorkflowInput,
  type FanPassWorkflowKind,
} from '@/services/fan-pass-hub/src/types';
import { InputValidationError } from '@/app/api/hub/dto';

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

function parseWallet(raw: unknown): string {
  const wallet = asString(raw, 'wallet');
  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    throw new InputValidationError('wallet must be a valid Solana public key');
  }
}

function parseProofs(raw: unknown): Record<string, unknown>[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw new InputValidationError('proofs must be an array');
  return raw.map((item, index) => asObject(item, `proofs[${index}]`));
}

export function parseExecuteFanPassWorkflowBody(body: unknown): ExecuteFanPassWorkflowInput {
  const obj = asObject(body, 'body');
  const workflowKind = asString(obj.workflow_kind, 'workflow_kind') as FanPassWorkflowKind;
  if (!FAN_PASS_WORKFLOW_KINDS.includes(workflowKind)) {
    throw new InputValidationError(`workflow_kind must be one of: ${FAN_PASS_WORKFLOW_KINDS.join(', ')}`);
  }
  return {
    wallet: parseWallet(obj.wallet),
    workflow_kind: workflowKind,
    item_id: asString(obj.item_id, 'item_id'),
    proofs: parseProofs(obj.proofs),
  };
}
