# Technical baseline

- Solana SPL Token (legacy token program for broad wallet compatibility)
- Anchor `1.0.2`
- Recommended Solana toolchain `3.1.10`
- Rust edition 2021
- USDC mainnet mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Static website; no application database required for sale ownership state
- Public RPC initially; production RPC can be upgraded only when traffic requires it

`web/app.js` reads token balances and the sale PDA directly from Solana. `web/admin/` performs owner-authorized sale state actions. `web/owner/` is the one-time launch/signing console.
