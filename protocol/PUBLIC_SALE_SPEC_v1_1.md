# RLYA Public Sale Specification v1.1

## Fixed inputs
- Network: Solana
- Payment asset: mainnet USDC
- RLYA decimals: 9
- Hard cap: 839,000,000 RLYA
- Sale inventory: 100,680,000 RLYA
- Base price: 3,000 micro-USDC = $0.003000
- Price step: 1,000,000 RLYA distributed
- Increment: 50 micro-USDC = $0.000050
- Minimum website purchase: 1 USDC

## Buyer path
The client submits both the USDC spend amount and the buyer's minimum acceptable RLYA output. The program recalculates the quote from current on-chain state and rejects the transaction if the result would fall below that minimum. One signed transaction then transfers USDC from the buyer to the configured treasury token account and RLYA from the program sale vault to the buyer. Both transfers are atomic. There is no claim balance and no refund state.

## Price rule
`price = base_price + floor(total_sold / step_size) * step_increment`

A purchase that crosses a step boundary is priced piecewise across the boundaries consumed.

## Off-site distribution
Only the on-chain sale admin may call `manual_sale`. The instruction must transfer the named RLYA amount from the same sale vault to the named recipient. It increments both `total_sold` and `manual_sold`, so the public price curve advances by actual off-site distribution. There is no arbitrary price-set instruction.

## Initialization gate
Only the wallet that currently controls the RLYA mint authority may initialize the RLYA sale state. This prevents another wallet from racing the legitimate launch and occupying the deterministic sale PDA first. Freeze authority must already be absent.

## Activation gate
The sale cannot activate unless the RLYA mint reports exactly 839,000,000 RLYA, both mint/freeze authority are absent, the sale vault holds exactly 100,680,000 RLYA, and the founder vault holds exactly 83,900,000 RLYA.


## Referral rule

A valid referred website purchase uses the same stepped RLYA quote as a direct purchase. Exactly 100 basis points (1%) of gross USDC goes to the referrer and the remaining 99% goes to treasury. The buyer is not surcharged. No referral RLYA is minted. Direct same-wallet self-referral is rejected. The website bundles first referral registration into the first referred purchase transaction, creating a deterministic buyer referral-attribution account; future purchases from that buyer must honor the same referrer and the direct-buy path is blocked for attributed buyers. Direct two-wallet circular referral registration is rejected. The rate is fixed in the program and is not a manual owner price control.
