# Build status — RLYA 0.7.1 pre-launch release

## Product position

RALYA is being built as economic settlement infrastructure for autonomous work. The long-term protocol is intended to let AI agents, software, machines and people commission work from one another, settle practical payments such as USDC and use RLYA for bonding, collateral, staking and economic accountability. The broader Jobs/AI-agent layer is a later release; it is not represented as live today.

## Fixed economics

- lifetime hard cap: **839,000,000 RLYA**
- decimals: **9**
- founder allocation: **83,900,000 RLYA (10%)**
- founder production lock: **365 days**
- working public-presale pool: **100,680,000 RLYA (12%)**
- starting presale price: **$0.003000 / RLYA**
- price step: **+$0.000050 per 1,000,000 RLYA allocated/distributed**
- referral rate: **1% of referred gross USDC**
- no arbitrary owner public-price setter
- no voluntary refund/claim path

Website purchases and authorized private/off-site allocations consume the same 100.68M pool and advance the same fixed curve.

## Pre-launch allocation layer

RLYA 0.7.1 operates a separate pre-launch allocation mode. It does not replace the already-built post-launch atomic sale path.

During pre-launch allocation mode:

1. buyer connects a Solana wallet;
2. buyer signs a harmless quote-authorization message;
3. the backend locks an exact short-lived curve position and RLYA allocation;
4. buyer signs the real Solana USDC transaction;
5. the backend independently verifies the confirmed transaction, signer, RALYA quote memo and exact USDC balance changes;
6. the exact RLYA allocation is recorded against that wallet;
7. reconnecting the same wallet shows its confirmed expected RLYA;
8. actual RLYA distribution remains scheduled before public token launch.

The public website does not represent pre-launch RLYA as already transferred.

### Pre-launch payment/referral protections

- real Solana Mainnet USDC only
- exact BigInt pricing/accounting; no floating-point money calculations in the backend
- short quote reservations prevent buyers from receiving a stale curve position
- buyer signs the quote request before a reservation is created
- quote nonces are one-use
- quote requests are rate-limited
- one live reservation per buyer wallet
- the transaction must contain the quote-specific RALYA memo
- the buyer wallet must be a signer
- buyer USDC debit must equal the locked gross amount
- treasury/referrer credits must exactly reconcile to the quote
- first confirmed referral attribution is locked
- self-referral and direct two-wallet circular referrals are blocked
- confirmation-time presale cap guard remains authoritative
- opening allocation access now requires a server-side Solana RPC + treasury USDC receiving-account preflight

## Owner pre-launch controls

The private `/owner/` console separates three different concepts.

### Public reveal stage

Owner-signed public messaging stages:

- Pre-launch
- Mainnet preparation
- Mainnet verified
- Distribution preparation
- Distribution scheduled
- Launch approaching

Changing the public stage does **not** open presale/token trading or execute blockchain transactions.

### Pre-launch allocation access

Separately owner-signed controls can:

- run an opening readiness preflight;
- open new pre-launch allocations only when the Solana payment rail is ready;
- pause new allocations;
- close new allocations;
- inspect public totals;
- record an authorized private/off-site investor allocation;
- look up a buyer wallet;
- export the final hashed delivery manifest.

A private/off-site allocation enters an RLYA amount, not an arbitrary replacement price. It immediately consumes the shared presale pool and advances the fixed curve.

### Future distribution

The final delivery manifest separates per wallet:

- website-presale RLYA;
- genuine private/off-site RLYA;
- verified website gross USDC;
- website referral USDC;
- locked referrer;
- source transaction identifiers.

Private owner reconciliation notes are not exposed through the public buyer wallet endpoint.

## Mainnet reconciliation added in source

The production sale program keeps the existing `Sale` account layout and adds separate pre-launch reconciliation accounts/instructions.

The intended later production migration is:

- `initialize_prelaunch_metrics` creates a separate reconciliation PDA;
- `import_prelaunch_referral` recreates the buyer's locked pre-launch referral attribution on Mainnet;
- `deliver_prelaunch` delivers website-presale RLYA from the official sale vault, advances `Sale.total_sold`, imports the already-paid gross USDC/referral totals and increments separate pre-launch metrics;
- `deliver_prelaunch_manual` delivers genuine private/off-site pre-launch RLYA while advancing the existing `manual_sold` counter;
- deterministic web/manual delivery receipt PDAs make distribution idempotent so rerunning the distribution tool skips completed wallet allocations.

This preserves the distinction between public website presale and private/off-site allocation while keeping one final total-sold price curve.

## Existing verified protocol foundation retained

- 57 deterministic tests
- 50,000-operation randomized sale/referral stress run
- Rust/Solana source and launch-safety audit
- pinned Solana **3.1.10** / Anchor **1.0.2** toolchain
- CI stack-frame rejection above 4,096 bytes
- full localhost on-chain integration for initialize, activation gates, direct buy, referral buy, manual distribution and pause/resume
- 500 USDC referred test purchase reconciled to 5 USDC referrer + 495 USDC treasury
- 2,000,000 RLYA manual distribution advanced tested price from $0.003000 to $0.003100
- public Solana Devnet program deployment
- public Devnet core protocol integration
- fixed-supply authority checks
- protected post-launch atomic-sale master switch
- pinned/self-hosted production browser blockchain dependencies
- owner-controlled local Mainnet deployment scripts with exact executable byte/SHA verification
- staged Mainnet 839M token-preparation console retained but deliberately deferred
- atomic activate + pause founder-lock sequence retained for the later Mainnet checkpoint
- legacy owner-funded 1 USDC atomic Mainnet smoke tool retained for later atomic-sale diagnostics; it is not part of the delayed-allocation pre-launch sequence because it would consume presale inventory
- public-only Mainnet verifier

## Public Devnet evidence

- Program: `Dk5eeCK6KmYY4b6pQkCRpfbZViwEjYJLryjZoUgBxsHN`
- Devnet RLYA test mint: `3K3AWEJaJ7sqYB926CitbRaBnPn6cyiC8WPsEe1N6Uii`
- Devnet USDC test mint: `BHAVfo4QzXKoRhNrinficvotonPyhuWQNYhwFn5XNdvW`
- Devnet sale PDA: `ASgQBY5NPHHcuXNDWaDSD4wX8MiZ57JdUjzFvzxtejDg`
- Actions evidence run: `31778172257`
- marker: `RALYA_DEVNET_PROTOCOL_INTEGRATION=PASS`
- full reconciliation: `docs/DEVNET_PROTOCOL_EVIDENCE.md`

These are test-only assets and are never production addresses.

## Network / release state

- Localhost protocol: **VERIFIED**
- Public Devnet core protocol: **VERIFIED**
- Pre-launch allocation software: **0.7.1 RELEASE READY**
- Solana production Mainnet program: **NOT DEPLOYED — DELIBERATELY DEFERRED**
- Production RLYA mint: **NOT CREATED — DELIBERATELY DEFERRED**
- Pre-launch allocation access: **DEFAULT CLOSED; OWNER CONTROLLED**
- Post-launch atomic RLYA sale: **DISABLED**
- Public token launch: **NOT OPEN**

The informational website can be public while allocation access remains closed. Mainnet token creation is not required for the current pre-launch allocation phase.

## Remaining operating checkpoints

1. deploy the hardened 0.7.1 website with pre-launch allocation access CLOSED;
2. prepare/verify the configured treasury Solana USDC receiving account;
3. run the owner-signed opening preflight;
4. when the owner chooses, switch pre-launch allocation access to OPEN independently of token launch;
5. operate website and authorized private/off-site allocations against the same fixed curve;
6. later, after sufficient pre-launch progress and when the owner chooses, perform the separate permanent Mainnet deployment and fixed 839M token-creation sequence;
7. close pre-launch allocations before final distribution, let in-flight quote windows clear and export the final hashed delivery manifest;
8. distribute confirmed allocations before public launch using the already-built reconciliation/receipt path;
9. announce/publicly launch only when the owner chooses;
10. later switch from pre-launch allocation mode to the already-built atomic USDC → RLYA settlement mode.

No production Mainnet address is to be claimed until signed on-chain evidence exists.
