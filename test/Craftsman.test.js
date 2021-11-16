const { expectRevert, time } = require('@openzeppelin/test-helpers');
const VVSToken = artifacts.require('VVSToken');
const Workbench = artifacts.require('Workbench');
const Craftsman = artifacts.require('Craftsman');
const MockERC20 = artifacts.require('libs/MockERC20');

contract('Craftsman', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        // 1000 per block = 5256000000 per year
        this.vvs = await VVSToken.new(5256000000, { from: minter });
        this.bench = await Workbench.new(this.vvs.address, { from: minter });
        this.lp1 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken', 'LP2', '1000000', { from: minter });
        this.lp3 = await MockERC20.new('LPToken', 'LP3', '1000000', { from: minter });
        this.craft = await Craftsman.new(this.vvs.address, this.bench.address, dev, '100', { from: minter });
        await this.vvs.transferOwnership(this.craft.address, { from: minter });
        await this.bench.transferOwnership(this.craft.address, { from: minter });

        await this.lp1.transfer(bob, '2000', { from: minter });
        await this.lp2.transfer(bob, '2000', { from: minter });
        await this.lp3.transfer(bob, '2000', { from: minter });

        await this.lp1.transfer(alice, '2000', { from: minter });
        await this.lp2.transfer(alice, '2000', { from: minter });
        await this.lp3.transfer(alice, '2000', { from: minter });
    });
    it('real case', async () => {
      this.lp4 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
      this.lp5 = await MockERC20.new('LPToken', 'LP2', '1000000', { from: minter });
      this.lp6 = await MockERC20.new('LPToken', 'LP3', '1000000', { from: minter });
      this.lp7 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
      this.lp8 = await MockERC20.new('LPToken', 'LP2', '1000000', { from: minter });
      this.lp9 = await MockERC20.new('LPToken', 'LP3', '1000000', { from: minter });
      await this.craft.add('2000', this.lp1.address, true, { from: minter });
      await this.craft.add('1000', this.lp2.address, true, { from: minter });
      await this.craft.add('500', this.lp3.address, true, { from: minter });
      await this.craft.add('500', this.lp3.address, true, { from: minter });
      await this.craft.add('500', this.lp3.address, true, { from: minter });
      await this.craft.add('500', this.lp3.address, true, { from: minter });
      await this.craft.add('500', this.lp3.address, true, { from: minter });
      await this.craft.add('100', this.lp3.address, true, { from: minter });
      await this.craft.add('100', this.lp3.address, true, { from: minter });
      assert.equal((await this.craft.poolLength()).toString(), "10");

      await time.advanceBlockTo('170');
      await this.lp1.approve(this.craft.address, '1000', { from: alice });
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '0');
      await this.craft.deposit(1, '20', { from: alice });
      await this.craft.withdraw(1, '20', { from: alice });
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '263');

      await this.vvs.approve(this.craft.address, '1000', { from: alice });
      await this.craft.enterStaking('20', { from: alice });
      await this.craft.enterStaking('0', { from: alice });
      await this.craft.enterStaking('0', { from: alice });
      await this.craft.enterStaking('0', { from: alice });
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '993');
      // assert.equal((await this.craft.getPoolPoint(0, { from: minter })).toString(), '1900');
    })


    it('deposit/withdraw', async () => {
      await this.craft.add('1000', this.lp1.address, true, { from: minter });
      await this.craft.add('1000', this.lp2.address, true, { from: minter });
      await this.craft.add('1000', this.lp3.address, true, { from: minter });

      await this.lp1.approve(this.craft.address, '100', { from: alice });
      await this.craft.deposit(1, '20', { from: alice });
      await this.craft.deposit(1, '0', { from: alice });
      await this.craft.deposit(1, '40', { from: alice });
      await this.craft.deposit(1, '0', { from: alice });
      assert.equal((await this.lp1.balanceOf(alice)).toString(), '1940');
      await this.craft.withdraw(1, '10', { from: alice });
      assert.equal((await this.lp1.balanceOf(alice)).toString(), '1950');
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '999');
      assert.equal((await this.vvs.balanceOf(dev)).toString(), '0');

      await this.lp1.approve(this.craft.address, '100', { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000');
      await this.craft.deposit(1, '50', { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '1950');
      await this.craft.deposit(1, '0', { from: bob });
      assert.equal((await this.vvs.balanceOf(bob)).toString(), '125');
      await this.craft.emergencyWithdraw(1, { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000');
    })

    it('staking/unstaking', async () => {
      await this.craft.add('1000', this.lp1.address, true, { from: minter });
      await this.craft.add('1000', this.lp2.address, true, { from: minter });
      await this.craft.add('1000', this.lp3.address, true, { from: minter });

      await this.lp1.approve(this.craft.address, '10', { from: alice });
      await this.craft.deposit(1, '2', { from: alice }); //0
      await this.craft.withdraw(1, '2', { from: alice }); //1

      await this.vvs.approve(this.craft.address, '250', { from: alice });
      await this.craft.enterStaking('240', { from: alice }); //3
      assert.equal((await this.bench.balanceOf(alice)).toString(), '240');
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '10');
      await this.craft.enterStaking('10', { from: alice }); //4
      assert.equal((await this.bench.balanceOf(alice)).toString(), '250');
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '249');
      await this.craft.leaveStaking(250);
      assert.equal((await this.bench.balanceOf(alice)).toString(), '0');
      assert.equal((await this.vvs.balanceOf(alice)).toString(), '749');

    });

    it('update multiplier', async () => {
      await this.craft.add('1000', this.lp1.address, true, { from: minter });
      await this.craft.add('1000', this.lp2.address, true, { from: minter });
      await this.craft.add('1000', this.lp3.address, true, { from: minter });

      await this.lp1.approve(this.craft.address, '100', { from: alice });
      await this.lp1.approve(this.craft.address, '100', { from: bob });
      await this.craft.deposit(1, '100', { from: alice });
      await this.craft.deposit(1, '100', { from: bob });
      await this.craft.deposit(1, '0', { from: alice });
      await this.craft.deposit(1, '0', { from: bob });

      await this.vvs.approve(this.craft.address, '100', { from: alice });
      await this.vvs.approve(this.craft.address, '100', { from: bob });
      await this.craft.enterStaking('50', { from: alice });
      await this.craft.enterStaking('100', { from: bob });

      await this.craft.updateMultiplier('0', { from: minter });

      await this.craft.enterStaking('0', { from: alice });
      await this.craft.enterStaking('0', { from: bob });
      await this.craft.deposit(1, '0', { from: alice });
      await this.craft.deposit(1, '0', { from: bob });

      assert.equal((await this.vvs.balanceOf(alice)).toString(), '700');
      assert.equal((await this.vvs.balanceOf(bob)).toString(), '150');

      await time.advanceBlockTo('265');

      await this.craft.enterStaking('0', { from: alice });
      await this.craft.enterStaking('0', { from: bob });
      await this.craft.deposit(1, '0', { from: alice });
      await this.craft.deposit(1, '0', { from: bob });

      assert.equal((await this.vvs.balanceOf(alice)).toString(), '700');
      assert.equal((await this.vvs.balanceOf(bob)).toString(), '150');

      await this.craft.leaveStaking('50', { from: alice });
      await this.craft.leaveStaking('100', { from: bob });
      await this.craft.withdraw(1, '100', { from: alice });
      await this.craft.withdraw(1, '100', { from: bob });

    });

    it('should allow dev and only dev to update dev', async () => {
      assert.equal((await this.craft.devaddr()).valueOf(), dev);
      await expectRevert(this.craft.dev(bob, { from: bob }), 'dev: wut?');
      await this.craft.dev(bob, { from: dev });
      assert.equal((await this.craft.devaddr()).valueOf(), bob);
      await this.craft.dev(alice, { from: bob });
      assert.equal((await this.craft.devaddr()).valueOf(), alice);
    })

    it('distributeSupply', async () => {
     // Half 5256000000 = 500 per block
     await this.craft.distributeSupply([alice], [2628000000], { from: minter });
     assert.equal((await this.craft.vvsPerBlock()).valueOf(), 500);
    });

    describe('updateStakingRatio', () => {
     beforeEach(async () => {
      await this.craft.add('1000', this.lp1.address, true, { from: minter });
      await this.craft.add('2500', this.lp2.address, true, { from: minter });
      await this.craft.add('4000', this.lp3.address, true, { from: minter });
     });

     it('allocPoint of VVS should be 25% by default', async () => {
      const poolInfo = await this.craft.poolInfo(0);
      const totalAllocPoint = Math.floor(parseInt(await this.craft.totalAllocPoint()) * 25 / 100);
      assert.equal(
       poolInfo.allocPoint.toString(),
       totalAllocPoint.toString()
      );
     });

     it('only owner can call', async () => {
      await expectRevert(this.craft.updateStakingRatio(30, { from: alice }), 'Ownable: caller is not the owner\'');
     });

     it('should not accept ratio > 50', async () => {
      await expectRevert(this.craft.updateStakingRatio(51, { from: minter }), 'updateStakingRatio: must be lte 50%');
     });

     it('should have correct allocPoint if increase ratio', async () => {
      await this.craft.updateStakingRatio(30, { from: minter });

      this.lp4 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
      await this.craft.add('2500', this.lp4.address, true, { from: minter });

      const poolInfo = await this.craft.poolInfo(0);
      const totalAllocPoint = Math.floor(parseInt(await this.craft.totalAllocPoint()) * 30 / 100);

      assert.equal(
       poolInfo.allocPoint.toString(),
       totalAllocPoint.toString()
      );
     });

     it('should have correct allocPoint if decrease ratio', async () => {
      await this.craft.updateStakingRatio(20, { from: minter });

      this.lp4 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
      await this.craft.add('2500', this.lp4.address, true, { from: minter });

      const poolInfo = await this.craft.poolInfo(0);
      const totalAllocPoint = Math.floor(parseInt(await this.craft.totalAllocPoint()) * 20 / 100);
      assert.equal(
       poolInfo.allocPoint.toString(),
       totalAllocPoint.toString()
      );
    });
   });
});
