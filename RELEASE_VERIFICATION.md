# RALYA Coin/Network 0.5.0 - Release Verification

Date: 2026-08-13  
Checkpoint: Referral Release Candidate 0.5.0 - protocol integration verified

## Deterministic and economic verification

- 56 deterministic/unit/invariant tests: PASS
- Randomized live-sale stress: PASS
  - 50,000 randomized operations executed
  - randomized direct purchases, referred purchases and owner/off-site distributions included
  - 0 rejected operations in the deterministic seeded run
  - 29,332,095.118 RLYA distributed during the seeded run
  - 1,064.66 USDC paid through referral splits during the seeded run
  - ending curve price: 0.004450 USDC/RLYA
  - no hard-cap or public-sale-cap breach
  - price never moved backwards
  - gross web-sale USDC reconciled exactly to treasury proceeds + referral rewards
  - per-referrer earnings reconciled exactly to aggregate referral accounting
- Source audit: PASS
- Website JavaScript syntax: PASS
- Owner/admin JavaScript syntax: PASS
- Tokenomics arithmetic: PASS
- Lifetime hard cap: exactly 839,000,000 RLYA
- Public-sale engineering allocation: exactly 100,680,000 RLYA (12%)
- Founder allocation: exactly 83,900,000 RLYA (10%)
- Founder initial lock: 365 days
- Active sale program contains no mint, presale-refund, claim-later, or arbitrary set-price instruction
- Direct same-wallet self-referral is rejected
- First referral attribution is deterministic and persistent for the buyer wallet
- An attributed buyer cannot bypass the referrer using the direct-buy instruction
- Direct two-wallet referral loops are rejected at registration
- Referral rate is fixed at 100 basis points (1%) in source and mirrored in on-chain state
- Referred buyer quote uses the same RLYA curve as a direct buyer
- Referral reward comes from gross USDC sale proceeds; it does not mint RLYA or surcharge the buyer
- Manual/off-platform sale path transfers RLYA from the same sale vault and advances the same price curve
- Whitepaper v1.1 PDF generated and visually inspected after rendering

## Real Solana compiler verification

The active program is `programs/rlya_sale`.

- Solana SBF compilation: PASS
- Project compiler/integration toolchain: Solana/Agave 3.1.10 + Anchor CLI 1.0.2
- Top-level Anchor program crates pinned exactly to 1.0.2
- CI refuses a green build if Solana reports a stack frame above 4,096 bytes
- Prior Buy/BuyWithReferral stack-frame issue was corrected and no longer appears in the passing compiler run

## Full localhost Solana protocol integration

A fresh Solana localhost validator was started from an empty ledger and the current program was compiled and deployed with disposable test-only keys.

- executable program size: 406,656 bytes
- deployment: PASS
- initialize instruction: PASS
- activation correctly rejected while RLYA mint authority existed: PASS
- activation correctly rejected before exact sale/founder vault funding: PASS
- activation after authority removal and exact vault funding: PASS
- direct USDC-to-RLYA purchase: PASS
- referred purchase: PASS
  - gross purchase: 500 USDC
  - referrer settlement: 5 USDC
  - treasury settlement: 495 USDC
- owner/manual distribution: PASS
  - 2,000,000 RLYA moved from the same sale vault
  - tested price moved from $0.003000 to $0.003100
- pause/resume: PASS
- final integration gross USDC accounting: 600 USDC
- final integration referral accounting: 5 USDC
- fixed RLYA supply remained unchanged: PASS
- RLYA mint authority removed: PASS
- RLYA freeze authority absent: PASS

### On-chain abuse/permission guards: 12 PASS

The integration run rejected:
- activation with mint authority still present
- activation before exact vault funding
- direct-buy referral bypass by an attributed wallet
- self-referral
- direct two-wallet circular referral
- minimum-output/slippage violation
- wrong treasury identity
- unauthorized admin pause
- purchase while paused
- presale-cap overflow
- purchase below the 1 USDC minimum
- founder release before the 365-day lock expires

All program IDs, mints, token accounts and keys created by this localhost integration are disposable test-environment values and are not RALYA production addresses.

## Current external-network gates

- Public Solana Devnet deployment/integration: IN PROGRESS
- Solana Mainnet program deployment: NOT DONE
- Production RLYA mint: NOT CREATED
- Real-money public sale: DISABLED

Mainnet is not implied by successful localhost integration. Public Devnet must reproduce the required network behavior before production owner signing.

## Website status

The release website contains wallet connection, RLYA/USDC balance reads, live on-chain quote logic, direct purchase construction, referred purchase construction, referral-link generation and owner-control code. There is no simulated buyer allocation ledger in the release build.

Production transaction controls remain fail-closed because the production RLYA mint, sale Program ID and treasury address are not published in `site-config.js`. The configuration also carries `presaleEnabled: false` during protocol testing.

## GitHub status

The public source repository is `mandated86-stack/ralya-network`. It contains the MIT-licensed source, CI workflows, security policy, contributing guide, Whitepaper source, program, economic model, tests, website and verification records.

## Mainnet owner-signature gate

The final owner-controlled Program ID, RLYA mint creation, allocation transfers, authority removal and mainnet deployment require the project owner's signatures. The repository contains no production private keys.
