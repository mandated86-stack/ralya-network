# RALYA / RLYA — master new-chat handoff

**Date:** 2026-08-15  
**Repository:** `mandated86-stack/ralya-network`  
**Source of truth:** current `main` branch. Do not rebuild from scratch. Inspect current files before modifying anything.

## 1. Project boundary

This document is for the **RLYA Coin/Network / RALYA blockchain project only**. Keep it strictly separate from the Ralya Protest App, ShadowScan, SignalHunter, NewsDesk and every other user project.

The owner is not a blockchain programmer and prefers clear, simple instructions and large checkpoints. Do most technical work directly through the connected GitHub/Netlify tools when safe. Do not repeatedly ask the owner to restate decisions already captured here.

Do not request seed phrases, private keys, recovery phrases or wallet/keypair JSON. If the owner offers one, say it is not needed and tell them not to post it.

The owner handles legal/regulatory matters independently. Do not repeatedly reopen compliance discussions unless the owner explicitly asks.

## 2. What RALYA is ultimately for

RALYA is intended as **economic settlement infrastructure for autonomous work / AI-to-AI commerce**.

Long-term concept:
- an AI agent, software system, machine or person can commission work from another;
- practical payment can settle in assets such as USDC;
- RLYA sits underneath as bonding, collateral, staking and economic accountability;
- future Jobs v1 can have buyer/agent lock USDC, provider lock RLYA bond, work happen off-chain, then payout/bond return or dispute/slash;
- arbitrary AI correctness cannot honestly be proven merely by hashing a result.

The Jobs/agent layer is **not being built now**. Current priority is website + pre-launch allocation/presale foundation, then later Mainnet/token distribution, then later the agent economy.

## 3. Fixed token/economic rules

Public project: **RALYA**  
Token: **RLYA**  
Current chain architecture: **Solana**

Hard rules:
- lifetime hard cap: **839,000,000 RLYA**;
- decimals: **9**;
- exactly 839M will eventually be minted once on production Mainnet;
- mint authority must then be permanently revoked;
- freeze authority must be absent before public sale activation;
- founder allocation: **10% = 83,900,000 RLYA**;
- founder production lock: **365 days**;
- no transfer tax, hidden minting, blacklist or arbitrary token controls.

Working allocation model:
- Founder 10% = 83.9M
- Public presale 12% = 100.68M
- Provider/security 25% = 209.75M
- Ecosystem/community 20% = 167.8M
- Protocol treasury 15% = 125.85M
- Liquidity 8% = 67.12M
- Future chain/security 10% = 83.9M

Only hard cap and founder 10% are treated as fully fixed unless owner explicitly changes another allocation before Mainnet.

The public homepage should not scream the founder's 10%; detailed tokenomics/whitepaper can disclose it properly.

## 4. Presale business rules

### Currency
- Crypto-only initially.
- **Canonical Solana USDC only** for the current Solana implementation.

### Public presale allocation
- Working pool: **100,680,000 RLYA**.

### Dynamic price curve
- Start: **$0.003000 per RLYA**.
- Increase: **+$0.000050 per 1,000,000 RLYA allocated/distributed**.
- 10M allocated -> $0.003500.
- 50M -> $0.005500.
- 100M -> $0.008000.

The price is driven by total RLYA allocated on the shared presale curve, not by arbitrary owner editing.

Website purchases and authorized private/off-site investor allocations consume the **same 100.68M pool** and move the **same curve**.

If an investor buys outside the website, the owner records that investor wallet + exact RLYA allocation. That allocation immediately consumes inventory and advances the public price. There is no separate arbitrary replacement price setter.

### Referral
- **1% = 100 bps** of gross USDC.
- Example: 500 USDC referred purchase = 5 USDC referrer + 495 USDC treasury; buyer gets normal RLYA quote.
- Referral paid in USDC, not extra RLYA.
- URL format: `?ref=<SOLANA-WALLET>`.
- First valid referrer becomes permanent for that buyer.
- Self referral blocked.
- Direct A->B->A two-wallet circular referral blocked.
- Gross USDC must equal treasury + referral.

### Refund product rule
The technical/product preference is no voluntary refund/claim path for confirmed purchases. Do not re-litigate legal/compliance in normal engineering work; the owner handles that separately.

## 5. Current presale model — delayed RLYA distribution

Do **not** assume presale buyers receive RLYA immediately.

Current model:

**real USDC payment now -> confirmed RLYA allocation/entitlement -> actual RLYA delivered before public token launch.**

Buyer-facing wording must be professional. Do not say the project cannot afford deployment, needs 3 SOL, token is fake, or use amateur wording such as "coin does not exist yet." Do not falsely claim production Mainnet/token is already live either.

Preferred language:
- Pre-launch Presale
- Allocation Confirmed
- Price locked at purchase
- Distribution Scheduled
- Mainnet Launch Preparation
- Pre-Launch Network Phase
- Launch Approaching

Buyer dashboard should communicate:
- USDC paid;
- purchase price;
- exact RLYA allocated;
- total expected RLYA for connected wallet;
- allocation confirmed;
- distribution scheduled before public launch.

## 6. What the pre-launch allocation software already does

Current 0.7.1 system is built around a separate pre-launch ledger and does not require production RLYA to exist yet.

Buyer flow:
1. connect Solana wallet;
2. sign harmless quote-authorization message;
3. backend creates short-lived quote reservation at an exact curve position;
4. buyer signs real Solana USDC payment;
5. backend independently reads/verifies the Solana transaction;
6. verify buyer signer, quote-specific RALYA memo, exact USDC debit and exact treasury/referral credits;
7. enforce final cap/concurrency conditions;
8. record exact RLYA allocation against wallet;
9. reconnecting wallet signs harmless ownership message and sees confirmed expected RLYA/history.

Important protections:
- exact integer/BigInt money/accounting;
- short reservations so casual typing does not move supply;
- one live reservation per wallet;
- one-use quote nonce;
- quote rate limiting;
- confirmation-time cap guard;
- owner/private allocation serialization against live quote reservations;
- buyer history requires wallet ownership signature;
- private owner reconciliation notes are not exposed publicly.

Public price/state refreshes in the browser and is derived from shared allocated inventory.

## 7. Owner pre-launch controls

Private `/owner/` console supports separate concerns.

### Public reveal stage
Owner-signed stage buttons:
- Pre-launch
- Mainnet preparation
- Mainnet verified
- Distribution preparation
- Distribution scheduled
- Launch approaching

These stages change public messaging only. They **do not** open purchases, deploy Mainnet, mint RLYA or move funds.

There is deliberately no automatic public "GO LIVE" tied to technical completion.

### Allocation-access controls
Owner-signed controls can:
- readiness preflight;
- OPEN pre-launch allocations;
- PAUSE new allocations;
- CLOSE new allocations;
- inspect totals;
- record authorized private/off-site investor RLYA allocation;
- look up buyer wallet;
- export final hashed delivery manifest.

**OPEN must fail** if backend Solana RPC or treasury USDC receiving account is not ready.

Current intended state while website/domain work continues: **CLOSED**.

### Treasury/referrer USDC account protection
The project treasury's canonical USDC receiving account should be prepared by the owner. Checkout should not surprise buyers by making them fund creation of project/referrer receiving accounts. Referrers prepare/activate their own USDC receiving account when appropriate.

## 8. Final pre-launch manifest and later delivery

When pre-launch fundraising is eventually finished:
- CLOSE new allocations;
- let all in-flight quote windows clear;
- export final hashed delivery manifest;
- manifest separates website allocations and genuine private/off-site allocations;
- includes website gross USDC/referral accounting and locked referrer/source identifiers;
- later commit expected manifest hash/totals on-chain;
- deliver website allocations through `deliver_prelaunch`;
- deliver genuine private/off-site allocations through `deliver_prelaunch_manual`;
- deterministic per-wallet receipt PDAs make reruns idempotent and prevent duplicate delivery.

The design keeps website-presale metrics separate from genuine manual/private allocations while advancing the single final `Sale.total_sold` curve.

Do **not** run the legacy owner-funded 1-USDC atomic Mainnet smoke purchase before delayed pre-launch distribution; it would consume presale inventory and shift the price curve. Use byte/state verification at that stage instead.

## 9. Current network/release state

Current release: **RLYA 0.7.1 pre-launch release**.

State:
- localhost protocol: VERIFIED;
- public Devnet core protocol: VERIFIED;
- pre-launch allocation software: RELEASE READY;
- production Solana Mainnet program: **NOT DEPLOYED — deliberately deferred**;
- production RLYA mint: **NOT CREATED — deliberately deferred**;
- pre-launch allocation access: **CLOSED by default / owner controlled**;
- post-launch atomic token sale: DISABLED;
- public token launch: NOT OPEN.

Do not start Mainnet just because deployment tooling exists. Current strategy is **website + pre-launch presale first, Mainnet later when sufficient presale progress/funding exists and owner chooses**.

## 10. Verified engineering foundation

Retained verified foundation includes:
- 57 deterministic tests;
- 50,000-operation randomized sale/referral stress test;
- Rust/Solana source and launch-safety audit;
- Solana 3.1.10 and Anchor CLI 1.0.2 pinned;
- stack-frame rejection above 4,096 bytes;
- real SBF build;
- localhost integration for initialize/activation guards, direct/referral purchase, manual distribution, pause/resume, authority checks and abuse guards;
- 500 USDC referral example verified as 5 USDC referrer + 495 USDC treasury;
- 2,000,000 manual RLYA distribution tested to move price $0.003000 -> $0.003100;
- pre-launch reconciliation instructions/metrics;
- final manifest commitment path;
- idempotent per-wallet delivery receipts;
- self-hosted/pinned browser blockchain dependencies;
- production web/function compile gates.

### Devnet evidence — test only
- Program: `Dk5eeCK6KmYY4b6pQkCRpfbZViwEjYJLryjZoUgBxsHN`
- Test RLYA: `3K3AWEJaJ7sqYB926CitbRaBnPn6cyiC8WPsEe1N6Uii`
- Test USDC: `BHAVfo4QzXKoRhNrinficvotonPyhuWQNYhwFn5XNdvW`
- Sale PDA: `ASgQBY5NPHHcuXNDWaDSD4wX8MiZ57JdUjzFvzxtejDg`
- Devnet evidence run: `31778172257`
- marker: `RALYA_DEVNET_PROTOCOL_INTEGRATION=PASS`

Do not repeat faucet/Devnet work unless there is a real reason.

## 11. Deferred Mainnet deployment information

The local secure deployment flow exists but is **not the current next action**.

Latest 0.7 cost preflight retained for later:
- program bytes: **513,464**;
- SBF SHA-256: `afe98cf00bab2e7be0c10e40d8e9a7b396c8feac59045f9f07a8d4ad5017cb1c`;
- program rent estimate: **3.574600320 SOL**;
- recommended dedicated payer estimate: **3.674600320 SOL**;
- Actions run: `31865784917`.

When owner eventually chooses Mainnet:
1. generate permanent Program ID locally;
2. generate separate upgrade authority locally;
3. generate dedicated deployment payer locally;
4. back up all three private JSON files offline;
5. never send private files to ChatGPT/GitHub/cloud;
6. run final live cost calculation;
7. deploy and download/verify exact executable bytes/SHA;
8. transfer upgrade authority away from payer;
9. create production mint with 9 decimals and no freeze authority;
10. mint exactly 839M;
11. create/fund seven allocation buckets;
12. founder 83.9M 365-day lock;
13. revoke mint authority;
14. initialize production sale using real USDC/treasury;
15. keep production sale PAUSED through verification;
16. reconcile/deliver pre-launch allocations before public token launch.

Disabled phone/cloud deployment workflow must remain disabled because ephemeral cloud production keys are unacceptable.

## 12. Website and Netlify

Netlify project: **`ralya-network`**  
Site ID: `aeca50d3-428e-4300-9c7f-668d219dc0bc`  
Current fallback URL: `https://ralya-network.netlify.app`  
GitHub default branch: `main`

Current web config includes:
- build `0.7.1-prelaunch-release`;
- launch phase `pre-launch`;
- presale mode `prelaunch-allocation`;
- post-launch `presaleEnabled: false`;
- Solana Mainnet network/RPC;
- canonical Solana USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;
- hard cap/presale cap/price/referral rules;
- production `rlyaMint`, `saleProgramId`, `salePda`, `treasuryWallet` blank until actual Mainnet evidence exists.

Netlify runtime has `RALYA_SOLANA_RPC` configured to Solana Mainnet. Owner OPEN preflight still verifies live readiness rather than trusting configuration blindly.

Do not manually upload only `web/` to Netlify: the pre-launch backend uses Netlify Functions outside that folder. The Git-connected Netlify project is the safe production deploy path.

## 13. Domain status

As of this handoff, the owner could not get `ralya.com` and is **in the process of buying `ralyaa.com` at Namecheap**. Purchase was not yet confirmed when this handoff was written.

Namecheap extras are not required for the current architecture: no Namecheap hosting, paid SSL, PremiumDNS, WordPress hosting or SiteLock is needed just to run the existing Netlify site.

After owner confirms purchase:
1. Netlify -> `ralya-network` -> Domain management;
2. add `ralyaa.com` as a domain already owned;
3. follow Netlify DNS instructions / use Netlify DNS as chosen;
4. make the custom domain primary after HTTPS is ready;
5. update public canonical project URL/metadata in repo where appropriate;
6. verify homepage, owner page/API and wallet flow under the custom domain;
7. keep allocation access CLOSED until owner explicitly decides to open it.

## 14. Fast website-edit system — use this in the next chat

This is specifically designed so a one-line web edit does not become a one-hour GitHub/Solana job.

### Lane 0: instant live copy
`/owner/` -> **Live website copy editor**.

Owner signs a harmless message. Approved text overrides are stored in Netlify Blobs and public pages apply them on refresh. No GitHub commit and no site rebuild. Financial/protocol values are not editable through this path.

### Lane 1: tiny permanent copy
Permanent marketing text is centralized in:

`web/site-copy.json`

If the user asks to alter copy and the field exists there, change **only that file**. The **Copy release** workflow performs only JSON validation + live-copy boundary audit. It does not install dependencies, stress test or build Solana.

### Lane 2: website/layout/function edit
HTML/CSS/JS/Netlify-function changes use the **Web release** workflow only. It runs web/function/economic safety checks but never the Solana SBF build. Node dependencies are cached. Newer runs cancel older in-progress web runs.

### Lane 3: protocol/economic change
Only genuine protocol/token/economic/security changes use the full repository/Solana build path.

**Future-chat rule:** do not run/await the heavy Solana path for a copy-only change.

See `docs/FAST_WEBSITE_EDITING.md`.

## 15. Website wording/brand rules

Public site should feel like a serious protocol/company, not a meme token.

Avoid:
- "fake coin";
- "we need SOL";
- "we need buyer money to deploy";
- "coin not created yet" as blunt buyer-facing wording;
- pretending production Mainnet/token exists when it does not;
- 1000x/meme-style promises;
- prominently screaming the founder 10% allocation on homepage.

Use:
- Pre-launch Presale;
- Mainnet Launch Preparation;
- Allocation Confirmed;
- Distribution Scheduled;
- fixed supply / transparent curve;
- autonomous work / AI-to-AI economic settlement;
- technical milestones separate from public launch timing.

Current whitepaper target on site: **RALYA Whitepaper v1.2 HTML**. An older v1.1 PDF remains in repo; do not accidentally relink public UI to stale wording.

## 16. Public owner wallet

Configured public owner wallet:

`BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo`

It is already recorded in `mainnet/OWNER_WALLET.txt`. Do not ask for it again while the Solana architecture remains current.

## 17. What the next chat should do first

The owner's immediate intention after opening the new chat is **website review/editing**, while the domain purchase is being completed.

Next-chat sequence:
1. read this handoff and current `main` before coding;
2. ask the owner/show the current website only as needed for the specific requested edits;
3. use the fast-edit lanes above;
4. when `ralyaa.com` purchase is confirmed, connect/update the custom-domain references;
5. keep pre-launch allocation access CLOSED during website polish unless owner explicitly says to open it;
6. later prepare treasury USDC receiving account + owner-signed readiness check;
7. open real pre-launch allocations only when owner explicitly chooses;
8. do **not** start Mainnet deployment yet.

## 18. Files that may be stale

Some older historical files can lag the current release. Prefer current source + `docs/BUILD_STATUS.md` + this handoff. Be cautious with:
- old `BUILD_MANIFEST.json` release labels;
- old `RELEASE_VERIFICATION.md` wording;
- old release notes;
- v1.1 whitepaper PDF;
- any old instruction that says Mainnet deployment is the immediate next step.

`NEXT_OWNER_ACTIONS.txt` has been rewritten with the current presale-first order.

---

**Core one-line summary:** RALYA 0.7.1 is a Solana-based pre-launch USDC allocation system for a future fixed-supply RLYA settlement/bonding asset; the website/presale comes first, buyers receive confirmed RLYA entitlements now and tokens before public launch, shared public/private allocations drive one fixed price curve, Mainnet creation is deliberately postponed, and website edits now have fast copy/web lanes so they never need a Solana rebuild unless protocol economics actually change.
