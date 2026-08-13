# RALYA Whitepaper v1.1

**Economic trust for autonomous work**  
**Token:** RLYA  
**Initial network:** Solana  
**Maximum supply:** 839,000,000 RLYA  
**Version:** 1.1 - August 2026

---

## 1. Executive summary

RALYA is being built as an economic coordination protocol for work performed by autonomous software, AI agents, machines and human service providers. The core idea is simple: a participant that promises to perform work should be able to put economic value at risk, complete the work, produce evidence, and receive settlement under transparent rules.

RLYA is the fixed-supply protocol asset intended to provide that economic security. It is not designed as a transfer-tax token, a meme asset, or a token whose only function is to be bought and resold. In the planned RALYA work protocol, RLYA is intended to be used for provider bonds, staking, dispute security and other forms of economic accountability. Practical settlement assets such as USDC can remain the payment rail for work itself.

RALYA launches on Solana first. This avoids the cost and operational burden of running an independent validator network before the protocol has real usage. A sovereign RALYA chain is a future option only if usage, independent infrastructure and community participation justify it.

The RLYA supply is capped at 839,000,000 tokens. The launch architecture requires the entire supply to exist before the public sale activates, and requires both mint authority and freeze authority to be removed. No application instruction can mint additional RLYA.

## 2. The problem

Autonomous software can increasingly research, trade information, call tools, create software, operate machines and coordinate other software. Payment alone does not solve the trust problem. A buyer still needs answers to questions such as:

- Who accepted the work?
- What exactly was promised?
- Was value placed at risk before work began?
- What evidence proves the work was completed?
- What happens if the result is objectively wrong or disputed?
- Can the provider build a portable record of successful work?

Traditional platforms solve these questions with a central company and a closed database. RALYA's long-term objective is to make the economic portion of that coordination independently verifiable and composable.

## 3. The RALYA model

A future RALYA work transaction is designed around six concepts:

1. **Request** - a machine, software agent, company or person publishes a clearly defined task.
2. **Settlement** - payment terms are specified in an accepted asset such as USDC.
3. **Bond** - the provider commits RLYA or another approved security position before performing the task.
4. **Evidence** - the result and task-specific proof are submitted.
5. **Verification or dispute** - deterministic tasks can be checked automatically; subjective tasks require a separate resolution path.
6. **Settlement and reputation** - accepted work releases payment and returns the bond; failure can expose the bond to protocol-defined consequences.

The protocol is intentionally being separated from the token sale. RLYA can launch and establish transparent supply and distribution rules before every future work-market module is complete.

## 4. Why RLYA exists

RLYA is designed to be the security asset underneath the protocol rather than the mandatory currency for every task.

Planned protocol roles include:

- provider bonds for accepting work;
- staking for service-provider participation;
- economic security for dispute participants or verifiers;
- validator/security participation if a sovereign RALYA chain is justified later;
- protocol participation incentives and ecosystem security.

This design avoids forcing a business that wants to pay 100 USDC for a service to first purchase a volatile token just to make the payment. The service can be priced in a practical settlement asset while the provider's RLYA position supplies economic accountability.

## 5. Solana-first architecture

RALYA begins as a Solana-based protocol and SPL token. Solana provides the ledger, transaction ordering and validator infrastructure during the early phase. RALYA does not need to operate its own always-on validator fleet in order to launch the token or its initial contracts.

The release architecture contains a dedicated RLYA sale program with these responsibilities:

- require the initializer to control the RLYA mint authority, preventing another wallet from front-running the sale setup;
- verify the exact RLYA hard cap before sale activation;
- verify mint authority has been removed;
- verify freeze authority has been removed;
- control the public-sale RLYA vault;
- sell RLYA for USDC atomically;
- route a fixed 1% of referred purchase USDC to the referring wallet without changing the buyer quote;
- calculate the current price from on-chain distribution state;
- record owner-authorized off-site distributions through the same sale vault;
- pause, resume or close the sale;
- enforce the initial founder time lock.

The website is a client of these rules. It does not define the public-sale price by itself.

## 6. Fixed supply

**Maximum lifetime supply: 839,000,000 RLYA**

RLYA uses 9 decimal places. At launch the complete supply is created once. The launch process then removes mint authority and freeze authority before the sale can be activated.

The sale program's activation gate requires:

- mint supply = exactly 839,000,000 RLYA;
- mint authority = none;
- freeze authority = none;
- public-sale vault = exactly 100,680,000 RLYA;
- founder-lock vault = exactly 83,900,000 RLYA.

If any of those conditions are false, the sale cannot activate.

## 7. Launch allocation

| Allocation | Share | RLYA |
|---|---:|---:|
| Provider and security incentives | 25% | 209,750,000 |
| Ecosystem and community | 20% | 167,800,000 |
| Protocol treasury | 15% | 125,850,000 |
| Public sale | 12% | 100,680,000 |
| Founder allocation | 10% | 83,900,000 |
| Future chain/security reserve | 10% | 83,900,000 |
| Liquidity | 8% | 67,120,000 |
| **Total** | **100%** | **839,000,000** |

The founder allocation is subject to an initial 365-day protocol-controlled lock beginning when the sale first activates. The founder allocation is part of the fixed 839M supply; it is not minted later.

Treasury and ecosystem pools are accounting allocations within the fixed supply and are intended for protocol development, integrations, security, incentives and future infrastructure. Public addresses for live allocation accounts should be published with the mainnet launch record.

## 8. Public-sale design

The first public payment rail is **USDC on Solana**. A purchase is designed to be atomic:

1. the buyer connects a Solana wallet;
2. the website reads the current sale state from Solana;
3. the buyer enters a USDC amount;
4. the client calculates the expected RLYA allocation from the same stepped curve used by the program and submits that quote as the buyer's minimum acceptable RLYA output;
5. the buyer signs one transaction;
6. the program recalculates the allocation from current on-chain state and rejects the transaction if it is below the buyer's minimum;
7. for a direct purchase, the program transfers the full USDC payment to the configured treasury token account; for a valid referred purchase, it transfers 1% of gross USDC to the referrer and 99% to treasury;
8. the program transfers the quoted RLYA from the sale vault to the buyer;
9. if the transaction fails, none of the transfer legs are completed.

There is no separate presale claim balance and no presale refund state. A confirmed purchase delivers RLYA directly to the buyer's wallet.

## 9. Demand-based launch curve

The release curve begins at:

**0.003000 USDC per RLYA**

The price increases by:

**0.000050 USDC per RLYA for every 1,000,000 RLYA distributed from the sale vault.**

The price therefore follows distribution rather than an editable number stored only on the website. A large purchase can cross several price steps; each portion is priced at the step it consumes.

Illustrative boundaries:

| Total public-sale distribution | Price per RLYA |
|---:|---:|
| 0 - 999,999 RLYA | $0.003000 |
| 1M - 1,999,999 RLYA | $0.003050 |
| 10M - 10,999,999 RLYA | $0.003500 |
| 50M - 50,999,999 RLYA | $0.005500 |
| 100M+ RLYA | $0.008000 |

This is a launch distribution curve, not a promise of an exchange-market price. After external markets exist, market prices are determined by those markets.

## 10. Off-site sales and the owner control

RALYA includes an owner-authorized on-chain off-site sale action for legitimate distributions where payment occurs outside the public website.

The control does **not** permit the website owner to type an arbitrary public price. Instead it requires the specified RLYA amount to leave the same on-chain public-sale vault and be delivered to the named recipient wallet. That amount increments the same public `total_sold` counter used by website purchases, so the public launch curve advances consistently.

Example: if 2,000,000 RLYA are sold privately, recording the sale transfers 2,000,000 RLYA from the public-sale vault and advances the distribution curve by two one-million-token steps.

The program separately records the quantity distributed through the owner-authorized path so observers can distinguish on-site USDC purchases from off-site token distributions.


## 11. Referral distribution

RALYA includes a fixed on-chain referral path for public-sale purchases. A connected wallet can share a link containing its Solana public address. If another wallet uses that referral when purchasing RLYA, the buyer pays the same gross USDC amount and receives the same RLYA quote as a direct buyer.

The sale program splits that gross USDC payment as follows:

- **1% to the referring Solana wallet in USDC;**
- **99% to the configured sale treasury;**
- **0 additional RLYA minted or awarded.**

The referral rate is fixed at 100 basis points in the sale program and stored in the on-chain sale state. It is not an owner-editable website setting. The website bundles a buyer wallet's first referral registration into its first referred purchase transaction, creating a deterministic on-chain referral-attribution record. That buyer cannot later switch to a different referrer or bypass the attribution using the direct-buy instruction. The program rejects same-wallet self-referrals and direct two-wallet referral loops at registration.

Example: a referred purchase of 500 USDC gives the buyer the same RLYA allocation that 500 USDC would receive without a referral. Five USDC is routed to the referrer and 495 USDC to treasury. The buyer is not charged 505 USDC.

If the referrer does not yet have a Solana USDC associated token account, the buyer client may include creation of that standard token account in the same transaction before the referred purchase instruction. The transaction fee/rent associated with creating that account is a Solana network cost, not an additional RALYA referral percentage.

Referral totals are recorded in aggregate in the sale state, while individual referral transfers remain independently visible in Solana transaction history.

## 12. Wallet transparency

The public website is designed to read:

- the connected wallet's real RLYA token balance;
- the connected wallet's real USDC balance;
- the current on-chain sale state;
- total RLYA distributed from the public-sale vault;
- the current and next launch-curve price;
- transaction signatures after purchases.

Once launch addresses are published, users can independently inspect the same mint, program and token-account data with standard Solana tools and explorers.

## 13. Founder lock and continuing development

The initial founder allocation is 10% of the hard cap and is locked for 365 days from first sale activation. The founder vault is program-controlled during this period.

The long-term development model is intended to depend increasingly on real protocol activity rather than future token inflation. The future work protocol may direct a disclosed share of protocol fees toward ongoing core development. Any such live fee configuration should be published in protocol documentation and encoded transparently rather than hidden in the token transfer mechanism.

## 14. No transfer tax and no hidden mint

RLYA is intended to remain a normal transferable token rather than using buy taxes, sell taxes or reflection mechanics.

The launch contract does not contain an RLYA mint instruction. The complete supply is created in the launch transaction sequence, after which mint and freeze authority are revoked before activation.

The owner-authorized off-site distribution function can only distribute tokens already present in the fixed public-sale vault. It cannot create new RLYA.

## 15. Verification research for autonomous work

The hardest RALYA problem is not payment; it is proving that work was completed correctly without requiring one central company to judge every result.

RALYA is therefore treating verification as a class of mechanisms rather than one universal oracle:

- **deterministic verification** for tasks whose output can be recomputed or tested;
- **cryptographic or machine-verifiable evidence** where task types support it;
- **competitive verification** where independent providers can reproduce or challenge a result;
- **buyer acceptance windows** for subjective deliverables;
- **dispute mechanisms** for buyer/provider disagreement;
- **reputation tied to economic history** as supporting evidence, not as a replacement for proof.

The public token launch does not claim that this research problem is already solved. The website and repository distinguish working sale infrastructure from future protocol modules.

## 16. Path to multichain

RALYA is Solana-first, not Solana-only as a permanent architectural commitment. Multichain settlement can be added incrementally once the base protocol is stable.

The expected progression is:

1. Solana token and sale;
2. Solana protocol modules;
3. selected cross-chain settlement integrations;
4. broader interoperability;
5. independent RALYA chain only if usage and decentralized infrastructure justify it.

This approach avoids paying to operate an empty validator network simply to market the project as a new Layer 1.

## 17. Open-source development

The RALYA release repository is intended to publish:

- Solana program source;
- browser sale client;
- owner control client;
- executable Python economic reference model;
- automated invariant and stress tests;
- tokenomics files;
- threat model and launch gates;
- whitepaper source and PDF;
- release hashes and verification notes.

Open source is not presented as proof of safety by itself. The project uses it so token rules, code changes and launch addresses can be inspected independently.

## 18. Security principles

The launch architecture follows several deliberately narrow rules:

- fixed lifetime supply;
- no mint instruction in the application program;
- mint/freeze authority must be revoked before activation;
- public-sale inventory has a fixed cap;
- buyer USDC, optional referral USDC, treasury USDC and RLYA delivery are executed in one transaction;
- referred buyers receive the same RLYA quote and pay no referral surcharge;
- same-wallet self-referrals and direct two-wallet referral loops are rejected;
- a buyer wallet's first referral attribution is persistent and cannot be bypassed through the direct-buy instruction;
- buyer transactions include minimum-output protection against a price-step change between quote and execution;
- sale initialization requires control of the RLYA mint authority to prevent account-squatting/front-run initialization;
- owner off-site distributions must use the same sale vault;
- pause can stop new website purchases without rewriting previous transfers;
- unsold public-sale inventory can only be withdrawn after the sale is closed;
- founder allocation cannot leave its vault before the lock expires;
- private keys are never embedded in the website or repository.

Before mainnet activation, the compiled program, program ID, mint address, treasury address and launch transaction signatures should be published together. The initial program upgrade authority is also a security-sensitive role and should be publicly identified; after the early audited upgrade period, the project can move that authority to a stronger multisignature/governance arrangement or make the program immutable when further upgrades are no longer required.

## 19. Development state at Whitepaper v1.1

At this release-candidate stage:

- the economic reference model and automated sale invariants are executable;
- the Solana Anchor sale program source exists;
- the public website uses real wallet/RPC code rather than simulated balances;
- the owner panel uses the same on-chain sale state;
- fixed 1% USDC referral economics, persistent first-referrer attribution, same-wallet/two-wallet loop protection and website referral links are implemented in source and tested;
- simulated purchase paths have been removed;
- whitepaper and public repository package are prepared;
- final Solana program compilation/deployment and RLYA mainnet mint require the project owner's signing wallet and are not represented as completed until their real addresses are published.

## 20. Roadmap

### Launch foundation
- compile and test the RLYA sale program with the pinned Solana/Anchor toolchain;
- deploy and verify program;
- create RLYA mint and metadata;
- create exactly 839M RLYA;
- fund published allocation accounts;
- revoke mint and freeze authority;
- activate public sale;
- publish addresses and transaction signatures.

### Protocol alpha
- provider identity and bond model;
- job request and settlement schema;
- deterministic task verification adapters;
- dispute and challenge prototype;
- public test environment.

### Interoperability
- selected multichain settlement integrations;
- provider tooling and SDKs;
- external developer integrations.

### Sovereign infrastructure, only if earned
- independent testnet;
- independent validators;
- security and migration plan;
- native RALYA chain only if protocol usage justifies it.

## 21. Closing principle

RALYA should be judged by what can be inspected and used: a fixed supply, published on-chain rules, a functioning token-sale mechanism, visible development evidence, and eventually an economic protocol that gives autonomous work real accountability.

The project is intentionally being built in that order.
