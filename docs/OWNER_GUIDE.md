# Owner guide — RALYA pre-launch presale

This guide covers the **website + pre-launch USDC presale phase only**. Production RLYA Mainnet deployment and public token Day 0 are a later phase.

Never send a seed phrase, recovery phrase, private key or production keypair JSON to ChatGPT, GitHub, email or cloud storage.

## 1. Keep the two launches separate

There are two different milestones:

1. **Pre-launch presale** — verified USDC purchases can be accepted and expected RLYA allocations recorded before the production RLYA token is publicly launched.
2. **RLYA public token Day 0** — later production Mainnet/token launch milestone.

When owner-signed presale allocation access is `OPEN`, the public website may correctly show **RLYA PRESALE • LIVE** even though RLYA public token Day 0 has not happened.

## 2. Fixed presale rules

- lifetime fixed supply: **839,000,000 RLYA**
- public presale base allocation: **288,000,000 RLYA**
- dedicated Buy + Stake bonus reserve: **14,400,000 RLYA** inside the same fixed lifetime supply
- starting price: **$0.003000 / RLYA**
- Buy + Stake: **fixed +5% RLYA**, no extra minting
- Standard: actual purchased RLYA is released **1 day before public token launch (T-1)**
- Buy + Stake: base allocation + fixed 5% bonus unlock together **21 days after public launch (T+21)**
- the first confirmed public-presale purchase locks that wallet to Standard or Buy + Stake for later public-presale purchases
- referral: **1% of gross referred USDC**
- buyer pays the normal amount and keeps the full expected RLYA allocation; referral payout does not reduce the buyer allocation or staking bonus
- confirmed on-chain presale purchase is final; **no buyer refund path**
- founder allocation: **83,900,000 RLYA = 10%**
- founder lock: **365 days starting from actual public RLYA token Day 0**, not from this presale phase

The website may describe pricing as demand-based/dynamic. Do not publicly advertise the exact internal price-step mechanic.

## 3. Presale access states

Pre-launch allocation access is a separate owner-signed control:

- `CLOSED` — no new purchases; website may still be public
- `OPEN` — verified USDC purchases may create expected RLYA allocations
- `PAUSED` — temporarily refuse new purchases while preserving existing records

The later atomic-token-sale switch `presaleEnabled` remains separate and stays `false` during this phase.

A visible Connect Wallet button or browser checkout capability does **not** mean access is open.

## 4. Required opening preflight

Do not sign `OPEN` until all checks below pass:

1. Netlify has a dedicated production-capable Solana Mainnet RPC configured as `RALYA_SOLANA_RPC`.
2. The RPC responds successfully from the deployed server/runtime.
3. `Prepare / verify USDC receiving account` confirms the treasury USDC associated token account.
4. If that account does not yet exist, the owner wallet may approve creation and pay the Solana network fee.
5. Owner opening preflight returns `READY` and confirms both Mainnet RPC reachability and the configured treasury USDC account.
6. Real Android/browser wallet connection behavior has been checked.

Only after these checks should the owner sign `OPEN`.

## 5. Website purchase flow

When access is `OPEN`:

1. buyer chooses and connects a Solana wallet;
2. buyer chooses Standard or Buy + Stake if the wallet has no prior locked release choice;
3. buyer enters USDC;
4. wallet signs a harmless allocation-quote authorization message;
5. server locks an exact short-lived expected RLYA allocation;
6. buyer approves the real Solana USDC transaction;
7. server independently verifies the transaction, buyer signer, quote memo and exact USDC balance movements;
8. only after successful verification is the expected RLYA allocation recorded;
9. reconnecting the wallet can show its confirmed expected allocation and release policy.

The website must never present expected pre-launch RLYA as if the actual token was already transferred.

## 6. Referral flow

`Share & earn 1% USDC` stays near the wallet/purchase flow.

For a valid referred purchase:

- the buyer pays the normal quoted USDC amount;
- the buyer keeps the full expected RLYA allocation;
- Buy + Stake still receives the fixed 5% RLYA bonus when selected/locked;
- the referrer receives 1% of gross referred USDC;
- self-referrals and prohibited direct two-wallet loops remain rejected.

## 7. Owner ledger and authorized off-site allocations

Existing authorized off-site/manual allocation tooling shares the reviewed public-presale accounting and must respect the same fixed **288M base presale allocation**. It is not an arbitrary public price setter.

Do not confuse this existing owner reconciliation tool with any future investor-allocation plan. A future separate 12% investor allocation is **not part of the current build and must not be implemented yet**.

## 8. Buyer release records

Every buyer-facing receipt, owner lookup and exported manifest must agree:

- Standard → `standard-tminus1` / **1 day before public launch**
- Buy + Stake → `staked-plus21d` / **21 days after public launch**, including the fixed 5% bonus

If any screen or exported record says Standard day 21 or Buy + Stake day 36, stop and treat it as stale/incorrect.

## 9. Controlled real-USDC test before broad promotion

After owner preflight is `READY` and access has been deliberately opened, perform a small real purchase from a **non-owner buyer wallet**.

Verify the complete path:

wallet connect → quote → exact USDC transaction → backend confirmation → expected RLYA allocation → correct Standard T-1 or Buy + Stake T+21 record → wallet reconnect/history.

If referral is included in the test, also verify the 1% USDC referral attribution.

Do not use the owner wallet as the normal buyer-flow test wallet.

## 10. What remains later

Do **not** start these actions from the website/presale pass:

- create the production RLYA mint
- deploy the production RLYA sale Program ID/PDA
- mark public RLYA token Day 0
- start the founder 365-day lock
- implement the future 12% investor allocation
- implement the future sovereign RALYA network
- implement future RALYA Jobs transaction-fee economics

The existing Mainnet engineering and reconciliation code can remain in the repository, but its production deployment sequence must be handled as a separate later phase after the website/presale is operating correctly.
