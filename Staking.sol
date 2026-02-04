// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC20
 * @dev Minimal ERC20 interface required for staking functionality.
 * This interface is intentionally small to remain Remix-compatible
 * and avoid inheritance/constructor issues.
 */
interface IERC20 {
    /**
     * @notice Transfers tokens to a recipient
     * @param to Address receiving the tokens
     * @param amount Amount of tokens to transfer
     * @return success Boolean indicating transfer success
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @notice Transfers tokens from one address to another using allowance
     * @param from Address providing the tokens
     * @param to Address receiving the tokens
     * @param amount Amount of tokens to transfer
     * @return success Boolean indicating transfer success
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    /**
     * @notice Returns the token balance of an account
     * @param account Address to query
     * @return balance Token balance
     */
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Staking
 * @author —
 * @notice Allows users to stake ERC20 tokens and earn time-based rewards
 * @dev Rewards are flat-rate based on staking duration:
 *      < 1 day  → 0%
 *      ≥ 1 day  → 1%
 *      ≥ 7 days → 10%
 *
 * IMPORTANT:
 * - Only one active stake per user
 * - Redeeming tokens does NOT auto-pay interest
 * - Restaking pays principal + accrued interest first
 */
contract Staking {
    /// @notice ERC20 token accepted for staking
    IERC20 public token;

    /// @notice Owner address with sweep privileges
    address public owner;

    /**
     * @dev Stores staking details for a user
     * @param amount Number of tokens currently staked
     * @param startTime Timestamp when staking or last interest claim began
     */
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
    }

    /// @dev Maps user address to their staking information
    mapping(address => StakeInfo) private stakes;

    /**
     * @dev Restricts function access to the contract owner
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Deploys the staking contract
     * @param _token Address of the ERC20 token to be staked
     *
     * Requirements:
     * - `_token` must not be the zero address
     */
    constructor(address _token) {
        require(_token != address(0), "Invalid token");
        token = IERC20(_token);
        owner = msg.sender;
    }

    /**
     * @notice Stakes ERC20 tokens into the contract
     * @param amount Number of tokens to stake
     *
     * Behavior:
     * - Reverts if amount is zero
     * - If user already has a stake:
     *   - Pays back principal + accrued interest
     *   - Resets staking state
     * - Transfers new stake from user
     *
     * Requirements:
     * - User must approve tokens before calling
     */
    function stake(uint256 amount) public {
        require(amount > 0, "Amount must be > 0");

        StakeInfo memory previousStake = stakes[msg.sender];

        // Pay out existing stake and interest before restaking
        if (previousStake.amount > 0) {
            uint256 interest = _calculateInterest(previousStake);
            uint256 payout = previousStake.amount + interest;

            delete stakes[msg.sender];
            require(token.transfer(msg.sender, payout), "Payout failed");
        }

        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Stake transfer failed"
        );

        stakes[msg.sender] = StakeInfo({
            amount: amount,
            startTime: block.timestamp
        });
    }

    /**
     * @notice Redeems staked tokens without paying interest
     * @param amount Number of tokens to redeem
     *
     * Behavior:
     * - Reverts if amount is zero or exceeds stake
     * - Does NOT pay any accrued interest
     * - Allows partial or full redemption
     */
    function reedem(uint256 amount) public {
        require(amount > 0, "Amount must be > 0");

        StakeInfo storage userStake = stakes[msg.sender];
        require(amount <= userStake.amount, "Insufficient stake");

        userStake.amount -= amount;

        // Clear storage if fully redeemed
        if (userStake.amount == 0) {
            delete stakes[msg.sender];
        }

        require(token.transfer(msg.sender, amount), "Redeem failed");
    }

    /**
     * @notice Claims accrued staking rewards
     *
     * Behavior:
     * - Transfers interest only
     * - Resets staking timer to prevent double-claim
     *
     * Requirements:
     * - Reverts if no interest is due
     */
    function claimInterest() public {
        StakeInfo storage userStake = stakes[msg.sender];
        uint256 interest = _calculateInterest(userStake);

        require(interest > 0, "No interest due");

        userStake.startTime = block.timestamp;
        require(token.transfer(msg.sender, interest), "Interest transfer failed");
    }

    /**
     * @notice Returns the accrued interest for a user
     * @param user Address of the staker
     * @return interest Amount of interest currently earned
     *
     * Note:
     * - This function does NOT modify state
     * - Used for UI and off-chain queries
     */
    function getAccruedInterest(address user)
        public
        view
        returns (uint256)
    {
        return _calculateInterest(stakes[user]);
    }

    /**
     * @notice Withdraws all tokens held by the contract
     * @dev Owner-only function
     *
     * WARNING:
     * - This can drain user funds
     * - Included strictly to satisfy challenge requirements
     */
    function sweep() public onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(owner, balance), "Sweep failed");
    }

    /**
     * @dev Internal helper to calculate staking rewards
     * @param info StakeInfo struct containing stake data
     * @return interest Calculated reward amount
     *
     * Reward Rules:
     * - < 1 day  → 0%
     * - ≥ 1 day  → 1%
     * - ≥ 7 days → 10%
     */
    function _calculateInterest(StakeInfo memory info)
        internal
        view
        returns (uint256)
    {
        if (info.amount == 0) return 0;

        uint256 elapsed = block.timestamp - info.startTime;

        if (elapsed < 1 days) {
            return 0;
        } else if (elapsed < 7 days) {
            return (info.amount * 1) / 100;
        } else {
            return (info.amount * 10) / 100;
        }
    }
}
