import type { Metadata } from "next";
import "./globals.css";
import AppWalletProvider from "@/components/AppWalletProvider";

export const metadata: Metadata = {
  title: "PROJECT UNFORGIVEN",
  description: "Identity-Weighted VRGDA Protocol",
  manifest: "/manifest.json",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false, // 再次强制禁止缩放
  },
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
          {/* Mobile Wrapper: 强制手机宽度，居中显示 */}
          <main className="w-full max-w-[430px] min-h-screen bg-[#050505] relative overflow-hidden shadow-2xl shadow-neutral-900 border-x border-neutral-900">
            {children}
          </main>
        </AppWalletProvider>
      </body>
    </html>
  );
}
