# RALYA Whitepaper v1.2

**Economic trust for autonomous work**  
**Token:** RLYA  
**Initial network:** Solana  
**Maximum supply:** 839,000,000 RLYA  
**Version:** 1.2 - August 2026

---

## 1. Executive summary

RALYA is being built as economic settlement infrastructure for work performed between autonomous software, AI agents, machines and human service providers. The long-term objective is to let one participant commission work from another, define practical payment terms, place economic value at risk and settle outcomes under transparent rules.

RLYA is the fixed-supply protocol asset intended to provide bonding, collateral, staking and economic accountability. It is not intended to be the mandatory payment currency for every job. Practical settlement assets such as USDC can remain the payment rail for work itself while RLYA supplies economic security underneath that activity.

RALYA is Solana-first. The token and settlement foundation are being released before the broader Jobs / AI-agent work modules. The public launch does not claim that arbitrary AI work verification is already solved.

## 2. Autonomous-work settlement model

A future RALYA work transaction is designed around:

1. **Request** - an AI agent, software system, machine, company or person defines a task.
2. **Settlement asset** - practical payment terms can be specified in an asset such as USDC.
3. **Bond** - a provider commits RLYA or another approved security position before performing the work.
4. **Work and evidence** - the result and task-specific evidence are submitted.
5. **Verification / dispute** - deterministic tasks can be tested automatically; subjective tasks require an appropriate resolution mechanism.
6. **Settlement and reputation** - accepted work releases payment and returns the bond; failure can expose the bond to protocol-defined consequences.

The economic and token foundation can launch before every future work-market module is complete.

## 3. Why RLYA exists

Planned RLYA roles include:

- provider bonds for accepting autonomous work;
- staking for service-provider participation;
- collateral around economic promises;
- economic security for dispute or verification participants;
- protocol participation incentives;
- future chain/security participation if independent infrastructure is justified by real usage.

The design avoids forcing a customer who wants to pay 100 USDC for a service to first purchase a volatile token merely to make the payment.

## 4. Solana-first architecture

RALYA begins as a Solana-based protocol and SPL token. Solana provides the ledger, transaction ordering and validator infrastructure while RALYA establishes real usage.

The release architecture includes a dedicated RLYA sale / founder-lock program that is designed to:

- verify the fixed supply and required vault balances before activation;
- require mint and freeze authorities to be removed before activation;
- control the official public-sale RLYA vault;
- maintain the fixed stepped price curve;
- support the later atomic USDC -> RLYA sale path;
- enforce fixed referral accounting;
- record legitimate private/off-site distributions through the same sale inventory;
- reconcile verified pre-launch allocations into production Mainnet accounting;
- pause, resume or close the sale;
- enforce the founder time lock.

## 5. Fixed supply

**Maximum lifetime supply: 839,000,000 RLYA**

RLYA uses 9 decimal places. The production launch process is designed to create the complete supply once and permanently remove mint authority. Freeze authority must be absent before public token-sale activation.

The application program contains no instruction that can create additional RLYA.

## 6. Launch allocation

| Allocation | Share | RLYA |
|---|---:|---:|
| Provider and security incentives | 25% | 209,750,000 |
| Ecosystem and community | 20% | 167,800,000 |
| Protocol treasury | 15% | 125,850,000 |
| Public presale | 12% | 100,680,000 |
| Founder allocation | 10% | 83,900,000 |
| Future chain/security reserve | 10% | 83,900,000 |
| Liquidity | 8% | 67,120,000 |
| **Total** | **100%** | **839,000,000** |

The founder allocation is part of the fixed supply and is subject to a 365-day protocol-controlled production lock beginning with activation.

## 7. Two-stage presale architecture

RALYA deliberately separates the initial **pre-launch allocation phase** from the later **atomic token-sale phase**.

### Stage A - pre-launch allocation

Before public token launch, a buyer can use Solana USDC to secure a fixed RLYA allocation at the confirmed presale curve position.

The flow is:

1. buyer connects a Solana wallet;
2. buyer enters a USDC amount;
3. the wallet authenticates a short-lived quote request;
4. the server locks the exact RLYA allocation at the current shared presale curve position;
5. the buyer signs the real Solana USDC transaction;
6. the transaction is independently verified against Solana, including signer, transaction reference and exact USDC balance changes;
7. the RLYA allocation is recorded against that wallet;
8. reconnecting the same wallet displays its confirmed expected RLYA;
9. RLYA distribution is scheduled before public token launch.

A confirmed allocation is not presented as an already-delivered token balance.

### Stage B - post-launch atomic settlement

After production RLYA is distributed and the public token launch is deliberately opened, the already-built sale path supports atomic settlement:

**USDC -> RLYA in the same Solana transaction.**

The program calculates the current curve price, applies buyer minimum-output protection, transfers USDC according to the referral rules and transfers RLYA from the official sale vault to the buyer atomically.

The two stages share the same economic supply and pricing model but use different settlement timing.

## 8. Demand-based presale curve

The presale curve begins at:

**0.003000 USDC per RLYA**

and increases by:

**0.000050 USDC per RLYA for every 1,000,000 RLYA allocated/distributed.**

Illustrative boundaries:

| Total presale allocation/distribution | Price per RLYA |
|---:|---:|
| 0 - 999,999 RLYA | $0.003000 |
| 1M - 1,999,999 RLYA | $0.003050 |
| 10M - 10,999,999 RLYA | $0.003500 |
| 50M - 50,999,999 RLYA | $0.005500 |
| 100M+ RLYA | $0.008000 |

A single purchase can cross multiple pricing steps. The curve is a launch-distribution mechanism, not a promise of a future exchange-market price.

## 9. One curve for website and private/off-site allocations

Authorized private/off-site investor allocations consume the same 100,680,000 RLYA presale pool and advance the same fixed curve.

The owner control does not provide an arbitrary replacement public price. Instead, the owner records the exact RLYA quantity legitimately allocated to the named investor wallet. That quantity advances total confirmed allocation and therefore moves the public curve by the same mathematical rule.

This prevents private allocations from being hidden outside the public supply/price accounting.

## 10. Referral distribution

The fixed referral rate is **1% of gross referred USDC**.

For a referred pre-launch website purchase:

- the buyer pays the normal gross USDC amount;
- the buyer receives the normal RLYA allocation;
- 1% of gross USDC is routed to the referrer;
- 99% is routed to the configured pre-launch treasury;
- no extra RLYA is created.

The first confirmed referrer for a buyer wallet is locked. Self-referrals and direct two-wallet circular referral relationships are rejected.

When pre-launch allocations are later reconciled on Mainnet, the locked referral attribution and aggregate verified referral accounting can be imported into production protocol records without minting additional RLYA.

## 11. Pre-launch allocation records and distribution

The pre-launch ledger distinguishes:

- verified website USDC allocations;
- authorized private/off-site allocations;
- gross website USDC;
- referral USDC;
- buyer wallet;
- locked referrer;
- exact RLYA allocation;
- source transaction identifiers.

Before distribution, the owner closes new allocation access and exports a hashed final delivery manifest.

The production distribution tool then uses the official RLYA sale vault. Website-presale deliveries and private/off-site deliveries remain separately identifiable in production accounting while both advance the same total-sold curve.

Deterministic per-wallet delivery receipt accounts make distribution idempotent: if a distribution session is interrupted, rerunning it can skip allocations already completed on-chain instead of transferring them twice.

## 12. Public reveal timing is separate from technical readiness

RALYA does not equate a technical milestone with a forced public launch date.

The public site can move through staged messaging such as:

- Pre-launch
- Mainnet preparation
- Mainnet verified
- Distribution preparation
- Distribution scheduled
- Launch approaching

These public reveal stages do not themselves mint RLYA, move funds, resume the on-chain sale or open public token trading.

This allows production infrastructure to be completed and independently verified while launch timing remains a deliberate product and community decision.

## 13. Founder lock

The founder allocation is **83,900,000 RLYA (10%)** and is part of the fixed 839M supply. The production program is designed to hold that allocation under a 365-day founder lock beginning with activation.

The activation/pause launch sequence is designed so the lock can begin while the final committed sale state remains PAUSED.

## 14. No transfer tax, hidden mint or arbitrary sale price

RLYA is intended to remain a normal transferable token rather than using buy taxes, sell taxes or reflection mechanics.

The launch architecture does not include:

- post-launch RLYA minting;
- hidden token blacklists;
- arbitrary transfer taxes;
- an owner-editable public price field;
- a voluntary presale refund/claim state.

Owner-authorized distribution can only operate against the fixed presale inventory and fixed curve.

## 15. Verification research for autonomous work

The hardest RALYA problem is not payment; it is determining whether arbitrary work was completed correctly without requiring one central company to judge every result.

RALYA therefore treats verification as a family of mechanisms:

- deterministic tests for outputs that can be recomputed;
- cryptographic or machine-verifiable evidence where task types support it;
- competitive reproduction/challenge;
- buyer acceptance windows for subjective deliverables;
- dispute mechanisms for buyer/provider disagreement;
- economic-history reputation as supporting evidence rather than universal proof.

The token/presale launch does not claim this research problem is already solved.

## 16. Development sequence

The current staged path is:

1. fixed token economics and sale security foundation;
2. pre-launch allocation / fundraising infrastructure;
3. production Solana Mainnet deployment;
4. exact 839M production RLYA creation and authority removal;
5. founder lock and production verification;
6. presale allocation distribution;
7. deliberate public token launch;
8. Jobs v1 public testing;
9. AI SDK/API integrations;
10. real AI-to-AI work and settlement demonstrations;
11. broader autonomous-work settlement network.

A sovereign RALYA chain remains a future option only if usage and decentralized infrastructure justify it.

## 17. Open-source evidence

The RALYA repository is intended to publish the sale program source, economic reference model, automated tests, website clients, owner tools, threat model, launch evidence and whitepaper source.

Open source is not presented as proof of safety by itself. Its purpose is to make token rules, code changes and launch addresses independently inspectable.

## 18. Current status

As of this whitepaper version:

- fixed economics and sale logic have been extensively tested;
- public Devnet core protocol integration has passed;
- the pre-launch allocation software is prepared as a release candidate;
- production Solana Mainnet deployment has not yet been claimed;
- a production RLYA mint has not yet been claimed;
- public token launch has not yet been opened.

Production addresses and live claims should only be published after corresponding owner-signed on-chain evidence exists.
