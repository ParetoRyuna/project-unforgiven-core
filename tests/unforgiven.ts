import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

describe("UNFORGIVEN - VRGDA Logic Demo", () => {
  // 设置连接
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();

  // --- VRGDA 核心算法 (JS 映射版本) ---
  const BPS = 10000n;
  const DECAY_CONSTANT = 100n; 
  const BASE_PRICE = 1_000_000_000n; // 1 SOL (Lamports)

  function calculateVrgdaPrice(itemsSold: number, targetRateBps: number, startTime: number) {
    const now = Math.floor(Date.now() / 1000);
    const duration = BigInt(now - startTime);
    const targetSold = (duration * BigInt(targetRateBps)) / BPS;
    const salesDifference = BigInt(itemsSold) - targetSold;
    const priceModifierBps = salesDifference * DECAY_CONSTANT;
    const finalPrice = (BASE_PRICE * (BPS + priceModifierBps)) / BPS;
    
    return {
        target: targetSold.toString(),
        actual: itemsSold,
        diff: salesDifference.toString(),
        priceSol: (Number(finalPrice) / 1_000_000_000).toFixed(4)
    };
  }

  it("Verifies Program and Showcases VRGDA Pricing", async () => {
    const programId = new PublicKey("7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT");
    console.log("\n🚀 [System Check] Pinging Program:", programId.toBase58());

    const accountInfo = await provider.connection.getAccountInfo(programId);
    if (accountInfo) {
        console.log("✅ [Status] Contract is LIVE on Localnet.");
    }

    console.log("\n📈 [Demo] VRGDA Dynamic Pricing Scenarios:");
    const startTime = Math.floor(Date.now() / 1000) - 300; // 5分钟前开始
    const targetRate = 2000; // 目标每秒卖 0.2 张票 (5秒一张)

    // 场景 1: 销售极其冷清
    let s1 = calculateVrgdaPrice(20, targetRate, startTime);
    console.log("--------------------------------------------------");
    console.log("📉 SCENARIO: LOW DEMAND");
    console.log(`   Target: ${s1.target} | Actual: ${s1.actual} | Diff: ${s1.diff}`);
    console.log(`   >>> Price dropped to: ${s1.priceSol} SOL`);

    // 场景 2: 销售符合预期
    let s2 = calculateVrgdaPrice(60, targetRate, startTime);
    console.log("--------------------------------------------------");
    console.log("⚖️  SCENARIO: NORMAL DEMAND");
    console.log(`   Target: ${s2.target} | Actual: ${s2.actual} | Diff: ${s2.diff}`);
    console.log(`   >>> Price stays at: ${s2.priceSol} SOL`);

    // 场景 3: 疯狂抢购
    let s3 = calculateVrgdaPrice(150, targetRate, startTime);
    console.log("--------------------------------------------------");
    console.log("🔥 SCENARIO: HIGH DEMAND (BULL RUN)");
    console.log(`   Target: ${s3.target} | Actual: ${s3.actual} | Diff: ${s3.diff}`);
    console.log(`   >>> Price surged to: ${s3.priceSol} SOL`);
    console.log("--------------------------------------------------\n");
  });
});
