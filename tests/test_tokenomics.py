import unittest

from model.ralya_core.config import (
    FOUNDER_ALLOCATION,
    PRESALE_ALLOCATION,
    RLYA_MAX_SUPPLY,
    RLYA_MAX_SUPPLY_TOKENS,
    RLYA_UNIT,
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

    def test_presale_is_twelve_percent_in_working_model(self):
        self.assertEqual(PRESALE_ALLOCATION, 100_680_000 * RLYA_UNIT)


if __name__ == "__main__":
    unittest.main()
