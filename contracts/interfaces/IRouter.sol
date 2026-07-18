// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    error ETHTransferFailed();
    error Expired();
    error InsufficientAmount();
    error InsufficientAmountA();
    error InsufficientAmountB();
    error InsufficientAmountADesired();
    error InsufficientAmountBDesired();
    error InsufficientLiquidity();
    error InsufficientOutputAmount();
    error InvalidPath();
    error OnlyWETH();
    error PoolFactoryDoesNotExist();
    error SameAddresses();
    error ZeroAddress();

    function defaultFactory() external view returns (address);
    function weth() external view returns (address);
    function poolFor(address tokenA, address tokenB, bool stable, address factory) external view returns (address);
    function getAmountsOut(uint256 amountIn, Route[] calldata routes) external view returns (uint256[] memory amounts);
    function addLiquidityETH(address token, bool stable, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
    function swapExactETHForTokens(uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external payable returns (uint256[] memory amounts);
    function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external returns (uint256[] memory amounts);
}
