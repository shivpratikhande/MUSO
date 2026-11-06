# Reach

**Who is it for, and would they use it?**
- **Brands and sponsors** funding reward pools at live events: they pay for verified human attention and need proof they can check. The Arkiv report is that proof.
- **Fans who film** (creators): they get paid for clips people actually watch, and own their clip's public record.
- **Organizers:** they attract sponsors with transparent, checkable results.
- **Other apps:** an open, queryable catalogue of event clips and campaign results.

**Can they try it today?**
- The MUSO app runs on iPhone via Expo. The pool screen shows **"Public proof on Arkiv"** once a sponsored pool ends.
- Anyone can query the data with no account and no MUSO server: `pnpm --filter @muso/backend arkiv:query [poolId]`, or open an entity on the [Rabdi explorer](https://rabdi.explorer.arkiv.network/address/0x278A05621217b3B8680c56e19B5B9cf48Bd6BAfB).
- The end-to-end demo: a sponsor funds a pool (USDC on Arc), verified humans watch (World ID), creators are paid on Arc, and the report lands on Arkiv. Script: `pnpm --filter @muso/backend arc:demo`.

**Will we keep building after Mumbai?** Yes. Next: real events in India (concerts and college fests), with sponsor dashboards reading straight from Arkiv, plus clip licensing for media apps.
