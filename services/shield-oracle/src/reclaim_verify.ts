import { verifyProof, type Proof } from '@reclaimprotocol/js-sdk';

import { claimProofIdentifierForReplayProtection } from './proof_replay_store.ts';

type VerificationResult =
  | { ok: true; proofIdentifiers: string[] }
  | { ok: false; status: number; reason: string };

function allowedProviders(): Set<string> {
  const raw = process.env.RECLAIM_ALLOWED_PROVIDERS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return new Set(list);
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
  if (fromJson) return fromJson === walletBase58;
  return contextRaw.includes(walletBase58);
}

export async function verifyReclaimProofBundle(input: {
  walletBase58: string;
  attestations: Record<string, unknown>[];
}): Promise<VerificationResult> {
  const proofs = normalizeProofs(input.attestations);
  if (proofs.length === 0) {
    return { ok: false, status: 400, reason: 'no attestations provided' };
  }

  const cryptographicValid = await verifyProof(proofs, false).catch(() => false);
  if (!cryptographicValid) {
    return { ok: false, status: 400, reason: 'reclaim proof signature verification failed' };
  }

  const providerAllowlist = allowedProviders();
  const requireContextWallet = process.env.RECLAIM_REQUIRE_CONTEXT_MATCH !== '0';
  const identifiers: string[] = [];

  for (const proof of proofs) {
    const provider = proof?.claimData?.provider?.toLowerCase?.() ?? '';
    if (providerAllowlist.size > 0 && !providerAllowlist.has(provider)) {
      return { ok: false, status: 400, reason: 'provider not allowlisted' };
    }

    const owner = proof?.claimData?.owner ?? '';
    if (owner !== input.walletBase58) {
      return { ok: false, status: 400, reason: 'reclaim proof owner mismatch' };
    }

    if (requireContextWallet) {
      const contextRaw = proof?.claimData?.context ?? '';
      if (typeof contextRaw !== 'string' || !contextMatchesWallet(contextRaw, input.walletBase58)) {
        return { ok: false, status: 400, reason: 'reclaim proof context wallet mismatch' };
      }
    }

    const identifier = (proof?.identifier || proof?.claimData?.identifier || '').trim();
    if (!identifier) {
      return { ok: false, status: 400, reason: 'reclaim proof identifier missing' };
    }
    identifiers.push(identifier);
  }

  for (const identifier of identifiers) {
    const accepted = await claimProofIdentifierForReplayProtection(identifier);
    if (!accepted) {
      return { ok: false, status: 409, reason: 'reclaim proof replay detected' };
    }
  }

  return { ok: true, proofIdentifiers: identifiers };
}
