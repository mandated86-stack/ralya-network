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
FOUNDER_ALLOCATION = 83_900_000 * RLYA_UNIT
FOUNDER_LOCK_SECONDS = 365 * 24 * 60 * 60

# Launch allocation model. Exact token amounts are the source of truth because
# the owner-selected 288M public allocation and 14.4M staking-bonus reserve do
# not map cleanly to whole basis points of the 839M hard cap.
TOKEN_ALLOCATION_TOKENS = {
    "provider_security_incentives": 145_096_154,
    "ecosystem_community": 116_076_923,
    "protocol_treasury": 87_057_692,
    "presale": 288_000_000,
    "staking_bonus_reserve": 14_400_000,
    "founder": 83_900_000,
    "future_chain_security": 58_038_462,
    "liquidity": 46_430_769,
}

# Rounded display shares only; never derive token balances from these values.
TOKEN_ALLOCATION_BPS = {
    "provider_security_incentives": 1_729,
    "ecosystem_community": 1_384,
    "protocol_treasury": 1_038,
    "presale": 3_433,
    "staking_bonus_reserve": 172,
    "founder": 1_000,
    "future_chain_security": 692,
    "liquidity": 552,
}

PRESALE_ALLOCATION = TOKEN_ALLOCATION_TOKENS["presale"] * RLYA_UNIT
STAKING_BONUS_RESERVE = TOKEN_ALLOCATION_TOKENS["staking_bonus_reserve"] * RLYA_UNIT
STAKING_BONUS_BPS = 500  # fixed 5% bonus on a staked presale purchase
STANDARD_PRESALE_RELEASE_SECONDS = 21 * 24 * 60 * 60
STAKED_PRESALE_RELEASE_SECONDS = 36 * 24 * 60 * 60  # 21 days + 15-day staking lock

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
