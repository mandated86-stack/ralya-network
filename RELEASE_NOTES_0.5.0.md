# RALYA Coin/Network 0.5.0 referral release candidate

This checkpoint adds the first complete referral layer to the fixed-supply RLYA sale architecture.

## Referral rule

- 1% of a valid referred purchase's gross USDC is sent to the referrer.
- 99% is sent to the configured treasury.
- The buyer is not charged extra and receives the same RLYA quote.
- No additional RLYA is created.
- Same-wallet self-referral and direct two-wallet loops are rejected.
- First referral attribution is stored in a deterministic on-chain account and cannot be switched or bypassed with the direct-buy instruction.
- The rate is fixed at 100 basis points in the program source and stored in sale state.

## Public client

The website can read a referral from `?ref=<SolanaWallet>`, display it before signing, generate a personal referral link for a connected wallet, and build the referred Solana transaction path.

## Verification status

The Python economic mirror, deterministic tests, randomized stress tests, static source audit and browser JavaScript syntax checks are included. The Anchor program still requires a real Solana/Anchor compilation + local-validator/Devnet integration gate before mainnet activation.
