# RLYA Mainnet Gates

The public sale must not be called live until every production gate below is complete and the launch-address record is published.

## Verified pre-mainnet engineering gates

- [x] Anchor/Rust program compiles with the pinned project toolchain.
- [x] Solana SBF build rejects stack frames above 4,096 bytes.
- [x] Fresh localhost Solana validator accepts the deployed executable.
- [x] Full localhost initialize → activate → direct-buy → referral-buy → manual-distribution → pause/resume integration passes.
- [x] 1%/99% referred USDC settlement reconciles on-chain.
- [x] Manual/off-site distribution advances the same `total_sold` price curve.
- [x] 12 abuse/permission guards pass, including self/circular referral, referral bypass, slippage, wrong treasury, unauthorized admin, paused purchase, cap overflow and early founder release.
- [x] Integration verifies fixed supply remains unchanged, mint authority is removed and freeze authority is absent before active sale operation.
- [ ] Public Solana Devnet deployment succeeds.
- [ ] Public Devnet reproduces required initialize/activate/buy/referral/manual-sale behavior.
- [ ] Website transaction construction, including any required token-account creation, is exercised against the public Devnet configuration.

## Production gates

- [ ] Owner-controlled production Program ID generated and backed up securely.
- [ ] Production upgrade-authority policy is published; founder-lock trust must not depend on one ordinary hot wallet. Use a reviewed multisig/timelock arrangement or deliberately make the program immutable when the project is ready.
- [ ] Program deployed to Solana mainnet.
- [ ] Program ID published in the canonical launch record.
- [ ] RLYA metadata created with name `RALYA`, symbol `RLYA`, decimals `9`.
- [ ] Exactly 839,000,000 RLYA created.
- [ ] Public-sale vault funded with exactly 100,680,000 RLYA.
- [ ] Founder-lock vault funded with exactly 83,900,000 RLYA.
- [ ] Remaining allocation accounts published and reconcile to 839M total.
- [ ] Mint authority revoked.
- [ ] Freeze authority absent/revoked.
- [ ] Sale activation transaction succeeds.
- [ ] Mainnet RLYA mint, sale PDA, program ID and treasury address inserted into `web/site-config.js` from the signed launch record.
- [ ] Explicit public-sale enable switch reviewed and enabled only after all production addresses are verified.
- [ ] Production purchase-path JavaScript dependencies are bundled/self-hosted or otherwise integrity-controlled; the money-moving path must not depend on mutable third-party runtime CDN code.
- [ ] Public sale UI shows owner-recorded off-site/manual distribution separately from ordinary website-sale activity while still showing the combined curve counter.
- [ ] Referral token-account UX is reviewed so the user is not surprised by additional account-creation rent/network costs.
- [ ] Website reads real sale state and wallet balances from mainnet.
- [ ] One small owner-controlled end-to-end USDC purchase verified before wider publication.
- [ ] Public repository and Whitepaper v1.1 available from website.
- [ ] Mainnet program/mint/authority-removal/activation/purchase transaction signatures published.
