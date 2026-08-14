# RALYA / RLYA

**Economic trust for autonomous work.**

RALYA is a Solana-first protocol project. RLYA is its fixed-supply economic security asset. The repository contains the public sale program, real wallet client, owner controls, executable economic model, automated tests, threat model, tokenomics and Whitepaper v1.1.

## Fixed launch rules

- Symbol: `RLYA`
- Maximum supply: `839,000,000`
- Decimals: `9`
- Public sale engineering pool: `100,680,000 RLYA`
- USDC launch price: `$0.003000`
- Price increment: `$0.000050` each `1,000,000 RLYA` distributed
- Founder allocation: 10%, initial 365-day protocol lock
- No application mint instruction
- Mint authority must be revoked and freeze authority absent before sale activation
- No presale claim/refund state
- Referred public-sale purchases pay a fixed 1% of gross USDC to the referrer; buyer quote and gross spend stay unchanged
- Same-wallet self-referrals and direct two-wallet referral loops are rejected; no referral RLYA is minted
- Off-site sales use the same sale vault and advance the same public curve

## Verified engineering status

- 56 deterministic tests pass
- 50,000-operation randomized sale/referral stress run passes
- source audit and browser JavaScript checks pass
- Solana SBF compilation passes with a 4,096-byte stack-frame CI gate
- full localhost Solana protocol integration passes under the pinned Solana 3.1.10 / Anchor 1.0.2 project toolchain
- 12 localhost on-chain abuse/permission guards pass
- public Solana Devnet program deployment passes
- public Devnet core protocol integration passes: initialize, activation gates, direct purchase, referral attribution/bypass protection, referred purchase and manual distribution
- public Devnet 500 USDC referred purchase reconciled exactly to 5 USDC referrer + 495 USDC treasury
- public Devnet 2,000,000 RLYA manual distribution advanced the tested curve from $0.003000 to $0.003100
- public Devnet final invariants verified the 839M hard-cap supply, absent mint authority and absent freeze authority
- production mainnet addresses and production RLYA mint do not yet exist; real-money sale remains disabled

See `docs/BUILD_STATUS.md` for the current launch gates and `docs/DEVNET_PROTOCOL_EVIDENCE.md` for the public Devnet addresses, accounting and transaction signatures.

## Repository layout

- `programs/rlya_sale` - active Anchor/Solana sale + founder-lock program
- `web` - public real-wallet website
- `web/admin` - owner sale controls
- `web/owner` - launch preparation/control page
- `model` - executable Python economic mirror
- `tests` - deterministic/invariant tests
- `scripts` - compiler, audit, stress and protocol-integration tooling
- `whitepaper` - Whitepaper v1.1 source
- `security` - threat model and launch gates
- `tokenomics` - launch allocation

## Status

RALYA remains a release candidate. The public Devnet core transaction checkpoint is verified. Mainnet is not deployed and the production token is not created. The project will not use the word `LIVE` for the sale until the owner-signed mainnet program, mint, authority-removal evidence and end-to-end purchase verification are published.

## Open source

MIT licensed. Contributions and independent review are welcome. See `SECURITY.md` for vulnerability reporting expectations.
