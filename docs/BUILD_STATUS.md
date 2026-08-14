# Build status - RLYA 0.5.0 referral release candidate

## Verified now
- fixed 839M economic model and invariant tests
- 56 deterministic tests passing
- 50,000-operation randomized sale/referral stress run passing
- Rust/Solana source audit passing
- browser JavaScript syntax checks passing
- real Solana SBF compilation passing in GitHub Actions
- compiler/integration toolchain pinned to Solana 3.1.10 and Anchor CLI 1.0.2; top-level Anchor program crates pinned to 1.0.2
- CI rejects any Solana stack-frame warning above the 4,096-byte limit
- current Buy and BuyWithReferral account validation compile without the prior stack overflow warning
- current program successfully deployed to a fresh localhost Solana validator as a 406,656-byte executable
- full localhost on-chain protocol integration passed: initialize, activation gates, direct buy, referral buy, manual distribution and sale pause/resume
- 500 USDC referred purchase reconciled exactly to 5 USDC referrer + 495 USDC treasury
- 2,000,000 RLYA manual/off-site distribution moved tokens from the same sale vault and advanced price from $0.003000 to $0.003100
- final localhost integration accounting recorded 600 USDC gross and 5 USDC referral payout
- 12 localhost on-chain abuse/permission guards passed, including mint-authority activation gate, vault-funding gate, referral bypass, self-referral, circular referral, slippage, wrong treasury, unauthorized admin, paused purchase, presale-cap overflow, sub-minimum purchase and early founder release
- integration verified hard-cap supply remained fixed, mint authority was removed and freeze authority was absent
- public Solana Devnet program deployment passed
- public Devnet core protocol integration passed against the deployed program: initialize, activation gates, direct buy, referral attribution/bypass guard, referred purchase and manual distribution
- public Devnet referred purchase reconciled exactly to 5 USDC referrer + 495 USDC treasury from a 500 USDC test purchase
- public Devnet manual distribution of 2,000,000 RLYA advanced the price from $0.003000 to $0.003100
- public Devnet final state recorded 600 USDC gross, 5 USDC referral payout and approximately 2.2M RLYA distributed/sold
- public Devnet final invariants verified hard-cap supply remained 839,000,000 RLYA, mint authority was absent and freeze authority was absent
- disposable Devnet test identities use no production keys and no real-money sale is enabled

## Public Devnet evidence
- Devnet program: `Dk5eeCK6KmYY4b6pQkCRpfbZViwEjYJLryjZoUgBxsHN`
- Devnet RLYA test mint: `3K3AWEJaJ7sqYB926CitbRaBnPn6cyiC8WPsEe1N6Uii`
- Devnet USDC test mint: `BHAVfo4QzXKoRhNrinficvotonPyhuWQNYhwFn5XNdvW`
- Devnet sale PDA: `ASgQBY5NPHHcuXNDWaDSD4wX8MiZ57JdUjzFvzxtejDg`
- GitHub Actions evidence run: `31778172257`
- final marker: `RALYA_DEVNET_PROTOCOL_INTEGRATION=PASS`
- transaction signatures and full reconciliation: `docs/DEVNET_PROTOCOL_EVIDENCE.md`

## Complete in source/test package
- fixed 839M economics
- working 12% public-sale engineering pool model
- instant USDC-to-RLYA settlement logic with buyer minimum-output protection
- distribution-based stepped pricing
- owner off-site distribution synchronization
- no claim/refund state
- 365-day founder lock
- real wallet/RPC browser client
- owner admin panel including off-site distribution, sale lifecycle, unsold withdrawal and founder release
- one-time owner launch console
- Whitepaper v1.1
- public GitHub CI configuration

## Current network status
- Localhost Solana validator: **FULL PROTOCOL INTEGRATION VERIFIED**
- Solana Devnet: **PUBLIC DEPLOYMENT + CORE PROTOCOL INTEGRATION VERIFIED**
- Solana Mainnet: **NOT DEPLOYED**
- Production RLYA mint: **NOT CREATED**
- Real-money public sale: **DISABLED**

## Evidence still required before the word LIVE is used
- final owner-controlled Program ID is generated for production
- production upgrade-authority policy is secured and externally reviewed
- mainnet program is deployed
- final RLYA mint is signed
- 839M allocation accounts are funded according to the final launch allocation
- mint authority is revoked and freeze authority is absent
- founder allocation is placed under the production 365-day lock
- sale activates and a small end-to-end mainnet purchase/referral verification succeeds
- launch addresses/signatures are published in site configuration
- final production website hardening and explicit sale-enable gate are verified

## Referral system
- Fixed on-chain rate: 1% of referred gross USDC purchase (100 basis points).
- Buyer quote and gross purchase amount are unchanged by referral.
- Referral reward is paid in USDC from sale proceeds; no extra RLYA is minted.
- Same-wallet self-referrals and direct two-wallet loops are rejected.
- A buyer wallet's first referral attribution is locked and future purchases must honor it.
- Browser referral links use `?ref=<SolanaWallet>`.
- Aggregate referral USDC is recorded in sale state.
