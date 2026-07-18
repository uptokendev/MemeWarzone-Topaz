// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IFactoryRegistry} from "./interfaces/IFactoryRegistry.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IPoolFactory} from "./interfaces/IPoolFactory.sol";
import {IRouter} from "./interfaces/IRouter.sol";
import {IWETH} from "./interfaces/IWETH.sol";

contract Router is IRouter {
    using SafeERC20 for IERC20;

    address public immutable factoryRegistry;
    address public immutable defaultFactory;
    address public immutable voter;
    IWETH public immutable weth;
    uint256 internal constant MINIMUM_LIQUIDITY = 10 ** 3;

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    constructor(address factoryRegistry_, address factory_, address voter_, address weth_) {
        factoryRegistry = factoryRegistry_;
        defaultFactory = factory_;
        voter = voter_;
        weth = IWETH(weth_);
    }

    receive() external payable {
        if (msg.sender != address(weth)) revert OnlyWETH();
    }

    function sortTokens(address tokenA, address tokenB) public pure returns (address token0, address token1) {
        if (tokenA == tokenB) revert SameAddresses();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
    }

    function poolFor(address tokenA, address tokenB, bool stable, address factory_) public view returns (address pool) {
        address resolvedFactory = factory_ == address(0) ? defaultFactory : factory_;
        if (!IFactoryRegistry(factoryRegistry).isPoolFactoryApproved(resolvedFactory)) revert PoolFactoryDoesNotExist();
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        bytes32 salt = keccak256(abi.encodePacked(token0, token1, stable));
        pool = Clones.predictDeterministicAddress(IPoolFactory(resolvedFactory).implementation(), salt, resolvedFactory);
    }

    function getAmountsOut(uint256 amountIn, Route[] calldata routes) public view returns (uint256[] memory amounts) {
        if (routes.length == 0) revert InvalidPath();
        amounts = new uint256[](routes.length + 1);
        amounts[0] = amountIn;
        for (uint256 i; i < routes.length; i++) {
            address factory_ = routes[i].factory == address(0) ? defaultFactory : routes[i].factory;
            address pool = poolFor(routes[i].from, routes[i].to, routes[i].stable, factory_);
            amounts[i + 1] = IPoolFactory(factory_).isPool(pool) ? IPool(pool).getAmountOut(amounts[i], routes[i].from) : 0;
        }
    }

    function getReserves(address tokenA, address tokenB, bool stable, address factory_) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IPool(poolFor(tokenA, tokenB, stable, factory_)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function quoteAddLiquidity(address tokenA, address tokenB, bool stable, address factory_, uint256 amountADesired, uint256 amountBDesired) public view returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address pool = IPoolFactory(factory_).getPool(tokenA, tokenB, stable);
        uint256 supply;
        uint256 reserveA;
        uint256 reserveB;
        if (pool != address(0)) {
            supply = IERC20(pool).totalSupply();
            (reserveA, reserveB) = getReserves(tokenA, tokenB, stable, factory_);
        }
        if (reserveA == 0 && reserveB == 0) {
            amountA = amountADesired;
            amountB = amountBDesired;
            liquidity = Math.sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
        } else {
            uint256 amountBOptimal = _quoteLiquidity(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                amountA = _quoteLiquidity(amountBDesired, reserveB, reserveA);
                amountB = amountBDesired;
            }
            liquidity = Math.min((amountA * supply) / reserveA, (amountB * supply) / reserveB);
        }
    }

    function addLiquidityETH(address token, bool stable, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        (amountToken, amountETH) = _addLiquidity(token, address(weth), stable, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        address pool = poolFor(token, address(weth), stable, defaultFactory);
        IERC20(token).safeTransferFrom(msg.sender, pool, amountToken);
        weth.deposit{value: amountETH}();
        require(weth.transfer(pool, amountETH), "WETH_TRANSFER_FAILED");
        liquidity = IPool(pool).mint(to);
        if (msg.value > amountETH) _safeTransferETH(msg.sender, msg.value - amountETH);
    }

    function swapExactETHForTokens(uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external payable ensure(deadline) returns (uint256[] memory amounts) {
        if (routes.length == 0 || routes[0].from != address(weth)) revert InvalidPath();
        amounts = getAmountsOut(msg.value, routes);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        weth.deposit{value: amounts[0]}();
        require(weth.transfer(poolFor(routes[0].from, routes[0].to, routes[0].stable, routes[0].factory), amounts[0]), "WETH_TRANSFER_FAILED");
        _swap(amounts, routes, to);
    }

    function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external ensure(deadline) returns (uint256[] memory amounts) {
        if (routes.length == 0 || routes[routes.length - 1].to != address(weth)) revert InvalidPath();
        amounts = getAmountsOut(amountIn, routes);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(routes[0].from).safeTransferFrom(msg.sender, poolFor(routes[0].from, routes[0].to, routes[0].stable, routes[0].factory), amountIn);
        _swap(amounts, routes, address(this));
        weth.withdraw(amounts[amounts.length - 1]);
        _safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline) external ensure(deadline) returns (uint256[] memory amounts) {
        if (routes.length == 0) revert InvalidPath();
        amounts = getAmountsOut(amountIn, routes);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(routes[0].from).safeTransferFrom(msg.sender, poolFor(routes[0].from, routes[0].to, routes[0].stable, routes[0].factory), amountIn);
        _swap(amounts, routes, to);
    }

    function _addLiquidity(address tokenA, address tokenB, bool stable, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin) internal returns (uint256 amountA, uint256 amountB) {
        if (amountADesired < amountAMin) revert InsufficientAmountADesired();
        if (amountBDesired < amountBMin) revert InsufficientAmountBDesired();
        address pool = IPoolFactory(defaultFactory).getPool(tokenA, tokenB, stable);
        if (pool == address(0)) IPoolFactory(defaultFactory).createPool(tokenA, tokenB, stable);
        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB, stable, defaultFactory);
        if (reserveA == 0 && reserveB == 0) {
            amountA = amountADesired;
            amountB = amountBDesired;
        } else {
            uint256 amountBOptimal = _quoteLiquidity(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                if (amountBOptimal < amountBMin) revert InsufficientAmountB();
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                uint256 amountAOptimal = _quoteLiquidity(amountBDesired, reserveB, reserveA);
                if (amountAOptimal < amountAMin) revert InsufficientAmountA();
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
        }
    }

    function _swap(uint256[] memory amounts, Route[] calldata routes, address to) internal {
        for (uint256 i; i < routes.length; i++) {
            (address token0, ) = sortTokens(routes[i].from, routes[i].to);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = routes[i].from == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address recipient = i < routes.length - 1 ? poolFor(routes[i + 1].from, routes[i + 1].to, routes[i + 1].stable, routes[i + 1].factory) : to;
            IPool(poolFor(routes[i].from, routes[i].to, routes[i].stable, routes[i].factory)).swap(amount0Out, amount1Out, recipient, new bytes(0));
        }
    }

    function _quoteLiquidity(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256) {
        if (amountA == 0) revert InsufficientAmount();
        if (reserveA == 0 || reserveB == 0) revert InsufficientLiquidity();
        return (amountA * reserveB) / reserveA;
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool ok, ) = to.call{value: value}(new bytes(0));
        if (!ok) revert ETHTransferFailed();
    }
}
