# RLYA Mainnet Release Candidate Threat Model

## Public-sale threats
- overselling the 100,680,000 RLYA public-sale allocation
- integer rounding giving a buyer more RLYA than paid for
- incorrect quote calculation when one purchase crosses one or more 1,000,000-RLYA price steps
- buyer USDC transferring without the matching RLYA delivery
- buyer receiving RLYA without the matching USDC transfer
- unauthorized use of the manual/off-platform sale instruction
- manual/off-platform RLYA leaving the vault without advancing total-sold and the public price curve
- recipient substitution during manual sale
- unauthorized pause, resume, close, or unsold-token withdrawal
- buyer or admin supplying the wrong treasury USDC token account
- website configuration pointing users at the wrong RLYA mint, program, treasury, or RPC network
- compromised public RPC returning misleading display data
- leaked owner, treasury, founder, or deployment signing keys

## Token-supply threats
- mint authority accidentally remaining active after the 839,000,000-RLYA supply is created
- freeze authority accidentally remaining active
- hidden mint instruction inside the active sale program
- allocation totals not reconciling exactly to 839,000,000 RLYA
- sale vault not holding exactly 100,680,000 RLYA at first activation
- founder vault not holding exactly 83,900,000 RLYA at first activation
- founder allocation releasing before the 365-day lock expires

## Program and upgrade threats
- deployed bytecode not matching the reviewed open-source commit
- final program ID not matching website configuration or published records
- deployment/upgrade authority being handled carelessly
- a future upgrade introducing minting, confiscation, refund, hidden-price, or sale-accounting behavior that was not publicly reviewed

## Website threats
- malicious dependency substitution in browser-delivered JavaScript
- wallet-draining instructions unrelated to the documented RLYA sale
- stale price display causing a user to sign a transaction with assumptions that no longer match on-chain state
- fake token mint or fake treasury address presented by a compromised site

The buyer transaction is designed so USDC payment and RLYA delivery occur atomically inside one Solana transaction. Website values are informational; the program's on-chain state is authoritative.

## Future autonomous-work protocol threats
These belong to a later protocol release and are not part of the active token-sale program:
- double settlement
- provider claiming payment without accepted result evidence
- bond returned after a slash decision
- unauthorized dispute resolution
- escrow or bond accounting divergence
- timeout path executing twice

## Mainnet release posture
Mainnet activation requires all of the following evidence:
1. Anchor/Rust program compiles with the pinned toolchain.
2. Integration tests execute against Solana localnet/Devnet.
3. The final program ID is published and matches the deployed executable program.
4. RLYA metadata is publicly reachable.
5. Exactly 839,000,000 RLYA are created and the published allocations reconcile.
6. Mint authority is permanently revoked and freeze authority is absent.
7. The sale and founder vault balances pass the program's activation checks.
8. The website is populated with the final immutable public addresses.
9. Launch transaction signatures and a launch record are published.


## Referral abuse

- The buyer cannot use the same wallet as referrer.
- The 1% rate is fixed in program source and mirrored in on-chain sale state.
- Referral payout comes from the buyer gross USDC amount and does not alter the RLYA quote.
- The referred transfer is part of the same transaction as treasury payment and RLYA delivery, preventing a partially paid referral state.
- Sybil referral farming across distinct wallets is economically equivalent to choosing a different payout destination; no extra RLYA is created.
