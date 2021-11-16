pragma solidity 0.6.12;

/** @title IIGO.
 * @notice It is an interface for IGO.sol
 */
interface IIGO {
    /**
     * @notice It allows users to deposit LP tokens to pool
     * @param _amount: the number of LP token used (18 decimals)
     * @param _pid: poolId
     */
    function depositPool(uint256 _amount, uint8 _pid) external;

    /**
     * @notice It allows users to harvest from pool
     * @param _pid: poolId
     */
    function harvestPool(uint8 _pid) external;

    /**
     * @notice It allows the admin to withdraw funds
     * @param _lpAmount: the number of LP token to withdraw (18 decimals)
     * @param _offerAmount: the number of offering amount to withdraw
     * @dev This function is only callable by admin.
     */
    function finalWithdraw(uint256 _lpAmount, uint256 _offerAmount) external;

    /**
     * @notice It sets parameters for pool
     * @param _offeringAmountPool: offering amount (in tokens)
     * @param _raisingAmountPool: raising amount (in LP tokens)
     * @param _limitPerUserInLP: limit per user (in LP tokens)
     * @param _hasTax: if the pool has a tax
     * @param _pid: poolId
     * @dev This function is only callable by admin.
     */
    function setPool(
        uint256 _offeringAmountPool,
        uint256 _raisingAmountPool,
        uint256 _limitPerUserInLP,
        bool _hasTax,
        uint8 _pid
    ) external;

    /**
     * @notice It updates campaign id for the IGO.
     * @param _campaignId: the campaignId for the IGO
     * @dev This function is only callable by admin.
     */
    function updateCampaignId(
        uint256 _campaignId
    ) external;

    /**
     * @notice It returns the pool information
     * @param _pid: poolId
     */
    function viewPoolInformation(uint256 _pid)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256
        );

    /**
     * @notice It returns the tax overflow rate calculated for a pool
     * @dev 100,000 means 0.1(10%)/ 1 means 0.000001(0.0001%)/ 1,000,000 means 1(100%)
     * @param _pid: poolId
     * @return It returns the tax percentage
     */
    function viewPoolTaxRateOverflow(uint256 _pid) external view returns (uint256);

    /**
     * @notice External view function to see user information
     * @param _user: user address
     * @param _pids[]: array of pids
     */
    function viewUserInfo(address _user, uint8[] calldata _pids)
        external
        view
        returns (uint256[] memory, bool[] memory);

    /**
     * @notice External view function to see user allocations for both pools
     * @param _user: user address
     * @param _pids[]: array of pids
     */
    function viewUserAllocationPools(address _user, uint8[] calldata _pids) external view returns (uint256[] memory);

    /**
     * @notice External view function to see user offering and refunding amounts for both pools
     * @param _user: user address
     * @param _pids: array of pids
     */
    function viewUserOfferingAndRefundingAmountsForPools(address _user, uint8[] calldata _pids)
        external
        view
        returns (uint256[3][] memory);
}
