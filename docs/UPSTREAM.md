# Upstream Record

Original repository: `https://github.com/topazdex/topaz-contacts`

Original commit inspected: `858d93c0e595777aef9564124f634f4138be8f6d`

Imported operational contract scope:

- `contracts/Pool.sol`
- `contracts/PoolFees.sol`
- `contracts/factories/PoolFactory.sol`
- `contracts/Router.sol`
- Required router, pool, factory, wrapped-native, and callback interfaces

Excluded systems:

- TOPAZ protocol token
- VotingEscrow, Voter, gauges, gauge factories, minter, reward distributors
- Voting rewards, bribes, managed rewards, emissions, rebases, veNFTs
- Governance contracts and UI-facing governance helpers
- Farming and gauge staking

Minimal modifications:

- Removed gauge, voter, zap-staking, and governance dependencies from router execution paths.
- Removed ERC2771 trusted-forwarder inheritance from `Router`; callers use ordinary `msg.sender`.
- Kept production-compatible external entry points required by MemeWarzone: `defaultFactory()`, `weth()`, `addLiquidityETH(...)`, `PoolFactory.getPool(...)`, `PoolFactory.isPool(...)`, `PoolFactory.getFee(...)`, `PoolFactory.createPool(...)`, and pool fee/reserve/token accessors.
- Kept Topaz-style fee accounting where swap input fees are removed from pool reserves, transferred to `PoolFees`, indexed by LP ownership, and claimed with `claimFees()`.
- Preserved the volatile constant-product swap formula and retained the stable formula only for interface compatibility and basic exclusion testing.
- Configured the deployment path to set volatile fees to `100` basis points for MemeWarzone graduated pools.

Reasoning:

The MemeWarzone graduation flow only needs Token/WBNB pool creation, liquidity, swaps, 1% post-graduation trading fees, LP fee accrual, and LP fee claiming. Keeping gauge and governance infrastructure would add deployment and security surface without participating in the acceptance test.
