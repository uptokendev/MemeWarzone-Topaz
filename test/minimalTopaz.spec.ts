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
    const { owner, other, token, wbnb, factory, registry } = await deployFixture();

    await expect(factory.createPool(await token.getAddress(), await wbnb.getAddress(), false)).to.emit(factory, "PoolCreated");
    const pool = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);

    expect(await registry.isPoolFactoryApproved(await factory.getAddress())).to.equal(true);
    expect(await factory.isPool(pool)).to.equal(true);
    expect(await factory.getPool(await wbnb.getAddress(), await token.getAddress(), false)).to.equal(pool);
    expect(await factory.getFee(pool, false)).to.equal(100);
    await expect(factory.createPool(await wbnb.getAddress(), await token.getAddress(), false)).to.be.revertedWithCustomError(factory, "PoolAlreadyExists");
    await expect(factory.connect(owner).setFee(false, 301)).to.be.revertedWithCustomError(factory, "FeeTooHigh");
    await expect(factory.connect(other).setFee(false, 100)).to.be.revertedWithCustomError(factory, "NotFeeManager");
  });

  it("keeps stable and volatile pools separate", async function () {
    const { token, wbnb, factory } = await deployFixture();

    const tokenAddress = await token.getAddress();
    const wbnbAddress = await wbnb.getAddress();
    await factory.createPool(tokenAddress, wbnbAddress, false);
    await factory.createPool(tokenAddress, wbnbAddress, true);

    const volatilePool = await factory.getPool(tokenAddress, wbnbAddress, false);
    const stablePool = await factory.getPool(tokenAddress, wbnbAddress, true);
    expect(volatilePool).to.not.equal(stablePool);
    expect(await factory.isPool(volatilePool)).to.equal(true);
    expect(await factory.isPool(stablePool)).to.equal(true);
    expect(await factory.getFee(volatilePool, false)).to.equal(100);
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

  it("enforces liquidity deadlines and minimum amounts", async function () {
    const { lpReceiver, token, router } = await deployFixture();
    const tokenAddress = await token.getAddress();

    await expect(
      router.addLiquidityETH(tokenAddress, false, e("10000"), 0, 0, lpReceiver.address, 0, { value: e("10") })
    ).to.be.revertedWithCustomError(router, "Expired");

    await expect(
      router.addLiquidityETH(tokenAddress, false, e("10000"), e("10001"), 0, lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, {
        value: e("10")
      })
    ).to.be.revertedWithCustomError(router, "InsufficientAmountADesired");

    await expect(
      router.addLiquidityETH(tokenAddress, false, e("10000"), 0, e("11"), lpReceiver.address, Math.floor(Date.now() / 1000) + 3600, {
        value: e("10")
      })
    ).to.be.revertedWithCustomError(router, "InsufficientAmountBDesired");
  });

  it("uses the existing pool ratio on second liquidity additions", async function () {
    const { lpReceiver, token, wbnb, factory, router } = await deployFixture();
    const tokenAddress = await token.getAddress();
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await router.addLiquidityETH(tokenAddress, false, e("10000"), 0, 0, lpReceiver.address, deadline, { value: e("10") });
    await router.addLiquidityETH(tokenAddress, false, e("3000"), e("1999"), e("2"), lpReceiver.address, deadline, { value: e("2") });

    const poolAddress = await factory.getPool(tokenAddress, await wbnb.getAddress(), false);
    const pool = await ethers.getContractAt("Pool", poolAddress);
    expect(await token.balanceOf(poolAddress)).to.equal(e("12000"));
    expect(await wbnb.balanceOf(poolAddress)).to.equal(e("12"));

    const [reserve0, reserve1] = await pool.getReserves();
    expect(reserve0 + reserve1).to.equal(e("12012"));
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

  it("moves future fee entitlement with LP ownership without leaking prior fees", async function () {
    const { lpReceiver, trader, other, token, wbnb, factory, router } = await deployFixture();
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await router.addLiquidityETH(await token.getAddress(), false, e("10000"), 0, 0, lpReceiver.address, deadline, { value: e("10") });
    const poolAddress = await factory.getPool(await token.getAddress(), await wbnb.getAddress(), false);
    const pool = await ethers.getContractAt("Pool", poolAddress);
    const lpBalance = await pool.balanceOf(lpReceiver.address);
    const buyRoute = [{ from: await wbnb.getAddress(), to: await token.getAddress(), stable: false, factory: await factory.getAddress() }];

    await router.connect(trader).swapExactETHForTokens(0, buyRoute, trader.address, deadline, { value: e("1") });
    await pool.connect(lpReceiver).transfer(other.address, lpBalance / 2n);

    await pool.connect(other).claimFees();
    expect(await wbnb.balanceOf(other.address)).to.equal(0);

    await expect(pool.connect(lpReceiver).claimFees()).to.emit(pool, "Claim");
    expect(await wbnb.balanceOf(lpReceiver.address)).to.be.gt(0);

    await router.connect(trader).swapExactETHForTokens(0, buyRoute, trader.address, deadline, { value: e("1") });
    const otherWbnbBefore = await wbnb.balanceOf(other.address);
    await expect(pool.connect(other).claimFees()).to.emit(pool, "Claim");
    expect(await wbnb.balanceOf(other.address)).to.be.gt(otherWbnbBefore);
  });
});