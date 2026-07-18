// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PoolFees
/// @notice 1:1 fee vault for a Topaz pool. Fees are separated from reserves.
contract PoolFees {
    using SafeERC20 for IERC20;

    address internal immutable pool;
    address internal immutable token0;
    address internal immutable token1;

    error NotPool();

    constructor(address token0_, address token1_) {
        pool = msg.sender;
        token0 = token0_;
        token1 = token1_;
    }

    function claimFeesFor(address recipient, uint256 amount0, uint256 amount1) external {
        if (msg.sender != pool) revert NotPool();
        if (amount0 > 0) IERC20(token0).safeTransfer(recipient, amount0);
        if (amount1 > 0) IERC20(token1).safeTransfer(recipient, amount1);
    }
}
