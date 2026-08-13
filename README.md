# RALYA / RLYA

**Economic trust for autonomous work.**

RALYA is a Solana-first protocol project. RLYA is its fixed-supply economic security asset. The launch package contains the public sale program, real wallet client, owner control client, executable economic model, tests, threat model, tokenomics and Whitepaper v1.1.

## Fixed launch rules

- Symbol: `RLYA`
- Maximum supply: `839,000,000`
- Decimals: `9`
- Public sale: `100,680,000 RLYA`
- USDC launch price: `$0.003000`
- Price increment: `$0.000050` each `1,000,000 RLYA` distributed
- Founder allocation: 10%, initial 365-day protocol lock
- No application mint instruction
- Mint and freeze authority must be revoked before sale activation
- No presale claim/refund state
- Referred public-sale purchases pay a fixed 1% of gross USDC to the referrer; buyer quote and gross spend stay unchanged
- Same-wallet self-referrals are rejected; no referral RLYA is minted
- Off-site sales use the same sale vault and advance the same public curve

## Repository layout

- `programs/rlya_sale` - active Anchor/Solana sale + founder-lock program
- `web` - public real-wallet website
- `web/admin` - owner sale controls
- `web/owner` - launch preparation/control page
- `model` - executable Python economic mirror
- `tests` - deterministic/invariant tests
- `scripts` - audit and stress tooling
- `whitepaper` - Whitepaper v1.1 source
- `security` - threat model and launch gates
- `tokenomics` - launch allocation

## Status

This repository is a release candidate until the final program ID, RLYA mint and launch transaction signatures are published. Source is never labeled deployed merely because it exists.

## Open source

MIT licensed. Contributions and independent review are welcome. See `SECURITY.md` for vulnerability reporting expectations.
