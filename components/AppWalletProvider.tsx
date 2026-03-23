"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
} from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";

// 引入默认样式
import "@solana/wallet-adapter-react-ui/styles.css";

export default function AppWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const network = useMemo(() => {
    const configured = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.toLowerCase();
    if (configured === "mainnet-beta") return WalletAdapterNetwork.Mainnet;
    if (configured === "testnet") return WalletAdapterNetwork.Testnet;
    return WalletAdapterNetwork.Devnet;
  }, []);

  const endpoint = useMemo(() => {
    const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
    return explicit && explicit.length > 0 ? explicit : clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
