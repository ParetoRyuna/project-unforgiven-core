'use client';

import { useState, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '@/hooks/useProgram';
import { useBuyTicket } from '@/hooks/useBuyTicket';
import { useGlobalState } from '@/hooks/useGlobalState';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { computeVrgdaPrice } from '@/hooks/useVrgdaPrice';

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT'
);

const DEMO_PAY_AMOUNT_LAMPORTS = 100_000_000; // 0.1 SOL，演示用

export default function Home() {
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const { connection } = useConnection();
  const { program } = useProgram();
  const globalState = useGlobalState();
  const { buyTicket, loading: buyLoading, error: buyError } = useBuyTicket();
  const [simulateLoading, setSimulateLoading] = useState(false);

  const {
    basePrice,
    targetRateBps,
    itemsSold,
    startTime,
    isMock,
    loading: stateLoading,
    setItemsSold,
    refetch,
  } = globalState;

  const displayPriceLamports = computeVrgdaPrice(
    basePrice,
    targetRateBps,
    itemsSold,
    startTime,
    1
  );
  const displayPriceSol = displayPriceLamports / 1e9;

  const handleBuyTicket = useCallback(async () => {
    if (!connected || !publicKey) return;

    if (isMock) {
      setSimulateLoading(true);
      try {
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault')],
          PROGRAM_ID
        );
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: vaultPda,
            lamports: DEMO_PAY_AMOUNT_LAMPORTS,
          })
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;
        const signed = await wallet.signTransaction!(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          'confirmed'
        );
        setItemsSold((prev) => prev + 1);
        alert(`购票成功（演示）! TX: ${sig.slice(0, 16)}...`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '支付失败';
        alert(msg);
      } finally {
        setSimulateLoading(false);
      }
      return;
    }

    if (!program) return;
    const result = await buyTicket({
      connection,
      wallet,
      program,
      apiBaseUrl: '/api',
    });
    if (result.txSignature) {
      alert(`购票成功! TX: ${result.txSignature.slice(0, 20)}...`);
      refetch();
    }
    if (result.error) alert(result.error);
  }, [connected, publicKey, program, isMock, connection, wallet, buyTicket, setItemsSold, refetch]);

  const loading = buyLoading || simulateLoading;

  return (
    <div className="min-h-screen p-6 flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-chrome glow-text mb-2">
        PROJECT UNFORGIVEN
      </h1>
      <p className="text-neutral-400 text-sm mb-8">
        Identity-Weighted VRGDA Protocol
      </p>

      {!connected ? (
        <WalletMultiButton
          className="!glass-panel !glow-border !px-8 !py-4 !rounded-lg !text-burnt !font-semibold hover:!bg-white/5 !transition !bg-transparent !border !border-[rgba(255,255,255,0.1)] !text-base"
        >
          连接钱包
        </WalletMultiButton>
      ) : (
        <div className="glass-panel rounded-xl p-6 w-full max-w-sm space-y-4">
          <p className="text-sm text-neutral-400">
            {publicKey?.toBase58().slice(0, 8)}...{publicKey?.toBase58().slice(-8)}
          </p>

          {!stateLoading && (
            <div className="rounded-lg bg-black/30 px-4 py-3 border border-white/10">
              <p className="text-neutral-500 text-xs uppercase tracking-wider mb-1">当前票价</p>
              <p className="text-2xl font-bold text-chrome">
                {displayPriceSol.toFixed(4)} <span className="text-sm font-normal text-neutral-500">SOL</span>
              </p>
              <p className="text-neutral-500 text-xs mt-1">已售 {itemsSold} 张 · VRGDA 动态定价</p>
            </div>
          )}

          <button
            onClick={handleBuyTicket}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-burnt text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#e05500] transition glow-border"
          >
            {loading ? '处理中...' : '购买票据'}
          </button>
          {buyError && !isMock && (
            <p className="text-red-400 text-sm">{buyError}</p>
          )}
        </div>
      )}
    </div>
  );
}
