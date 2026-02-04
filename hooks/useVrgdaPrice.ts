'use client';

// 与 programs/unforgiven/src/lib.rs 一致的 VRGDA 常数
const BPS = 10_000;
const MIN_ALPHA_BPS = 500;
const DECAY_CONSTANT = 100;
const PRICE_MODIFIER_MAX_BPS = 5000;

function tierToAlphaBps(tierLevel: number): number {
  switch (tierLevel) {
    case 1: return 10000;
    case 2: return 5000;
    default: return Math.max(2500, MIN_ALPHA_BPS);
  }
}

/**
 * 前端 VRGDA 定价（与合约公式一致）
 * @param basePrice lamports
 * @param targetRateBps 目标速率 basis points (10000 = 1/s)
 * @param itemsSold 已售数量
 * @param startTime 拍卖开始时间 (unix s)
 * @param tierLevel 1=Platinum, 2=Gold, 3=Silver
 * @param now 当前时间 (unix s)，默认 Date.now()/1000
 */
export function computeVrgdaPrice(
  basePrice: number,
  targetRateBps: number,
  itemsSold: number,
  startTime: number,
  tierLevel: number = 1,
  now: number = Math.floor(Date.now() / 1000)
): number {
  const safeAlpha = Math.max(tierToAlphaBps(tierLevel), MIN_ALPHA_BPS);
  const duration = Math.max(0, now - startTime);
  const targetSold = (duration * targetRateBps) / BPS;
  const salesDifference = itemsSold - targetSold;
  const priceModifierBps = Math.max(
    -PRICE_MODIFIER_MAX_BPS,
    Math.min(PRICE_MODIFIER_MAX_BPS, Math.round(salesDifference * DECAY_CONSTANT))
  );
  const numerator = BPS + priceModifierBps;
  const vrgdaPrice = (basePrice * numerator) / BPS;
  const finalPrice = (vrgdaPrice * BPS) / safeAlpha;
  return Math.floor(finalPrice);
}
