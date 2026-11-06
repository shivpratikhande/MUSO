# MUSO reward campaigns on Arc (built in Arc Studio)

The Arc track requires the contract to be built in **[Arc Studio](https://studio.arc.io)**.

- **Studio project:** https://studio.arc.io/app/a2e5e21f-ce8e-4ba9-87f0-b46aa7e6cc03?thread=d76eb9e9-1820-493a-86f5-9fffd28f605d
- **Deployed (Arc Testnet, chain 5042002):** `0x7cbbb1f0e9d7301c16e6d544f9a55d13030f74eb`
- **Token:** USDC ERC-20 interface `0x3600000000000000000000000000000000000000` (6 decimals)
- **MUSO allocator / relayer:** `0x93923e856525D3BA5ac06D1047B4bC60944fdd00`
- **Source:** [`studio/RewardCampaigns.sol`](studio/RewardCampaigns.sol), exactly as Studio deployed it (deploy tx `0x8d3c0ca6…f436`, sent from the sponsor's Circle smart wallet)
- **Source matches chain:** compiled with solc 0.8.28 (optimizer 200 runs, Prague), the 6,802-byte runtime code is identical to the live contract except the USDC immutable. Arc has no explorer verification yet, so this comparison is the proof.

## How it works
1. `createCampaign(title, budget, maxPerRecipient, allocator, endsAt)`: the sponsor deposits the
   exact USDC budget into escrow. No owner or admin can move it.
2. After `endsAt` (and for 14 days), the allocator calls `award` / `awardMany` (up to 500 per call).
   MUSO computes each creator's share from verified watch time. Each address can be awarded once,
   capped by `maxPerRecipient`, and the total can never exceed the budget.
3. `claim(id)` or `claimFor(id, creator)`: anyone can submit the claim, so MUSO pays the gas, but the
   USDC always goes to the creator.
4. `reclaimUnawarded(id)`: after the award window, the sponsor recovers whatever was not awarded.

## How we built it
1. We wrote a reference design ourselves (`src/RewardCampaigns.sol`, Merkle-based, with tests).
2. Arc Studio generated its own allocation-based design. We kept Studio's design and reviewed it
   independently (`test/RewardCampaignsStudio.t.sol`).
3. The review found two issues: (a) awards were possible before the campaign ended; (b) the sponsor
   could award the whole budget to itself, so creators could not be paid. We asked Studio to fix
   both. Studio fixed them and deployed to Arc Testnet.
4. `test/RewardCampaignsStudio.t.sol` (9 tests, including a 2,000-run funds-conservation fuzz test) now
   asserts both fixes. We also checked the live deploy on a fork of Arc Testnet: awards before the end, sponsor
   self-award, and allocator self-award are all rejected. An allocator award after the end, plus
   a relayed `claimFor`, pays the creator.

## First live campaign (Arc Testnet)
Campaign #1: a 1 USDC budget split 60/40 between two creators, with both claims submitted by MUSO (the creators paid no gas).

| Step | Transaction |
|---|---|
| Sponsor `0xF879…19E6` creates the campaign (1 USDC escrowed) | [0x9aa0ca6f…](https://testnet.arcscan.app/tx/0x9aa0ca6f3724f1de79e34cafecd5a81322d384f4f8928e7f13c5d6b7cd473a48) |
| After it ends, the allocator calls `awardMany` (0.6 + 0.4 USDC) | [0x9a899019…](https://testnet.arcscan.app/tx/0x9a899019ace8695ee0508099bd84b4a29f1fba6a42aba736c2f801c0f92c292f) |
| Relayed `claimFor` creator 1 → +0.600000 USDC | [0xfca3604c…](https://testnet.arcscan.app/tx/0xfca3604c046c5676852550ae6cb02f70b3270eeadf88d7d1ebad263d8e839919) |
| Relayed `claimFor` creator 2 → +0.400000 USDC | [0xc9165875…](https://testnet.arcscan.app/tx/0xc9165875adc2c9b33c210ede52710d330940c9f5dde0708b615342e633f96c27) |

The contract's USDC balance afterwards is 0: everything the sponsor deposited reached the creators.

## End to end through MUSO (Arc Testnet)
`pnpm --filter @muso/backend arc:demo --fund-link` against the running API. The organizer funded the pool through
MUSO's wallet page (connect → sign → approve → `createCampaign`) as **campaign #2** (2 USDC). Viewers then
watched with real heartbeats. When the pool ended, MUSO split it by watch time and its worker called `awardMany`,
then relayed `claimFor`. Bob linked his wallet only after Alice had been paid, and was still paid.

| Creator | Share | Claim transaction |
|---|---|---|
| Alice (2 videos, 24 s) | 1.33 USDC | [0x09442a77…](https://testnet.arcscan.app/tx/0x09442a7758c1297ac942c6ac66937d1ce5bb034e2335717c7509cda89fbb9d4e) |
| Bob (1 video, 12 s, wallet linked late) | 0.67 USDC | [0xdf5f7aa0…](https://testnet.arcscan.app/tx/0xdf5f7aa0409fe76e60afd89cf23d1486e016255bd7d7d05ae7fd62f2db2cdd3b) |

Creators paid no gas: their wallets held 0 USDC before and exactly their shares after.
