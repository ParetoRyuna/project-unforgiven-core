import { PublicKey } from '@solana/web3.js';

import {
  GRAPH_EVENT_TYPES,
  HUB_DECISIONS,
  RELATION_EDGE_TYPES,
  type GraphEventIngestInput,
  type RelationEdgeUpsertInput,
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

function parseWallet(input: unknown, name: string): string {
  const wallet = asString(input, name);
  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    throw new InputValidationError(`${name} must be a valid Solana public key`);
  }
}

function asOptionalString(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseMetadata(input: unknown): Record<string, unknown> | undefined {
  if (input == null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new InputValidationError('metadata must be an object');
  }
  return input as Record<string, unknown>;
}

function parseValueLamports(value: unknown): string | undefined {
  const raw = asOptionalString(value);
  if (!raw) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new InputValidationError('value_lamports must be a decimal string');
  }
  return raw;
}

export function parseGraphEventIngestBody(body: unknown): GraphEventIngestInput {
  const obj = asObject(body, 'body');
  const eventType = asString(obj.event_type, 'event_type') as GraphEventIngestInput['event_type'];
  if (!GRAPH_EVENT_TYPES.includes(eventType)) {
    throw new InputValidationError(`event_type must be one of: ${GRAPH_EVENT_TYPES.join(', ')}`);
  }
  const decision = asOptionalString(obj.decision) as GraphEventIngestInput['decision'];
  if (decision && !HUB_DECISIONS.includes(decision)) {
    throw new InputValidationError(`decision must be one of: ${HUB_DECISIONS.join(', ')}`);
  }
  const occurredAt =
    typeof obj.occurred_at === 'number' && Number.isFinite(obj.occurred_at) ? Math.floor(obj.occurred_at) : undefined;

  return {
    wallet: parseWallet(obj.wallet, 'wallet'),
    event_type: eventType,
    asset_id: asString(obj.asset_id, 'asset_id'),
    decision,
    value_lamports: parseValueLamports(obj.value_lamports),
    occurred_at: occurredAt,
    context:
      obj.context && typeof obj.context === 'object' && !Array.isArray(obj.context)
        ? (obj.context as GraphEventIngestInput['context'])
        : undefined,
  };
}

export function parseRelationUpsertBody(body: unknown): RelationEdgeUpsertInput {
  const obj = asObject(body, 'body');
  const edgeType = asString(obj.edge_type, 'edge_type') as RelationEdgeUpsertInput['edge_type'];
  if (!RELATION_EDGE_TYPES.includes(edgeType)) {
    throw new InputValidationError(`edge_type must be one of: ${RELATION_EDGE_TYPES.join(', ')}`);
  }
  const weight = Number(obj.weight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
    throw new InputValidationError('weight must be between 0 and 100');
  }
  return {
    from_wallet: parseWallet(obj.from_wallet, 'from_wallet'),
    to_id: asString(obj.to_id, 'to_id'),
    edge_type: edgeType,
    weight,
    metadata: parseMetadata(obj.metadata),
  };
}
