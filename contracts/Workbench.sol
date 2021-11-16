pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./VVSToken.sol";

// Workbench with Governance.
contract Workbench is ERC20('Workbench Token', 'BENCH'), Ownable {
    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner (Craftsman).
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }

    function burn(address _from ,uint256 _amount) public onlyOwner {
        _burn(_from, _amount);
    }

    // The VVS TOKEN!
    VVSToken public vvs;

    constructor(
        VVSToken _vvs
    ) public {
        vvs = _vvs;
    }

    // Safe VVS transfer function, just in case if rounding error causes pool to not have enough VVSs.
    function safeVVSTransfer(address _to, uint256 _amount) public onlyOwner {
        uint256 vvsBal = vvs.balanceOf(address(this));
        if (_amount > vvsBal) {
            vvs.transfer(_to, vvsBal);
        } else {
            vvs.transfer(_to, _amount);
        }
    }
}
