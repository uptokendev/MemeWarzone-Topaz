export const BSC_TESTNET_STAGING_NETWORK = "bscTestnet";
export const BSC_TESTNET_STAGING_CHAIN_ID = 97;
export const BSC_TESTNET_STAGING_VOLATILE_FEE_BPS = 30;

export function requireBscTestnetStagingVolatileFeeBps(
  value: string | number | undefined,
  label = "VOLATILE_FEE_BPS"
): number {
  const resolved = value === undefined || value === ""
    ? BSC_TESTNET_STAGING_VOLATILE_FEE_BPS
    : Number(value);

  if (!Number.isInteger(resolved) || resolved !== BSC_TESTNET_STAGING_VOLATILE_FEE_BPS) {
    throw new Error(
      `${label} must be exactly ${BSC_TESTNET_STAGING_VOLATILE_FEE_BPS} for the BSC Testnet staging generation; got ${String(value)}`
    );
  }

  return resolved;
}

export function assertBscTestnetStagingNetwork(networkName: string, chainId: number): void {
  if (networkName !== BSC_TESTNET_STAGING_NETWORK || chainId !== BSC_TESTNET_STAGING_CHAIN_ID) {
    throw new Error(
      `30-bps Topaz staging deployment is BSC Testnet-only: expected ${BSC_TESTNET_STAGING_NETWORK}/${BSC_TESTNET_STAGING_CHAIN_ID}, got ${networkName}/${chainId}`
    );
  }
}

export function buildBscTestnetStagingManifestConfiguration(
  value: string | number | undefined
): { volatileFeeBps: number; graduationPoolStable: false } {
  return {
    volatileFeeBps: requireBscTestnetStagingVolatileFeeBps(value),
    graduationPoolStable: false
  };
}

export function requireBscTestnetStagingManifest(manifest: any): number {
  assertBscTestnetStagingNetwork(String(manifest?.network ?? ""), Number(manifest?.chainId ?? 0));
  return requireBscTestnetStagingVolatileFeeBps(
    manifest?.configuration?.volatileFeeBps,
    "manifest.configuration.volatileFeeBps"
  );
}
