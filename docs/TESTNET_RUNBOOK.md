# BNB Testnet Runbook

## Environment

Create `.env` in the root of `MemeWarzone-Topaz`, next to `package.json`. This is separate from the MemeWarzone launchpad `.env`.

```env
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
PRIVATE_KEY_DEPLOY=0xYOUR_FUNDED_TESTNET_DEPLOYER_PRIVATE_KEY
BSCSCAN_API_KEY=
DEPLOYER_ADDRESS=0xYOUR_DEPLOYER_ADDRESS
VOLATILE_FEE_BPS=100
```

Backward-compatible aliases are also accepted: `BSC_TESTNET_RPC` for `BSC_TESTNET_RPC_URL`, and `DEPLOYER_PK` for `PRIVATE_KEY_DEPLOY`.

`BSCSCAN_API_KEY` is optional for deploying and smoke testing, but required for explorer verification. `DEPLOYER_ADDRESS` is recorded for operator clarity and checked for address format when set.

## Deployment

```bash
npm ci
npm run compile
npm test
npm run deploy:check-env:bsc-testnet
npm run deploy:testnet
npm run verify:testnet
npm run smoke:testnet
npm run export:testnet
```

The deploy command creates `deployments/bscTestnet/minimal-topaz.json`. Copy that manifest into the MemeWarzone launchpad repo at the same relative path, or set MemeWarzone's `TOPAZ_MANIFEST` to this file's absolute path.

## Acceptance Gates

- `Router.defaultFactory()` equals deployed `PoolFactory`.
- `Router.weth()` equals deployed `TestWBNB`.
- `MinimalFactoryRegistry` approves only the deployed `PoolFactory`.
- `PoolFactory.volatileFee()` is exactly `100`.
- A Token/WBNB volatile pool can be created.
- `PoolFactory.isPool(pool)` recognizes the smoke pool.
- `PoolFactory.getFee(pool, false)` returns exactly `100`.
- Liquidity can be added with native BNB.
- LP is minted to the requested receiver.
- Initial pool reserves are nonzero.
- A WBNB-to-token buy succeeds and produces tokens.
- A token-to-WBNB sell succeeds.
- LP fees are claimable through `Pool.claimFees()`.
- The LP receiver claims WBNB fees from the buy.
- The LP receiver claims launch-token fees from the sell.
- Claiming fees does not change LP principal.
- `deployments/bscTestnet/minimal-topaz.json` is exported and used as the only address source by MemeWarzone.