"use client";

import { ConnectButton } from "thirdweb/react";
import { client } from "@/utils/client";

export default function WalletConnect({ compact = false }: { compact?: boolean }) {
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
