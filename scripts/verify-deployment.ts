import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const manifest = JSON.parse(readFileSync(join("deployments", network.name, "minimal-topaz.json"), "utf8"));
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== manifest.chainId) throw new Error(`Chain mismatch: ${chainId} != ${manifest.chainId}`);

  for (const [name, address] of Object.entries<string>(manifest.contracts)) {
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`${name} has no bytecode at ${address}`);
  }

  const router = await ethers.getContractAt("Router", manifest.contracts.Router);
  const factory = await ethers.getContractAt("PoolFactory", manifest.contracts.PoolFactory);
  const registry = await ethers.getContractAt("MinimalFactoryRegistry", manifest.contracts.FactoryRegistry);

  if ((await router.defaultFactory()) !== manifest.contracts.PoolFactory) throw new Error("Router factory mismatch");
  if ((await router.weth()) !== manifest.contracts.WBNB) throw new Error("Router WBNB mismatch");
  if (!(await registry.isPoolFactoryApproved(manifest.contracts.PoolFactory))) throw new Error("Registry approval missing");
  if ((await factory.volatileFee()) !== BigInt(manifest.configuration.volatileFeeBps)) throw new Error("Volatile fee mismatch");
  console.log("Minimal Topaz deployment verified");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
