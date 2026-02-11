'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useUnforgivenProgram } from '@/hooks/useUnforgivenProgram';
import { BN } from '@coral-xyz/anchor';
import {
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';

export default function BuyTicketButton() {
  const { connected, publicKey: buyer } = useWallet();
  const { program } = useUnforgivenProgram();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buyTicket = useCallback(async () => {
    if (!connected || !program || !buyer) {
      alert('请先连接钱包');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const programId = program.programId;

      const [globalState] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        programId
      );
      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault')],
        programId
      );

      const nonce = new BN(Date.now());
      const nonceBuffer = Buffer.alloc(8);
      nonce.toArrayLike(Buffer, 'le', 8).copy(nonceBuffer);

      const [ticket] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('ticket'),
          globalState.toBuffer(),
          buyer.toBuffer(),
          nonceBuffer,
        ],
        programId
      );

      const sigInstructionIndex = 1;
      const eventId = globalState;
      const tierLevel = 1;
      const expiry = new BN(Math.floor(Date.now() / 1000) + 60);

      const tx = await program.methods
        .buyTicket(sigInstructionIndex, eventId, tierLevel, expiry, nonce)
        .accounts({
          buyer,
          globalState,
          vault,
          ticket,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Transaction sent', tx);
      alert(`交易已发送! ${tx.slice(0, 16)}...`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      setError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  }, [connected, program, buyer]);

  if (!connected) {
    return (
      <button
        type="button"
        disabled
        className="rounded-lg bg-purple-900/50 text-purple-300 px-6 py-3 font-medium cursor-not-allowed"
      >
        Please Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={buyTicket}
        disabled={loading || !program}
        className="rounded-lg bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Sending...' : 'Buy Ticket'}
      </button>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
