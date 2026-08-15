# Owner guide — RALYA pre-launch through public launch

This guide separates **pre-launch fundraising**, **technical Mainnet readiness**, **token distribution** and **public token launch**. Completing one stage does not automatically trigger the next.

Never send a seed phrase, private key, wallet JSON or production keypair to ChatGPT, GitHub, email or cloud storage.

## Stage 1 — public website / hype phase

The RALYA website may be public before production Mainnet deployment. Public messaging uses the staged reveal control in `/owner/`:

- Pre-launch
- Mainnet preparation
- Mainnet verified
- Distribution preparation
- Distribution scheduled
- Launch approaching

Changing these labels changes public messaging only. It cannot mint RLYA, move USDC, deploy a program, open token trading or resume the on-chain sale.

## Stage 2 — pre-launch allocation access

Pre-launch allocation access is a separate owner-signed control with three states:

- `CLOSED` — informational website only;
- `OPEN` — verified USDC purchases may create RLYA allocations;
- `PAUSED` — temporarily refuse new allocations while retaining all existing records.

The post-launch atomic-sale configuration `presaleEnabled` remains a different master switch and stays `false` during this phase.

### Website purchase flow

When allocation access is open:

1. buyer connects a Solana wallet;
2. buyer enters USDC;
3. wallet signs a harmless allocation-quote message;
4. server locks an exact short-lived RLYA allocation at the current shared curve position;
5. buyer signs the actual Solana USDC transaction;
6. server independently verifies the transaction, buyer signer, quote memo and exact USDC balance changes;
7. allocation becomes `CONFIRMED`;
8. reconnecting that wallet displays the buyer's expected RLYA;
9. RLYA distribution remains scheduled before public launch.

The starting price is $0.003000 and increases $0.000050 each time another 1,000,000 RLYA is allocated. The complete pre-launch pool is 100,680,000 RLYA.

### Referral flow

A referred website purchase routes 1% of gross USDC to the referrer and 99% to the pre-launch treasury. The buyer receives the normal RLYA allocation. The first confirmed referrer for a buyer wallet is locked; self-referrals and direct two-wallet circular referrals are rejected.

## Stage 3 — private/off-site investor allocations

The private owner console has `Private / off-site investor allocation`.

Enter:

- investor Solana wallet;
- exact RLYA allocation;
- optional internal payment/deal reference;
- optional internal owner note.

The system does **not** expose an arbitrary price box. The RLYA amount consumes the same 100.68M pool and advances the same fixed public curve.

Private references/notes stay in the owner ledger and are not returned through the public buyer-wallet endpoint.

## Stage 4 — monitor / reconcile pre-launch

The private owner console shows:

- current allocation access state;
- current price;
- total allocated RLYA;
- website RLYA allocation;
- private/off-site RLYA allocation;
- verified website USDC;
- referral USDC;
- buyer lookup.

Use `Download delivery manifest` only when a reconciliation snapshot is needed. The final manifest should be exported after pre-launch allocation access is closed for distribution.

The manifest is hashed and groups each wallet's:

- website RLYA;
- private/off-site RLYA;
- total RLYA;
- verified website gross USDC;
- website referral USDC;
- locked referrer;
- source transaction IDs.

## Stage 5 — permanent Mainnet program

When production Mainnet deployment is ready, download the current `mandated86-stack/ralya-network` main branch to the owner's own computer. A normal GitHub **Code → Download ZIP** extraction is supported; git clone is optional.

Run:

- Windows: `scripts/mainnet_program_deploy.ps1`
- macOS/Linux: `scripts/mainnet_program_deploy.sh`

The script refuses CI, runs the RALYA source/security audit and generates three separate local identities:

1. permanent RALYA Program ID keypair;
2. dedicated upgrade-authority keypair;
3. dedicated Mainnet deployment/fee-payer keypair.

Back up all three local JSON key files offline. They must not be uploaded or shared.

The script patches only the public Program ID into the source, compiles the exact SBF executable, shows the public fee-payer address and live Mainnet deployment requirement, and broadcasts only after the explicit `DEPLOY-RLYA-MAINNET` confirmation.

After deployment it downloads the executable back from Mainnet and requires exact byte/SHA-256 equality before completing the authority transfer. A successful run creates `RALYA_MAINNET_PROGRAM_PUBLIC.txt`, containing public evidence only.

## Stage 6 — create the fixed production RLYA supply

After the permanent Mainnet Program ID is independently verified, open `/owner/`, connect the authorized owner wallet and use `Prepare RLYA Mainnet`.

The staged sequence is:

1. create the RLYA mint with 9 decimals and no freeze authority;
2. mint exactly **839,000,000 RLYA** once;
3. initialize sale and founder-lock accounts while sale remains `DRAFT`;
4. fund all seven published allocation buckets;
5. permanently revoke RLYA mint authority;
6. re-check that freeze authority is absent.

The production token can exist at this stage without public trading being opened.

## Stage 7 — founder lock / PAUSED production sale

Use `Atomic activate + pause` so activation and pause are one Solana transaction. The founder's 365-day lock starts while the final committed sale state is `PAUSED`.

Public launch is still separate.

## Stage 8 — verify the clean PAUSED production state

For the delayed-allocation pre-launch model, do **not** run the legacy 1-USDC atomic smoke purchase before buyer distribution. That transaction would consume part of the same 100.68M presale inventory and move the buyer price curve.

Instead, require the clean production verification path:

- exact downloaded Mainnet executable byte/SHA equality;
- exact 839M production supply;
- mint authority removed;
- freeze authority absent;
- all seven allocation buckets reconciled;
- founder lock active;
- sale state PAUSED;
- production Program ID / mint / PDA / treasury identities verified;
- `scripts/verify_mainnet_public.mjs` passes in its clean pre-smoke state.

The old 1-USDC smoke tool remains available only for a later atomic-sale diagnostic when using it cannot steal inventory from pre-launch buyer allocations or silently move their curve. It is hidden in the owner console while `presaleMode` is `prelaunch-allocation`.

## Stage 9 — final pre-launch RLYA distribution

Before distribution:

1. close pre-launch allocation access;
2. export the final hashed delivery manifest;
3. keep the production sale PAUSED;
4. load that manifest into `Pre-launch RLYA distribution` in `/owner/`;
5. run the distribution preflight.

The preflight checks:

- manifest SHA-256;
- production Program ID / RLYA mint / deterministic sale PDA;
- connected owner equals on-chain admin;
- sale state is PAUSED;
- fixed 100.68M presale cap;
- official sale-vault inventory;
- existing on-chain delivery receipt PDAs;
- on-chain pre-launch metrics commitment matches the final manifest SHA-256 and expected totals.

Only still-pending allocations count toward a rerun preflight.

### Website-presale delivery

Website allocations use `deliver_prelaunch`:

- RLYA comes from the official sale vault;
- `total_sold` advances;
- previously verified gross USDC/referral totals are imported into production accounting;
- separate pre-launch metrics advance;
- locked referral attribution is recreated on-chain where required;
- deterministic web-delivery receipt PDA prevents duplicate delivery.

### Private/off-site delivery

Private/off-site allocations use the separate pre-launch manual delivery path:

- RLYA comes from the same official sale vault;
- `total_sold` advances;
- `manual_sold` advances;
- deterministic private/off-site delivery receipt PDA prevents duplicate delivery.

The owner tool uses small batches. If interrupted, rerun preflight; completed receipt PDAs are skipped.

## Stage 10 — public launch timing

Technical Mainnet readiness does not force launch timing. The public reveal stage can remain at `Mainnet verified`, `Distribution preparation` or another appropriate stage while marketing/community work continues.

When distribution has been completed and independently reconciled, public launch timing can be announced separately.

The post-launch atomic sale remains independently gated. Only when the launch decision is made should production addresses and reviewed configuration be finalized and the post-launch atomic purchase mode enabled/resumed.

## Post-launch atomic settlement

The already-built production sale path supports direct wallet settlement:

`USDC → RLYA in the same transaction`

with the same fixed curve and referral rules. It is the later token-sale mode, not the initial delayed-delivery pre-launch allocation mode.

## Ongoing admin controls

`/admin/` retains on-chain-authorized controls for:

- legitimate off-site sale/delivery from the official sale vault;
- pause/resume;
- close sale;
- withdraw unsold inventory after close;
- release founder allocation only after the on-chain lock expires.

The core long-term product remains the RALYA autonomous-work / AI-to-AI settlement layer; the broader Jobs/agent modules follow after the token and settlement foundation rather than being falsely presented as live during presale.
