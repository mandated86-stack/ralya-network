# Owner guide - minimal actions

Most technical work is prepared inside this repository. The owner should only perform actions that require ownership of an external account or possession of the real signing wallet.

## Before program compilation
1. Create a separate **public** GitHub repository named `ralya-network` under the connected GitHub account. Do not reuse the private Ralya Protest App repository.
2. Publish this source tree there. CI then runs the reference-model/security checks and compiles the active Solana program.

## Before mainnet program deployment
1. Generate the final program keypair and keep `rlya_sale-keypair.json` private. Only its public Program ID is published.
2. Patch the public Program ID with `python scripts/set_program_id.py <PUBLIC_PROGRAM_ID>` and rebuild the final `.so`.
3. Deploy the final compiled `.so` to Solana using that program keypair. The deployment authority must remain under project control during the early audited upgrade period.

## One-time token launch
After the website metadata URL is live and the deployed program ID is confirmed, open `/owner/` and connect the real owner wallet. The launch console preflight verifies the executable program and metadata before enabling the irreversible launch sequence.

The launch sequence creates the token mint, metadata and complete 839M fixed supply, initializes/funds the sale and founder vaults plus reserve accounts, revokes mint authority, verifies freeze authority is absent, activates the sale, and exports the signed launch record plus final website configuration.

## Ongoing controls
`/admin/` provides only on-chain-authorized controls:
- record/deliver a legitimate off-site sale from the same public-sale vault;
- pause or resume new website purchases;
- close the sale;
- move unsold public-sale inventory to the published treasury after closing;
- release the founder allocation only after its on-chain lock expires.

The website never asks for or stores a seed phrase. Do not send private keys, seed phrases, or the private program keypair to ChatGPT or commit them to GitHub.
