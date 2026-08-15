from .config import RLYA_MAX_SUPPLY, RLYA_UNIT, TOKEN_ALLOCATION_TOKENS


def allocation_table() -> dict[str, int]:
    return {
        name: tokens * RLYA_UNIT
        for name, tokens in TOKEN_ALLOCATION_TOKENS.items()
    }


def validate_tokenomics() -> None:
    allocations = allocation_table()
    if sum(allocations.values()) != RLYA_MAX_SUPPLY:
        raise ValueError("allocation base units must exactly equal hard cap")
    if allocations["founder"] != RLYA_MAX_SUPPLY // 10:
        raise ValueError("founder allocation must equal 10%")
    if allocations["presale"] != 288_000_000 * RLYA_UNIT:
        raise ValueError("public presale allocation must equal 288M RLYA")
    if allocations["staking_bonus_reserve"] != 14_400_000 * RLYA_UNIT:
        raise ValueError("staking bonus reserve must equal 14.4M RLYA")
