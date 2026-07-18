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
- Liquidity can be added with native BNB.
- A WBNB-to-token buy succeeds.
- A token-to-WBNB sell succeeds.
- LP fees are claimable through `Pool.claimFees()`.
- `deployments/bscTestnet/minimal-topaz.json` is exported and used as the only address source by MemeWarzone.
