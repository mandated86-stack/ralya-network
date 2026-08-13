# RALYA Coin/Network 0.5.0 - Release Verification

Date: 2026-08-13  
Checkpoint: Referral Mainnet Release Candidate 0.5.0

## Verified in this runtime

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
- Public-sale allocation: exactly 100,680,000 RLYA (12%)
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
- Live buyer transaction path is designed as atomic USDC-for-RLYA delivery
- Manual/off-platform sale path transfers real RLYA from the same sale vault and advances the same price curve
- Whitepaper v1.1 PDF generated and visually inspected after rendering

## Source-ready, but still requires external chain verification

The active Solana program is `programs/rlya_sale`.

It contains the public sale, fixed referral split, on-chain demand curve, manual/off-platform sale reconciliation, founder lock, pause/resume/close controls, and first-activation supply/authority checks.

This runtime does not have a complete Solana/Anchor deployment environment with the owner's signing wallet, so this release does **not** falsely claim successful final-program compilation, local-validator integration, Devnet deployment, mainnet deployment, mainnet RLYA mint creation, or mainnet token-sale activation. Those remain launch gates.

## Website status

The release website contains real wallet, real RLYA/USDC balance reads, live on-chain quote logic, direct purchase construction, referred purchase construction, referral-link generation, and owner-control code. There is no simulated buyer/demo allocation system in the release build.

Mainnet transaction controls remain fail-closed until `site-config.js` contains the real RLYA mint address, deployed RLYA sale program ID, treasury wallet, and public GitHub repository URL.

## GitHub status

The repository is prepared for an MIT-licensed public GitHub release with CI, security policy, contributing guide, Whitepaper v1.1, contracts, tests and website source. A writable public repository named `ralya-network` has not yet been found in the connected GitHub account, so no public push is claimed in this checkpoint.

## Mainnet owner-signature gate

The final RLYA mint, allocation transfers, authority revocation and program deployment require the project owner's wallet signatures. The release contains no private project keys.
