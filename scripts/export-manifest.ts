import { ethers, network } from "hardhat";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const source = join("deployments", network.name, "minimal-topaz.json");
  if (!existsSync(source)) {
    throw new Error(`Missing deployment manifest: ${source}`);
  }
  const manifest = JSON.parse(readFileSync(source, "utf8"));
  manifest.deploymentCommit = process.env.GITHUB_SHA || manifest.deploymentCommit || "";
  manifest.chainId = Number((await ethers.provider.getNetwork()).chainId);

  const outDir = join("deployments", network.name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "minimal-topaz.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Exported ${join(outDir, "minimal-topaz.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
