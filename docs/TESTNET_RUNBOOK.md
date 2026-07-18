# BNB Testnet Runbook

## Environment

Create `.env` from `.env.example` and set:

- `BSC_TESTNET_RPC_URL`
- `PRIVATE_KEY_DEPLOY`
- `BSCSCAN_API_KEY`
- `DEPLOYER_ADDRESS`
- `VOLATILE_FEE_BPS=100`

## Deployment

```bash
npm ci
npm run compile
npm test
npm run deploy:testnet
npm run verify:testnet
npm run smoke:testnet
npm run export:testnet
```

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