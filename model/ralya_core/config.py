"""Protocol constants used by the executable reference model.

Amounts are integer base units only. Floating point is deliberately forbidden for money.
"""
RLYA_DECIMALS = 9
USDC_DECIMALS = 6
RLYA_UNIT = 10 ** RLYA_DECIMALS
USDC_UNIT = 10 ** USDC_DECIMALS

RLYA_MAX_SUPPLY_TOKENS = 839_000_000
RLYA_MAX_SUPPLY = RLYA_MAX_SUPPLY_TOKENS * RLYA_UNIT
FOUNDER_BPS = 1_000  # 10.00%
FOUNDER_ALLOCATION = RLYA_MAX_SUPPLY * FOUNDER_BPS // 10_000
FOUNDER_LOCK_SECONDS = 365 * 24 * 60 * 60

# Release-candidate allocation model. Sums to 100% and is frozen for the launch package.
TOKEN_ALLOCATION_BPS = {
    "founder": 1_000,                 # 10%
    "presale": 1_200,                 # 12%
    "provider_security_incentives": 2_500,  # 25%
    "ecosystem_community": 2_000,     # 20%
    "protocol_treasury": 1_500,       # 15%
    "liquidity": 800,                 # 8%
    "future_chain_security": 1_000,   # 10%
}

PRESALE_ALLOCATION = RLYA_MAX_SUPPLY * TOKEN_ALLOCATION_BPS["presale"] // 10_000

# Initial protocol fee for the future autonomous-work protocol; not used by the token sale.
DEFAULT_PROTOCOL_FEE_BPS = 100  # 1.00% of successful job payment
DEV_SHARE_OF_PROTOCOL_FEE_BPS = 1_000  # 10% of the protocol fee, not 10% of job value

# Buyer protection / provider protection defaults for the reference model.
DEFAULT_REVIEW_WINDOW_SECONDS = 72 * 60 * 60
DEFAULT_JOB_TTL_SECONDS = 7 * 24 * 60 * 60
DEFAULT_PROVIDER_WORK_WINDOW_SECONDS = 72 * 60 * 60

# If a provider loses a dispute, slashed bond is split between buyer compensation and treasury.
SLASH_TO_BUYER_BPS = 8_000
SLASH_TO_TREASURY_BPS = 2_000

