'use client';

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  bytesToHex,
  deriveProgramDataAddress,
  findAdminConfigPda,
  findGlobalConfigV2Pda,
  hexToBytes,
  parseAdminConfigAccount,
} from '@/lib/unforgiven-v2-client';

type InitializeButtonProps = {
  program: Program | null;
  programId: PublicKey;
  onInitialized?: () => void | Promise<void>;
};

type ShieldRuntimeConfig = {
  oraclePubkey: string;
  scoringModelHashHex: string;
};

async function fetchShieldRuntimeConfig(): Promise<ShieldRuntimeConfig> {
  const res = await fetch('/api/shield-config');
  const raw = await res.text();
  let body: ShieldRuntimeConfig | { error?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`shield-config returned non-JSON: ${raw.slice(0, 160)}`);
  }
  if (!res.ok || !('oraclePubkey' in body) || !('scoringModelHashHex' in body)) {
    throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `shield-config failed (${res.status})`);
  }
  return body;
}

export default function InitializeButton({
  program,
  programId,
  onInitialized,
}: InitializeButtonProps) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    if (!publicKey) {
      alert('钱包已断开，请重新连接后再试。');
      return;
    }
    if (!program) {
      alert('合约连接中，请稍后重试。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const runtimeConfig = await fetchShieldRuntimeConfig();
      const programData = deriveProgramDataAddress(programId);
      const globalConfigV2 = findGlobalConfigV2Pda(programId);
      const adminConfig = findAdminConfigPda(programId);

      const [globalInfo, adminInfo] = await Promise.all([
        connection.getAccountInfo(globalConfigV2, 'confirmed'),
        connection.getAccountInfo(adminConfig, 'confirmed'),
      ]);

      if (!globalInfo) {
        await program.methods
          .initializeV2()
          .accounts({
            authority: publicKey,
            program: programId,
            programData,
            globalConfigV2,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      const oracleBytes = Array.from(new PublicKey(runtimeConfig.oraclePubkey).toBytes());
      const modelHashBytes = Array.from(hexToBytes(runtimeConfig.scoringModelHashHex));

      if (!adminInfo) {
        await program.methods
          .initializeAdminConfig(oracleBytes, modelHashBytes)
          .accounts({
            authority: publicKey,
            program: programId,
            programData,
            adminConfig,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else {
        const parsed = parseAdminConfigAccount(adminInfo.data);
        if (!parsed) {
          throw new Error('Existing admin config account has an invalid layout');
        }
        if (parsed.authority.toBase58() !== publicKey.toBase58()) {
          throw new Error(`Current wallet is not the admin authority (${parsed.authority.toBase58()})`);
        }

        if (
          bytesToHex(parsed.oraclePubkey) !==
          bytesToHex(new PublicKey(runtimeConfig.oraclePubkey).toBytes())
        ) {
          await program.methods
            .rotateOracle(Array.from(new PublicKey(runtimeConfig.oraclePubkey).toBytes()))
            .accounts({
              authority: publicKey,
              adminConfig,
            })
            .rpc();
        }

        if (bytesToHex(parsed.activeScoringModelHash) !== runtimeConfig.scoringModelHashHex.toLowerCase()) {
          await program.methods
            .setScoringModelHash(modelHashBytes)
            .accounts({
              authority: publicKey,
              adminConfig,
            })
            .rpc();
        }
      }

      await onInitialized?.();
      alert('v2 协议初始化完成，当前网络上的 admin config 已就绪。');
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Initialization failed';
      setError(message);
      alert(`初始化失败: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [connection, onInitialized, program, programId, publicKey]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={initialize}
        disabled={loading}
        className="rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Initializing v2...' : 'Initialize v2 Admin'}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
