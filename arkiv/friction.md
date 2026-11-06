# Friction: what got in our way

Things we actually hit while building MUSO's Arkiv integration (SDK 1.0.1, Rabdi):

1. **Explorer URLs aren't documented.** We needed links to entities, transactions and wallets from our app, and had to find `/entity/<key>`, `/tx/<hash>` and `/address/<addr>` in the explorer's JavaScript bundle. A short "link to the explorer" section, or `chain.blockExplorers` helpers for entities, would fix this.
2. **`dec` drops trailing zeros.** We write `dec("1000.00")` for money and read back `"1000"`. That's correct, but surprising for currency. Our tests broke on it, and the UI has to re-format. Worth one line in the column-types page.
3. **The 128-byte `str` limit needs our own truncation.** Event and sponsor titles (with emoji and Hindi text) can go over it. We wrote a helper that cuts on character boundaries. An SDK helper such as `str.truncate()` that's UTF-8 safe would save every team the same bug.
4. **Lifetimes over ~182 days throw.** An event far in the future plus a 30-day tail can exceed `MAX_LIFETIME`, so we clamp to `ExpirationTime.max()` ourselves. An option like `atDate(d, { clamp: true })` would help.
5. **No idempotency for batches.** If our process dies after `executeBatch` lands but before we save the keys, a retry writes duplicates. We record keys right after each batch, but a client-supplied idempotency key, or an easy "find by attribute and creator before create" pattern in the docs, would make this safe.
6. **Selecting every column is verbose.** The proof screen needs almost all columns, and each has to be listed in `select({...})`. A `select('*')` or `select(schema.all)` that stays typed would help.
7. **The public RPC is unpredictable without an access key.** Our first run of the query script stalled for several minutes with no output. Later runs finished in about 2 s, so we couldn't tell whether rate limiting caused it. Per-request timeouts and a clearer hint in the warning ("get a key at hub.arkiv.network") would help judges running our query.
8. **Getting started takes three accounts on top of the code:** tGLM from the faucet, an access key from the hub, and a wallet. Fine for builders, but a one-click "hackathon starter" (key + funded test wallet) would remove the first hour of setup.
