import { expect } from "chai";
import { ethers } from "hardhat";

const e = ethers.parseEther;

async function deployFixture() {
  const [owner, lpReceiver, trader, other] = await ethers.getSigners();
  const token = await ethers.deployContract("TestToken", ["Launch Token", "LAUNCH"]);
  const wbnb = await ethers.deployContract("TestWBNB");
  const poolImplementation = await ethers.deployContract("Pool");
  const factory = await ethers.deployContract("PoolFactory", [await poolImplementation.getAddress()]);
  const registry = await ethers.deployContract("MinimalFactoryRegistry", [await factory.getAddress()]);
  const router = await ethers.deployContract("Router", [
    await registry.getAddress(),
    await factory.getAddress(),
    owner.address,
    await wbnb.getAddress()
  ]);

  await factory.setFee(false, 100);
  await token.mint(owner.address, e("1000000"));
  await token.mint(trader.address, e("1000000"));
  await token.approve(await router.getAddress(), e("1000000"));
  await token.connect(trader).approve(await router.getAddress(), e("1000000"));

  return { owner, lpReceiver, trader, other, token, wbnb, poolImplementation, factory, registry, router };
}

describe("Minimal Topaz", function () {
  it("creates volatile pools once and enforces the 1% volatile fee", async function () {
    const { owner, token, wbnb, factory, registry } = await deployFixture();

    await expect(factory.createPool(await token.getAddress(), await wbnb.getAddress(), false)).to.emit(factory, "PoolCreated");
    const pool = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);

    expect(await registry.isPoolFactoryApproved(await factory.getAddress())).to.equal(true);
    expect(await factory.isPool(pool)).to.equal(true);
    expect(await factory.getPool(await wbnb.getAddress(), await token.getAddress(), false)).to.equal(pool);
    expect(await factory.getFee(pool, false)).to.equal(100);
    await expect(factory.createPool(await wbnb.getAddress(), await token.getAddress(), false)).to.be.revertedWithCustomError(factory, "PoolAlreadyExists");
    await expect(factory.connect(owner).setFee(false, 301)).to.be.revertedWithCustomError(factory, "FeeTooHigh");
  });

  it("adds native liquidity, wraps BNB, mints LP to the requested locker, and refunds dust", async function () {
    const { owner, lpReceiver, token, wbnb, factory, router } = await deployFixture();
    const routerAddress = await router.getAddress();

    await expect(
      router.addLiquidityETH(await token.getAddress(), false, e("10000"), e("9000"), e("9"), lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, {
        value: e("10")
      })
    ).to.changeEtherBalances([owner, router], [-e("10"), 0n]);

    const poolAddress = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);
    const pool = await ethers.getContractAt("Pool", poolAddress);
    expect(await token.balanceOf(poolAddress)).to.equal(e("10000"));
    expect(await wbnb.balanceOf(poolAddress)).to.equal(e("10"));
    expect(await pool.balanceOf(lpReceiver.address)).to.be.gt(0);
    expect(await token.allowance(routerAddress, poolAddress)).to.equal(0);

    const [reserve0, reserve1] = await pool.getReserves();
    expect(reserve0 + reserve1).to.equal(e("10010"));
  });

  it("executes buys and sells with 1% input fees excluded from reserves", async function () {
    const { lpReceiver, trader, token, wbnb, factory, router } = await deployFixture();

    await router.addLiquidityETH(await token.getAddress(), false, e("10000"), 0, 0, lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, {
      value: e("10")
    });
    const poolAddress = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);
    const pool = await ethers.getContractAt("Pool", poolAddress);
    const poolFees = await pool.poolFees();
    const token0 = await pool.token0();

    const buyRoute = [{ from: await wbnb.getAddress(), to: await token.getAddress(), stable: false, factory: await factory.getAddress() }];
    await router.connect(trader).swapExactETHForTokens(0, buyRoute, trader.address, Math.floor(Date.now() / 1000) + 3600, { value: e("1") });
    expect(await wbnb.balanceOf(poolFees)).to.equal(e("0.01"));

    const sellAmount = e("100");
    const sellRoute = [{ from: await token.getAddress(), to: await wbnb.getAddress(), stable: false, factory: await factory.getAddress() }];
    await router.connect(trader).swapExactTokensForETH(sellAmount, 0, sellRoute, trader.address, Math.floor(Date.now() / 1000) + 3600);
    expect(await token.balanceOf(poolFees)).to.equal(e("1"));

    const [reserve0, reserve1] = await pool.getReserves();
    const poolTokenBalance = await token.balanceOf(poolAddress);
    const poolWbnbBalance = await wbnb.balanceOf(poolAddress);
    if (token0 === await token.getAddress()) {
      expect(reserve0).to.equal(poolTokenBalance);
      expect(reserve1).to.equal(poolWbnbBalance);
    } else {
      expect(reserve0).to.equal(poolWbnbBalance);
      expect(reserve1).to.equal(poolTokenBalance);
    }
  });

  it("lets LP holders claim both fee assets without reducing LP principal", async function () {
    const { lpReceiver, trader, token, wbnb, factory, router } = await deployFixture();

    await router.addLiquidityETH(await token.getAddress(), false, e("10000"), 0, 0, lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, {
      value: e("10")
    });
    const poolAddress = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);
    const pool = await ethers.getContractAt("Pool", poolAddress);
    const lpBefore = await pool.balanceOf(lpReceiver.address);

    const buyRoute = [{ from: await wbnb.getAddress(), to: await token.getAddress(), stable: false, factory: await factory.getAddress() }];
    await router.connect(trader).swapExactETHForTokens(0, buyRoute, trader.address, Math.floor(Date.now() / 1000) + 3600, { value: e("1") });
    const sellRoute = [{ from: await token.getAddress(), to: await wbnb.getAddress(), stable: false, factory: await factory.getAddress() }];
    await router.connect(trader).swapExactTokensForETH(e("100"), 0, sellRoute, trader.address, Math.floor(Date.now() / 1000) + 3600);

    await expect(pool.connect(lpReceiver).claimFees()).to.emit(pool, "Claim");
    expect(await token.balanceOf(lpReceiver.address)).to.be.gt(0);
    expect(await wbnb.balanceOf(lpReceiver.address)).to.be.gt(0);
    expect(await pool.balanceOf(lpReceiver.address)).to.equal(lpBefore);
    await pool.connect(lpReceiver).claimFees();
    expect(await pool.balanceOf(lpReceiver.address)).to.equal(lpBefore);
  });
});
