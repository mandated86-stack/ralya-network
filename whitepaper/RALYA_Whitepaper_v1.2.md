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

Planned RLYA roles include provider bonds, staking for service-provider participation, collateral around economic promises, economic security for dispute or verification participants, protocol participation incentives and future chain/security participation if independent infrastructure is justified by real usage.

The design avoids forcing a customer who wants to pay 100 USDC for a service to first purchase a volatile token merely to make the payment.

## 4. Solana-first architecture

RALYA begins as a Solana-based protocol and SPL token. Solana provides the ledger, transaction ordering and validator infrastructure while RALYA establishes real usage.

The release architecture includes a dedicated RLYA sale / founder-lock program designed to verify the fixed supply and required vault balances, control official sale inventory, maintain deterministic presale pricing, enforce fixed referral accounting, reconcile pre-launch allocations into production records, enforce delayed presale delivery and protect the founder time lock.

## 5. Fixed supply

**Maximum lifetime supply: 839,000,000 RLYA**

RLYA uses 9 decimal places. The production launch process is designed to create the complete supply once and permanently remove mint authority. Freeze authority must be absent before public token-sale activation. The application program contains no instruction that can create additional RLYA.

## 6. Launch allocation

Exact token quantities are the source of truth. Percentage figures below are descriptive shares rounded from those exact quantities.

| Allocation | Approx. share | RLYA |
|---|---:|---:|
| Provider and security incentives | 17.293940% | 145,096,154 |
| Ecosystem and community | 13.835152% | 116,076,923 |
| Protocol treasury | 10.376364% | 87,057,692 |
| Public presale base allocation | 34.326579% | 288,000,000 |
| Presale staking-bonus reserve | 1.716329% | 14,400,000 |
| Founder allocation | 10.000000% | 83,900,000 |
| Future chain/security reserve | 6.917576% | 58,038,462 |
| Liquidity | 5.534061% | 46,430,769 |
| **Total** | **100%** | **839,000,000** |

The founder allocation is exactly 83,900,000 RLYA (10% of the lifetime supply) and is subject to a 365-day protocol-controlled production lock beginning with activation.

The 14,400,000 RLYA staking-bonus reserve is sufficient to pay a fixed 5% bonus if the full 288,000,000 RLYA public base allocation chooses the presale staking option. It is part of the existing 839M supply; staking does not mint additional RLYA.

## 7. Pre-launch allocation and delayed delivery

Before public token launch, a buyer can use Solana USDC to secure an expected RLYA allocation at the confirmed presale price position.

The flow is:

1. buyer connects a Solana wallet;
2. buyer enters a USDC amount;
3. buyer chooses the standard release option or **Buy + Stake** before the first confirmed purchase for that wallet;
4. the wallet authenticates a short-lived quote request that includes the staking choice;
5. the server locks the exact base RLYA allocation and, when Buy + Stake is selected, the corresponding fixed 5% bonus from the dedicated bonus reserve;
6. the buyer signs the real Solana USDC transaction;
7. the transaction is independently verified against Solana, including signer, transaction reference and exact USDC balance changes;
8. the expected allocation is recorded against that wallet;
9. reconnecting the same wallet displays the purchased allocation, any staking bonus and the applicable release policy.

A confirmed pre-launch allocation is not presented as an already-delivered token balance.

### Standard release

A standard presale allocation is scheduled for distribution **21 days after the public RLYA launch**.

### Buy + Stake release

A buyer who selects **Buy + Stake** receives a fixed **5% additional RLYA** relative to the base RLYA purchased. The base allocation and bonus are scheduled together **36 days after the public RLYA launch**, which is 15 days later than the standard release.

The first confirmed presale purchase locks that wallet to its selected release policy for later presale purchases. This prevents one wallet from accumulating incompatible delivery schedules under a single delivery identity.

## 8. Demand-based presale curve

The presale curve begins at **0.003000 USDC per RLYA** and increases by **0.000050 USDC per RLYA for each additional 1,000,000 base RLYA allocated/distributed**.

A single purchase can cross multiple pricing steps. Only the purchased base RLYA advances the public pricing curve; the fixed 5% staking bonus does not advance the curve and does not change the buyer's base purchase price.

This curve is a launch-distribution mechanism, not a promise of future exchange-market pricing.

## 9. One base-allocation curve for website and private/off-site allocations

Authorized private/off-site investor base allocations consume the same 288,000,000 RLYA public allocation cap and advance the same deterministic price curve. The owner control does not provide an arbitrary replacement public price.

Presale staking bonuses are separately accounted against the fixed 14,400,000 RLYA bonus reserve so that bonus tokens cannot silently expand the 288M base sale cap or the 839M lifetime supply.

## 10. Referral distribution

The fixed referral rate is **1% of gross referred USDC**.

For a referred pre-launch website purchase:

- the buyer pays the normal gross USDC amount;
- the buyer receives the normal base RLYA allocation;
- if Buy + Stake is selected, the buyer also receives the same fixed 5% RLYA staking bonus available to a non-referred buyer;
- 1% of gross USDC is routed to the locked referrer;
- 99% is routed to the configured pre-launch treasury;
- referral and staking rewards do not mint additional RLYA.

The first confirmed referrer for a buyer wallet is locked. Self-referrals and direct two-wallet circular referral relationships are rejected.

## 11. Pre-launch records and delivery manifests

The pre-launch ledger distinguishes verified website USDC allocations, authorized private/off-site allocations, gross website USDC, referral USDC, buyer wallet, locked referrer, exact base RLYA allocation, staking choice, staking bonus and source transaction identifiers.

Before distribution, the owner closes new allocation access and exports a hashed final delivery manifest. The manifest separately commits purchased base RLYA and staking-bonus RLYA so both can be reconciled without changing the fixed supply or base price curve.

Deterministic per-wallet delivery receipt accounts are intended to make distribution idempotent: if a distribution session is interrupted, rerunning it can skip allocations already completed on-chain rather than transferring them twice.

## 12. Public launch and release timing

Technical readiness does not force a public launch date. The public launch is a deliberate owner-controlled milestone after production contracts, mint, fixed-supply authority removal and required launch checks are complete.

The presale delivery clock is tied to that public launch milestone:

- **Day 0:** public RLYA launch;
- **Day 21:** standard presale allocations become distributable;
- **Day 36:** Buy + Stake allocations plus their fixed 5% RLYA bonus become distributable.

These dates do not permit additional minting and do not alter the founder lock.

## 13. Founder lock

The founder allocation is **83,900,000 RLYA (10%)** and is part of the fixed 839M supply. The production program is designed to hold that allocation under a **365-day founder lock** beginning with activation.

The founder lock is independent of the 21-day and 36-day presale buyer release schedules.

## 14. Narrow token rules

RLYA is intended to remain a normal transferable token rather than using buy taxes, sell taxes or reflection mechanics.

The launch architecture does not include post-launch RLYA minting, hidden token blacklists, arbitrary transfer taxes, an owner-editable public price field or a voluntary presale refund/claim state.

Owner-authorized distribution can only operate against fixed inventory and recorded allocations.

## 15. Verification research for autonomous work

The hardest RALYA problem is not payment; it is determining whether arbitrary work was completed correctly without requiring one central company to judge every result.

RALYA therefore treats verification as a family of mechanisms: deterministic tests for outputs that can be recomputed, cryptographic or machine-verifiable evidence where task types support it, competitive reproduction/challenge, buyer acceptance windows for subjective deliverables, dispute mechanisms and economic-history reputation as supporting evidence rather than universal proof.

The token/presale launch does not claim this research problem is already solved.

## 16. Development sequence

The staged path is:

1. fixed token economics and sale-security foundation;
2. pre-launch allocation and USDC verification infrastructure;
3. production Solana Mainnet deployment;
4. exact 839M production RLYA creation and authority removal;
5. founder lock and production verification;
6. deliberate public token launch;
7. standard presale distribution beginning at day 21 after public launch;
8. Buy + Stake distribution plus fixed 5% bonus beginning at day 36 after public launch;
9. Jobs v1 public testing;
10. AI SDK/API integrations;
11. real AI-to-AI work and settlement demonstrations;
12. broader autonomous-work settlement network.

A sovereign RALYA chain remains a future option only if usage and decentralized infrastructure justify it.

## 17. Open-source evidence

The RALYA repository is intended to publish the sale program source, economic reference model, automated tests, website clients, owner tools, threat model, launch evidence and whitepaper source.

Open source is not presented as proof of safety by itself. Its purpose is to make token rules, code changes and launch addresses independently inspectable.

## 18. Current status

As of this whitepaper version, the revised 288M public allocation, fixed 14.4M staking-bonus reserve, 5% Buy + Stake rule and delayed buyer release schedules are being integrated into the release candidate. Production Solana Mainnet deployment, a production RLYA mint and public token launch are not claimed until their corresponding owner-signed evidence exists.

Production addresses and live claims should only be published after corresponding owner-signed on-chain evidence exists.
