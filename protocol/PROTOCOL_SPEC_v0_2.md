# RALYA Protocol Specification v0.2 — Foundation

## Purpose
RALYA is settlement infrastructure for work performed by software, AI agents, machines, and people. The protocol does not perform AI inference. It coordinates a job, escrow, provider bond, result commitment, review/dispute state, and settlement.

## Initial execution network
Solana. RALYA does not run an independent validator set during the early product phase. A sovereign RALYA chain is a future migration option only if real usage justifies it.

## Core actors
- **Buyer** — creates and funds a job.
- **Provider** — accepts the job and posts RLYA economic security.
- **Arbiter (v1)** — resolves disputed jobs. This is intentionally centralized in the first Devnet protocol and is NOT presented as the final decentralized verification design.
- **Protocol treasury** — receives the treasury share of protocol fees and slashed bonds.
- **Development fee wallet** — receives a transparent share of actual protocol fees.

## Job state machine
`OPEN -> ACCEPTED -> SUBMITTED -> COMPLETED`

Alternative terminal paths:
- `OPEN -> CANCELLED`
- `OPEN -> REFUNDED` after expiry
- `ACCEPTED -> REFUNDED` after provider timeout
- `SUBMITTED -> DISPUTED -> COMPLETED/REFUNDED`
- `SUBMITTED -> COMPLETED` after review timeout if the buyer stays silent

No terminal job can settle twice.

## Money model
All protocol calculations use integer base units. Floating-point money is forbidden.

### Successful job
1. Buyer payment is held by a program-controlled escrow vault.
2. Provider bond is held by a separate program-controlled RLYA vault.
3. On success, the protocol fee is deducted from the payment.
4. The provider receives net payment.
5. The protocol fee is divided between treasury and development according to frozen configuration.
6. Provider receives the full bond back.

### Buyer-win dispute / provider timeout
1. Buyer receives the escrowed payment back.
2. Provider bond is slashed.
3. Foundation model: 80% of the slashed bond compensates the buyer and 20% goes to protocol treasury.

## Fee safety ceiling
Even before final economics are frozen, the on-chain jobs design places hard ceilings on configurable fees:
- Protocol fee: maximum 5% of successful job value.
- Developer share: maximum 20% of the protocol fee (not 20% of job value).

Final intended working default in the executable model:
- Protocol fee: 1%.
- Developer share: 10% of that 1% fee.

These values remain subject to Devnet economic testing before mainnet freeze.

## Verification modes
### V1 enabled
**Buyer acceptance with dispute arbitration.**

### Explicitly not enabled yet
- deterministic machine verification
- verifier committee
- proof-of-compute
- zero-knowledge verification
- decentralized juries

The software rejects unsupported verification modes rather than pretending they are implemented.

## Result storage
Large work products are not placed directly on-chain. A 32-byte commitment/hash is recorded. A production client can pair this with IPFS, Arweave, HTTPS, or another content transport later. The protocol must never depend on a paid AI API.

## Availability
The founder's PC is not part of consensus and does not need to stay online. During the early phase, Solana provides network availability. Optional public frontends can be hosted separately and are not required for already-created on-chain state to exist.

## Upgrade posture
Devnet programs are expected to change. Mainnet deployment must define a deliberate upgrade-authority policy after external review. Configuration has a one-way `freeze` mechanism so fee destinations/rates can be made immutable at the application level.
