# RALYA Public Devnet Protocol Evidence

Verified on **14 August 2026** against Solana Devnet.

This page records a testing milestone only. All addresses below are **Devnet test assets/state**. They are not production RLYA, not mainnet launch addresses, and do not enable a real-money public sale.

## Evidence identity

- GitHub Actions run: `31778172257`
- Job: `94697937123`
- Tested source commit: `bd95b51c40866c8a131032ca5d84333bb5caca41`
- Network: Solana Devnet
- Devnet program: `Dk5eeCK6KmYY4b6pQkCRpfbZViwEjYJLryjZoUgBxsHN`
- Devnet RLYA test mint: `3K3AWEJaJ7sqYB926CitbRaBnPn6cyiC8WPsEe1N6Uii`
- Devnet USDC test mint: `BHAVfo4QzXKoRhNrinficvotonPyhuWQNYhwFn5XNdvW`
- Devnet sale PDA: `ASgQBY5NPHHcuXNDWaDSD4wX8MiZ57JdUjzFvzxtejDg`

## Public transaction evidence

### Initialize
Transaction:
`o4Uj1HNcG5H9WBkh5t4eApyEUdyGx9XUjZzMPGgG3ZTr1fpWYqp58qdLhd6s4WKjQBb8tgke64ofu2BjBGS3cnk`

Result: `INITIALIZE PASS`

### Activate
Before activation, the test confirmed that activation is rejected while mint authority exists and while required vault allocations are underfunded.

Transaction:
`2JnGqhYjH46AXPW9TyWDiDk7TeuHAqWSQaSdPRp6SAmYN3bPAm4bBTHwpQbGDEgM594ET1wqWXs4xz2e3m7tNFpv`

Result: `ACTIVATE PASS`

### Direct purchase
Transaction:
`42fYZRzaZV7MRNW5e8LERDiKMA6sAr9M7zo1y3X8qmex9XUdQa27LpNDCcjTzYjEaYzgcs8L7PUQ1sdFCZ1svGEH`

Result: `DIRECT_BUY PASS`

### Referral attribution / bypass guard
Transaction:
`Qz5sESuCGr11n9iDHmpHJpGMeQN8KjQQAWt2J3d74AA2TuHcFaBHZ7tC8Wbm435Sg2TSByqBhsKKs72NsFPk1Ai`

Result: the referred wallet could not bypass its referral attribution by attempting a direct purchase.

### Referred purchase
Transaction:
`2oMo6sKgntADJkCcT5U9GyZayrprNXK8potfQvK6RTPsZe9y3C5ciX8BqwpS8VxsHfP157Vbk7PpdCf8j6KxoEPV`

Result: a 500 USDC test purchase reconciled exactly to **5 USDC to the referrer + 495 USDC to treasury**, while the buyer received the normal RLYA quote.

### Manual/off-site distribution
Transaction:
`25AmrUnNGsDvHX6hMnzog8fqSJ24V1vQaE9tfVGdNE2pYyKpDyozPFHdoMX2of98r2S9wNB3Pki2fZeH9h8c8sdt`

Result: 2,000,000 RLYA moved from the same sale vault and advanced the price from **$0.003000 to $0.003100**.

## Final reconciled state

- Total distributed/sold: `2,199,999.999999999 RLYA`
- Gross test USDC recorded: `600 USDC`
- Referral test USDC paid: `5 USDC`
- Final tested price: `$0.003100`
- Hard-cap mint supply remained exactly `839,000,000 RLYA`
- Mint authority: absent
- Freeze authority: absent
- Public Devnet core guards exercised in this run: 3
- Full localhost abuse/permission suite remains: 12 guards passed

Final CI marker:

`RALYA_DEVNET_PROTOCOL_INTEGRATION=PASS`

## What this proves

The deployed Devnet program reproduced the core sale path already verified on the local Solana validator: initialize, guarded activation, direct USDC purchase, fixed 1% referral settlement, referral-bypass protection, manual distribution through the same sale vault, stepped price movement, and fixed-supply authority invariants.

## What this does not prove

- Mainnet is not deployed.
- A production RLYA mint has not been created.
- Production program/treasury addresses do not yet exist.
- The real-money public sale remains disabled.
- Devnet program and mint addresses on this page must never be represented as production addresses.
