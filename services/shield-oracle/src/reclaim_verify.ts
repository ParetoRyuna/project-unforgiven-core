import { verifyProof, type Proof } from '@reclaimprotocol/js-sdk';

import {
  claimProofIdentifierForReplayProtection,
  type ReplayClaimResult,
} from './proof_replay_store.ts';

type VerificationResult =
  | { ok: true; proofIdentifiers: string[] }
  | { ok: false; status: number; reason: VerificationReason };

export type VerificationReason =
  | 'no_attestations'
  | 'proof_signature_verification_failed'
  | 'provider_allowlist_required'
  | 'provider_not_allowlisted'
  | 'owner_wallet_mismatch'
  | 'context_wallet_mismatch'
  | 'proof_identifier_missing'
  | 'proof_replay_detected'
  | 'replay_backend_unavailable';

type VerifyDeps = {
  verifyProofFn?: (proofs: Proof[], skipSignatureValidation: boolean) => Promise<boolean> | boolean;
  claimProofIdentifierFn?: (identifier: string) => Promise<ReplayClaimResult>;
};

function allowedProviders(): Set<string> {
  const raw = process.env.RECLAIM_ALLOWED_PROVIDERS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return new Set(list);
}

function requireProviderAllowlist(): boolean {
  return process.env.NODE_ENV === 'production';
}

function parseContextWallet(context: string): string | null {
  try {
    const parsed = JSON.parse(context) as Record<string, unknown>;
    const candidates = [
      parsed.contextAddress,
      parsed.walletAddress,
      parsed.owner,
      parsed.wallet,
      parsed.address,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) {
        return c.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeProofs(attestations: Record<string, unknown>[]): Proof[] {
  return attestations as unknown as Proof[];
}

function contextMatchesWallet(contextRaw: string, walletBase58: string): boolean {
  const fromJson = parseContextWallet(contextRaw);
  return fromJson === walletBase58;
}

export async function verifyReclaimProofBundle(input: {
  walletBase58: string;
  attestations: Record<string, unknown>[];
}, deps: VerifyDeps = {}): Promise<VerificationResult> {
  const proofs = normalizeProofs(input.attestations);
  if (proofs.length === 0) {
    return { ok: false, status: 400, reason: 'no_attestations' };
  }

  const verifyProofFn = deps.verifyProofFn ?? verifyProof;
  const cryptographicValid = await Promise.resolve(verifyProofFn(proofs, false)).catch(() => false);
  if (!cryptographicValid) {
    return { ok: false, status: 400, reason: 'proof_signature_verification_failed' };
  }

  const providerAllowlist = allowedProviders();
  if (requireProviderAllowlist() && providerAllowlist.size === 0) {
    return { ok: false, status: 503, reason: 'provider_allowlist_required' };
  }
  const requireContextWallet = process.env.RECLAIM_REQUIRE_CONTEXT_MATCH !== '0';
  const identifiers: string[] = [];

  for (const proof of proofs) {
    const provider = proof?.claimData?.provider?.toLowerCase?.() ?? '';
    if (providerAllowlist.size > 0 && !providerAllowlist.has(provider)) {
      return { ok: false, status: 400, reason: 'provider_not_allowlisted' };
    }

    const owner = proof?.claimData?.owner ?? '';
    if (owner !== input.walletBase58) {
      return { ok: false, status: 400, reason: 'owner_wallet_mismatch' };
    }

    if (requireContextWallet) {
      const contextRaw = proof?.claimData?.context ?? '';
      if (typeof contextRaw !== 'string' || !contextMatchesWallet(contextRaw, input.walletBase58)) {
        return { ok: false, status: 400, reason: 'context_wallet_mismatch' };
      }
    }

    const identifier = (proof?.identifier || proof?.claimData?.identifier || '').trim();
    if (!identifier) {
      return { ok: false, status: 400, reason: 'proof_identifier_missing' };
    }
    identifiers.push(identifier);
  }

  const claimProofIdentifierFn =
    deps.claimProofIdentifierFn ?? claimProofIdentifierForReplayProtection;
  for (const identifier of identifiers) {
    const claimResult = await claimProofIdentifierFn(identifier);
    if (!claimResult.ok) {
      if (claimResult.reason === 'backend_unavailable') {
        return { ok: false, status: 503, reason: 'replay_backend_unavailable' };
      }
      return { ok: false, status: 409, reason: 'proof_replay_detected' };
    }
  }

  return { ok: true, proofIdentifiers: identifiers };
}
