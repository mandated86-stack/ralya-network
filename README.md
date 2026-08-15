# RALYA / RLYA

**Economic trust for autonomous work.**

RALYA is a Solana-first protocol project. RLYA is its fixed-supply economic security asset. The repository contains the public-sale engineering, real-wallet client, owner controls, executable economic model, automated tests, threat model, tokenomics and Whitepaper v1.2.

## Fixed launch rules

- Symbol: `RLYA`
- Maximum lifetime supply: `839,000,000 RLYA`
- Public presale base allocation: `288,000,000 RLYA`
- Dedicated Buy + Stake bonus reserve: `14,400,000 RLYA` inside the same fixed lifetime supply
- USDC starting presale price: `$0.003000`
- Buy + Stake: fixed `+5% RLYA`; base allocation and bonus unlock together 21 days after public token launch
- Standard presale release: purchased RLYA is delivered 1 day before public token launch
- The first confirmed public-presale purchase locks that wallet to Standard or Buy + Stake for later public-presale purchases
- Founder allocation: exactly 10% (`83,900,000 RLYA`) with a 365-day lock beginning on actual public token Day 0
- No application mint instruction
- Mint authority must be revoked and freeze authority absent before later public token-sale activation
- No buyer refund path; a confirmed on-chain USDC presale purchase is final
- Referred presale purchases pay a fixed 1% of gross USDC to the referrer; the buyer's spend, expected RLYA allocation and any fixed staking bonus are unchanged
- Same-wallet self-referrals and direct two-wallet referral loops are rejected; no referral RLYA is minted
- Authorized off-site allocations share the same reviewed presale accounting and base allocation pool

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
- public Devnet final invariants verified the 839M hard-cap supply, absent mint authority and absent freeze authority
- production RLYA Mainnet mint/program/PDA do not yet exist; public RLYA token Day 0 has not occurred

See `docs/BUILD_STATUS.md` for launch gates and `docs/DEVNET_PROTOCOL_EVIDENCE.md` for public Devnet addresses, accounting and transaction signatures.

## Repository layout

- `programs/rlya_sale` - Anchor/Solana sale + founder-lock engineering
- `web` - public real-wallet website and pre-launch USDC presale client
- `web/admin` - owner sale controls
- `web/owner` - launch preparation/control page
- `model` - executable Python economic mirror
- `tests` - deterministic/invariant tests
- `scripts` - compiler, audit, stress and protocol-integration tooling
- `whitepaper` - Whitepaper v1.2 source
- `security` - threat model and launch gates
- `tokenomics` - launch allocation

## Status

RALYA is in its **pre-launch presale phase**. The presale at `ralyaai.com` can record verified USDC purchases and expected RLYA allocations before the production RLYA token is publicly launched.

The **pre-launch presale** and the later **RLYA public token Mainnet Day 0** are separate milestones. When owner-signed presale allocation access is `OPEN`, the website may correctly show **RLYA PRESALE • LIVE** even though the production RLYA mint/program deployment and public token Day 0 remain a later phase.

Current public-token status: **building toward Mainnet**. No production RLYA mint/program/PDA is created by the website/presale phase, and the founder one-year lock does not start until actual public token Day 0.

## Open source

MIT licensed. Contributions and independent review are welcome. See `SECURITY.md` for vulnerability reporting expectations.
