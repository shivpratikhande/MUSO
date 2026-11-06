# @muso/contracts: RewardCampaigns (Arc)

A **reusable, sponsor-funded stablecoin reward escrow** for [Arc](https://docs.arc.io). MUSO uses it for creator reward pools: sponsors deposit USDC, MUSO's backend computes each creator's share from server-verified watch time, and creators claim on-chain.

| Function | Who | Rule enforced on-chain |
|---|---|---|
| `createCampaign` | Sponsor | Pulls the exact deposit. Only allowed tokens (USDC/EURC). |
| `publishAllocations` | Allocator role | Only after the end, only once, total ≤ deposit |
| `claim` | Anyone (relayer) for `account` | Valid Merkle proof, once per account, ≤ per-recipient cap, within the window, funds go to `account` |
| `reclaim` | Sponsor | After the claim window (or a 30-day grace period if never allocated): deposit − claimed |

Admins can only allow or disallow tokens. **No admin path can move campaign funds.**

## Develop
Uses [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry.md) (`arc-forge`), which simulates Arc's EVM differences:
```sh
pnpm --filter @muso/contracts build
pnpm --filter @muso/contracts test      # arc-forge test --network arc (includes a funds-conservation fuzz test)
```

## Deploy
Built and deployed through **Arc Studio**: see [ARC_STUDIO.md](ARC_STUDIO.md). A Foundry script is included as a fallback:
```sh
ADMIN=0x… ALLOCATOR=0x… arc-forge script script/DeployRewardCampaigns.s.sol \
  --rpc-url https://rpc.testnet.arc.network --private-key $PRIVATE_KEY --broadcast
```
