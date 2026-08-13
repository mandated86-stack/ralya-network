# RLYA mainnet release flow

The release is intentionally split between automated build work and owner-only signatures.

1. Public GitHub repository runs the Anchor build workflow and produces `rlya_sale.so` + IDL.
2. The compiled program is tested on Devnet and then deployed to mainnet using the final project signing wallet.
3. The owner opens `/owner/`, enters the deployed program ID, and runs the preflight.
4. The launch console creates the RLYA mint and Metaplex fungible-token metadata, creates exactly 839M RLYA, initializes the sale/founder PDAs, funds all seven allocation accounts, revokes mint authority, and activates the sale.
5. The console exports `RALYA_MAINNET_LAUNCH_RECORD.json` and a populated `site-config.js`.
6. Those two files are published to the public repository/site.
7. A small real USDC purchase is performed and verified before wider promotion.

No seed phrase is placed in this repository or website.
