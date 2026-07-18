// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IPoolCallee} from "./interfaces/IPoolCallee.sol";
import {IPoolFactory} from "./interfaces/IPoolFactory.sol";
import {PoolFees} from "./PoolFees.sol";

/// @title Minimal Topaz Pool
/// @notice Volatile/stable AMM pool with Topaz-style segregated LP fee accounting.
contract Pool is IPool, ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bool public stable;
    address public token0;
    address public token1;
    address public poolFees;
    address public factory;

    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;
    uint256 internal constant MINIMUM_K = 10 ** 10;
    uint256 public constant periodSize = 1800;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public blockTimestampLast;
    uint256 public reserve0CumulativeLast;
    uint256 public reserve1CumulativeLast;
    uint256 public index0;
    uint256 public index1;
    uint256 internal decimals0;
    uint256 internal decimals1;

    string private _poolName;
    string private _poolSymbol;

    Observation[] public observations;
    mapping(address => uint256) public supplyIndex0;
    mapping(address => uint256) public supplyIndex1;
    mapping(address => uint256) public claimable0;
    mapping(address => uint256) public claimable1;

    constructor() ERC20("Topaz LP", "TOPAZ-LP") {}

    function initialize(address token0_, address token1_, bool stable_) external {
        if (factory != address(0)) revert FactoryAlreadySet();
        factory = msg.sender;
        token0 = token0_;
        token1 = token1_;
        stable = stable_;
        poolFees = address(new PoolFees(token0_, token1_));

        string memory symbol0 = IERC20Metadata(token0_).symbol();
        string memory symbol1 = IERC20Metadata(token1_).symbol();
        _poolName = string(abi.encodePacked(stable_ ? "Stable AMM - " : "Volatile AMM - ", symbol0, "/", symbol1));
        _poolSymbol = string(abi.encodePacked(stable_ ? "sAMM-" : "vAMM-", symbol0, "/", symbol1));
        decimals0 = 10 ** IERC20Metadata(token0_).decimals();
        decimals1 = 10 ** IERC20Metadata(token1_).decimals();
        observations.push(Observation(block.timestamp, 0, 0));
    }

    function name() public view override returns (string memory) {
        return bytes(_poolName).length == 0 ? super.name() : _poolName;
    }

    function symbol() public view override returns (string memory) {
        return bytes(_poolSymbol).length == 0 ? super.symbol() : _poolSymbol;
    }

    function setName(string calldata name_) external {
        if (msg.sender != IPoolFactory(factory).voter()) revert NotEmergencyCouncil();
        _poolName = name_;
    }

    function setSymbol(string calldata symbol_) external {
        if (msg.sender != IPoolFactory(factory).voter()) revert NotEmergencyCouncil();
        _poolSymbol = symbol_;
    }

    function claimFees() external returns (uint256 claimed0, uint256 claimed1) {
        address sender = msg.sender;
        _updateFor(sender);
        claimed0 = claimable0[sender];
        claimed1 = claimable1[sender];
        if (claimed0 > 0 || claimed1 > 0) {
            claimable0[sender] = 0;
            claimable1[sender] = 0;
            PoolFees(poolFees).claimFeesFor(sender, claimed0, claimed1);
            emit Claim(sender, sender, claimed0, claimed1);
        }
    }

    function getReserves() public view returns (uint256, uint256, uint256) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 reserve0_, uint256 reserve1_) = (reserve0, reserve1);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0_;
        uint256 amount1 = balance1 - reserve1_;
        uint256 supply = totalSupply();

        if (supply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY);
            if (stable) {
                if ((amount0 * 1e18) / decimals0 != (amount1 * 1e18) / decimals1) revert DepositsNotEqual();
                if (_k(amount0, amount1) <= MINIMUM_K) revert BelowMinimumK();
            }
        } else {
            liquidity = Math.min((amount0 * supply) / reserve0_, (amount1 * supply) / reserve1_);
        }
        if (liquidity < MINIMUM_LIQUIDITY) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);
        _update(balance0, balance1, reserve0_, reserve1_);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        (uint256 reserve0_, uint256 reserve1_) = (reserve0, reserve1);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));
        uint256 supply = totalSupply();

        amount0 = (liquidity * balance0) / supply;
        amount1 = (liquidity * balance1) / supply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();
        _burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);
        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
        _update(balance0, balance1, reserve0_, reserve1_);
        emit Burn(msg.sender, to, amount0, amount1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external nonReentrant {
        if (IPoolFactory(factory).isPaused()) revert IsPaused();
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint256 reserve0_, uint256 reserve1_) = (reserve0, reserve1);
        if (amount0Out >= reserve0_ || amount1Out >= reserve1_) revert InsufficientLiquidity();
        if (to == token0 || to == token1) revert InvalidTo();

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);
        if (data.length > 0) IPoolCallee(to).hook(msg.sender, amount0Out, amount1Out, data);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > reserve0_ - amount0Out ? balance0 - (reserve0_ - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1_ - amount1Out ? balance1 - (reserve1_ - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        uint256 feeBps = IPoolFactory(factory).getFee(address(this), stable);
        if (amount0In > 0) _update0((amount0In * feeBps) / 10_000);
        if (amount1In > 0) _update1((amount1In * feeBps) / 10_000);

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
        if (_k(balance0, balance1) < _k(reserve0_, reserve1_)) revert K();
        _update(balance0, balance1, reserve0_, reserve1_);
        emit Swap(msg.sender, to, amount0In, amount1In, amount0Out, amount1Out);
    }

    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256) {
        amountIn -= (amountIn * IPoolFactory(factory).getFee(address(this), stable)) / 10_000;
        return _getAmountOut(amountIn, tokenIn, reserve0, reserve1);
    }

    function skim(address to) external nonReentrant {
        IERC20(token0).safeTransfer(to, IERC20(token0).balanceOf(address(this)) - reserve0);
        IERC20(token1).safeTransfer(to, IERC20(token1).balanceOf(address(this)) - reserve1);
    }

    function sync() external nonReentrant {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }

    function _update0(uint256 amount) internal {
        if (amount == 0) return;
        IERC20(token0).safeTransfer(poolFees, amount);
        uint256 ratio = (amount * 1e18) / totalSupply();
        if (ratio > 0) index0 += ratio;
        emit Fees(msg.sender, amount, 0);
    }

    function _update1(uint256 amount) internal {
        if (amount == 0) return;
        IERC20(token1).safeTransfer(poolFees, amount);
        uint256 ratio = (amount * 1e18) / totalSupply();
        if (ratio > 0) index1 += ratio;
        emit Fees(msg.sender, 0, amount);
    }

    function _updateFor(address recipient) internal {
        if (recipient == address(0)) return;
        uint256 supplied = balanceOf(recipient);
        uint256 index0_ = index0;
        uint256 index1_ = index1;
        uint256 delta0 = index0_ - supplyIndex0[recipient];
        uint256 delta1 = index1_ - supplyIndex1[recipient];
        supplyIndex0[recipient] = index0_;
        supplyIndex1[recipient] = index1_;
        if (supplied > 0) {
            if (delta0 > 0) claimable0[recipient] += (supplied * delta0) / 1e18;
            if (delta1 > 0) claimable1[recipient] += (supplied * delta1) / 1e18;
        }
    }

    function _update(address from, address to, uint256 value) internal override {
        _updateFor(from);
        _updateFor(to);
        super._update(from, to, value);
    }

    function _update(uint256 balance0, uint256 balance1, uint256 reserve0_, uint256 reserve1_) internal {
        uint256 blockTimestamp = block.timestamp;
        uint256 timeElapsed = blockTimestamp - blockTimestampLast;
        if (timeElapsed > 0 && reserve0_ != 0 && reserve1_ != 0) {
            reserve0CumulativeLast += reserve0_ * timeElapsed;
            reserve1CumulativeLast += reserve1_ * timeElapsed;
        }
        Observation memory point = observations[observations.length - 1];
        if (blockTimestamp - point.timestamp > periodSize) {
            observations.push(Observation(blockTimestamp, reserve0CumulativeLast, reserve1CumulativeLast));
        }
        reserve0 = balance0;
        reserve1 = balance1;
        blockTimestampLast = blockTimestamp;
        emit Sync(balance0, balance1);
    }

    function _getAmountOut(uint256 amountIn, address tokenIn, uint256 reserve0_, uint256 reserve1_) internal view returns (uint256) {
        if (stable) {
            uint256 xy = _k(reserve0_, reserve1_);
            reserve0_ = (reserve0_ * 1e18) / decimals0;
            reserve1_ = (reserve1_ * 1e18) / decimals1;
            (uint256 reserveA, uint256 reserveB) = tokenIn == token0 ? (reserve0_, reserve1_) : (reserve1_, reserve0_);
            amountIn = tokenIn == token0 ? (amountIn * 1e18) / decimals0 : (amountIn * 1e18) / decimals1;
            uint256 y = reserveB - _get_y(amountIn + reserveA, xy, reserveB);
            return (y * (tokenIn == token0 ? decimals1 : decimals0)) / 1e18;
        }
        (uint256 reserveA, uint256 reserveB) = tokenIn == token0 ? (reserve0_, reserve1_) : (reserve1_, reserve0_);
        return (amountIn * reserveB) / (reserveA + amountIn);
    }

    function _k(uint256 x, uint256 y) internal view returns (uint256) {
        if (!stable) return x * y;
        uint256 x_ = (x * 1e18) / decimals0;
        uint256 y_ = (y * 1e18) / decimals1;
        uint256 a = (x_ * y_) / 1e18;
        uint256 b = ((x_ * x_) / 1e18) + ((y_ * y_) / 1e18);
        return (a * b) / 1e18;
    }

    function _f(uint256 x0, uint256 y) internal pure returns (uint256) {
        uint256 a = (x0 * y) / 1e18;
        uint256 b = ((x0 * x0) / 1e18) + ((y * y) / 1e18);
        return (a * b) / 1e18;
    }

    function _d(uint256 x0, uint256 y) internal pure returns (uint256) {
        return (3 * x0 * ((y * y) / 1e18)) / 1e18 + ((((x0 * x0) / 1e18) * x0) / 1e18);
    }

    function _get_y(uint256 x0, uint256 xy, uint256 y) internal pure returns (uint256) {
        for (uint256 i; i < 255; i++) {
            uint256 k = _f(x0, y);
            if (k < xy) {
                uint256 dy = ((xy - k) * 1e18) / _d(x0, y);
                if (dy == 0) {
                    if (k == xy) return y;
                    if (_f(x0, y + 1) > xy) return y + 1;
                    dy = 1;
                }
                y += dy;
            } else {
                uint256 dy = ((k - xy) * 1e18) / _d(x0, y);
                if (dy == 0) {
                    if (k == xy || _f(x0, y - 1) < xy) return y;
                    dy = 1;
                }
                y -= dy;
            }
        }
        revert("!y");
    }
}
