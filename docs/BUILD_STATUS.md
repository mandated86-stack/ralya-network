# Build status - RLYA 0.5.0 referral release candidate

## Verified now
- fixed 839M economic model and invariant tests
- 56 deterministic tests passing
- 50,000-operation randomized sale/referral stress run passing
- Rust/Solana source audit passing
- browser JavaScript syntax checks passing
- real Solana SBF compilation passing in GitHub Actions
- CI rejects any Solana stack-frame warning above the 4,096-byte limit
- current Buy and BuyWithReferral account validation compile without the prior stack overflow warning
- current program successfully deployed to a fresh local Solana validator
- local deployment produced executable Program/ProgramData accounts under the upgradeable loader
- disposable local validator deployment uses no real SOL and no production keys
- Devnet deploy script suppresses raw failed-deployment output so temporary recovery material is not published

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
- Local validator: **DEPLOYMENT VERIFIED**
- Solana Devnet: **PENDING PUBLIC DEPLOYMENT**. The first disposable CI attempt reached the funding stage but the public Devnet faucet rate-limited GitHub's shared runner IP.
- Solana Mainnet: **NOT DEPLOYED**
- Real RLYA mint: **NOT CREATED**
- Real-money public sale: **DISABLED**

## Evidence still required before the word LIVE is used
- public Devnet program deployment succeeds
- Devnet initialize/activate/buy/referral/manual-sale transactions pass
- final owner-controlled Program ID is generated for production
- mainnet program is deployed
- final RLYA mint is signed
- 839M allocation accounts are funded
- mint authority is revoked and freeze authority is absent
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
