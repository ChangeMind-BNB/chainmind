// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ChainMindDeposit is Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    mapping(bytes16 => bool) public usedDepositCodes;
    uint256 public totalDeposits;

    event Deposit(
        address indexed sender,
        uint256 amount,
        bytes16 indexed depositCode,
        uint256 timestamp
    );

    event Withdrawal(address indexed to, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function deposit(uint256 amount, bytes16 depositCode) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(depositCode != bytes16(0), "Invalid deposit code");
        require(!usedDepositCodes[depositCode], "Deposit code already used");
        usedDepositCodes[depositCode] = true;
        totalDeposits += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amount, depositCode, block.timestamp);
    }

    function withdraw(uint256 amount) external onlyOwner {
        usdc.safeTransfer(owner(), amount);
        emit Withdrawal(owner(), amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
