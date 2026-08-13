# Build status - RLYA 0.5.0 referral release candidate

## Complete in source/test package
- fixed 839M economics
- 12% live public-sale pool
- instant USDC-to-RLYA settlement model with buyer minimum-output protection
- distribution-based stepped pricing
- owner off-site distribution synchronization
- no claim/refund state
- 365-day founder lock
- real wallet/RPC browser client
- owner admin panel including off-site distribution, sale lifecycle, unsold withdrawal and founder release
- one-time owner launch console
- Whitepaper v1.1
- public GitHub CI configuration

## Evidence still required before the word LIVE is used
- GitHub Anchor compiler job passes
- Devnet transactions pass
- mainnet program is deployed
- final RLYA mint is signed
- 839M allocation accounts are funded
- mint authority is revoked
- sale activates and a small end-to-end mainnet purchase succeeds
- launch addresses/signatures are published in site configuration


## Referral system

- Fixed on-chain rate: 1% of referred gross USDC purchase (100 basis points).
- Buyer quote and gross purchase amount are unchanged by referral.
- Referral reward is paid in USDC from sale proceeds; no extra RLYA is minted.
- Same-wallet self-referrals and direct two-wallet loops are rejected.
- A buyer wallet's first referral attribution is locked and future purchases must honor it.
- Browser referral links use `?ref=<SolanaWallet>`.
- Aggregate referral USDC is recorded in sale state.
