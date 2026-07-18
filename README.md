# MemeWarzone Minimal Topaz

Minimal Topaz AMM fork for MemeWarzone BNB Testnet graduation testing.

This repository intentionally includes only the DEX pieces needed by the launchpad:

- Token/WBNB volatile pool creation
- Token/WBNB liquidity
- Native BNB wrapping through `TestWBNB`
- Token-to-WBNB and WBNB-to-token swaps
- Fixed 1% volatile pool fee
- LP fee accrual and `claimFees()`

Governance, gauges, emissions, veNFTs, farming, and Topaz protocol-token systems are out of scope.

## Commands

```bash
npm ci
npm run compile
npm test
npm run deploy:testnet
npm run verify:testnet
npm run smoke:testnet
npm run export:testnet
```

The accepted testnet address source is `deployments/bscTestnet/minimal-topaz.json`.
