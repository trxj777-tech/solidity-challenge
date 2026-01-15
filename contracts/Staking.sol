// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Staking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public owner;

    struct StakeInfo {
        uint256 amount;          // Amount of tokens staked
        uint256 stakedAt;        // Timestamp when tokens were staked
    }

    mapping(address => StakeInfo) public stakes;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _token) {
        require(_token != address(0), "Invalid token address");
        token = IERC20(_token);
        owner = msg.sender;
    }

    function stake(uint256 amount) public nonReentrant {
        require(amount > 0, "Amount must be greater than 0");

        StakeInfo storage userStake = stakes[msg.sender];

        // CHECKS & EFFECTS: Calculate and store values before external calls
        uint256 oldAmount = userStake.amount;
        uint256 interest = 0;
        
        if (oldAmount > 0) {
            interest = _calculateInterest(msg.sender);
        }

        // EFFECTS: Update state BEFORE external calls
        stakes[msg.sender] = StakeInfo({
            amount: amount,
            stakedAt: block.timestamp
        });

        // INTERACTIONS: External calls LAST
        if (oldAmount > 0) {
            uint256 totalToTransfer = oldAmount + interest;
            token.safeTransfer(msg.sender, totalToTransfer);
        }

        // Transfer new stake from user
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    function redeem(uint256 amount) public nonReentrant {
        require(amount > 0, "Amount must be greater than 0");

        StakeInfo storage userStake = stakes[msg.sender];
        require(userStake.amount >= amount, "Insufficient staked balance");

        // EFFECTS: Update state first
        userStake.amount -= amount;

        // If fully redeemed, reset stake timestamp
        if (userStake.amount == 0) {
            userStake.stakedAt = 0;
        }

        // INTERACTIONS: Transfer tokens back to user
        token.safeTransfer(msg.sender, amount);
    }

    function claimInterest() public nonReentrant {
        uint256 interest = _calculateInterest(msg.sender);
        require(interest > 0, "No interest due");

        // EFFECTS: Update stake timestamp to current time (reset reward period)
        stakes[msg.sender].stakedAt = block.timestamp;

        // INTERACTIONS: Transfer after state update
        token.safeTransfer(msg.sender, interest);
    }

    // returns the accrued interest
    function getAccruedInterest(address user) public view returns (uint256) {
        return _calculateInterest(user);
    }

    // Internal function to calculate interest based on time staked
    function _calculateInterest(address user) internal view returns (uint256) {
        StakeInfo memory userStake = stakes[user];

        if (userStake.amount == 0) {
            return 0;
        }

        uint256 timeStaked = block.timestamp - userStake.stakedAt;

        // Less than 1 day: 0% reward
        if (timeStaked < 1 days) {
            return 0;
        }
        // More than 1 week: 10% reward
        else if (timeStaked >= 7 days) {
            return (userStake.amount * 10) / 100;
        }
        // More than 1 day but less than 1 week: 1% reward
        else {
            return (userStake.amount * 1) / 100;
        }
    }

    function sweep() public onlyOwner nonReentrant {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to sweep");
        token.safeTransfer(owner, balance);
    }

}
