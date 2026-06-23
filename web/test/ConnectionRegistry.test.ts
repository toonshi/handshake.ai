import { expect } from "chai";
import hre from "hardhat";

describe("ConnectionRegistry", function () {
  it("Should record connections and maintain states", async function () {
    const { ethers } = await hre.network.create();
    const [owner, addr1, addr2] = await ethers.getSigners();

    const ConnectionRegistry = await ethers.getContractFactory("ConnectionRegistry");
    const registry = await ConnectionRegistry.deploy();
    await registry.waitForDeployment();

    const matchId = "test-match-uuid-123";

    // Record connection
    const tx = await registry.recordConnection(addr1.address, addr2.address, matchId);
    await tx.wait();

    // Verify connection stored
    const conn = await registry.getConnection(0);
    expect(conn.userA).to.equal(addr1.address);
    expect(conn.userB).to.equal(addr2.address);
    expect(conn.matchId).to.equal(matchId);

    // Verify stats
    expect(await registry.connectionCount(addr1.address)).to.equal(1n);
    expect(await registry.connectionCount(addr2.address)).to.equal(1n);
    expect(await registry.totalConnections()).to.equal(1n);
    expect(await registry.matchExists(matchId)).to.be.true;

    // Verify cannot record duplicate matchId
    await expect(
      registry.recordConnection(addr1.address, addr2.address, matchId)
    ).to.be.revertedWithCustomError(registry, "MatchAlreadyRecorded");

    // Verify only owner can record
    const nonOwnerRegistry = registry.connect(addr1);
    await expect(
      nonOwnerRegistry.recordConnection(addr1.address, addr2.address, "another-match-id")
    ).to.be.revertedWithCustomError(registry, "NotAuthorized");
  });
});
