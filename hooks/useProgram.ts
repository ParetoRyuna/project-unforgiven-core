import { useMemo } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
// 运行 anchor build 后，可将 target/idl/unforgiven.json 复制到此处覆盖；需包含 types 以兼容 Program 账户解析
import idlJson from '@/app/idl/unforgiven.json';

// 替换为你部署后的真实 Program ID（与 Anchor.toml / declare_id 一致）
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '7cVF3X3PvNLTNHd9EqvWHsrtHkeJXwRzBcRuoHoTThVT'
);

// 确保 IDL 含 types（GlobalState/Ticket/Vault 等账户类型），否则会报 Accounts require idl.types
const idl = idlJson as Idl;

export const useProgram = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const program = useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(
      connection,
      wallet,
      AnchorProvider.defaultOptions()
    );

    return new Program(idl, provider);
  }, [connection, wallet]);

  return { program };
};
