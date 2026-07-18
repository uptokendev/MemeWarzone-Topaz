#!/usr/bin/env node
require("dotenv").config();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_RE = /^(0x)?[a-fA-F0-9]{64}$/;
const BSC_RPC_ENVS = ["BSC_TESTNET_RPC_URL", "BSC_TESTNET_RPC"];
const DEPLOYER_PRIVATE_KEY_ENVS = ["PRIVATE_KEY_DEPLOY", "DEPLOYER_PK"];
const KNOWN_LOCAL_PRIVATE_KEYS = new Set([
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "59c6995e998f97a5a0044966f0945389d8f4e2145e3ea535c9ea6d1cfef39d4",
  "5de4111a2f57843d4a54c1c7d2254141e70cdb4c5b4bc7d22477d90b4f0ad7a3",
]);

const errors = [];
const warnings = [];

function raw(name) {
  return (process.env[name] || "").trim();
}

function firstConfigured(names) {
  return names.find((name) => raw(name));
}

function hasAny(names) {
  return names.some((name) => raw(name));
}

function normalizePrivateKey(value) {
  return value.toLowerCase().replace(/^0x/, "");
}

function checkRequiredAny(names, message) {
  if (!hasAny(names)) errors.push(`${names.join(" or ")}: ${message}`);
}

function checkPrivateKey(name) {
  const value = raw(name);
  if (!value) return;
  if (!PRIVATE_KEY_RE.test(value)) {
    errors.push(`${name}: expected 32-byte hex private key`);
    return;
  }
  if (KNOWN_LOCAL_PRIVATE_KEYS.has(normalizePrivateKey(value))) {
    errors.push(`${name}: uses a default Hardhat local private key; set a real funded BSC testnet deployer key`);
  }
}

function checkAddress(name) {
  const value = raw(name);
  if (!value) return;
  if (!ADDRESS_RE.test(value)) errors.push(`${name}: expected 20-byte 0x address`);
}

function checkVolatileFee() {
  const value = raw("VOLATILE_FEE_BPS") || "100";
  if (value !== "100") errors.push(`VOLATILE_FEE_BPS: Minimal Topaz deployment requires 100, got ${value}`);
}

checkRequiredAny(BSC_RPC_ENVS, "required for --network bscTestnet");
checkRequiredAny(DEPLOYER_PRIVATE_KEY_ENVS, "required for --network bscTestnet");
for (const name of DEPLOYER_PRIVATE_KEY_ENVS) checkPrivateKey(name);
checkAddress("DEPLOYER_ADDRESS");
checkVolatileFee();

if (!raw("BSCSCAN_API_KEY")) {
  warnings.push("BSCSCAN_API_KEY is unset; deploy/smoke can run, but BscScan verification may fail or be skipped.");
}

console.log("[topaz-env] target=bscTestnet");
console.log(`[topaz-env] rpc=${firstConfigured(BSC_RPC_ENVS) || "unset"}`);
console.log(`[topaz-env] deployerKey=${firstConfigured(DEPLOYER_PRIVATE_KEY_ENVS) || "unset"}`);
console.log(`[topaz-env] deployerAddress=${raw("DEPLOYER_ADDRESS") || "optional/unset"}`);
console.log(`[topaz-env] volatileFeeBps=${raw("VOLATILE_FEE_BPS") || "100"}`);

for (const warning of warnings) console.warn(`[topaz-env] warning: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`[topaz-env] error: ${error}`);
  process.exitCode = 1;
} else {
  console.log("[topaz-env] OK");
}
