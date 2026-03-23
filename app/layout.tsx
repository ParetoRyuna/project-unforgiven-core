import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppWalletProvider from "@/components/AppWalletProvider";

export const metadata: Metadata = {
  title: "PROJECT UNFORGIVEN",
  description: "VRGDA + zkTLS on-chain fairness execution on Solana",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // 再次强制禁止缩放
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex justify-center bg-black">
        <AppWalletProvider>
          {/* Mobile: 430px 宽；桌面: 全宽，便于 /demo 录屏满屏 */}
          <main className="w-full max-w-[430px] lg:max-w-none min-h-screen bg-[#050505] relative overflow-hidden shadow-2xl shadow-neutral-900 border-x border-neutral-900 lg:shadow-none lg:border-0">
            {children}
          </main>
        </AppWalletProvider>
      </body>
    </html>
  );
}
