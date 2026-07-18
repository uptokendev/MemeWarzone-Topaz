import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer, trader, lpReceiver] = await ethers.getSigners();
  const manifest = JSON.parse(readFileSync(join("deployments", network.name, "minimal-topaz.json"), "utf8"));
  const token = await ethers.deployContract("TestToken", ["Smoke Token", "SMOKE"]);
  await token.waitForDeployment();
  await token.mint(deployer.address, ethers.parseEther("100000"));
  await token.approve(manifest.contracts.Router, ethers.parseEther("10000"));

  const router = await ethers.getContractAt("Router", manifest.contracts.Router);
  const factory = await ethers.getContractAt("PoolFactory", manifest.contracts.PoolFactory);
  await router.addLiquidityETH(await token.getAddress(), false, ethers.parseEther("10000"), 0, 0, lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, { value: ethers.parseEther("10") });

  const poolAddress = await factory.getPool(await token.getAddress(), manifest.contracts.WBNB, false);
  if (poolAddress === ethers.ZeroAddress) throw new Error("Pool was not created");

  const route = [{ from: manifest.contracts.WBNB, to: await token.getAddress(), stable: false, factory: manifest.contracts.PoolFactory }];
  await router.connect(trader).swapExactETHForTokens(0, route, trader.address, Math.floor(Date.now() / 1000) + 3600, { value: ethers.parseEther("0.1") });

  const sellRoute = [{ from: await token.getAddress(), to: manifest.contracts.WBNB, stable: false, factory: manifest.contracts.PoolFactory }];
  await token.connect(trader).approve(manifest.contracts.Router, await token.balanceOf(trader.address));
  await router.connect(trader).swapExactTokensForETH(await token.balanceOf(trader.address), 0, sellRoute, trader.address, Math.floor(Date.now() / 1000) + 3600);

  const pool = await ethers.getContractAt("Pool", poolAddress);
  await pool.connect(lpReceiver).claimFees();
  console.log(`Smoke test passed for pool ${poolAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
