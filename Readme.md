# Smart contract Chanllenge

The candidate will demonstrate their ability to work with Solidity smart contracts by modifying an existing contract to meet specified requirements.

After making the changes, the candidate will create a pull request (PR) to the original repository with a clear description of the changes made.

## Overview

Staking contracts allows users to stake tokens for a specific duration and earn rewards based on their staking period.

Your task in this problem is to build a staking contract that allows users to deposit ERC-20 tokens and receive rewards on the basis of the time they’ve staked their tokens for.

The calculation of the rewards is done in the following manner:
If less than 1 day has been passed, the user earns no rewards.
If more than 1 day has been passed, the user earns 1% on their staked token amount.
If more than a week has passed, the user earns 10%.

If a user redeems their TOKENs before claiming interest, no interest shall be paid.

## Input

Your contract must implement the following public functions / constructor:

constructor(address token) : The constructor sets the token address.

stake(uint256 amount) : This function allows users to stake their tokens. If a user already has a staked balance, the function transfers the accumulated rewards and the staked tokens to the user before adding the new deposit. Otherwise, it adds the new deposit. If amount is 0, the function must revert.

redeem(uint256 amount) : This function allows stakers to redeem their staked tokens. The function must revert if amount is more than currently staked or 0.

claimInterest() : This function transfers the rewards to the staker. The function must revert if no interest is due.

sweep() : This function allows the owner to withdraw all staked tokens.