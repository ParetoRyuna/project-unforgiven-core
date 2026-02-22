import type { RawAttestation } from './types.ts';

export function providerName(attestation: RawAttestation): string {
  const raw =
    (attestation.provider as string | undefined) ??
    (attestation.providerName as string | undefined) ??
    ((attestation.claimData as Record<string, unknown> | undefined)?.provider as string | undefined) ??
    '';
  return raw.toLowerCase();
}

export function readPathNumber(input: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    const parts = path.split('.');
    let cur: unknown = input;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === 'number' && Number.isFinite(cur)) return cur;
    if (typeof cur === 'string') {
      const n = Number(cur);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
