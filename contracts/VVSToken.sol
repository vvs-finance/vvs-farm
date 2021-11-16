// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./VVSInitMintable.sol";

contract VVSToken is VVSInitMintable {

    constructor (
        uint256 _supplyPerYear
    ) VVSInitMintable(_supplyPerYear) public {}

    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner (Craftsman).
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }
}
