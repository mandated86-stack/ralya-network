import unittest

from model.ralya_core.config import (
    FOUNDER_ALLOCATION,
    PRESALE_ALLOCATION,
    RLYA_MAX_SUPPLY,
    RLYA_MAX_SUPPLY_TOKENS,
    RLYA_UNIT,
    STAKING_BONUS_BPS,
    STAKING_BONUS_RESERVE,
    STANDARD_PRESALE_RELEASE_OFFSET_SECONDS,
    STAKED_PRESALE_RELEASE_SECONDS,
)
from model.ralya_core.tokenomics import allocation_table, validate_tokenomics


class TokenomicsTests(unittest.TestCase):
    def test_hard_cap_exact(self):
        self.assertEqual(RLYA_MAX_SUPPLY, 839_000_000 * RLYA_UNIT)
        self.assertEqual(RLYA_MAX_SUPPLY_TOKENS, 839_000_000)

    def test_founder_is_exactly_ten_percent(self):
        self.assertEqual(FOUNDER_ALLOCATION, 83_900_000 * RLYA_UNIT)

    def test_working_allocations_sum_exactly_to_cap(self):
        validate_tokenomics()
        self.assertEqual(sum(allocation_table().values()), RLYA_MAX_SUPPLY)

    def test_public_presale_is_288_million(self):
        self.assertEqual(PRESALE_ALLOCATION, 288_000_000 * RLYA_UNIT)

    def test_staking_bonus_is_fixed_five_percent_with_full_reserve(self):
        self.assertEqual(STAKING_BONUS_BPS, 500)
        self.assertEqual(STAKING_BONUS_RESERVE, 14_400_000 * RLYA_UNIT)
        self.assertEqual(PRESALE_ALLOCATION * STAKING_BONUS_BPS // 10_000, STAKING_BONUS_RESERVE)

    def test_presale_release_windows(self):
        self.assertEqual(STANDARD_PRESALE_RELEASE_OFFSET_SECONDS, -(24 * 60 * 60))
        self.assertEqual(STAKED_PRESALE_RELEASE_SECONDS, 21 * 24 * 60 * 60)


if __name__ == "__main__":
    unittest.main()
