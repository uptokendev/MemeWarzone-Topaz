// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IPoolFactory} from "./interfaces/IPoolFactory.sol";

contract PoolFactory is IPoolFactory {
    address public immutable implementation;

    bool public isPaused;
    address public pauser;
    address public feeManager;
    address public voter;

    uint256 public stableFee;
    uint256 public volatileFee;
    uint256 public constant MAX_FEE = 300;
    uint256 public constant ZERO_FEE_INDICATOR = 420;

    mapping(address => mapping(address => mapping(bool => address))) private _getPool;
    mapping(address => bool) private _isPool;
    mapping(address => uint256) public customFee;
    address[] public allPools;

    constructor(address implementation_) {
        if (implementation_ == address(0)) revert ZeroAddress();
        implementation = implementation_;
        voter = msg.sender;
        pauser = msg.sender;
        feeManager = msg.sender;
        stableFee = 5;
        volatileFee = 30;
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }

    function getPool(address tokenA, address tokenB, bool stable) external view returns (address) {
        return _getPool[tokenA][tokenB][stable];
    }

    function isPool(address pool) external view returns (bool) {
        return _isPool[pool];
    }

    function setVoter(address voter_) external {
        if (msg.sender != voter) revert NotVoter();
        if (voter_ == address(0)) revert ZeroAddress();
        voter = voter_;
        emit SetVoter(voter_);
    }

    function setPauser(address pauser_) external {
        if (msg.sender != pauser) revert NotPauser();
        if (pauser_ == address(0)) revert ZeroAddress();
        pauser = pauser_;
        emit SetPauser(pauser_);
    }

    function setPauseState(bool state) external {
        if (msg.sender != pauser) revert NotPauser();
        isPaused = state;
        emit SetPauseState(state);
    }

    function setFeeManager(address feeManager_) external {
        if (msg.sender != feeManager) revert NotFeeManager();
        if (feeManager_ == address(0)) revert ZeroAddress();
        feeManager = feeManager_;
        emit SetFeeManager(feeManager_);
    }

    function setFee(bool stable, uint256 fee) external {
        if (msg.sender != feeManager) revert NotFeeManager();
        if (fee > MAX_FEE) revert FeeTooHigh();
        if (fee == 0) revert ZeroFee();
        if (stable) stableFee = fee;
        else volatileFee = fee;
    }

    function setCustomFee(address pool, uint256 fee) external {
        if (msg.sender != feeManager) revert NotFeeManager();
        if (!_isPool[pool]) revert InvalidPool();
        if (fee > MAX_FEE && fee != ZERO_FEE_INDICATOR) revert FeeTooHigh();
        customFee[pool] = fee;
        emit SetCustomFee(pool, fee);
    }

    function getFee(address pool, bool stable) public view returns (uint256) {
        uint256 fee = customFee[pool];
        if (fee == ZERO_FEE_INDICATOR) return 0;
        if (fee != 0) return fee;
        return stable ? stableFee : volatileFee;
    }

    function createPool(address tokenA, address tokenB, bool stable) public returns (address pool) {
        if (tokenA == tokenB) revert SameAddress();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (_getPool[token0][token1][stable] != address(0)) revert PoolAlreadyExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1, stable));
        pool = Clones.cloneDeterministic(implementation, salt);
        IPool(pool).initialize(token0, token1, stable);
        _getPool[token0][token1][stable] = pool;
        _getPool[token1][token0][stable] = pool;
        allPools.push(pool);
        _isPool[pool] = true;

        emit PoolCreated(token0, token1, stable, pool, allPools.length);
    }
}
