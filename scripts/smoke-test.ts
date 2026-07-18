import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function etherEnv(name: string, fallback: string) {
  return ethers.parseEther(process.env[name] || fallback);
}

async function waitFor(txPromise: Promise<any>) {
  const tx = await txPromise;
  await tx.wait();
  return tx;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const trader = deployer;
  const lpReceiver = deployer;
  const manifest = JSON.parse(readFileSync(join("deployments", network.name, "minimal-topaz.json"), "utf8"));
  const liquidityTokens = etherEnv("SMOKE_LIQUIDITY_TOKENS", "100");
  const liquidityBnb = etherEnv("SMOKE_LIQUIDITY_BNB", "0.005");
  const buyBnb = etherEnv("SMOKE_BUY_BNB", "0.001");
  const suffix = Math.floor(Date.now() / 1000).toString(36).slice(-6).toUpperCase();
  const token = await ethers.deployContract("TestToken", [`Smoke Token ${suffix}`, `SMK${suffix}`]);
  await token.waitForDeployment();
  await waitFor(token.mint(deployer.address, liquidityTokens * 20n));
  await waitFor(token.approve(manifest.contracts.Router, liquidityTokens));

  assert((await token.balanceOf(deployer.address)) >= liquidityTokens, "Deployer smoke-token balance is below liquidity amount");
  assert((await token.allowance(deployer.address, manifest.contracts.Router)) >= liquidityTokens, "Router allowance is below liquidity amount");

  const router = await ethers.getContractAt("Router", manifest.contracts.Router);
  const factory = await ethers.getContractAt("PoolFactory", manifest.contracts.PoolFactory);
  assert((await router.defaultFactory()) === manifest.contracts.PoolFactory, "Router factory mismatch");
  assert((await router.weth()) === manifest.contracts.WBNB, "Router WBNB mismatch");

  await waitFor(
    router.addLiquidityETH(await token.getAddress(), false, liquidityTokens, 0, 0, lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, {
      value: liquidityBnb,
    })
  );

  const poolAddress = await factory.getPool(await token.getAddress(), manifest.contracts.WBNB, false);
  assert(poolAddress !== ethers.ZeroAddress, "Pool was not created");
  assert(await factory.isPool(poolAddress), "Factory does not recognize smoke pool");
  assert((await factory.getFee(poolAddress, false)) === 100n, "Smoke pool volatile fee is not 100 bps");

  const pool = await ethers.getContractAt("Pool", poolAddress);
  assert((await pool.stable()) === false, "Smoke pool is not volatile");

  const lpBeforeTrades = await pool.balanceOf(lpReceiver.address);
  assert(lpBeforeTrades > 0n, "LP receiver did not receive liquidity");

  const [reserve0Before, reserve1Before] = await pool.getReserves();
  assert(reserve0Before > 0n && reserve1Before > 0n, "Initial reserves are empty");

  const route = [{ from: manifest.contracts.WBNB, to: await token.getAddress(), stable: false, factory: manifest.contracts.PoolFactory }];
  const quotedBuy = await router.getAmountsOut(buyBnb, route);
  const expectedBuyOut = quotedBuy[quotedBuy.length - 1];
  assert(expectedBuyOut > 0n, "Buy quote produced zero smoke tokens");

  const traderTokenBeforeBuy = await token.balanceOf(trader.address);
  await waitFor(router.connect(trader).swapExactETHForTokens(expectedBuyOut, route, trader.address, Math.floor(Date.now() / 1000) + 3600, { value: buyBnb }));

  const traderTokenAfterBuy = await token.balanceOf(trader.address);
  const traderTokenBought = traderTokenAfterBuy - traderTokenBeforeBuy;
  assert(
    traderTokenBought >= expectedBuyOut,
    `Buy token delta below quote: expected at least ${expectedBuyOut.toString()}, before ${traderTokenBeforeBuy.toString()}, after ${traderTokenAfterBuy.toString()}`
  );

  const sellRoute = [{ from: await token.getAddress(), to: manifest.contracts.WBNB, stable: false, factory: manifest.contracts.PoolFactory }];
  const quotedSell = await router.getAmountsOut(traderTokenBought, sellRoute);
  const expectedSellOut = quotedSell[quotedSell.length - 1];
  assert(expectedSellOut > 0n, "Sell quote produced zero WBNB");
  await waitFor(token.connect(trader).approve(manifest.contracts.Router, traderTokenBought));
  await waitFor(router.connect(trader).swapExactTokensForETH(traderTokenBought, expectedSellOut, sellRoute, trader.address, Math.floor(Date.now() / 1000) + 3600));

  const tokenBeforeClaim = await token.balanceOf(lpReceiver.address);
  const wbnb = await ethers.getContractAt("TestWBNB", manifest.contracts.WBNB);
  const wbnbBeforeClaim = await wbnb.balanceOf(lpReceiver.address);
  const lpBeforeClaim = await pool.balanceOf(lpReceiver.address);

  await waitFor(pool.connect(lpReceiver).claimFees());

  const tokenClaimed = (await token.balanceOf(lpReceiver.address)) - tokenBeforeClaim;
  const wbnbClaimed = (await wbnb.balanceOf(lpReceiver.address)) - wbnbBeforeClaim;
  const lpAfterClaim = await pool.balanceOf(lpReceiver.address);

  assert(tokenClaimed > 0n, "LP receiver did not claim launch-token fees after sell");
  assert(wbnbClaimed > 0n, "LP receiver did not claim WBNB fees after buy");
  assert(lpAfterClaim === lpBeforeClaim && lpAfterClaim === lpBeforeTrades, "LP principal changed during smoke trades or fee claim");

  console.log(`Smoke test passed for pool ${poolAddress}`);
  console.log(`Liquidity BNB: ${liquidityBnb.toString()}`);
  console.log(`Buy BNB: ${buyBnb.toString()}`);
  console.log(`Buy token quote: ${expectedBuyOut.toString()}`);
  console.log(`Sell WBNB quote: ${expectedSellOut.toString()}`);
  console.log(`Claimed token fees: ${tokenClaimed.toString()}`);
  console.log(`Claimed WBNB fees: ${wbnbClaimed.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});