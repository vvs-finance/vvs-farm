const { assert } = require("chai");

const VVSToken = artifacts.require('VVSToken');

contract('VVSToken', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.vvs = await VVSToken.new(1000, { from: minter });
    });


    it('mint', async () => {
        await this.vvs.mint(alice, 1000, { from: minter });
        assert.equal((await this.vvs.balanceOf(alice)).toString(), '1000');
    })
});
