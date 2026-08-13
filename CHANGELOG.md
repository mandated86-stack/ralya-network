# Changelog

## 0.5.0 - Referral release candidate
- Added a fixed 1% USDC referral payout path to the active sale model and Anchor source.
- Referred buyers pay the same gross USDC and receive the same RLYA quote as direct buyers.
- Added direct same-wallet self-referral rejection.
- Added on-chain aggregate referral accounting and referral event data.
- Added wallet referral links (`?ref=<wallet>`) and real referred-purchase transaction construction.
- Added owner-console visibility for aggregate referral USDC.
- Updated the public site, build evidence, threat model and public-sale specification.
- Updated Whitepaper to v1.1 with referral economics and transaction behavior.
- Expanded deterministic and randomized sale tests.

## 0.4.0 - Mainnet release candidate
- Replaced prior claim-based presale model with instant atomic USDC-to-RLYA delivery.
- Added stepped on-chain demand pricing: $0.003000 start, +$0.000050 per 1M RLYA distributed.
- Added owner-authorized off-site distribution that advances the same public curve.
- Added real Solana wallet balance reads and purchase transaction builder.
- Added private owner admin panel and one-time mainnet launch console.
- Added fixed-supply activation checks for exact 839M supply and revoked mint/freeze authority.
- Added mint-authority proof at initialization to prevent deterministic sale-account front-running.
- Added buyer minimum-output protection so price-step movement fails safely instead of silently worsening a quote.
- Completed owner lifecycle controls for unsold inventory and founder release after lock expiry.
- Added Whitepaper v1.0 and token metadata.
- Added separate public GitHub/CI structure and MIT license.
- Removed old simulation/claim-presale release artifacts.

## 0.3.0 - Foundation
- Economic reference model, website foundation and early Anchor sources.
