const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require("chai");
const VVSToken = artifacts.require('VVSToken');
const Workbench = artifacts.require('Workbench');
const Craftsman = artifacts.require('Craftsman');
const CraftsmanAdmin = artifacts.require('CraftsmanAdmin');
const MockERC20 = artifacts.require('MockERC20');

contract('CraftsmanAdmin', ([alice, newOwner, newOwner1, dev, minter]) => {
 beforeEach(async () => {
  // 1000 per block = 5256000000 per year
  this.vvs = await VVSToken.new(5256000000, { from: minter });
  this.bench = await Workbench.new(this.vvs.address, { from: minter });
  this.craft = await Craftsman.new(this.vvs.address, this.bench.address, dev, '100', { from: minter });
  this.craftsAdmin = await CraftsmanAdmin.new(this.craft.address, { from: minter });

  await this.vvs.transferOwnership(this.craft.address, { from: minter });
  await this.bench.transferOwnership(this.craft.address, { from: minter });
  await this.craft.transferOwnership(this.craftsAdmin.address, { from: minter });

  this.lp1 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
 });

 describe('add', () => {
  it('only owner can call', async () => {
   await expectRevert(this.craftsAdmin.add(1000, this.lp1.address, true, { from: alice }), 'Ownable: caller is not the owner\'');
  });

  it('can call add', async () => {
   await this.craftsAdmin.add(1000, this.lp1.address, true, { from: minter });
   assert.equal(await this.craft.poolLength(), 2);
  });
 });

 describe('set', () => {
  beforeEach(async () => {
   await this.craftsAdmin.add(1000, this.lp1.address, true, { from: minter });
  });

  it('only owner can call', async () => {
   await expectRevert(this.craftsAdmin.set(1, 2000, true, { from: alice }), 'Ownable: caller is not the owner\'');
  });

  it('can call set', async () => {
   await this.craftsAdmin.set(1, 2000, true, { from: minter });
   const pool = await this.craft.poolInfo(1);
   assert.equal(pool.allocPoint, 2000);
  });
 });

 describe('distributeSupply', () => {
  beforeEach(() => {
   this.teamAddresses = [alice];
   this.teamAmount = [1000];
  });
  it('only owner can call', async () => {
   await expectRevert(this.craftsAdmin.distributeSupply(
    this.teamAddresses,
    this.teamAmount,
    { from: alice }
   ), 'Ownable: caller is not the owner\'');
  });

  it('can call distributeSupply', async () => {
   await this.craftsAdmin.distributeSupply(
    this.teamAddresses,
    this.teamAmount,
    { from: minter }
   );
   assert.equal(await this.vvs.balanceOf(alice), 1000);
  });
 });

 describe('updateStakingRatio', () => {
  it('only owner can call', async () => {
   await expectRevert(this.craftsAdmin.updateStakingRatio(10, { from: alice }), 'Ownable: caller is not the owner\'');
  });

  it('can call distributeSupply', async () => {
   await this.craftsAdmin.updateStakingRatio(10, { from: minter });
   assert.equal(await this.craft.vvsStakingRatio(), 10);
  });
 });

 describe('enableTransferOwnership', () => {
  it('only owner can call', async () => {
   await expectRevert(this.craftsAdmin.enableTransferOwnership(newOwner, { from: alice }), 'Ownable: caller is not the owner\'');
  });

  it('can call enableTransferOwnership', async () => {
   const timelock = await this.craftsAdmin.TRANSFER_OWNERSHIP_TIMELOCK();
   await this.craftsAdmin.enableTransferOwnership(newOwner, { from: minter });
   assert.equal((await this.craftsAdmin.newOwner()).toString(), newOwner);
   assert.equal(
    (await this.craftsAdmin.transferOwnershipTimeLock()).toString(),
    (await time.latest()).add(timelock).toString()
   );
  });

  it('changing newOwner resets the timer', async () => {
   const timelock = await this.craftsAdmin.TRANSFER_OWNERSHIP_TIMELOCK();
   await this.craftsAdmin.enableTransferOwnership(newOwner, { from: minter });
   await time.increase(timelock);
   await this.craftsAdmin.enableTransferOwnership(newOwner1, { from: minter });

   assert.equal((await this.craftsAdmin.newOwner()).toString(), newOwner1);
   assert.equal(
    (await this.craftsAdmin.transferOwnershipTimeLock()).toString(),
    (await time.latest()).add(timelock).toString()
   );
  });
 });

 describe('transferOwnership', () => {
  it('only owner can call', async () => {
   await expectRevert(this.craftsAdmin.transferOwnership({ from: alice }), 'Ownable: caller is not the owner\'');
  });

  it('cannot call when timelock timestamp not reached', async () => {
   await this.craftsAdmin.enableTransferOwnership(newOwner, { from: minter });

   await time.increase(
    (await this.craftsAdmin.TRANSFER_OWNERSHIP_TIMELOCK())
     .sub(time.duration.seconds(1)));
   await expectRevert(this.craftsAdmin.transferOwnership({ from: minter }), "CraftsmanAdmin: transferOwnership not ready");

  });

  it('can transferOwnership after timelock timestamp', async () => {
   await this.craftsAdmin.enableTransferOwnership(newOwner, { from: minter });

   await time.increase(await this.craftsAdmin.TRANSFER_OWNERSHIP_TIMELOCK());
   await time.increase(time.duration.seconds(1));
   await this.craftsAdmin.transferOwnership({ from: minter });
   assert.equal((await this.craft.owner()).toString(), newOwner);
  });
 });
});
