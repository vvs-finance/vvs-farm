const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const VVSToken = artifacts.require('VVSToken');
const Craftsman = artifacts.require('Craftsman');
const MockERC20 = artifacts.require('libs/MockERC20');
const Timelock = artifacts.require('Timelock');
const Workbench = artifacts.require('Workbench');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Timelock', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.vvs = await VVSToken.new(5256000000, { from: alice });
        this.timelock = await Timelock.new(bob, '28800', { from: alice }); //8hours
    });

    it('should not allow non-owner to do operation', async () => {
        await this.vvs.transferOwnership(this.timelock.address, { from: alice });
        await expectRevert(
            this.vvs.transferOwnership(carol, { from: alice }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.vvs.transferOwnership(carol, { from: bob }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.timelock.queueTransaction(
                this.vvs.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]),
                (await time.latest()).add(time.duration.hours(6)),
                { from: alice },
            ),
            'Timelock::queueTransaction: Call must come from admin.',
        );
    });

    it('should do the timelock thing', async () => {
        await this.vvs.transferOwnership(this.timelock.address, { from: alice });
        const eta = (await time.latest()).add(time.duration.hours(9));
        await this.timelock.queueTransaction(
            this.vvs.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, { from: bob },
        );
        await time.increase(time.duration.hours(1));
        await expectRevert(
            this.timelock.executeTransaction(
                this.vvs.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]), eta, { from: bob },
            ),
            "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
        await time.increase(time.duration.hours(8));
        await this.timelock.executeTransaction(
            this.vvs.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, { from: bob },
        );
        assert.equal((await this.vvs.owner()).valueOf(), carol);
    });

    it('should also work with Craftsman', async () => {
        this.lp1 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.bench = await Workbench.new(this.vvs.address, { from: minter });
        this.craft = await Craftsman.new(this.vvs.address, this.bench.address, dev, '0', { from: alice });
        await this.vvs.transferOwnership(this.craft.address, { from: alice });
        await this.bench.transferOwnership(this.craft.address, { from: minter });
        await this.craft.add('100', this.lp1.address, true, { from: alice });
        await this.craft.transferOwnership(this.timelock.address, { from: alice });
        await expectRevert(
            this.craft.add('100', this.lp1.address, true, { from: alice }),
            "Ownable: caller is not the owner",
        );

        const eta = (await time.latest()).add(time.duration.hours(9));
        await this.timelock.queueTransaction(
            this.craft.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [minter]), eta, { from: bob },
        );
        // await this.timelock.queueTransaction(
        //     this.craft.address, '0', 'add(uint256,address,bool)',
        //     encodeParameters(['uint256', 'address', 'bool'], ['100', this.lp2.address, false]), eta, { from: bob },
        // );
        await time.increase(time.duration.hours(9));
        await this.timelock.executeTransaction(
            this.craft.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [minter]), eta, { from: bob },
        );
        await expectRevert(
            this.craft.add('100', this.lp1.address, true, { from: alice }),
            "Ownable: caller is not the owner",
        );
        await this.craft.add('100', this.lp1.address, true, { from: minter })
        // await this.timelock.executeTransaction(
        //     this.craft.address, '0', 'add(uint256,address,bool)',
        //     encodeParameters(['uint256', 'address', 'bool'], ['100', this.lp2.address, false]), eta, { from: bob },
        // );
        // assert.equal((await this.craft.poolInfo('0')).valueOf().allocPoint, '200');
        // assert.equal((await this.craft.totalAllocPoint()).valueOf(), '300');
        // assert.equal((await this.craft.poolLength()).valueOf(), '2');
    });
});
