// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Staking {

    constructor(address token) {}

    // allows users to stake tokens
    function stake(uint256 amount) public {}

    // allows users to reedem staked tokens
    function reedem(uint256 amount) public {}

    // transfers rewards to staker
    function claimInterest() public {}

    // returns the accrued interest
    function getAccruedInterest(address user) public returns (uint256) {}

    // allows owner to collect all the staked tokens
    function sweep() public {}
    
}