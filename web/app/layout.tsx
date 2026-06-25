import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import {ThirdwebProvider } from "thirdweb/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Handshake — Your agent works the room so you don't have to",
  description:
    "AI-powered matchmaking for MiniHack Kenya. Your agent negotiates introductions on your behalf, then calls you when it finds someone worth your time.",
  openGraph: {
    title: "Handshake",
    description: "Your agent works the room so you don't have to.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-[#0a0a0a] text-[#ededed] antialiased"
        suppressHydrationWarning
      >
        <ThirdwebProvider>

        {children}
        </ThirdwebProvider>
      </body>
    </html>
  );
}
