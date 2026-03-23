'use client';

import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';

const DEFAULT_PROGRAM_ID = new PublicKey('5VqDVHqeCJW1cWZgydjJLG68ShDGVZ45k6cE7hUY9uMW');

/**
 * Returns only the program ID (from env or default). Does not load IDL or create Anchor Program.
 * Use this on pages that only need programId (e.g. /demo/guarded-claim) to avoid IdlCoder/IDL parsing errors.
 */
export function useProgramId(): PublicKey {
  return useMemo(() => {
    const value = process.env.NEXT_PUBLIC_PROGRAM_ID;
    return value ? new PublicKey(value) : DEFAULT_PROGRAM_ID;
  }, []);
}
