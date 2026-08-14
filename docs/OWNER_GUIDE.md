# Owner guide — final Mainnet path

Most technical work is already prepared in this repository. The owner should perform only actions that genuinely require possession of the real signing wallet or local production keys. Never send a seed phrase, private key, wallet JSON or production keypair to ChatGPT, GitHub, email or cloud storage.

## Checkpoint A — permanent Mainnet program

Download the current `mandated86-stack/ralya-network` main branch to the owner's own computer. A normal GitHub **Code → Download ZIP** extraction is supported; a git clone is optional.

Run:

- Windows: `scripts/mainnet_program_deploy.ps1`
- macOS/Linux: `scripts/mainnet_program_deploy.sh`

The script refuses CI, requires the tested Solana CLI 3.1.10 toolchain, and runs the RALYA source/security audit before production-key generation. It then generates the permanent Program ID and a separate upgrade-authority key locally and keeps both private key files outside the project folder/repository. It asks the owner to make an offline backup before any Mainnet broadcast.

The script patches the **public** Program ID into temporary source files, compiles the exact SBF executable, shows the live Mainnet deployment-rent estimate and current fee-payer balance, and requires the explicit phrase `DEPLOY-RLYA-MAINNET` before broadcasting. If the owner stops or deployment fails, the temporary Program-ID source changes are restored from local backups so the same permanent local keys can be reused safely after funding.

After deployment, the script downloads the executable back from Mainnet and requires exact byte length and SHA-256 equality with the locally built `.so`. Only after that match does it transfer upgrade authority away from the transaction-paying deployer. A successful run creates `RALYA_MAINNET_PROGRAM_PUBLIC.txt`, which contains only public evidence.

Return only that public record / Program ID to ChatGPT. Never return either JSON key file.

## Checkpoint B — prepare the fixed RLYA supply

Initial RLYA metadata is already publicly reachable from the public RALYA GitHub repository, so token creation does not depend on Netlify or a custom domain being live first.

After the public Program ID is verified, open `/owner/` and connect the actual owner wallet. The launch preflight requires:

- Solana Mainnet;
- the expected executable Program ID;
- the reachable public RALYA/RLYA metadata URI;
- the public presale master switch still **OFF**;
- enough SOL in the owner wallet for token/account rent and transaction fees.

`Prepare RLYA Mainnet` then performs the irreversible token preparation in stages:

1. Create the RLYA mint with 9 decimals and no freeze authority.
2. Mint exactly **839,000,000 RLYA** once.
3. Initialize the sale and founder-lock accounts while the sale remains `DRAFT`.
4. Fund all seven published allocation buckets so they reconcile to the full 839M supply.
5. Permanently revoke RLYA mint authority and re-check that freeze authority is absent.

At this point the production token exists but public buying is still not open.

## Checkpoint C — start founder lock without opening a public window

The `Atomic activate + pause` action puts `activate` and `pause` into the **same Solana transaction**. Solana transaction atomicity means either both instructions commit or neither does. The 365-day founder lock therefore starts while the transaction's final committed sale state is `PAUSED`; there is no separate transaction window in which the sale is left publicly active.

The console stores and downloads a public launch record containing the mint, Program ID, sale PDA, founder-lock/vault addresses, allocation accounts and transaction signatures.

## Checkpoint D — owner-funded 1 USDC Mainnet smoke verification

With the sale still `PAUSED`, the owner console performs one transparent **owner-funded protocol smoke purchase**. It uses disposable local test identities and exactly 1 USDC supplied by the owner wallet.

The critical smoke actions are atomic in one transaction:

`resume → register referral → buy 1 USDC → pause`

The transaction either commits the complete purchase and finishes `PAUSED`, or Solana rolls the entire sequence back. The verifier then requires:

- exactly 1.00 USDC gross sale accounting;
- exactly 0.01 USDC referral accounting (1%);
- exactly 0.99 USDC direct treasury proceeds before the referral test funds are swept;
- the exact quoted amount of RLYA delivered;
- zero manual/off-site distribution;
- final sale state `PAUSED`.

The disposable test assets are then swept to treasury and the updated public evidence record is downloaded. This 1 USDC transaction is protocol verification, not external buyer demand, and must remain disclosed as owner-funded smoke activity.

## Independent public verification

`scripts/verify_mainnet_public.mjs <launch-record.json>` uses only public RPC data and the public launch record. It verifies the executable program, exact 839M supply, null mint/freeze authorities, deterministic PDAs, treasury/founder identities, price/referral constants, founder lock, allocation balances and either the clean pre-smoke state or the exact owner-funded post-smoke accounting.

The required success marker is:

`RALYA_MAINNET_PUBLIC_VERIFICATION=PASS`

## Opening the public presale

The website's production `presaleEnabled` master switch remains `false` throughout program deployment, token creation, allocation, activation and Mainnet smoke verification. The browser purchase button is independently forced disabled while this switch is false.

Only after public verification passes should the signed Mainnet Program ID, mint, sale PDA and treasury values be merged into the protected site configuration. The hardened site is deployed while the chain sale remains `PAUSED`. Then, and only then, the public presale switch is enabled and the authorized owner resumes the on-chain sale.

## Ongoing owner controls

`/admin/` provides on-chain-authorized operations only:

- record/deliver a legitimate off-site sale from the same public-sale vault;
- pause or resume new purchases;
- close the sale;
- move unsold public-sale inventory to treasury after closing;
- release the founder allocation only after its on-chain lock expires.

Manual/off-site distributions are accounted separately in sale state and displayed separately on the public website while still advancing the same public distribution/price curve.
