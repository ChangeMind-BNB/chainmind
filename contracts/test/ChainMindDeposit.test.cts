const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('ChainMindDeposit', function () {
  async function deployFixture() {
    const [owner, depositor, other] = await ethers.getSigners();

    // Deploy mock USDC (18 decimals on BSC)
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await MockERC20.deploy('USD Coin', 'USDC', 18);

    // Deploy ChainMindDeposit
    const ChainMindDeposit = await ethers.getContractFactory('ChainMindDeposit');
    const deposit = await ChainMindDeposit.deploy(await usdc.getAddress());

    // Mint USDC to depositor
    const amount = ethers.parseEther('1000'); // 1000 USDC (18 decimals)
    await usdc.mint(depositor.address, amount);

    // Approve contract
    await usdc.connect(depositor).approve(await deposit.getAddress(), ethers.MaxUint256);

    return { deposit, usdc, owner, depositor, other };
  }

  describe('deposit', function () {
    it('should accept a valid deposit', async function () {
      const { deposit, depositor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('100');
      const code = ethers.hexlify(ethers.randomBytes(16));

      const tx = await deposit.connect(depositor).deposit(amount, code);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(deposit, 'Deposit')
        .withArgs(depositor.address, amount, code, block.timestamp);

      expect(await deposit.totalDeposits()).to.equal(amount);
      expect(await deposit.usedDepositCodes(code)).to.be.true;
    });

    it('should reject zero amount', async function () {
      const { deposit, depositor } = await loadFixture(deployFixture);
      const code = ethers.hexlify(ethers.randomBytes(16));

      await expect(deposit.connect(depositor).deposit(0, code))
        .to.be.revertedWith('Amount must be > 0');
    });

    it('should reject reused deposit code', async function () {
      const { deposit, depositor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('10');
      const code = ethers.hexlify(ethers.randomBytes(16));

      await deposit.connect(depositor).deposit(amount, code);
      await expect(deposit.connect(depositor).deposit(amount, code))
        .to.be.revertedWith('Deposit code already used');
    });

    it('should reject zero deposit code', async function () {
      const { deposit, depositor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('10');

      await expect(deposit.connect(depositor).deposit(amount, '0x00000000000000000000000000000000'))
        .to.be.revertedWith('Invalid deposit code');
    });
  });

  describe('withdraw', function () {
    it('should allow owner to withdraw', async function () {
      const { deposit, usdc, owner, depositor } = await loadFixture(deployFixture);
      const amount = ethers.parseEther('100');
      const code = ethers.hexlify(ethers.randomBytes(16));

      await deposit.connect(depositor).deposit(amount, code);

      const balanceBefore = await usdc.balanceOf(owner.address);
      await deposit.connect(owner).withdraw(amount);
      const balanceAfter = await usdc.balanceOf(owner.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it('should reject non-owner withdrawal', async function () {
      const { deposit, depositor } = await loadFixture(deployFixture);

      await expect(deposit.connect(depositor).withdraw(1))
        .to.be.revertedWithCustomError(deposit, 'OwnableUnauthorizedAccount');
    });
  });

  describe('pause', function () {
    it('should prevent deposits when paused', async function () {
      const { deposit, owner, depositor } = await loadFixture(deployFixture);
      const code = ethers.hexlify(ethers.randomBytes(16));

      await deposit.connect(owner).pause();
      await expect(deposit.connect(depositor).deposit(ethers.parseEther('10'), code))
        .to.be.revertedWithCustomError(deposit, 'EnforcedPause');
    });
  });
});

async function getBlockTimestamp() {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
}
