const { advanceBlockTo } = require('@openzeppelin/test-helpers/src/time');
const { assert } = require('chai');
const VVSToken = artifacts.require('VVSToken');
const Workbench = artifacts.require('Workbench');

contract('Workbench', ([alice, bob, carol, dev, minter]) => {
  beforeEach(async () => {
    this.vvs = await VVSToken.new(1000, { from: minter });
    this.bench = await Workbench.new(this.vvs.address, { from: minter });
  });

  it('mint', async () => {
    await this.bench.mint(alice, 1000, { from: minter });
    assert.equal((await this.bench.balanceOf(alice)).toString(), '1000');
  });

  it('burn', async () => {
    await advanceBlockTo('800');
    await this.bench.mint(alice, 1000, { from: minter });
    await this.bench.mint(bob, 1000, { from: minter });
    assert.equal((await this.bench.totalSupply()).toString(), '2000');
    await this.bench.burn(alice, 200, { from: minter });

    assert.equal((await this.bench.balanceOf(alice)).toString(), '800');
    assert.equal((await this.bench.totalSupply()).toString(), '1800');
  });

  it('safeVVSTransfer', async () => {
    assert.equal(
      (await this.vvs.balanceOf(this.bench.address)).toString(),
      '0'
    );
    await this.vvs.mint(this.bench.address, 1000, { from: minter });
    await this.bench.safeVVSTransfer(bob, 200, { from: minter });
    assert.equal((await this.vvs.balanceOf(bob)).toString(), '200');
    assert.equal(
      (await this.vvs.balanceOf(this.bench.address)).toString(),
      '800'
    );
    await this.bench.safeVVSTransfer(bob, 2000, { from: minter });
    assert.equal((await this.vvs.balanceOf(bob)).toString(), '1000');
  });
});
