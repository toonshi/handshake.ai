import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { defineChain } from "thirdweb/chains";

// Avalanche Fuji C-Chain testnet (43113). Switch to 43114 for mainnet.
const FUJI = defineChain(43113);
const SNOWTRACE_BASE = "https://testnet.snowtrace.io/tx";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

function isValidAddress(addr: string | undefined): addr is `0x${string}` {
  return !!addr && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function snowtraceUrl(txHash: string): string {
  return `${SNOWTRACE_BASE}/${txHash}`;
}

/**
 * Records a confirmed match on the Avalanche Fuji ConnectionRegistry contract.
 * Returns the transaction hash, or null if env vars are missing or the call fails.
 * Never throws — on-chain recording is best-effort and must not block the intro flow.
 */
export async function recordConnectionOnChain(
  walletA: string | undefined,
  walletB: string | undefined,
  matchId: string
): Promise<string | null> {
  const privateKey = process.env.AVALANCHE_PRIVATE_KEY;
  const contractAddress = process.env.AVALANCHE_CONTRACT_ADDRESS;

  if (!privateKey || !contractAddress) {
    console.warn(
      "[Avalanche] Skipping on-chain record — set AVALANCHE_PRIVATE_KEY and AVALANCHE_CONTRACT_ADDRESS"
    );
    return null;
  }

  const addrA = isValidAddress(walletA) ? walletA : ZERO_ADDR;
  const addrB = isValidAddress(walletB) ? walletB : ZERO_ADDR;

  try {
    const thirdwebClient = createThirdwebClient({
      secretKey: process.env.THIRDWEB_SECRET_KEY!,
      clientId: process.env.THIRDWEB_CLIENT_ID ?? process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID,
    });

    const account = privateKeyToAccount({
      client: thirdwebClient,
      privateKey: privateKey as `0x${string}`,
    });

    const contract = getContract({
      client: thirdwebClient,
      chain: FUJI,
      address: contractAddress as `0x${string}`,
      abi: [
        {
          inputs: [
            { name: "userA", type: "address" },
            { name: "userB", type: "address" },
            { name: "matchId", type: "string" },
          ],
          name: "recordConnection",
          outputs: [{ name: "id", type: "uint256" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          inputs: [{ name: "matchId", type: "string" }],
          name: "MatchAlreadyRecorded",
          type: "error",
        },
        {
          inputs: [],
          name: "NotAuthorized",
          type: "error",
        }
      ],
    });

    const tx = prepareContractCall({
      contract,
      method: "recordConnection",
      params: [addrA, addrB, matchId],
    });

    const { transactionHash } = await sendTransaction({ transaction: tx, account });
    console.log(`[Avalanche] Connection ${matchId} recorded: ${transactionHash}`);
    return transactionHash;
  } catch (err) {
    console.error("[Avalanche] Failed to record connection on-chain:", err);
    return null;
  }
}
