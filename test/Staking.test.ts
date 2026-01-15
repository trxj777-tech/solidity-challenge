import { expect } from "chai";
import { ethers } from "hardhat";
import { Staking, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Staking Contract", function () {
  let staking: Staking;
  let token: MockERC20;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const STAKE_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    token = await MockERC20Factory.deploy("Test Token", "TEST");
    await token.waitForDeployment();

    // Deploy Staking contract
    const StakingFactory = await ethers.getContractFactory("Staking");
    staking = await StakingFactory.deploy(await token.getAddress());
    await staking.waitForDeployment();

    // Mint tokens to users
    await token.mint(user1.address, INITIAL_SUPPLY);
    await token.mint(user2.address, INITIAL_SUPPLY);
    await token.mint(owner.address, INITIAL_SUPPLY);
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await staking.token()).to.equal(await token.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await staking.owner()).to.equal(owner.address);
    });

    it("Should revert with invalid token address", async function () {
      const StakingFactory = await ethers.getContractFactory("Staking");
      await expect(
        StakingFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid token address");
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      const stakeInfo = await staking.stakes(user1.address);
      expect(stakeInfo.amount).to.equal(STAKE_AMOUNT);
      expect(stakeInfo.stakedAt).to.be.gt(0);
    });

    it("Should revert when staking 0 amount", async function () {
      await expect(
        staking.connect(user1).stake(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should transfer tokens from user to contract", async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      
      const balanceBefore = await token.balanceOf(user1.address);
      await staking.connect(user1).stake(STAKE_AMOUNT);
      const balanceAfter = await token.balanceOf(user1.address);

      expect(balanceBefore - balanceAfter).to.equal(STAKE_AMOUNT);
      expect(await token.balanceOf(await staking.getAddress())).to.equal(STAKE_AMOUNT);
    });

    it("Should allow restaking and return old stake + interest", async function () {
      // First stake
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // Wait 2 days to earn 1% interest
      await time.increase(2 * 24 * 60 * 60);

      // Fund the contract with rewards
      const interest = STAKE_AMOUNT * 1n / 100n;
      await token.connect(owner).transfer(await staking.getAddress(), interest);

      const balanceBefore = await token.balanceOf(user1.address);

      // Restake with new amount
      const newStakeAmount = ethers.parseEther("500");
      await token.connect(user1).approve(await staking.getAddress(), newStakeAmount);
      await staking.connect(user1).stake(newStakeAmount);

      const balanceAfter = await token.balanceOf(user1.address);
      
      // User should receive old stake + interest back
      const received = balanceAfter - balanceBefore;
      expect(received).to.equal(STAKE_AMOUNT + interest - newStakeAmount);

      // New stake should be recorded
      const stakeInfo = await staking.stakes(user1.address);
      expect(stakeInfo.amount).to.equal(newStakeAmount);
    });

    it("Should reset stake timestamp when restaking", async function () {
      // First stake
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      const firstStakeTime = (await staking.stakes(user1.address)).stakedAt;

      // Wait some time
      await time.increase(60);

      // Restake
      const newStakeAmount = ethers.parseEther("500");
      await token.connect(user1).approve(await staking.getAddress(), newStakeAmount);
      await staking.connect(user1).stake(newStakeAmount);

      const secondStakeTime = (await staking.stakes(user1.address)).stakedAt;

      expect(secondStakeTime).to.be.gt(firstStakeTime);
    });
  });

  describe("Redeeming", function () {
    beforeEach(async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);
    });

    it("Should allow users to redeem staked tokens", async function () {
      const redeemAmount = ethers.parseEther("500");
      const balanceBefore = await token.balanceOf(user1.address);

      await staking.connect(user1).redeem(redeemAmount);

      const balanceAfter = await token.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(redeemAmount);

      const stakeInfo = await staking.stakes(user1.address);
      expect(stakeInfo.amount).to.equal(STAKE_AMOUNT - redeemAmount);
    });

    it("Should allow full redemption", async function () {
      await staking.connect(user1).redeem(STAKE_AMOUNT);

      const stakeInfo = await staking.stakes(user1.address);
      expect(stakeInfo.amount).to.equal(0);
      expect(stakeInfo.stakedAt).to.equal(0);
    });

    it("Should revert when redeeming 0 amount", async function () {
      await expect(
        staking.connect(user1).redeem(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert when redeeming more than staked", async function () {
      const tooMuch = STAKE_AMOUNT + ethers.parseEther("1");
      await expect(
        staking.connect(user1).redeem(tooMuch)
      ).to.be.revertedWith("Insufficient staked balance");
    });

    it("Should not pay interest when redeeming (as per requirement)", async function () {
      // Wait 2 days to earn interest
      await time.increase(2 * 24 * 60 * 60);

      // Check that interest has accrued
      const interest = await staking.getAccruedInterest(user1.address);
      expect(interest).to.be.gt(0);

      const balanceBefore = await token.balanceOf(user1.address);
      
      // Redeem all
      await staking.connect(user1).redeem(STAKE_AMOUNT);

      const balanceAfter = await token.balanceOf(user1.address);
      
      // User should only get back the staked amount, NOT the interest
      expect(balanceAfter - balanceBefore).to.equal(STAKE_AMOUNT);
    });
  });

  describe("Interest Calculation", function () {
    beforeEach(async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);
    });

    it("Should return 0% interest for less than 1 day", async function () {
      // Wait 23 hours
      await time.increase(23 * 60 * 60);

      const interest = await staking.getAccruedInterest(user1.address);
      expect(interest).to.equal(0);
    });

    it("Should return 1% interest for 1-7 days", async function () {
      // Wait 2 days
      await time.increase(2 * 24 * 60 * 60);

      const interest = await staking.getAccruedInterest(user1.address);
      const expected = STAKE_AMOUNT * 1n / 100n;
      expect(interest).to.equal(expected);
    });

    it("Should return 1% interest at exactly 1 day", async function () {
      // Wait exactly 1 day
      await time.increase(24 * 60 * 60);

      const interest = await staking.getAccruedInterest(user1.address);
      const expected = STAKE_AMOUNT * 1n / 100n;
      expect(interest).to.equal(expected);
    });

    it("Should return 10% interest for 7+ days", async function () {
      // Wait 8 days
      await time.increase(8 * 24 * 60 * 60);

      const interest = await staking.getAccruedInterest(user1.address);
      const expected = STAKE_AMOUNT * 10n / 100n;
      expect(interest).to.equal(expected);
    });

    it("Should return 10% interest at exactly 7 days", async function () {
      // Wait exactly 7 days
      await time.increase(7 * 24 * 60 * 60);

      const interest = await staking.getAccruedInterest(user1.address);
      const expected = STAKE_AMOUNT * 10n / 100n;
      expect(interest).to.equal(expected);
    });

    it("Should return 0 interest for users with no stake", async function () {
      const interest = await staking.getAccruedInterest(user2.address);
      expect(interest).to.equal(0);
    });
  });

  describe("Claiming Interest", function () {
    beforeEach(async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);
    });

    it("Should allow users to claim 1% interest after 1 day", async function () {
      // Wait 2 days
      await time.increase(2 * 24 * 60 * 60);

      // Fund the contract with rewards
      const expectedInterest = STAKE_AMOUNT * 1n / 100n;
      await token.connect(owner).transfer(await staking.getAddress(), expectedInterest);

      const balanceBefore = await token.balanceOf(user1.address);
      await staking.connect(user1).claimInterest();
      const balanceAfter = await token.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedInterest);
    });

    it("Should allow users to claim 10% interest after 7 days", async function () {
      // Wait 8 days
      await time.increase(8 * 24 * 60 * 60);

      // Fund the contract with rewards
      const expectedInterest = STAKE_AMOUNT * 10n / 100n;
      await token.connect(owner).transfer(await staking.getAddress(), expectedInterest);

      const balanceBefore = await token.balanceOf(user1.address);
      await staking.connect(user1).claimInterest();
      const balanceAfter = await token.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(expectedInterest);
    });

    it("Should revert when claiming with no interest due", async function () {
      // No time passed
      await expect(
        staking.connect(user1).claimInterest()
      ).to.be.revertedWith("No interest due");
    });

    it("Should revert when user has no stake", async function () {
      await expect(
        staking.connect(user2).claimInterest()
      ).to.be.revertedWith("No interest due");
    });

    it("Should reset stake timestamp after claiming", async function () {
      // Wait 2 days
      await time.increase(2 * 24 * 60 * 60);

      // Fund the contract
      const interest = STAKE_AMOUNT * 1n / 100n;
      await token.connect(owner).transfer(await staking.getAddress(), interest);

      const timestampBefore = (await staking.stakes(user1.address)).stakedAt;
      
      await staking.connect(user1).claimInterest();

      const timestampAfter = (await staking.stakes(user1.address)).stakedAt;
      expect(timestampAfter).to.be.gt(timestampBefore);
    });

    it("Should allow multiple claims over time", async function () {
      // First claim after 2 days (1% interest)
      await time.increase(2 * 24 * 60 * 60);
      const firstInterest = STAKE_AMOUNT * 1n / 100n;
      await token.connect(owner).transfer(await staking.getAddress(), firstInterest);
      await staking.connect(user1).claimInterest();

      // Second claim after 8 more days (10% interest)
      await time.increase(8 * 24 * 60 * 60);
      const secondInterest = STAKE_AMOUNT * 10n / 100n;
      await token.connect(owner).transfer(await staking.getAddress(), secondInterest);
      
      const balanceBefore = await token.balanceOf(user1.address);
      await staking.connect(user1).claimInterest();
      const balanceAfter = await token.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(secondInterest);
    });
  });

  describe("Sweep Function", function () {
    beforeEach(async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);
    });

    it("Should allow owner to sweep all tokens", async function () {
      const contractBalance = await token.balanceOf(await staking.getAddress());
      const ownerBalanceBefore = await token.balanceOf(owner.address);

      await staking.connect(owner).sweep();

      const ownerBalanceAfter = await token.balanceOf(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(contractBalance);
      expect(await token.balanceOf(await staking.getAddress())).to.equal(0);
    });

    it("Should revert when non-owner tries to sweep", async function () {
      await expect(
        staking.connect(user1).sweep()
      ).to.be.revertedWith("Only owner");
    });

    it("Should revert when there are no tokens to sweep", async function () {
      // First sweep all tokens
      await staking.connect(owner).sweep();

      // Try to sweep again
      await expect(
        staking.connect(owner).sweep()
      ).to.be.revertedWith("No tokens to sweep");
    });
  });

  describe("Edge Cases & Integration", function () {
    it("Should handle multiple users staking independently", async function () {
      // User1 stakes
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // User2 stakes different amount
      const user2Amount = ethers.parseEther("500");
      await token.connect(user2).approve(await staking.getAddress(), user2Amount);
      await staking.connect(user2).stake(user2Amount);

      const user1Stake = await staking.stakes(user1.address);
      const user2Stake = await staking.stakes(user2.address);

      expect(user1Stake.amount).to.equal(STAKE_AMOUNT);
      expect(user2Stake.amount).to.equal(user2Amount);
    });

    it("Should calculate interest independently for multiple users", async function () {
      // Both users stake
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      const user2Amount = ethers.parseEther("500");
      await token.connect(user2).approve(await staking.getAddress(), user2Amount);
      await staking.connect(user2).stake(user2Amount);

      // Wait 2 days
      await time.increase(2 * 24 * 60 * 60);

      const user1Interest = await staking.getAccruedInterest(user1.address);
      const user2Interest = await staking.getAccruedInterest(user2.address);

      expect(user1Interest).to.equal(STAKE_AMOUNT * 1n / 100n);
      expect(user2Interest).to.equal(user2Amount * 1n / 100n);
    });

    it("Should handle partial redemption correctly", async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // Wait to accrue interest
      await time.increase(2 * 24 * 60 * 60);

      // Redeem half
      const halfAmount = STAKE_AMOUNT / 2n;
      await staking.connect(user1).redeem(halfAmount);

      // Check remaining stake
      const stakeInfo = await staking.stakes(user1.address);
      expect(stakeInfo.amount).to.equal(halfAmount);

      // Interest should still be calculated on remaining stake
      await time.increase(6 * 24 * 60 * 60); // Additional 6 days
      const interest = await staking.getAccruedInterest(user1.address);
      expect(interest).to.equal(halfAmount * 10n / 100n);
    });
  });
});
