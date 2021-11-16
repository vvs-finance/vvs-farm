const { expectRevert, time, snapshot } = require("@openzeppelin/test-helpers");
const { assert } = require("chai");
const MockERC20 = artifacts.require("libs/MockERC20");
const IGO = artifacts.require("IGO");
const truffleAssert = require("truffle-assertions");

contract("IGO", ([alice, bob, carol, admin, minter]) => {
  let lp;
  let igoToken;
  let contract;
  let snapshotA;
  let startBlock;
  let endBlock;

  beforeEach(async () => {
    snapshotA = await snapshot();
    const currentBlock = await time.latestBlock();
    startBlock = Number.parseInt(currentBlock.toString()) + 20; // preparation buffer blocks
    endBlock = startBlock + 10; // all deposit actions

    // Prepare tokens
    lp = await MockERC20.new("LPToken", "LP1", "1000000", {
      from: minter,
    });
    igoToken = await MockERC20.new("Algo", "ALGO", "1000000", {
      from: minter,
    });

    await lp.transfer(bob, "1000", { from: minter });
    await lp.transfer(alice, "1000", { from: minter });
    await lp.transfer(carol, "1000", { from: minter });

    contract = await IGO.new(
      lp.address,
      igoToken.address,
      startBlock,
      endBlock,
      admin,
      {
        from: minter,
      }
    );

    await lp.approve(contract.address, "1000", { from: bob });
    await lp.approve(contract.address, "1000", { from: alice });
    await lp.approve(contract.address, "1000", { from: carol });
  });

  afterEach(async () => {
    // Restore to not affect tests after due to advance in time
    await snapshotA.restore();
  });

  it("should create the contract with 2 pools", async () => {
    contract = await IGO.new(
      lp.address,
      igoToken.address,
      startBlock,
      endBlock,
      admin,
      {
        from: minter,
      }
    );
    assert.equal(await contract.numberPools(), 2);
  });

  describe("depositPool", () => {
    it("should not allow to deposit with pid more than 1", async () => {
      const amount = 1;
      const pid = 2;
      await expectRevert(
        contract.depositPool(amount, pid, { from: bob }),
        "Non valid pool id"
      );
    });

    it("should not allow to deposit to unset pool", async () => {
      const amount = 1;
      const pid = 1;
      await expectRevert(
        contract.depositPool(amount, pid, { from: bob }),
        "Pool not set"
      );
    });

    it("should check the start block and end block for depositing", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      const amount = 1;
      await expectRevert(
        contract.depositPool(amount, pid, { from: bob }),
        "Too early"
      );

      await time.advanceBlockTo(endBlock);

      await expectRevert(
        contract.depositPool(amount, pid, { from: bob }),
        "Too late"
      );
    });

    it("should only allow amount greater than 0", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      await time.advanceBlockTo(startBlock);

      await expectRevert(
        contract.depositPool(0, pid, { from: bob }),
        "Amount must be > 0"
      );
    });

    it("should update the user amount and total pool amount correctly", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      await time.advanceBlockTo(startBlock);
      await contract.depositPool(5, pid, { from: bob });

      // Total LP
      const poolInformation = await contract.viewPoolInformation(pid);
      assert.equal(poolInformation[4].toString(), "5");

      const bobAllocations = await contract.viewUserAllocationPools(bob, [pid]);
      assert.equal(bobAllocations[0].toString(), "1000000000000", "5/5*10^12");
    });

    it("should emit Deposit event with correct parameters", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      await time.advanceBlockTo(startBlock);
      const tx = await contract.depositPool(5, pid, { from: bob });

      truffleAssert.eventEmitted(tx, "Deposit", (ev) => {
        return (
          ev.user.toString() === bob &&
          ev.pid.toString() === `${pid}` &&
          ev.amount.toString() === "5"
        );
      });
    });

    it("should check user limit on depositing", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      await time.advanceBlockTo(startBlock);
      await contract.depositPool(5, pid, { from: bob });

      await expectRevert(
        contract.depositPool(1, pid, { from: bob }),
        "New amount above user limit"
      );
    });

    it("should calculate the user allocations correctly", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);
      await contract.depositPool(1, pid, { from: bob });
      await contract.depositPool(2, pid, { from: alice });
      await contract.depositPool(3, pid, { from: carol });

      const bobAllocations = await contract.viewUserAllocationPools(bob, [pid]);
      const aliceAllocations = await contract.viewUserAllocationPools(alice, [
        pid,
      ]);
      const carolAllocations = await contract.viewUserAllocationPools(carol, [
        pid,
      ]);
      assert.equal(bobAllocations[0].toString(), "166666666666", "1/6*10^12");
      assert.equal(aliceAllocations[0].toString(), "333333333333", "2/6*10^12");
      assert.equal(carolAllocations[0].toString(), "500000000000", "3/6*10^12");
    });
  });

  describe("harvestPool", () => {
    it("should check end block for harvesting", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);
      await contract.depositPool(5, pid, { from: bob });

      await expectRevert(
        contract.harvestPool(pid, { from: bob }),
        "Too early to harvest"
      );
    });

    it("should check valid pool id for harvesting", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);
      await contract.depositPool(5, pid, { from: bob });
      await time.advanceBlockTo(endBlock);

      await expectRevert(
        contract.harvestPool(2, { from: bob }),
        "Non valid pool id"
      );
    });

    it("should check if the user has participated", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(endBlock);

      await expectRevert(
        contract.harvestPool(0, { from: bob }),
        "Did not participate"
      );
    });

    it("should check if the user has harvested", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);

      await contract.depositPool(5, pid, { from: bob });

      await time.advanceBlockTo(endBlock);

      await contract.harvestPool(pid, { from: bob });

      await expectRevert(
        contract.harvestPool(pid, { from: bob }),
        "Has harvested"
      );
    });

    it("should emit Harvest event with correct parameters", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);

      await contract.depositPool(5, pid, { from: bob });

      await time.advanceBlockTo(endBlock);

      const tx = await contract.harvestPool(pid, { from: bob });

      truffleAssert.eventEmitted(tx, "Harvest", (ev) => {
        return (
          ev.user.toString() === bob &&
          ev.pid.toString() === `${pid}` &&
          ev.offeringAmount.toString() === "50" &&
          ev.excessAmount.toString() === "0"
        );
      });
    });

    describe("without tax", () => {
      it("should harvest and get refund with correct amount when under-subscribed", async () => {
        const offeringAmountPool = 100; // IGO token
        const raisingAmountPool = 10; // LP token
        const limitPerUserInLP = 5; // LP token
        const hasTax = false;
        const pid = 1;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );

        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "999"); // 1000 - 1
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "999");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "10");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "998"); // 1000 - 2
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "998");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "20");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "997"); // 1000 - 3
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "997");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "30");

        assert.equal((await lp.balanceOf(contract.address)).toString(), "6");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "40"
        );
      });

      it("should harvest and get refund with correct amount when just enough subscription", async () => {
        const offeringAmountPool = 180; // IGO token
        const raisingAmountPool = 18; // LP token
        const limitPerUserInLP = 10; // LP token
        const hasTax = false;
        const pid = 1;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );

        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });
        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });
        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "997"); // 1000 - 3
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "997");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "30");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "994"); // 1000 - 6
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "994");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "60");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "991"); // 1000 - 9
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "991");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "90");

        assert.equal((await lp.balanceOf(contract.address)).toString(), "18");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        );
      });

      it("should harvest and get refund with correct amount when over-subscribed", async () => {
        const offeringAmountPool = 100; // IGO token
        const raisingAmountPool = 10; // LP token
        const limitPerUserInLP = 10; // LP token
        const hasTax = false;
        const pid = 1;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );

        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });
        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });
        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "997");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "999");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "16");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "994");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "997");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "33");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "991");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "995");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "50");

        assert.equal((await lp.balanceOf(contract.address)).toString(), "9");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "1"
        ); // leftover due to calculations
      });
    });

    describe("with tax", () => {
      it("should calculate harvest amount, refund and tax correctly when under-subscribed", async () => {
        const offeringAmountPool = 1000; // IGO token
        const raisingAmountPool = 100; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(1, pid, { from: bob });
        await contract.depositPool(2, pid, { from: alice });
        await contract.depositPool(3, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "999");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "999");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "10");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "998");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "998");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "20");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "997");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "997");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "30");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "6");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "940"
        ); // 1000 - 60
      });

      it("should calculate harvest amount, refund and tax correctly when just enough subscription", async () => {
        const offeringAmountPool = 1000; // IGO token
        const raisingAmountPool = 100; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(50, pid, { from: bob });
        await contract.depositPool(20, pid, { from: alice });
        await contract.depositPool(30, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "950");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "950");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "500");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "980");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "980");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "200");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "970");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "970");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "300");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "100");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        ); // 1000 - 60
      });

      it("should calculate harvest amount, refund and tax correctly when 2x subscription", async () => {
        const offeringAmountPool = 10000; // IGO token
        const raisingAmountPool = 1000; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(1000, pid, { from: bob });
        await contract.depositPool(400, pid, { from: alice });
        await contract.depositPool(600, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "0");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "495");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "5000");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "600");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "798");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "2000");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "400");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "697");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "3000");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "1010");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        );
      });

      it("should calculate harvest amount, refund and tax correctly when 50x subscription", async () => {
        await lp.transfer(bob, "99000", { from: minter });
        await lp.transfer(alice, "99000", { from: minter });
        await lp.transfer(carol, "99000", { from: minter });
        await lp.approve(contract.address, "100000", { from: bob });
        await lp.approve(contract.address, "100000", { from: alice });
        await lp.approve(contract.address, "100000", { from: carol });

        const offeringAmountPool = 10000; // IGO token
        const raisingAmountPool = 1000; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(20000, pid, { from: bob });
        await contract.depositPool(20000, pid, { from: alice });
        await contract.depositPool(10000, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        // Bob before harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "80000");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "0");
        await contract.harvestPool(pid, { from: bob });
        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "99502");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "4000");

        // Alice before harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "80000");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "0");
        await contract.harvestPool(pid, { from: alice });
        // Alice after harvest
        assert.equal((await lp.balanceOf(alice)).toString(), "99502");
        assert.equal((await igoToken.balanceOf(alice)).toString(), "4000");

        // Carol before harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "90000");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "0");
        await contract.harvestPool(pid, { from: carol });
        // Carol after harvest
        assert.equal((await lp.balanceOf(carol)).toString(), "99751");
        assert.equal((await igoToken.balanceOf(carol)).toString(), "2000");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "1245");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        );
      });

      it("should calculate harvest amount, refund and tax correctly when 100x subscription", async () => {
        await lp.transfer(bob, "39000", { from: minter });
        await lp.transfer(alice, "39000", { from: minter });
        await lp.transfer(carol, "19000", { from: minter });
        await lp.approve(contract.address, "100000", { from: bob });
        await lp.approve(contract.address, "100000", { from: alice });
        await lp.approve(contract.address, "100000", { from: carol });

        const offeringAmountPool = 10000; // IGO token
        const raisingAmountPool = 1000; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(40000, pid, { from: bob });
        await contract.depositPool(40000, pid, { from: alice });
        await contract.depositPool(20000, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        await contract.harvestPool(pid, { from: bob });
        await contract.harvestPool(pid, { from: alice });
        await contract.harvestPool(pid, { from: carol });

        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "39482"); // 40000 - 40000/100000*1000 - (40000-40000/100000*1000)*0.003
        assert.equal((await igoToken.balanceOf(bob)).toString(), "4000");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "1295");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        );
      });

      it("should calculate harvest amount, refund and tax correctly when 250x subscription", async () => {
        await lp.transfer(bob, "49000", { from: minter });
        await lp.transfer(alice, "99000", { from: minter });
        await lp.transfer(carol, "99000", { from: minter });
        await lp.approve(contract.address, "100000", { from: bob });
        await lp.approve(contract.address, "100000", { from: alice });
        await lp.approve(contract.address, "100000", { from: carol });

        const offeringAmountPool = 10000; // IGO token
        const raisingAmountPool = 1000; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(50000, pid, { from: bob });
        await contract.depositPool(100000, pid, { from: alice });
        await contract.depositPool(100000, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        await contract.harvestPool(pid, { from: bob });
        await contract.harvestPool(pid, { from: alice });
        await contract.harvestPool(pid, { from: carol });

        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "49676"); // 50000 - 50000/250000*1000 - (50000-50000/250000*1000)*0.0025
        assert.equal((await igoToken.balanceOf(bob)).toString(), "2000");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "1622");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        );
      });

      it("should calculate harvest amount, refund and tax correctly when 500x subscription", async () => {
        await lp.transfer(bob, "199000", { from: minter });
        await lp.transfer(alice, "199000", { from: minter });
        await lp.transfer(carol, "99000", { from: minter });
        await lp.approve(contract.address, "200000", { from: bob });
        await lp.approve(contract.address, "200000", { from: alice });
        await lp.approve(contract.address, "100000", { from: carol });

        const offeringAmountPool = 10000; // IGO token
        const raisingAmountPool = 1000; // LP token
        const limitPerUserInLP = 0; // LP token
        const hasTax = true;
        const pid = 0;
        await contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: admin }
        );
        // Receive token from the IGO project
        await igoToken.transfer(contract.address, offeringAmountPool, {
          from: minter,
        });

        await time.advanceBlockTo(startBlock);

        await contract.depositPool(200000, pid, { from: bob });
        await contract.depositPool(200000, pid, { from: alice });
        await contract.depositPool(100000, pid, { from: carol });

        await time.advanceBlockTo(endBlock);

        await contract.harvestPool(pid, { from: bob });
        await contract.harvestPool(pid, { from: alice });
        await contract.harvestPool(pid, { from: carol });

        // Bob after harvest
        assert.equal((await lp.balanceOf(bob)).toString(), "199201");
        assert.equal((await igoToken.balanceOf(bob)).toString(), "4000");

        // Contract
        assert.equal((await lp.balanceOf(contract.address)).toString(), "1997");
        assert.equal(
          (await igoToken.balanceOf(contract.address)).toString(),
          "0"
        );
      });
    });
  });

  describe("setPool", () => {
    it("should throw for non admin to set pool", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await expectRevert(
        contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: bob }
        ),
        "Ownable: caller is not the owner"
      );

      await expectRevert(
        contract.setPool(
          offeringAmountPool,
          raisingAmountPool,
          limitPerUserInLP,
          hasTax,
          pid,
          { from: minter }
        ),
        "Ownable: caller is not the owner"
      );
    });

    it("should only allow admin to set pool", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;

      const tx = await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      truffleAssert.eventEmitted(tx, "PoolParametersSet", (ev) => {
        return (
          ev.pid.toString() === `${pid}` &&
          ev.offeringAmountPool.toString() === `${offeringAmountPool}` &&
          ev.raisingAmountPool.toString() === `${raisingAmountPool}` &&
          ev.limitPerUserInLP.toString() === `${limitPerUserInLP}` &&
          ev.hasTax.toString() === `${hasTax}`
        );
      });
    });
  });

  describe("updateCampaignId", () => {
    it("should throw for non admin to update campaign id", async () => {
      const campaignId = 54000;
      await expectRevert(
        contract.updateCampaignId(campaignId, { from: minter }),
        "Ownable: caller is not the owner"
      );
    });

    it("should check the block before updating campaign id", async () => {
      const campaignId = 54000;
      await time.advanceBlockTo(endBlock + 1);
      await expectRevert(
        contract.updateCampaignId(campaignId, { from: admin }),
        "IGO has ended"
      );
    });

    it("should only allow admin to update campaign id", async () => {
      const campaignId = 54000;
      const tx = await contract.updateCampaignId(campaignId, { from: admin });
      truffleAssert.eventEmitted(tx, "CampaignIdSet", (ev) => {
        return ev.campaignId.toString() === `${campaignId}`;
      });
    });
  });

  describe("updateStartAndEndBlocks", () => {
    it("should throw for non admin to update start block and end block", async () => {
      await expectRevert(
        contract.updateStartAndEndBlocks(startBlock + 1, endBlock + 1, {
          from: minter,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("should check the start block if it's has started", async () => {
      await time.advanceBlockTo(startBlock + 1);
      await expectRevert(
        contract.updateStartAndEndBlocks(startBlock + 5, endBlock, {
          from: admin,
        }),
        "IGO has started"
      );
    });

    it("should check the new start block if it is in the future", async () => {
      const currentBlock = Number.parseInt(
        (await time.latestBlock()).toString()
      );
      await expectRevert(
        contract.updateStartAndEndBlocks(currentBlock - 1, endBlock, {
          from: admin,
        }),
        "New startBlock must be higher than current block"
      );
    });

    it("should compare the start block and end block in range before updating", async () => {
      await expectRevert(
        contract.updateStartAndEndBlocks(endBlock, startBlock, { from: admin }),
        "New startBlock must be lower than new endBlock"
      );
    });

    it("should set start block and end block", async () => {
      const campaignId = 54000;
      const tx = await contract.updateStartAndEndBlocks(
        startBlock + 1,
        endBlock + 1,
        { from: admin }
      );
      truffleAssert.eventEmitted(tx, "NewStartAndEndBlocks", (ev) => {
        return (
          ev.startBlock.toString() === `${startBlock + 1}` &&
          ev.endBlock.toString() === `${endBlock + 1}`
        );
      });
    });
  });

  describe("finalWithdraw", () => {
    it("should not allow non admin to withdraw", async () => {
      await expectRevert(
        contract.finalWithdraw(1, 1, { from: minter }),
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow to withdraw offering token more than there is", async () => {
      // Receive token from the IGO project
      const offeringAmountPool = 10000; // IGO token
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await expectRevert(
        contract.finalWithdraw(0, offeringAmountPool + 1, { from: admin }),
        "Not enough offering token"
      );
    });

    it("should not allow to withdraw LP token more than there is", async () => {
      const offeringAmountPool = 10000; // IGO token
      const raisingAmountPool = 1000; // LP token
      const limitPerUserInLP = 0; // LP token
      const hasTax = true;
      const pid = 0;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });
      await time.advanceBlockTo(startBlock);

      await contract.depositPool(200, pid, { from: bob });

      await expectRevert(
        contract.finalWithdraw(201, offeringAmountPool, { from: admin }),
        "Not enough LP tokens"
      );
    });

    it("should allow to withdraw LP token and offering token correctly", async () => {
      const offeringAmountPool = 10000; // IGO token
      const raisingAmountPool = 1000; // LP token
      const limitPerUserInLP = 0; // LP token
      const hasTax = true;
      const pid = 0;
      const depositAmount = 200;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });
      await time.advanceBlockTo(startBlock);

      await contract.depositPool(depositAmount, pid, { from: bob });

      const tx = await contract.finalWithdraw(
        depositAmount,
        offeringAmountPool,
        {
          from: admin,
        }
      );
      truffleAssert.eventEmitted(tx, "AdminWithdraw", (ev) => {
        return (
          ev.amountLP.toString() === `${depositAmount}` &&
          ev.amountOfferingToken.toString() === `${offeringAmountPool}`
        );
      });
      assert.equal((await lp.balanceOf(admin)).toString(), `${depositAmount}`);
      assert.equal(
        (await igoToken.balanceOf(admin)).toString(),
        `${offeringAmountPool}`
      );
    });
  });

  describe("recoverWrongTokens", () => {
    it("should not allow non admin to recover tokens", async () => {
      await expectRevert(
        contract.recoverWrongTokens(lp.address, 1, { from: minter }),
        "Ownable: caller is not the owner"
      );
    });

    it("should not allow to recover LP token", async () => {
      await expectRevert(
        contract.recoverWrongTokens(lp.address, 1, { from: admin }),
        "Cannot be LP token"
      );
    });

    it("should not allow to recover offering token", async () => {
      await expectRevert(
        contract.recoverWrongTokens(igoToken.address, 1, { from: admin }),
        "Cannot be offering token"
      );
    });

    it("should only allow to recover wrong token with existing amount", async () => {
      const wrongToken = await MockERC20.new("WrongToken", "WTK", "1000000", {
        from: minter,
      });
      const depositAmount = 1000;
      await wrongToken.transfer(contract.address, depositAmount, {
        from: minter,
      });
      await expectRevert(
        contract.recoverWrongTokens(wrongToken.address, depositAmount + 1, {
          from: admin,
        }),
        "Cannot recover more than balance"
      );
    });

    it("should allow to recover wrong token", async () => {
      const wrongToken = await MockERC20.new("WrongToken", "WTK", "1000000", {
        from: minter,
      });
      const depositAmount = 1000;
      await wrongToken.transfer(contract.address, depositAmount, {
        from: minter,
      });
      const tx = await contract.recoverWrongTokens(
        wrongToken.address,
        depositAmount,
        {
          from: admin,
        }
      );

      truffleAssert.eventEmitted(tx, "AdminTokenRecovery", (ev) => {
        return (
          ev.tokenAddress.toString() === `${wrongToken.address}` &&
          ev.amountTokens.toString() === `${depositAmount}`
        );
      });
      assert.equal(
        (await wrongToken.balanceOf(admin)).toString(),
        `${depositAmount}`
      );
    });
  });

  describe("viewUserOfferingAndRefundingAmountsForPools", () => {
    it("should display the user offering, refund and tax correctly", async () => {
      await lp.transfer(bob, "99000", { from: minter });
      await lp.transfer(alice, "99000", { from: minter });
      await lp.transfer(carol, "99000", { from: minter });
      await lp.approve(contract.address, "100000", { from: bob });
      await lp.approve(contract.address, "100000", { from: alice });
      await lp.approve(contract.address, "100000", { from: carol });

      const offeringAmountPool = 10000; // IGO token
      const raisingAmountPool = 1000; // LP token
      const limitPerUserInLP = 0; // LP token
      const hasTax = true;
      const pid = 0;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);

      await contract.depositPool(20000, pid, { from: bob });
      await contract.depositPool(20000, pid, { from: alice });
      await contract.depositPool(10000, pid, { from: carol });

      // Calculate the user offering amount and refund
      const bobOfferingAndRefund =
        await contract.viewUserOfferingAndRefundingAmountsForPools(bob, [pid]);
      let [userOfferingAmountPool, userRefundingAmountPool, userTaxAmountPool] =
        bobOfferingAndRefund[0];
      assert.equal(userOfferingAmountPool.toString(), "4000"); // "20000*10000/50000"
      assert.equal(userRefundingAmountPool.toString(), "19502"); // 20000 - 20000/50000*raisingAmount - tax
      assert.equal(userTaxAmountPool.toString(), "98"); // (20000 - 20000/50000*1000)*0.005 = 19600*0.005

      const carolOfferingAndRefund =
        await contract.viewUserOfferingAndRefundingAmountsForPools(carol, [
          pid,
        ]);
      [userOfferingAmountPool, userRefundingAmountPool, userTaxAmountPool] =
        carolOfferingAndRefund[0];
      assert.equal(userOfferingAmountPool.toString(), "2000");
      ("10000*10000/50000");
      assert.equal(userRefundingAmountPool.toString(), "9751");
      assert.equal(userTaxAmountPool.toString(), "49");
    });
  });

  describe("viewUserInfo", () => {
    it("should display the user info correctly after depositing into 1 pool, when 2 pools are set", async () => {
      let offeringAmountPool = 100; // IGO token
      let raisingAmountPool = 10; // LP token
      let limitPerUserInLP = 5; // LP token
      let hasTax = false;
      let pid = 0;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      offeringAmountPool = 100; // IGO token
      raisingAmountPool = 10; // LP token
      limitPerUserInLP = 0; // LP token
      hasTax = true;
      pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);
      await contract.depositPool(5, 1, { from: bob });

      const userInfo = await contract.viewUserInfo(bob, [0, 1], { from: bob });
      const amountPools = userInfo[0];
      const statusPools = userInfo[1];
      assert.equal(amountPools[0].toString(), "0");
      assert.equal(amountPools[1].toString(), "5");
      assert.equal(statusPools[0].toString(), "false");
      assert.equal(statusPools[1].toString(), "false");
    });

    it("should display the user info correctly after depositing into 0 pool, when 2 pools are set", async () => {
      let offeringAmountPool = 100; // IGO token
      let raisingAmountPool = 10; // LP token
      let limitPerUserInLP = 5; // LP token
      let hasTax = false;
      let pid = 0;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      offeringAmountPool = 100; // IGO token
      raisingAmountPool = 10; // LP token
      limitPerUserInLP = 0; // LP token
      hasTax = true;
      pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      const userInfo = await contract.viewUserInfo(bob, [0, 1], { from: bob });
      const amountPools = userInfo[0];
      const statusPools = userInfo[1];
      assert.equal(amountPools[0].toString(), "0");
      assert.equal(amountPools[1].toString(), "0");
      assert.equal(statusPools[0].toString(), "false");
      assert.equal(statusPools[1].toString(), "false");
    });

    it("should display the user info correctly after depositing into 2 pool, when 2 pools are set", async () => {
      let offeringAmountPool = 100; // IGO token
      let raisingAmountPool = 10; // LP token
      let limitPerUserInLP = 5; // LP token
      let hasTax = false;
      let pid = 0;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      offeringAmountPool = 100; // IGO token
      raisingAmountPool = 10; // LP token
      limitPerUserInLP = 0; // LP token
      hasTax = true;
      pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );

      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);
      await contract.depositPool(5, 0, { from: bob });
      await contract.depositPool(4, 1, { from: bob });
      await time.advanceBlockTo(endBlock);

      await contract.harvestPool(1, { from: bob });

      const userInfo = await contract.viewUserInfo(bob, [0, 1], { from: bob });
      const amountPools = userInfo[0];
      const statusPools = userInfo[1];
      assert.equal(amountPools[0].toString(), "5");
      assert.equal(amountPools[1].toString(), "4");
      assert.equal(statusPools[0].toString(), "false");
      assert.equal(statusPools[1].toString(), "true");
    });
  });

  describe("viewUserAllocationPools", () => {
    it("should return empty allocation for non participated user", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      assert.equal(await contract.viewUserAllocationPools(bob, [pid]), 0);
    });
  });

  describe("viewPoolTaxRateOverflow", () => {
    it("should return tax rate as zero when no tax set", async () => {
      const offeringAmountPool = 100; // IGO token
      const raisingAmountPool = 10; // LP token
      const limitPerUserInLP = 5; // LP token
      const hasTax = false;
      const pid = 1;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      assert.equal(await contract.viewPoolTaxRateOverflow(pid), 0);
    });

    it("should return tax rate as non zero when tax is set", async () => {
      const offeringAmountPool = 1000; // IGO token
      const raisingAmountPool = 100; // LP token
      const limitPerUserInLP = 0; // LP token
      const hasTax = true;
      const pid = 0;
      await contract.setPool(
        offeringAmountPool,
        raisingAmountPool,
        limitPerUserInLP,
        hasTax,
        pid,
        { from: admin }
      );
      // Receive token from the IGO project
      await igoToken.transfer(contract.address, offeringAmountPool, {
        from: minter,
      });

      await time.advanceBlockTo(startBlock);

      await contract.depositPool(1, pid, { from: bob });
      await contract.depositPool(2, pid, { from: alice });
      await contract.depositPool(3, pid, { from: carol });

      await time.advanceBlockTo(endBlock);

      assert.equal(
        (await contract.viewPoolTaxRateOverflow(pid)).toString(),
        "10000000000"
      );
    });
  });
});
