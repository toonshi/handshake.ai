"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "thirdweb/react";
import { client } from "@/utils/client";

export default function WalletConnect({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className="text-xs font-medium rounded-lg px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--muted)] opacity-0 select-none"
        aria-hidden
      >
        {compact ? "Wallet" : "Connect wallet"}
      </div>
    );
  }

  return (
    <ConnectButton
      client={client}
      connectModal={{ size: compact ? "compact" : "wide" }}
      connectButton={{
        label: compact ? "Wallet" : "Connect wallet",
        className: "!text-xs !font-medium !rounded-lg !px-3 !py-1.5 !min-h-0 !h-auto !bg-[var(--surface-2)] !border !border-[var(--border)] hover:!border-[var(--border-hover)] !text-white !transition-colors",
      }}
      detailsButton={{
        className: "!text-xs !font-medium !rounded-lg !px-3 !py-1.5 !min-h-0 !h-auto !bg-[var(--surface-2)] !border !border-[var(--border)] hover:!border-[var(--border-hover)] !text-white !transition-colors",
      }}
    />
  );
}
