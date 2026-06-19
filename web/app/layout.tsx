import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kuzana Connector — Your agent works the room so you don't have to",
  description:
    "AI-powered matchmaking for MiniHack Kenya. Your agent negotiates introductions on your behalf, then calls you when it finds someone worth your time.",
  openGraph: {
    title: "Kuzana Connector",
    description: "Your agent works the room so you don't have to.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-[#0a0a0a] text-[#ededed] antialiased">
        {children}
      </body>
    </html>
  );
}
