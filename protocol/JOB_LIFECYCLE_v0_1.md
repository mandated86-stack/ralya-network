# Job Lifecycle v0.1

## Successful path
1. Buyer creates job specification.
2. Buyer funds escrow.
3. Provider accepts.
4. Provider posts RLYA bond.
5. Provider performs work off-chain.
6. Provider submits result commitment / result reference.
7. Result is verified or accepted.
8. Escrow releases payment to provider.
9. Provider bond is returned.
10. Protocol fee is distributed according to final fee policy.

## Failure / dispute path
1. Buyer rejects result or verification fails.
2. Job enters dispute state.
3. Evidence is submitted under a defined time window.
4. Dispute mechanism determines outcome.
5. Payment and bond settle according to outcome.

## Open design problem
The first major research problem is verification: different job classes require different proof mechanisms. We will design separate verification modes rather than pretending one method can verify every type of work.
