# RALYA fast website editing

RALYA uses two separate website-editing paths so public copy changes do not require a Solana program rebuild.

## 1. Instant owner live-copy path

The private `/owner/` console exposes **Live website copy editor**. It writes only approved plain-text marketing fields to Netlify Blobs after an owner-wallet message signature. Public pages merge these overrides over `web/site-copy.json` on refresh.

Live-copy overrides cannot change token economics, price, hard cap, referral rate, wallet addresses, treasury configuration, presale access, Mainnet IDs or transaction logic.

Use **Reset all live overrides** to return every field to the version-controlled defaults.

## 2. Fast version-controlled path

Routine copy that should become the repository default belongs in:

`web/site-copy.json`

A normal wording-only edit now triggers the lightweight **Web release** workflow, not the Solana SBF build. The web workflow still runs the pre-launch safety audit, live-copy audit, economic self-test, Netlify function compilation and production browser bundle.

## Heavy protocol path

`.github/workflows/build.yml` is reserved for on-chain/protocol-sensitive paths such as the RLYA Solana program, tokenomics/model/tests, Solana deployment scripts and Anchor/Cargo configuration.

This separation is deliberate: copy work should be quick, while anything capable of changing money or protocol behavior remains slow and heavily verified.
