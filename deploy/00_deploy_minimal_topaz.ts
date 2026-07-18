import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const volatileFeeBps = Number(process.env.VOLATILE_FEE_BPS || "100");
  if (volatileFeeBps !== 100) {
    throw new Error("Minimal Topaz testnet deployment requires VOLATILE_FEE_BPS=100");
  }

  const wbnb = await ethers.deployContract("TestWBNB");
  await wbnb.waitForDeployment();

  const poolImplementation = await ethers.deployContract("Pool");
  await poolImplementation.waitForDeployment();

  const poolFactory = await ethers.deployContract("PoolFactory", [await poolImplementation.getAddress()]);
  await poolFactory.waitForDeployment();

  const registry = await ethers.deployContract("MinimalFactoryRegistry", [await poolFactory.getAddress()]);
  await registry.waitForDeployment();

  const router = await ethers.deployContract("Router", [
    await registry.getAddress(),
    await poolFactory.getAddress(),
    deployer.address,
    await wbnb.getAddress()
  ]);
  await router.waitForDeployment();

  const setFeeTx = await poolFactory.setFee(false, volatileFeeBps);
  await setFeeTx.wait();

  if ((await router.defaultFactory()) !== await poolFactory.getAddress()) throw new Error("Router factory mismatch");
  if ((await router.weth()) !== await wbnb.getAddress()) throw new Error("Router WBNB mismatch");
  if (!(await registry.isPoolFactoryApproved(await poolFactory.getAddress()))) throw new Error("Factory not approved");
  if ((await poolFactory.volatileFee()) !== BigInt(volatileFeeBps)) throw new Error("Volatile fee mismatch");

  const manifest = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    upstreamRepository: "topazdex/topaz-contacts",
    upstreamCommit: "858d93c0e595777aef9564124f634f4138be8f6d",
    deploymentCommit: process.env.GITHUB_SHA || "",
    deployer: deployer.address,
    contracts: {
      WBNB: await wbnb.getAddress(),
      PoolImplementation: await poolImplementation.getAddress(),
      PoolFactory: await poolFactory.getAddress(),
      FactoryRegistry: await registry.getAddress(),
      Router: await router.getAddress()
    },
    configuration: {
      volatileFeeBps,
      graduationPoolStable: false
    },
    transactions: {
      deployWBNB: wbnb.deploymentTransaction()?.hash || "",
      deployPoolImplementation: poolImplementation.deploymentTransaction()?.hash || "",
      deployPoolFactory: poolFactory.deploymentTransaction()?.hash || "",
      deployFactoryRegistry: registry.deploymentTransaction()?.hash || "",
      deployRouter: router.deploymentTransaction()?.hash || "",
      setVolatileFee: setFeeTx.hash
    }
  };

  const outDir = join("deployments", network.name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "minimal-topaz.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
