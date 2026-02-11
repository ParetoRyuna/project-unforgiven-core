import { BN } from '@coral-xyz/anchor';

export const VRGDA_CONSTANTS = {
  BPS: 10_000,
  GUEST_SALES_DIVISOR: 5000,
  SCALPER_SALES_DIVISOR: 3000,
  GUEST_CAP_SOL: 10,
  SCALPER_CAP_SOL: 1000,
  TARGET_RATE_DEMO_PER_HOUR: 1000,
  DECAY_DIVISOR: 5000,
  MIN_DECAY: 0.1,
} as const;

function toBigInt(value: BN | number | string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (BN.isBN(value)) return BigInt(value.toString());
  return BigInt(value);
}

export function computeVrgdaFinalPriceSol({
  basePriceSol,
  sales,
  target,
  tierLevel,
}: {
  basePriceSol: number;
  sales: number;
  target: number;
  tierLevel?: number;
}): number {
  if (tierLevel === 1) return Math.max(0.01, basePriceSol);
  const salesDifference = sales - target;
  const salesAhead = Math.max(0, salesDifference);
  const decayFactor =
    salesDifference <= 0
      ? Math.max(
          VRGDA_CONSTANTS.MIN_DECAY,
          1 - Math.abs(salesDifference) / VRGDA_CONSTANTS.DECAY_DIVISOR
        )
      : 1;

  if (tierLevel === 3) {
    const multiplier = 1 + Math.pow(salesAhead / VRGDA_CONSTANTS.SCALPER_SALES_DIVISOR, 2);
    const rawMultiplier = multiplier * decayFactor;
    const floor = basePriceSol * 10;
    const finalPrice = basePriceSol * Math.max(1, rawMultiplier) * 10;
    return Math.max(0.01, Math.max(floor, Math.min(VRGDA_CONSTANTS.SCALPER_CAP_SOL, finalPrice)));
  }

  const multiplier = 1 + salesAhead / VRGDA_CONSTANTS.GUEST_SALES_DIVISOR;
  const rawMultiplier = multiplier * decayFactor;
  const floor = basePriceSol;
  const finalPrice = basePriceSol * Math.max(1, rawMultiplier);
  return Math.max(0.01, Math.max(floor, Math.min(VRGDA_CONSTANTS.GUEST_CAP_SOL, finalPrice)));
}

export interface VrgdaInputs {
  basePrice: BN;
  targetRateBps: BN;
  startTime: BN;
  itemsSold: BN;
  now?: BN;
  tierLevel?: number;
  /** Override itemsSold for simulation (e.g. Slider). */
  customSold?: BN | number | null;
  /** Override time elapsed in hours for simulation. */
  customTimeElapsedHours?: number | null;
}

export interface VrgdaQuote {
  vrgdaPrice: BN;
  finalPrice: BN;
  deposit: BN;
}

export function calculateVrgdaPrice({
  basePrice,
  targetRateBps,
  startTime,
  itemsSold,
  now,
  tierLevel = 2,
  customSold,
  customTimeElapsedHours,
}: VrgdaInputs): VrgdaQuote {
  const baseLamports = toBigInt(basePrice);
  const targetRateBpsBig = toBigInt(targetRateBps);
  const startTimeSec = toBigInt(startTime);
  const itemsSoldBig = toBigInt(customSold != null ? customSold : itemsSold);
  const nowSec = toBigInt(now ?? Math.floor(Date.now() / 1000));

  const isSimulation = customSold != null || customTimeElapsedHours != null;
  const elapsedHours = customTimeElapsedHours != null
    ? Math.max(0, customTimeElapsedHours)
    : Number(nowSec > startTimeSec ? nowSec - startTimeSec : 0n) / 3600;
  const targetSold = isSimulation
    ? elapsedHours * VRGDA_CONSTANTS.TARGET_RATE_DEMO_PER_HOUR
    : Number((nowSec > startTimeSec ? nowSec - startTimeSec : 0n) * targetRateBpsBig / BigInt(VRGDA_CONSTANTS.BPS));
  const currentSold = customSold != null ? Number(customSold) : Number(itemsSoldBig);
  const salesDifference = currentSold - targetSold;
  const baseLamportsNumber = Number(baseLamports);
  const basePriceSol = baseLamportsNumber / 1_000_000_000;
  const salesAhead = Math.max(0, salesDifference);
  const decayFactor =
    salesDifference <= 0
      ? Math.max(
          VRGDA_CONSTANTS.MIN_DECAY,
          1 - Math.abs(salesDifference) / VRGDA_CONSTANTS.DECAY_DIVISOR
        )
      : 1;
  let finalPriceSol = basePriceSol;

  if (tierLevel === 3) {
    const multiplier = 1 + Math.pow(salesAhead / VRGDA_CONSTANTS.SCALPER_SALES_DIVISOR, 2);
    const rawMultiplier = multiplier * decayFactor;
    finalPriceSol = basePriceSol * Math.max(1, rawMultiplier) * 10;
    finalPriceSol = Math.max(basePriceSol * 10, Math.min(VRGDA_CONSTANTS.SCALPER_CAP_SOL, finalPriceSol));
  } else if (tierLevel === 2) {
    const multiplier = 1 + salesAhead / VRGDA_CONSTANTS.GUEST_SALES_DIVISOR;
    const rawMultiplier = multiplier * decayFactor;
    finalPriceSol = basePriceSol * Math.max(1, rawMultiplier);
    finalPriceSol = Math.max(basePriceSol, Math.min(VRGDA_CONSTANTS.GUEST_CAP_SOL, finalPriceSol));
  } else {
    finalPriceSol = basePriceSol;
  }

  const finalLamports = BigInt(Math.max(1, Math.round(finalPriceSol * 1_000_000_000)));
  const baseVrgdaPrice = finalLamports;
  const finalPrice = finalLamports;
  const deposit = finalLamports >= baseLamports ? finalLamports - baseLamports : 0n;

  return {
    vrgdaPrice: new BN(baseVrgdaPrice.toString()),
    finalPrice: new BN(finalPrice.toString()),
    deposit: new BN(deposit.toString()),
  };
}
