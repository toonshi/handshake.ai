import hre from "hardhat";

async function main() {
  const { ethers } = await hre.network.create();
  const [deployer] = await ethers.getSigners();

  console.log("──────────────────────────────────────────────");
  console.log("Deploying ConnectionRegistry");
  console.log("  Network :", (await ethers.provider.getNetwork()).name);
  console.log("  Chain ID:", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("  Deployer:", deployer.address);
  console.log(
    "  Balance :",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "AVAX"
  );
  console.log("──────────────────────────────────────────────");

  const ConnectionRegistry = await ethers.getContractFactory("ConnectionRegistry");
  const registry = await ConnectionRegistry.deploy();

  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log("");
  console.log("✅ ConnectionRegistry deployed to:", address);
  console.log("");
  console.log("Add this to your .env.local:");
  console.log(`  AVALANCHE_CONTRACT_ADDRESS=${address}`);
  console.log("");
  console.log("View on Snowtrace:");
  console.log(`  https://testnet.snowtrace.io/address/${address}`);
  console.log("──────────────────────────────────────────────");

  // Wait for a few block confirmations before verifying
  console.log("\nWaiting for block confirmations...");
  const deployTx = registry.deploymentTransaction();
  if (deployTx) {
    await deployTx.wait(3);
  }

  // Attempt auto-verification on Snowtrace
  try {
    const { run } = await import("hardhat");
    await run("verify:verify", {
      address,
      constructorArguments: [],
    });
    console.log("✅ Contract verified on Snowtrace");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Already Verified") || message.includes("already verified")) {
      console.log("✅ Contract already verified on Snowtrace");
    } else {
      console.log("⚠️  Verification skipped:", message);
      console.log("   You can verify manually later with:");
      console.log(`   npx hardhat verify --network fuji ${address}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
