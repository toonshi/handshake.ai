import dotenv from "dotenv";
import { recordConnectionOnChain } from "../lib/avalanche.js";

// Load env vars
dotenv.config({ path: ".env.local" });

async function main() {
  const dummyWalletA = "0x1111111111111111111111111111111111111111";
  const dummyWalletB = "0x2222222222222222222222222222222222222222";
  const randomMatchId = `test-match-${Math.floor(Math.random() * 1000000)}`;

  console.log("──────────────────────────────────────────────────");
  console.log("Testing avalanche.ts integration...");
  console.log(`Match ID: ${randomMatchId}`);
  console.log(`Wallet A: ${dummyWalletA}`);
  console.log(`Wallet B: ${dummyWalletB}`);
  console.log("──────────────────────────────────────────────────");

  console.log("Sending transaction to Fuji testnet...");
  const txHash = await recordConnectionOnChain(dummyWalletA, dummyWalletB, randomMatchId);

  if (txHash) {
    console.log("──────────────────────────────────────────────────");
    console.log("✅ SUCCESS!");
    console.log(`Transaction Hash: ${txHash}`);
    console.log(`View on Snowtrace: https://testnet.snowtrace.io/tx/${txHash}`);
    console.log("──────────────────────────────────────────────────");
  } else {
    console.log("──────────────────────────────────────────────────");
    console.log("❌ FAILED: Transaction was not recorded. Check logs above.");
    console.log("──────────────────────────────────────────────────");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
