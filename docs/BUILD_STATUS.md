# Build status - RLYA 0.6.0 Mainnet-preparation release candidate

## Verified now
- fixed 839M economic model and invariant tests
- 57 deterministic tests passing
- 50,000-operation randomized sale/referral stress run passing
- Rust/Solana source and launch-safety audit passing
- browser JavaScript and Mainnet owner-tool syntax checks passing
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
- production browser presale master switch is enforced independently of address configuration and defaults OFF
- public manual/off-site RLYA distribution is exposed separately from total distribution
- production browser Solana/Metaplex dependencies are pinned and self-hosted in generated bundles instead of runtime `esm.sh` imports
- owner-controlled Mainnet deploy scripts keep permanent Program ID and upgrade-authority private keys outside GitHub/CI
- Mainnet owner deployment supports either a clean git checkout or a normal GitHub Download ZIP; temporary public Program-ID source patches restore automatically on stop/failure
- Mainnet deployment runs the source/security audit before production-key generation
- Mainnet deployment tooling requires exact downloaded on-chain executable SHA-256/byte equality with the locally built SBF binary before completing authority transfer
- initial production token metadata is publicly reachable from the RALYA GitHub repository and is no longer blocked on pre-launch Netlify availability
- Mainnet token-preparation console stages exact 839M creation, all published allocations and permanent mint-authority revocation before activation
- Mainnet founder-lock activation and pause are atomic in one Solana transaction, so the committed state finishes PAUSED without an inter-transaction public ACTIVE window
- owner-funded 1 USDC Mainnet referral smoke flow is designed as atomic `resume -> register referral -> buy -> pause`, with idempotent recovery and transparent owner-funded accounting
- public-only Mainnet verifier checks program, mint authorities, deterministic PDAs, allocation reconciliation, founder lock and pre/post-smoke accounting without private keys
- final authoritative production release-gate GitHub Actions run `31816280219` (Build 51, source commit `f525f652ccb9757ac0430cc2d71c740ad7e3487f`) passed SBF build/audit, pinned browser dependency installation and self-hosted production browser bundle build
- matching Repository checks run `31816280215` passed repository verification plus shell/PowerShell/Node Mainnet owner-tool syntax checks
- production bundle marker: `RALYA_PRODUCTION_WEB_BUNDLE=PASS`

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
- owner off-site distribution synchronization and separate public transparency metric
- no claim/refund state
- 365-day founder lock
- real wallet/RPC browser client
- owner admin panel including off-site distribution, sale lifecycle, unsold withdrawal and founder release
- staged owner Mainnet token launch console
- atomic activate/pause Mainnet module
- atomic owner-funded 1 USDC Mainnet referral smoke module
- public-only Mainnet verification script
- owner-controlled Windows/macOS/Linux Mainnet program deployment scripts
- protected public presale enable gate
- pinned/self-hosted production browser dependency build
- repository-hosted initial token metadata and image
- Whitepaper v1.1
- public GitHub CI configuration

## Current network status
- Localhost Solana validator: **FULL PROTOCOL INTEGRATION VERIFIED**
- Solana Devnet: **PUBLIC DEPLOYMENT + CORE PROTOCOL INTEGRATION VERIFIED**
- Solana Mainnet: **NOT DEPLOYED**
- Production RLYA mint: **NOT CREATED**
- Real-money public sale: **DISABLED**

## Owner-signed evidence still required before the word LIVE is used
- permanent owner-controlled production Program ID is generated locally and backed up safely
- owner fee-paying wallet has enough real Mainnet SOL for the current program-rent estimate plus transaction fees
- Mainnet program deploys and downloaded executable exactly matches the built SBF binary
- production upgrade authority is secured; a hardware/multisig/governance arrangement is preferred before substantial public funds are exposed
- owner creates the production RLYA mint and exactly 839,000,000 RLYA
- all seven launch allocation accounts reconcile to the fixed 839M supply
- mint authority is permanently revoked and freeze authority is absent
- founder allocation is placed under the production 365-day lock while sale finishes PAUSED
- owner-funded atomic 1 USDC referred-purchase smoke verification passes and finishes PAUSED
- `scripts/verify_mainnet_public.mjs` returns `RALYA_MAINNET_PUBLIC_VERIFICATION=PASS`
- signed Mainnet Program ID, RLYA mint, sale PDA, treasury and transaction evidence are published in site configuration/evidence
- hardened website is deployed with presale master switch still OFF
- only after all verification passes is the public presale switch enabled and the authorized owner resumes the on-chain sale

## Referral system
- Fixed on-chain rate: 1% of referred gross USDC purchase (100 basis points).
- Buyer quote and gross purchase amount are unchanged by referral.
- Referral reward is paid in USDC from sale proceeds; no extra RLYA is minted.
- Same-wallet self-referrals and direct two-wallet loops are rejected.
- A buyer wallet's first referral attribution is locked and future purchases must honor it.
- Browser referral links use `?ref=<SolanaWallet>`.
- Aggregate referral USDC is recorded in sale state.
