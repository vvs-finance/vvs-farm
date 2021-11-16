// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VVSInitMintable is ERC20("VVSToken", "VVS"), Ownable {
    uint256 public nextDistributionTimestamp;

    uint256 public constant nextDistributionWindow = 365 days;
    uint256 public constant BLOCK_TIME = 6 seconds;

    bool isAfterFirstYear;
    uint256 public SUPPLY_PER_YEAR;
    uint256 public SUPPLY_PER_BLOCK;

    event SupplyDistributed(uint256 amount);

    constructor (
        uint256 _supplyPerYear
    ) public {
        SUPPLY_PER_YEAR = _supplyPerYear;
        SUPPLY_PER_BLOCK = _perYearToPerBlock(_supplyPerYear);
        nextDistributionTimestamp = block.timestamp;
    }

    function distributeSupply(
        address[] memory _teamAddresses,
        uint256[] memory _teamAmounts
    ) public onlyOwner {
        require(block.timestamp >= nextDistributionTimestamp, "VVSInitMintable: Not ready");
        require(_teamAddresses.length == _teamAmounts.length, "VVSInitMintable: Array length mismatch");

        if (isAfterFirstYear) {
            SUPPLY_PER_YEAR = SUPPLY_PER_YEAR.div(2);
        } else {
            isAfterFirstYear = true;
        }

        uint256 communitySupplyPerYear = SUPPLY_PER_YEAR;
        for (uint256 i; i < _teamAddresses.length; i++) {
            _mint(_teamAddresses[i], _teamAmounts[i]);
            communitySupplyPerYear = communitySupplyPerYear.sub(_teamAmounts[i]);
        }

        require(communitySupplyPerYear >= SUPPLY_PER_YEAR.mul(30).div(100));

        SUPPLY_PER_BLOCK = _perYearToPerBlock(communitySupplyPerYear);
        nextDistributionTimestamp = nextDistributionTimestamp.add(nextDistributionWindow);
        emit SupplyDistributed(SUPPLY_PER_YEAR.sub(communitySupplyPerYear));
    }

    function _perYearToPerBlock (
        uint256 perYearValue
    ) internal pure returns (uint256) {
        return perYearValue.mul(BLOCK_TIME).div(365 days);
    }
}
