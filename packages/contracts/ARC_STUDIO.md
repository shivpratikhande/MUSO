# Building RewardCampaigns in Arc Studio

The Arc track requires the contract to be built in **[Arc Studio](https://studio.arc.io)** with a
shareable project URL. This is the exact workflow we used, and the prompt we gave Studio.

## Steps
1. Open https://studio.arc.io and sign in with your Circle account.
2. Create a new project named **MUSO RewardCampaigns**.
3. Paste the prompt below. Attach `src/RewardCampaigns.sol` and `test/RewardCampaigns.t.sol` (or paste them).
4. Let Studio review the contract and run its checks. Keep the record of what it flagged (screenshot or copy) for the demo.
5. Deploy to **Arc Testnet** from Studio with constructor arguments:
   - `admin` = your wallet address
   - `allocator` = `0x93923e856525D3BA5ac06D1047B4bC60944fdd00` (MUSO backend allocator/relayer)
   - `tokens` = `[0x3600000000000000000000000000000000000000, 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a]` (USDC, EURC)
6. Copy the **deployed address** into the root `.env` as `ARC_REWARD_CAMPAIGNS_ADDRESS=`.
7. Copy the **Studio project URL** into the root README under "Arc".

## Prompt for Arc Studio

> Build and deploy a reusable, sponsor-funded stablecoin reward escrow for Arc called
> `RewardCampaigns` (Solidity ^0.8.28, OpenZeppelin 5).
>
> **Roles:** `DEFAULT_ADMIN_ROLE` manages which tokens are allowed (USDC
> `0x3600000000000000000000000000000000000000` and EURC on Arc testnet). `ALLOCATOR_ROLE`
> (an app backend or a Chainlink CRE workflow) publishes allocations.
>
> **Flow:**
> 1. `createCampaign(token, deposit, endsAt, claimWindow, maxPerRecipient, externalRef)`: the
>    sponsor deposits USDC via `transferFrom`. The contract checks the full amount arrived.
> 2. After `endsAt`, the allocator calls `publishAllocations(id, merkleRoot, allocatedTotal)`
>    once, with `allocatedTotal <= deposit`. This opens a claim window.
> 3. `claim(id, account, amount, proof)`: anyone can submit (gasless relaying) but funds always
>    go to `account`. Each account claims once, `amount <= maxPerRecipient`, and the total
>    claimed can never exceed `allocatedTotal`. Leaves use OpenZeppelin StandardMerkleTree
>    encoding of `(uint256 campaignId, address account, uint256 amount)`.
> 4. `reclaim(id)`: after the claim window the sponsor recovers `deposit - claimed`. If
>    allocations were never published, after a 30-day grace period the sponsor recovers
>    everything.
>
> **Security:** ReentrancyGuard, SafeERC20, custom errors, events for every state change, no
> admin path to move campaign funds, and campaign proofs bound to the campaign id. Use the
> USDC ERC-20 interface (6 decimals) only, never Arc's 18-decimal native balance.
>
> Please review against Arc's EVM differences, then run the attached Foundry tests (including
> the funds-conservation fuzz test) and deploy to Arc Testnet.
