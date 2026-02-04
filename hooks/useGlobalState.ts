'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT'
);

// GlobalState 布局：8 discriminator + authority(32) + oracle(32) + target_rate_bps(8) + start_time(8) + base_price(8) + items_sold(8) + bump(1)
const DISCRIMINATOR = 8;
const AUTHORITY_LEN = 32;
const ORACLE_LEN = 32;
const TARGET_RATE_OFFSET = DISCRIMINATOR + AUTHORITY_LEN + ORACLE_LEN;
const START_TIME_OFFSET = TARGET_RATE_OFFSET + 8;
const BASE_PRICE_OFFSET = START_TIME_OFFSET + 8;
const ITEMS_SOLD_OFFSET = BASE_PRICE_OFFSET + 8;

export interface GlobalStateMock {
  basePrice: number;
  targetRateBps: number;
  itemsSold: number;
  startTime: number;
  isMock: boolean;
}

const DEFAULT_MOCK: GlobalStateMock = {
  basePrice: 1_000_000_000, // 1 SOL
  targetRateBps: 1000,      // 0.1 items/sec
  itemsSold: 0,
  startTime: Math.floor(Date.now() / 1000),
  isMock: true,
};

export function useGlobalState() {
  const { connection } = useConnection();
  const [state, setState] = useState<GlobalStateMock>(DEFAULT_MOCK);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const [globalStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        PROGRAM_ID
      );
      const accountInfo = await connection.getAccountInfo(globalStatePda);
      if (!accountInfo?.data || accountInfo.data.length < ITEMS_SOLD_OFFSET + 8) {
        setState(prev => ({ ...DEFAULT_MOCK, itemsSold: prev.itemsSold, startTime: prev.startTime }));
        return;
      }
      const data = accountInfo.data;
      const targetRateBps = data.readBigUInt64LE(TARGET_RATE_OFFSET);
      const startTime = Number(data.readBigInt64LE(START_TIME_OFFSET));
      const basePrice = data.readBigUInt64LE(BASE_PRICE_OFFSET);
      const itemsSold = data.readBigUInt64LE(ITEMS_SOLD_OFFSET);
      setState({
        basePrice: Number(basePrice),
        targetRateBps: Number(targetRateBps),
        itemsSold: Number(itemsSold),
        startTime,
        isMock: false,
      });
    } catch {
      setState(prev => ({ ...DEFAULT_MOCK, itemsSold: prev.itemsSold, startTime: prev.startTime }));
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const setItemsSold = useCallback((updater: number | ((prev: number) => number)) => {
    setState(prev => ({
      ...prev,
      itemsSold: typeof updater === 'function' ? updater(prev.itemsSold) : updater,
    }));
  }, []);

  return { ...state, loading, refetch: fetchState, setItemsSold };
}
