from .config import RLYA_MAX_SUPPLY, TOKEN_ALLOCATION_BPS


def allocation_table() -> dict[str, int]:
    return {
        name: RLYA_MAX_SUPPLY * bps // 10_000
        for name, bps in TOKEN_ALLOCATION_BPS.items()
    }


def validate_tokenomics() -> None:
    if sum(TOKEN_ALLOCATION_BPS.values()) != 10_000:
        raise ValueError("allocation basis points must sum to 10,000")
    allocations = allocation_table()
    if sum(allocations.values()) != RLYA_MAX_SUPPLY:
        raise ValueError("allocation base units must exactly equal hard cap")
    if allocations["founder"] != RLYA_MAX_SUPPLY // 10:
        raise ValueError("founder allocation must equal 10%")
