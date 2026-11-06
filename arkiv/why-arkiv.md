# Why Arkiv

**If we swapped Arkiv for Postgres, what would our users lose?**

MUSO already runs on Postgres. That's where the app works from. We added Arkiv for what Postgres **can't** give the people who pay and get paid:

1. **Sponsors would lose proof.** In Postgres, a pool's attention report says whatever MUSO says, and MUSO could change it later. On Arkiv the report is **read-only** and written by a known wallet (`$creator`), so a brand can check how many verified humans watched, for how long, and what each clip was paid, **without trusting MUSO**, and see that it never changed.
2. **Creators would lose ownership.** In Postgres, a clip's public listing belongs to MUSO. On Arkiv, the clip's record is **transferred to the creator's wallet**, and they can extend or delete it. If MUSO disappeared, their public record would stay theirs.
3. **Everyone would lose the link to the money.** Payout receipts tie each share of the report to its **USDC transaction on Arc**. Attention (Arkiv) and payment (Arc) can be checked end to end by anyone.
4. **Other apps would lose an open catalogue.** Events and clips are queryable by city, date, event and licence on a public database, so a media app or AI agent can find licensable clips without MUSO's API.
5. **We'd lose cleanup.** Event data expires 30 days after the show, and audit records after the audit window. Expiry is built into the data, not a cron job someone forgets.

What stays in Postgres: everything private or fast-changing, like accounts, watch heartbeats, payments in progress, and the media itself. Arkiv gets only the **public facts that need to be trusted**.
