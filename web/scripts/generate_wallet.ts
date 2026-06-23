import { ethers } from "ethers";

async function main() {
  const wallet = ethers.Wallet.createRandom();
  console.log("──────────────────────────────────────────────");
  console.log("Generated a new Deployer Wallet:");
  console.log("  Address    :", wallet.address);
  console.log("  Private Key:", wallet.privateKey);
  console.log("──────────────────────────────────────────────");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
