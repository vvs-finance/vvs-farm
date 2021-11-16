const { assert } = require("chai");
const { expectRevert, time } = require("@openzeppelin/test-helpers");
const VVSVault = artifacts.require("VVSVault");
const VVSToken = artifacts.require("VVSToken");
const Workbench = artifacts.require("Workbench");
const Craftsman = artifacts.require("Craftsman");
const truffleAssert = require("truffle-assertions");

contract("VVSVault", (accounts) => {
  const [owner, treasuryAddress, dev, boredApe, penguin] = accounts;
  let vvsToken;
  let workbench;
  let craftsman;
  let vault;
  let REWARD_PER_BLOCK = 1000;
  let SUPPLY_PER_YEAR = (REWARD_PER_BLOCK * 365 * 24 * 60 * 60) / 6; // 1000 per blocks, with block time 6s
  let REWARD_START_BLOCK = 1; // Rewards always starts at each test
  const TOKEN_BALANCE = 5000;

  beforeEach(async () => {
    vvsToken = await VVSToken.new(SUPPLY_PER_YEAR, { from: owner });
    workbench = await Workbench.new(vvsToken.address, { from: owner });
    craftsman = await Craftsman.new(
      vvsToken.address,
      workbench.address,
      dev,
      REWARD_START_BLOCK,
      { from: owner }
    );
    await vvsToken.mint(boredApe, TOKEN_BALANCE, { from: owner });
    await vvsToken.mint(penguin, TOKEN_BALANCE, { from: owner });

    await vvsToken.transferOwnership(craftsman.address, { from: owner });
    await workbench.transferOwnership(craftsman.address, { from: owner });

    vault = await VVSVault.new(
      vvsToken.address,
      workbench.address,
      craftsman.address,
      owner,
      treasuryAddress,
      { from: owner }
    );

    await vvsToken.approve(vault.address, TOKEN_BALANCE, { from: boredApe });
    await vvsToken.approve(vault.address, TOKEN_BALANCE, { from: penguin });
  });

  it("can create contract", async () => {
    assert.equal(await vault.available(), 0);
  });

  describe("deposit", () => {
    it("allows to deposit token when contract is not paused", async () => {
      assert.equal(
        await vvsToken.balanceOf(boredApe),
        TOKEN_BALANCE,
        `boredApe has ${TOKEN_BALANCE} tokens`
      );

      // Start staking into the vault
      await vault.deposit(500, { from: boredApe });

      assert.equal(
        (await vault.available()).toString(),
        "0",
        "All token staked"
      );
      assert.equal((await vault.balanceOf()).toString(), "500");
      assert.equal(
        (await vault.calculateTotalPendingVVSRewards()).toString(),
        "0"
      );

      // Advance some blocks to mine rewards
      // Note: this could affect other tests in this suite
      const nBlockForwarding = 10;
      const blk = Math.max(REWARD_START_BLOCK, await time.latestBlock()); // Make sure rewarding starts
      await time.advanceBlockTo(Number.parseInt(blk) + nBlockForwarding);

      assert.equal(
        (await vault.calculateTotalPendingVVSRewards()).toString(),
        `${nBlockForwarding * REWARD_PER_BLOCK}`,
        "Reward does not match"
      );
    });

    it("calculates shares correctly after subsequent deposits", async () => {
      // Start staking into the vault
      let tx;
      tx = await vault.deposit(500, { from: boredApe });
      truffleAssert.eventEmitted(tx, "Deposit", (ev) => {
        return (
          ev.sender === boredApe &&
          ev.amount.toString() === "500" &&
          ev.shares.toString() === "500"
        );
      });

      // Advance some blocks to mine rewards
      // Note: this could affect other tests in this suite
      const nBlockForwarding = 2;
      const blk = Math.max(REWARD_START_BLOCK, await time.latestBlock()); // Make sure rewarding starts
      await time.advanceBlockTo(Number.parseInt(blk) + nBlockForwarding);

      // Second deposit to the vault
      tx = await vault.deposit(1500, { from: penguin });

      truffleAssert.eventEmitted(tx, "Deposit", (ev) => {
        // total pool = 500
        // totalShares = 500
        // currentShares = 1500*500/500 = 1500
        return (
          ev.sender === penguin &&
          ev.amount.toString() === "1500" &&
          ev.shares.toString() === `${(1500 / 500) * 500}`
        );
      });

      assert.equal(
        (await vault.balanceOf()).toString(),
        "5000",
        "3 blocks mined for boredApe + total capital from both players"
      );
      assert.equal(
        (await vault.available()).toString(),
        "3000",
        "3 blocks mined for boredApe. Pending not staked"
      );

      // Third deposit to the vault
      tx = await vault.deposit(500, { from: boredApe });
      truffleAssert.eventEmitted(tx, "Deposit", (ev) => {
        // total pool = 5000
        // totalShares = 2000
        // currentShares = 500*2000/5000 = 200
        return (
          ev.sender === boredApe &&
          ev.amount.toString() === "500" &&
          ev.shares.toString() === `${(500 * 2000) / 5000}`
        );
      });
    });

    it("does not allow to deposit when contract is paused", async () => {
      await vault.pause({ from: owner });

      await expectRevert(vault.deposit(500, { from: boredApe }), "paused");

      await vault.unpause({ from: owner });
      await vault.deposit(500, { from: boredApe });

      assert.equal(
        (await vvsToken.balanceOf(boredApe)).toString(),
        `${TOKEN_BALANCE - 500}`
      );
    });
  });

  describe("withdraw", () => {
    it("allows to withdraw token", async () => {
      await vault.deposit(500, { from: boredApe });

      const nBlockForwarding = 2;
      const blk = Math.max(REWARD_START_BLOCK, await time.latestBlock()); // Make sure rewarding starts
      await time.advanceBlockTo(Number.parseInt(blk) + nBlockForwarding);

      // Second deposit to the vault
      await vault.deposit(1500, { from: penguin });

      // 3rd
      await vault.deposit(500, { from: boredApe });

      assert.equal(
        (await vault.userInfo(boredApe)).shares.toString(),
        "700",
        `boredApe total share is 500 + 200`
      );

      assert.equal(
        (await vault.balanceOf()).toString(),
        "6500",
        `balanceOf is 6500`
      );
      assert.equal(
        (await vault.totalShares()).toString(),
        "2200",
        `totalShares is 2200`
      );

      let tx = await vault.withdrawAll({ from: boredApe });
      truffleAssert.eventEmitted(tx, "Withdraw", (ev) => {
        let currentAmount = (6500 * 700) / 2200; // 2066 ? why so little
        let amount = currentAmount * (1 - 10 / 10000);
        return (
          ev.sender === boredApe &&
          ev.amount.toString() === `${Math.floor(amount)}` &&
          ev.shares.toString() === `${500 + 200}`
        );
      });
      assert.equal(
        (await vvsToken.balanceOf(boredApe)).toString(),
        `${TOKEN_BALANCE - 500 - 500 + 2066}`,
        `boredApe has ${TOKEN_BALANCE} tokens`
      );

      assert.equal(
        (await vault.balanceOf()).toString(),
        "5431",
        `balanceOf is 5431`
      );

      tx = await vault.withdrawAll({ from: penguin });
      truffleAssert.eventEmitted(tx, "Withdraw", (ev) => {
        // let currentAmount = (5431 * 1500) / 1500;
        // let amount = currentAmount * (1 - 10 / 10000); // 5425.6

        return (
          ev.sender === penguin &&
          ev.amount.toString() === `${5426}` &&
          ev.shares.toString() === `${1500}`
        );
      });
    });

    it("allows to withdraw token even when contract is paused", async () => {
      await vault.deposit(500, { from: boredApe });
      await vault.pause({ from: owner });

      await vault.withdrawAll({ from: boredApe });

      assert.equal(
        Number.parseInt((await vvsToken.balanceOf(boredApe)).toString()),
        TOKEN_BALANCE
      );
    });
  });

  describe("harvest", () => {
    it("allows to harvest when contract is not paused", async () => {
      await vault.deposit(500, { from: boredApe });
      await vault.deposit(1500, { from: penguin });
      await vault.deposit(1000, { from: boredApe });

      assert.equal(
        (await vault.balanceOf()).toString(),
        "5000",
        "2 block mined"
      );
      assert.equal(
        (await vault.available()).toString(),
        "1000",
        "Harvested from depositing"
      );

      // Advance some blocks to mine rewards
      await time.advanceBlock();

      assert.equal(
        (await vault.calculateTotalPendingVVSRewards()).toString(),
        "2000",
        "Pending to harvest after 1 block"
      );

      let tx = await vault.harvest({ from: boredApe });

      // 3000 is 1000 in the vault and 2000 rewarded from staking in masterchef
      // + 1. (integer in calculating the bounty)
      assert.equal(
        (await vault.balanceOf()).toString(),
        `${5000 + 2000 - Number.parseInt((3000 * (200 + 25)) / 10000)}`,
        "Balance after fees"
      );

      assert.equal(
        Number.parseInt((await vvsToken.balanceOf(treasuryAddress)).toString()),
        Number.parseInt((3000 * 200) / 10000)
      );

      // Remaining capital + some call bounty
      assert.equal(
        Number.parseInt((await vvsToken.balanceOf(boredApe)).toString()),
        Number.parseInt(TOKEN_BALANCE - 500 - 1000 + (3000 * 25) / 10000)
      );

      truffleAssert.eventEmitted(tx, "Harvest", (ev) => {
        return (
          ev.sender === boredApe &&
          ev.performanceFee.toString() === "60" &&
          ev.callFee.toString() === "7"
        );
      });
    });

    it("does not allow to harvest token when contract is paused", async () => {
      await vault.pause({ from: owner });

      await expectRevert(vault.harvest({ from: boredApe }), "paused");

      await vault.unpause({ from: owner });

      await vault.harvest({ from: boredApe });
    });
  });

  describe("vvsAtLastUserAction", () => {
    it("calculates the vvs correctly with balanceOf value after token safeTransfer", async () => {
      // Let boredApe and penguin deposit
      let tx;

      tx = await vault.deposit(500, { from: boredApe });
      truffleAssert.eventEmitted(tx, "Deposit", (ev) => {
        return (
          ev.sender === boredApe &&
          ev.amount.toString() === "500" &&
          ev.shares.toString() === "500"
        );
      });

      assert.equal(
        (await vault.userInfo(boredApe)).vvsAtLastUserAction.toString(),
        "500",
        "from 500*500/500"
      );

      // Second deposit to the vault
      tx = await vault.deposit(1500, { from: penguin });
      truffleAssert.eventEmitted(tx, "Deposit", (ev) => {
        // total pool = 500
        // totalShares = 500
        // currentShares = 1500*500/500 = 1500
        return (
          ev.sender === penguin &&
          ev.amount.toString() === "1500" &&
          ev.shares.toString() === `${(1500 * 500) / 500}`
        );
      });

      assert.equal(
        (await vault.userInfo(penguin)).vvsAtLastUserAction.toString(),
        "1500",
        "from 1500*2000/2000"
      );

      // Advance some blocks
      const nBlockForwarding = 2;
      const blk = Math.max(REWARD_START_BLOCK, await time.latestBlock()); // Make sure rewarding starts
      await time.advanceBlockTo(Number.parseInt(blk) + nBlockForwarding);

      // Check balanceOf
      assert.equal(
        (await vault.balanceOf()).toString(),
        "3000",
        `2000 capital + 1000 from harvesting due to 2nd deposit`
      );

      // Set penalty early withdrawl to zero to simplify this test
      await vault.setWithdrawFee(0, { from: owner });

      // Now penguin withdraws partially, 500 shares out of 1500 shares
      tx = await vault.withdraw(500, { from: penguin });

      // user.shares = 1500 - 500 = 1000 shares remaining
      // totalShares = 2000 - 500 = 1500 shares remaining
      // currentAmount = 3000*500/2000 = 750
      // balanceOf after the safeTransfer = 3000 - currentAmount = 2250
      assert.equal((await vault.balanceOf()).toString(), "2250", "balance");

      assert.equal(
        (await vault.userInfo(penguin)).shares.toString(),
        "1000",
        "Remaining shares for penguin"
      );

      // vvs: 2250*1000/1500 = 1500
      assert.equal(
        (await vault.userInfo(penguin)).vvsAtLastUserAction.toString(),
        "1500",
        "VVS Remaining"
      );

      truffleAssert.eventEmitted(tx, "Withdraw", (ev) => {
        return (
          ev.sender === penguin &&
          ev.amount.toString() === "750" &&
          ev.shares.toString() === "500"
        );
      });
    });
  });

  describe("Events on setters", () => {
    it("captures events on SetAdmin", async () => {
      // Set penalty early withdrawl to zero to simplify this test
      const tx = await vault.setAdmin(boredApe, { from: owner });

      truffleAssert.eventEmitted(tx, "SetAdmin", (ev) => {
        return ev.admin === boredApe;
      });
    });

    it("captures events on SetTreasury", async () => {
      // Set penalty early withdrawl to zero to simplify this test
      const tx = await vault.setTreasury(penguin, { from: owner });

      truffleAssert.eventEmitted(tx, "SetTreasury", (ev) => {
        return ev.treasury === penguin;
      });
    });

    it("captures events on SetPerformanceFee", async () => {
      // Set penalty early withdrawl to zero to simplify this test
      const tx = await vault.setPerformanceFee(300, { from: owner });

      truffleAssert.eventEmitted(tx, "SetPerformanceFee", (ev) => {
        return ev.performanceFee.toString() === "300";
      });
    });

    it("captures events on SetCallFee", async () => {
      // Set penalty early withdrawl to zero to simplify this test
      const tx = await vault.setCallFee(30, { from: owner });

      truffleAssert.eventEmitted(tx, "SetCallFee", (ev) => {
        return ev.callFee.toString() === "30";
      });
    });

    it("captures events on SetWithdrawFee", async () => {
      // Set penalty early withdrawl to zero to simplify this test
      const tx = await vault.setWithdrawFee(20, { from: owner });

      truffleAssert.eventEmitted(tx, "SetWithdrawFee", (ev) => {
        return ev.withdrawFee.toString() === "20";
      });
    });

    it("captures events on SetWithdrawFeePeriod", async () => {
      // Set penalty early withdrawl to zero to simplify this test
      const tx = await vault.setWithdrawFeePeriod(71, { from: owner });

      truffleAssert.eventEmitted(tx, "SetWithdrawFeePeriod", (ev) => {
        return ev.withdrawFeePeriod.toString() === "71";
      });
    });
  });
});
