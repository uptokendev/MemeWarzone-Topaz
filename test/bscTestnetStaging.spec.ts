import { expect } from "chai";
import {
  BSC_TESTNET_STAGING_VOLATILE_FEE_BPS,
  assertBscTestnetStagingNetwork,
  buildBscTestnetStagingManifestConfiguration,
  requireBscTestnetStagingManifest,
  requireBscTestnetStagingVolatileFeeBps
} from "../scripts/lib/bsc-testnet-staging";

describe("BSC Testnet 30-bps staging generation", function () {
  it("accepts exactly 30 bps and defaults to 30", function () {
    expect(requireBscTestnetStagingVolatileFeeBps("30")).to.equal(30);
    expect(requireBscTestnetStagingVolatileFeeBps(30)).to.equal(30);
    expect(requireBscTestnetStagingVolatileFeeBps(undefined)).to.equal(30);
    expect(BSC_TESTNET_STAGING_VOLATILE_FEE_BPS).to.equal(30);
  });

  it("rejects the historical 100-bps staging value and arbitrary values", function () {
    expect(() => requireBscTestnetStagingVolatileFeeBps("100")).to.throw(
      "VOLATILE_FEE_BPS must be exactly 30"
    );
    expect(() => requireBscTestnetStagingVolatileFeeBps("31")).to.throw(
      "VOLATILE_FEE_BPS must be exactly 30"
    );
    expect(() => requireBscTestnetStagingVolatileFeeBps("not-a-number")).to.throw(
      "VOLATILE_FEE_BPS must be exactly 30"
    );
  });

  it("records exactly 30 bps in the staging manifest configuration", function () {
    expect(buildBscTestnetStagingManifestConfiguration("30")).to.deep.equal({
      volatileFeeBps: 30,
      graduationPoolStable: false
    });
  });

  it("validates the manifest as BSC Testnet chain 97 with 30 bps", function () {
    const manifest = {
      network: "bscTestnet",
      chainId: 97,
      configuration: {
        volatileFeeBps: 30,
        graduationPoolStable: false
      }
    };

    expect(requireBscTestnetStagingManifest(manifest)).to.equal(30);
  });

  it("rejects a 100-bps manifest", function () {
    expect(() =>
      requireBscTestnetStagingManifest({
        network: "bscTestnet",
        chainId: 97,
        configuration: { volatileFeeBps: 100, graduationPoolStable: false }
      })
    ).to.throw("manifest.configuration.volatileFeeBps must be exactly 30");
  });

  it("cannot be used as a mainnet deployment path", function () {
    expect(() => assertBscTestnetStagingNetwork("bscMainnet", 56)).to.throw(
      "30-bps Topaz staging deployment is BSC Testnet-only"
    );
    expect(() => assertBscTestnetStagingNetwork("bscTestnet", 56)).to.throw(
      "30-bps Topaz staging deployment is BSC Testnet-only"
    );
  });
});
