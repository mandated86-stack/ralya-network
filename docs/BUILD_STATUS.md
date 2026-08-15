# Build status — RLYA 1.0.0 pre-launch presale

## Current product position

RALYA is building economic settlement infrastructure for autonomous work. The current production focus is the public website and the **pre-launch USDC presale allocation layer**. The later RLYA production Mainnet token launch is a separate phase and has **not** happened.

The website can correctly show **RLYA PRESALE • LIVE** after owner-signed presale access is `OPEN`, even though the production RLYA mint/program and public token Day 0 remain later milestones.

## Fixed presale economics

- lifetime hard cap: **839,000,000 RLYA**
- public presale base allocation: **288,000,000 RLYA**
- dedicated Buy + Stake bonus reserve: **14,400,000 RLYA** inside the same fixed lifetime supply
- starting presale price: **$0.003000 / RLYA**
- Buy + Stake bonus: **fixed +5% RLYA**, with no extra minting
- Standard buyer release: **actual purchased RLYA 1 day before public token launch (T-1)**
- Buy + Stake release: **base allocation + fixed 5% bonus unlock together 21 days after public launch (T+21)**
- first confirmed public-presale purchase locks that wallet to Standard or Buy + Stake for later public-presale purchases
- referral: **1% of gross referred USDC**
- confirmed on-chain presale purchases are final; **no buyer refund path**
- founder allocation: **83,900,000 RLYA (10%)**
- founder lock: **365 days beginning from actual public RLYA token Day 0**

Presale pricing follows the reviewed deterministic demand-based curve. The exact internal step mechanic is intentionally not used as public marketing copy.

## Pre-launch buyer flow

When owner-signed allocation access is `OPEN`:

1. the buyer connects a Solana wallet;
2. the buyer signs a harmless quote-authorization message;
3. the backend locks an exact short-lived allocation quote;
4. the buyer signs the real Solana USDC transaction;
5. the backend independently verifies the confirmed transaction, signer, RALYA memo and exact USDC balance changes;
6. the expected RLYA allocation is recorded against that wallet;
7. reconnecting the same wallet can display its confirmed allocation and release policy.

The public website does not represent pre-launch RLYA as already transferred.

## Runtime / reliability work in the 1.0.0 presale-stability pass

- `/api/presale/state` is hardened so Netlify Blob/runtime initialization failures are caught inside the request handler and return a **fail-closed CLOSED state**, rather than allowing an uncaught platform error to become the buyer experience.
- Browser Solana reads are routed through a narrow same-origin server RPC proxy instead of exposing the dedicated provider credential in public JavaScript.
- Production server-side Solana operations require the configured dedicated `RALYA_SOLANA_RPC` endpoint.
- The public buyer UI remains disabled whenever live backend state cannot be verified.
- The large public status treatment uses **FINAL SETUP / LIVE / PAUSED**, with a small reconnect line during temporary state loss instead of a giant `STATUS UPDATING` card.

## Wallet connection

The website now uses a Wallet Standard–based connection layer with persistent wallet state and a professional chooser. The intended priority is to connect in the browser the user started from whenever the wallet exposes a compatible interface. Explicit mobile wallet-app handoff is a fallback rather than the first action.

Targeted wallet paths include Phantom, Solflare, Trust Wallet, MetaMask-compatible Solana support and other Wallet Standard–compatible wallets. WalletConnect QR support remains dependent on configuring a WalletConnect project ID and is not claimed as production-tested until that is done.

## Owner opening gate

Presale access remains fail-closed until all of the following are true:

- a dedicated production-capable Solana Mainnet RPC is configured in Netlify;
- the server can reach Solana Mainnet through that RPC;
- the configured treasury USDC associated token account exists and passes mint/owner verification;
- owner opening preflight returns `READY`;
- the owner explicitly signs the `OPEN` action.

Browser checkout capability by itself does **not** mean the presale is live.

## Existing protocol foundation retained

The existing deterministic economic tests, randomized stress tests, Solana/Anchor program work, Devnet evidence, source/security audits, fixed-supply checks, referral protections, owner controls and later Mainnet tooling remain in the repository. This website/presale pass does not replace or trigger the later Mainnet phase.

Public Devnet evidence remains test-only and must never be presented as a production address.

## Current network / release state

- canonical public website: **https://ralyaai.com**
- website phase: **PRE-LAUNCH PRESALE / FINAL SETUP** until owner-signed access is opened
- pre-launch allocation access: **CLOSED unless owner explicitly opens it after preflight**
- post-launch atomic RLYA sale: **DISABLED**
- production RLYA mint: **NOT CREATED**
- production sale Program ID: **NOT DEPLOYED**
- production sale PDA: **NOT CREATED**
- public RLYA token Day 0: **NOT MARKED**
- founder one-year lock: **NOT STARTED**
- public token status: **BUILDING TOWARD MAINNET**

## Remaining operating checkpoints

1. configure a free dedicated Solana Mainnet RPC and keep its credential server-side;
2. verify the treasury USDC receiving account;
3. run owner opening preflight and require `READY`;
4. verify the wallet chooser and buyer UI on real Android browser/wallet combinations;
5. after all checks are green, owner signs presale access `OPEN`;
6. verify the public site changes to **RLYA PRESALE • LIVE**;
7. execute one controlled small real-USDC purchase from a **non-owner buyer wallet** and verify quote → transaction → backend confirmation → expected allocation → correct T-1/T+21 policy → reconnect/history, plus referral attribution if included;
8. only then broaden public promotion.

## Explicitly not part of this pass

This pass does **not** create the production RLYA mint, deploy the production sale program/PDA, mark public token Day 0, start the founder lock, implement a future 12% investor allocation, launch the future sovereign RALYA chain or add future RALYA Jobs transaction-fee economics.
