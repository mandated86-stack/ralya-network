# RALYA / RLYA — authoritative new-chat handoff

**Date:** 15 August 2026  
**Repository:** `mandated86-stack/ralya-network`  
**Default branch:** `main`  
**Project:** RALYA  
**Token:** RLYA

> This handoff is for the **RLYA Coin/Network blockchain project only**. Keep it strictly separate from the unrelated **Ralya Protest App**, ShadowScan, SignalHunter, NewsDesk and every other project.

## 1. Owner working style / operating rules

- Owner is nontechnical and wants simple, exact instructions rather than blockchain jargon.
- Assistant should do as much technical work as possible through connected GitHub/Netlify tools and use large checkpoints instead of many tiny manual steps.
- Never rebuild the project from scratch without a strong reason. Inspect current `main` first and extend the existing implementation.
- Never ask for or accept seed phrases, private keys or wallet JSON files. Public wallet addresses are enough for coordination.
- Do not re-enable ephemeral/cloud Mainnet deployment keys.
- Owner is handling legal/regulatory requirements separately and does not want repeated legal reminders unless explicitly asked.
- No Mainnet deployment now. The current strategy is **pre-launch fundraising/allocation first; permanent Mainnet deployment later after sufficient presale progress and when the owner chooses**.

## 2. Core reason RALYA exists

RALYA is intended as **economic settlement infrastructure for autonomous work / AI-to-AI commerce**.

Long-term idea:

- an AI agent, software service, machine or person can commission work from another;
- practical payment can settle in assets such as USDC;
- RLYA supplies the economic-security layer: bonding, collateral, staking and accountability;
- later Jobs v1 can allow buyer/agent to lock payment, provider/agent to lock an RLYA bond, work to happen off-chain, then payout/bond return or dispute/slash rules to execute;
- do not claim arbitrary AI correctness can be proven merely by hashing a result.

**Important:** the Jobs/AI-agent layer is a later roadmap item. Do not build or present it as live now. The current priority is token economics, pre-launch allocation, website, distribution preparation and launch infrastructure.

## 3. Chain / token hard rules

Current chain architecture: **Solana**.

Hard token rules:

- lifetime hard cap: **839,000,000 RLYA**
- decimals: **9**
- no intended post-launch inflation
- production sequence eventually mints exactly 839M once, then permanently revokes mint authority
- freeze authority absent before sale activation
- founder allocation: **10% = 83,900,000 RLYA**
- founder initial lock: **365 days**
- no transfer tax
- no blacklist
- no hidden minting
- no arbitrary public price setter
- no voluntary buyer refund/claim/cancel path in the product design

Working allocation model:

- Founder — 10% — 83.9M
- Public presale — 12% — 100.68M
- Provider/security — 25% — 209.75M
- Ecosystem/community — 20% — 167.8M
- Protocol treasury — 15% — 125.85M
- Liquidity — 8% — 67.12M
- Future chain/security — 10% — 83.9M

Only the 839M hard cap and founder 10% are fully fixed unless owner explicitly changes other allocations before Mainnet.

Public homepage should **not scream the founder's 10%**. Detailed tokenomics/whitepaper can disclose it appropriately.

## 4. Presale economics — fixed behavior

Initial presale is **crypto-only** and currently **Solana USDC only**.

Price curve:

- starting price: **$0.003000 / RLYA**
- price increases **$0.000050 for every 1,000,000 RLYA allocated/distributed**
- 10M allocated => $0.003500
- 50M allocated => $0.005500
- 100M allocated => $0.008000
- calculations use exact integer/BigInt accounting, not floating-point money
- buyer quote/minimum-output protections are required

Shared curve rule:

- website presale allocations and authorized private/off-site investor allocations consume the **same 100.68M RLYA presale pool**;
- both advance the **same fixed curve**;
- private/off-site owner action records an exact RLYA amount, **not an arbitrary replacement price**;
- therefore a private 1M RLYA allocation immediately advances the public curve by one price step.

Referral rules:

- fixed **1% = 100 bps** of referred gross USDC
- example: 500 USDC => 5 USDC referrer, 495 USDC treasury
- buyer receives the normal RLYA quote; referral is not an extra buyer surcharge
- referral payout is USDC, not extra RLYA
- referral links use `?ref=<SOLANA-WALLET>`
- first valid referral attribution is permanent/locked
- self-referral blocked
- direct A->B->A two-wallet circular referral blocked
- gross = treasury + referral invariant

## 5. Current presale model — delayed RLYA distribution

Do **not** revert to the old assumption that presale buyers receive RLYA immediately.

Current intended public flow:

**real USDC now -> confirmed RLYA allocation -> actual RLYA delivered before public token launch**.

The website must never pretend a token transfer already happened when it did not.

Professional wording should use ideas such as:

- RALYA Pre-Launch Presale
- Secure your RLYA allocation ahead of public launch
- Allocation Confirmed
- Distribution Scheduled
- Mainnet Launch Preparation / Pre-Launch Network Phase

Avoid amateur/internal wording such as:

- “coin is not created yet”
- “we need SOL”
- “funding deployment”
- “fake coin”
- wording suggesting the project cannot afford deployment

Presale proceeds may later fund necessary launch infrastructure, but that is an internal financing fact and is not buyer-facing marketing copy.

## 6. Pre-launch allocation system — BUILT

Current release: **RLYA 0.7.1 pre-launch release**.

The pre-launch allocation software is already built and verified.

Buyer flow:

1. connect Solana wallet;
2. sign harmless quote-authorization message;
3. backend locks an exact short-lived curve position and RLYA allocation;
4. buyer signs the real Solana USDC transaction;
5. backend independently verifies confirmed transaction, signer, quote-specific RALYA memo and exact USDC balance changes;
6. exact RLYA allocation is stored against buyer wallet;
7. reconnecting the same wallet shows confirmed expected RLYA and purchase history;
8. actual token distribution remains scheduled before public launch.

Protections already implemented:

- real Solana Mainnet USDC only
- exact BigInt pricing
- short quote reservations
- signed quote requests before reservation
- one-use quote nonces
- quote rate limiting
- one live reservation per buyer wallet
- quote-specific transaction memo verification
- buyer must be transaction signer
- buyer debit must equal locked gross amount
- treasury/referrer credits must exactly reconcile
- first confirmed referral attribution locked
- self/circular referral protections
- confirmation-time presale-cap guard
- authenticated buyer allocation lookup via harmless wallet ownership signature
- private owner notes not exposed to public buyer endpoint
- atomic/concurrency protection around ledger mutations

## 7. Owner pre-launch controls — BUILT

Private `/owner/` console separates three things.

### Public reveal stage

Owner-signed marketing/status stages:

1. Pre-launch
2. Mainnet preparation
3. Mainnet verified
4. Distribution preparation
5. Distribution scheduled
6. Launch approaching

Changing this status **does not** open sales, deploy Mainnet, mint RLYA or execute blockchain transactions.

This lets technical work finish privately while public launch/hype timing remains under owner control.

### Allocation access

Separate owner-signed controls support:

- opening readiness preflight
- OPEN new pre-launch allocations
- PAUSE new allocations
- CLOSE allocations
- public totals
- authorized private/off-site investor allocation
- buyer wallet lookup
- recent allocation inspection
- final hashed delivery manifest export

Opening is protected: backend checks the Solana RPC and treasury USDC receiving account before it accepts OPEN.

**Do not automatically open real-money access.** Owner chooses when to OPEN.

### Future distribution

Final delivery manifest distinguishes per wallet:

- website-presale RLYA
- private/off-site RLYA
- verified website gross USDC
- referral USDC
- locked referrer
- source transaction identifiers

## 8. Mainnet reconciliation / distribution path — BUILT IN SOURCE, NOT DEPLOYED

The production sale program retains its core `Sale` layout and adds separate pre-launch reconciliation/receipt accounts.

Later migration path:

- `initialize_prelaunch_metrics`
- `import_prelaunch_referral`
- `deliver_prelaunch` for website presale allocations
- `deliver_prelaunch_manual` for genuine private/off-site allocations
- delivery receipt PDAs make distribution idempotent and allow safe reruns without double delivery

Website pre-launch deliveries advance final `Sale.total_sold` and import already-paid gross/referral USDC accounting. Private/off-site deliveries additionally advance the existing manual counter.

Final distribution should happen from the official sale vault before public token launch.

## 9. Existing verified Solana foundation

Verified engineering retained:

- 57 deterministic tests
- 50,000-operation randomized sale/referral stress test
- source/launch-safety audits
- Solana **3.1.10** pinned
- Anchor CLI **1.0.2** pinned
- CI rejects Solana stack frame warnings above 4,096 bytes
- full disposable localhost validator integration
- direct purchase/referral/manual sale/pause/resume/founder-lock/supply guards
- 500 USDC referred test => 5 USDC referrer + 495 USDC treasury
- tested manual distribution of 2M RLYA moved price $0.003000 -> $0.003100
- exact 839M supply verification in tests
- mint/freeze authority checks

Public Devnet evidence — TEST ONLY:

- Program: `Dk5eeCK6KmYY4b6pQkCRpfbZViwEjYJLryjZoUgBxsHN`
- test RLYA mint: `3K3AWEJaJ7sqYB926CitbRaBnPn6cyiC8WPsEe1N6Uii`
- test USDC mint: `BHAVfo4QzXKoRhNrinficvotonPyhuWQNYhwFn5XNdvW`
- sale PDA: `ASgQBY5NPHHcuXNDWaDSD4wX8MiZ57JdUjzFvzxtejDg`
- Actions run: `31778172257`
- marker: `RALYA_DEVNET_PROTOCOL_INTEGRATION=PASS`

Never present Devnet addresses as production addresses.

## 10. Mainnet status — DELIBERATELY DEFERRED

Production Solana Mainnet program is **not deployed**.

Production RLYA mint is **not created**.

Production website config intentionally has blank:

- `rlyaMint`
- `saleProgramId`
- `salePda`
- post-launch `treasuryWallet`

Post-launch atomic sale master switch is OFF.

Do not start Mainnet deployment merely because scripts exist. Owner explicitly chose to delay Mainnet until sufficient pre-launch progress/presales and later launch timing.

Latest known 0.7 Mainnet cost preflight (informational only; do not fund now):

- program size: **513,464 bytes**
- binary SHA-256: `afe98cf00bab2e7be0c10e40d8e9a7b396c8feac59045f9f07a8d4ad5017cb1c`
- program rent estimate: **3.574600320 SOL**
- recommended dedicated payer balance then: **3.674600320 SOL**

Recalculate live before any future funding because costs can change.

### Secure future local deployment design

When owner eventually chooses Mainnet, use owner-controlled local scripts:

- Windows: `scripts/mainnet_program_deploy.ps1`
- macOS/Linux: `scripts/mainnet_program_deploy.sh`

They create three separate local private identities:

- permanent RALYA Program ID keypair
- separate upgrade-authority keypair
- dedicated Mainnet deployment payer keypair

Owner backs up those private JSON files offline. They are never uploaded to GitHub or ChatGPT.

The old phone-first GitHub runner deployment was identified as unsafe because ephemeral keys could disappear after funding/deploy. It is disabled and **must not be re-enabled**.

## 11. Public owner wallet

Public owner wallet currently configured:

`BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo`

This public address is safe to use in configuration and signing verification. Do not ask owner for its seed/private key.

## 12. Website / Netlify state

Netlify project: **`ralya-network`**  
Site ID: `aeca50d3-428e-4300-9c7f-668d219dc0bc`  
Current Netlify URL: `https://ralya-network.netlify.app`

Repository/Netlify are Git-connected. Normal production releases should update `main`; Netlify deploys the complete website and its serverless functions.

Do **not** manually upload only the `web/` folder for a presale release because financial verification functions live under `netlify/functions/`.

Netlify runtime currently has `RALYA_SOLANA_RPC` configured to Solana Mainnet RPC. Owner OPEN preflight still validates the RPC and treasury receiving account before enabling allocations.

Website positioning:

- serious infrastructure/protocol, not meme-coin/1000x language
- AI-to-AI/autonomous settlement is the long-term purpose
- public token/hype timing separate from technical readiness
- fixed-supply story
- transparent stepped presale pricing
- current Whitepaper link: `RALYA_Whitepaper_v1.2.html`
- founder 10% not prominently marketed on homepage
- no simulated production balances/purchases

## 13. NEW fast website editing system

Permanent rule: ordinary website edits must not trigger the full Solana release process.

### Lane A — instant text changes

`/owner/` contains **Live website copy editor**.

It uses owner-wallet message signing + site-scoped Netlify Blobs.

Approved plain-text changes:

- require no GitHub commit
- require no Netlify redeploy
- require no Solana build
- are visible immediately to new visitors
- refresh on already-open pages about every 30 seconds while visible
- can be reset back to version-controlled defaults

Live editor is allowlisted and cannot modify financial/protocol/security settings.

See `docs/WEB_FAST_EDIT_SYSTEM.md`.

### Lane B — HTML/CSS/JS/layout edits

Use `.github/workflows/web-release.yml`.

It runs only the website/function/economic safety checks and browser bundle. It does **not** rebuild Solana or run the full blockchain stress/protocol suite for normal web edits.

Rapid successive website pushes cancel stale in-progress web releases.

### Lane C — protocol changes

Use full `Repository checks` / `Build` only for actual Solana program, tokenomics, economic/security, Mainnet-script or protocol-test changes. Repository checks are path-filtered so a normal website change does not invoke the full suite.

## 14. Domain status

Owner could not get the preferred `ralya.com` and is currently buying **`ralyaa.com`** through Namecheap.

At the screenshot stage:

- first-year domain registration about **€9.75**
- ICANN fee about **€0.17**
- domain privacy free
- no Namecheap hosting, SSL certificate, PremiumDNS, VPN, email, SiteLock or other paid add-ons are needed for the RALYA site
- Netlify remains the host and provides HTTPS after custom-domain connection

**Domain is not yet considered connected until owner confirms purchase and the DNS/custom-domain step is completed.**

Next domain task after purchase:

1. add `ralyaa.com` as custom domain to Netlify project `ralya-network`;
2. follow Netlify DNS instructions / update Namecheap DNS as required;
3. wait for HTTPS provisioning;
4. update website canonical/project/OG URLs from the Netlify subdomain to `https://ralyaa.com`;
5. keep the Netlify subdomain working as fallback.

## 15. Current public-sale state

- informational website: can be public
- pre-launch allocation software: release ready
- allocation access: **CLOSED by default / owner controlled**
- production Mainnet RLYA: not created
- post-launch atomic sale: disabled
- public token launch: not open

Do not confuse **website live** with **presale OPEN**, and do not confuse **presale OPEN** with **token/Mainnet launch**. They are separate states.

## 16. What is next in the new chat

Immediate sequence:

1. confirm `ralyaa.com` purchase and connect it to the existing Netlify project;
2. perform the owner's requested website wording/design edits using the new fast editing workflow;
3. keep allocations CLOSED while visual/copy work is happening unless owner explicitly says to open them;
4. when owner is ready for real presale, prepare/verify the treasury USDC receiving account and run owner-signed OPEN readiness preflight;
5. only then OPEN pre-launch allocations when owner explicitly chooses;
6. operate website + authorized private/off-site allocations against the shared price curve;
7. build hype/public status gradually using owner reveal-stage controls — there is no need to rush public token launch;
8. later, after sufficient presale progress and owner decision, return to permanent Mainnet deployment/token creation/distribution sequence;
9. one day / scheduled period before public launch, deliver confirmed RLYA allocations according to final manifest and verify receipts/accounting;
10. public launch only when owner chooses; post-launch can later switch to the already-built atomic USDC -> RLYA sale path.

## 17. Main later-launch sequence (do not execute now)

When explicitly authorized later:

1. generate permanent local Program ID / upgrade authority / dedicated payer
2. offline-backup all three private files
3. recalculate current Mainnet deployment cost
4. deploy verified program
5. verify downloaded executable hash/bytes
6. transfer upgrade authority away from payer
7. create production RLYA mint, 9 decimals, no freeze authority
8. mint exactly 839M
9. create/fund all seven allocation buckets
10. founder 83.9M 365-day lock
11. fund official 100.68M sale vault if unchanged
12. permanently revoke mint authority
13. initialize real-USDC sale state
14. activate into PAUSED state without consuming presale inventory
15. close pre-launch ledger when appropriate and export final manifest
16. commit/import pre-launch accounting
17. distribute website/private allocations with idempotent receipts
18. independently verify supply, authorities, allocations and imported accounting
19. publish signed production Program ID/mint/PDA/treasury/evidence
20. update website production addresses
21. choose public reveal/launch timing separately

Legacy 1-USDC atomic smoke purchase is **not** part of delayed-allocation pre-launch migration because it would consume inventory and move the curve. Keep it deferred for later atomic-sale diagnostics.

## 18. Source-of-truth files to inspect first in a new chat

Always read current `main` before changing anything. Useful files:

- `docs/BUILD_STATUS.md`
- `docs/HANDOFF_NEW_CHAT_2026-08-15.md` (this file)
- `docs/WEB_FAST_EDIT_SYSTEM.md`
- `web/site-config.js`
- `web/index.html`
- `web/site-copy.json`
- `web/site-content.js`
- `web/owner/site-copy-control.js`
- `web/owner/presale-control.js`
- `web/owner/status-control.js`
- `netlify/functions/site-content.mts`
- `netlify/functions/presale-state.mts`
- `netlify/functions/presale-quote.mts`
- `netlify/functions/presale-confirm.mts`
- `netlify/functions/presale-wallet.mts`
- `netlify/functions/presale-owner.mts`
- `programs/rlya_sale/src/lib.rs`
- `tokenomics/GENESIS_ALLOCATION.json`
- `.github/workflows/web-release.yml`
- `.github/workflows/check.yml`
- `.github/workflows/build.yml`

## 19. Non-negotiable continuity reminders

- RALYA / RLYA Coin/Network is not the Ralya Protest App.
- AI-to-AI economic settlement is the core long-term purpose.
- Do not build Jobs/AI-agent execution layer now.
- Do not deploy Mainnet now.
- Do not reopen phone/cloud-key Mainnet deployment.
- Do not ask for secrets.
- Do not replace the fixed public curve with an arbitrary admin price setter.
- Website + private investor allocations must share one curve and one 100.68M pool.
- Buyer sees expected/allocated RLYA until distribution; do not falsely show token received.
- Actual RLYA distribution occurs before public launch.
- Public technical stage and allocation OPEN/CLOSED are separate controls.
- Website wording must remain professional and not expose internal financing needs.
- For tiny copy changes, use Live Website Copy Editor first; for design/code changes use fast Web release; full Solana CI only for protocol work.
