// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoolFactory {
    event SetFeeManager(address feeManager);
    event SetPauser(address pauser);
    event SetPauseState(bool state);
    event SetVoter(address voter);
    event PoolCreated(address indexed token0, address indexed token1, bool indexed stable, address pool, uint256 index);
    event SetCustomFee(address indexed pool, uint256 fee);

    error FeeTooHigh();
    error InvalidPool();
    error NotFeeManager();
    error NotPauser();
    error NotVoter();
    error PoolAlreadyExists();
    error SameAddress();
    error ZeroFee();
    error ZeroAddress();

    function allPoolsLength() external view returns (uint256);
    function implementation() external view returns (address);
    function voter() external view returns (address);
    function isPaused() external view returns (bool);
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address);
    function isPool(address pool) external view returns (bool);
    function getFee(address pool, bool stable) external view returns (uint256);
    function createPool(address tokenA, address tokenB, bool stable) external returns (address);
    function setFee(bool stable, uint256 fee) external;
    function setCustomFee(address pool, uint256 fee) external;
    function setVoter(address voter) external;
}
