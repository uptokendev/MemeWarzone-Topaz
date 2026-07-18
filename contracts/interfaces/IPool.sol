// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPool {
    error DepositsNotEqual();
    error BelowMinimumK();
    error FactoryAlreadySet();
    error InsufficientLiquidity();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientInputAmount();
    error IsPaused();
    error InvalidTo();
    error K();
    error NotEmergencyCouncil();

    event Fees(address indexed sender, uint256 amount0, uint256 amount1);
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, address indexed to, uint256 amount0, uint256 amount1);
    event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out);
    event Sync(uint256 reserve0, uint256 reserve1);
    event Claim(address indexed sender, address indexed recipient, uint256 amount0, uint256 amount1);

    struct Observation {
        uint256 timestamp;
        uint256 reserve0Cumulative;
        uint256 reserve1Cumulative;
    }

    function token0() external view returns (address);
    function token1() external view returns (address);
    function factory() external view returns (address);
    function stable() external view returns (bool);
    function poolFees() external view returns (address);
    function claimFees() external returns (uint256, uint256);
    function getReserves() external view returns (uint256, uint256, uint256);
    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256);
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amount0, uint256 amount1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function initialize(address token0, address token1, bool stable) external;
}
