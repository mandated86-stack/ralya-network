import random
import unittest

from model.ralya_core.config import FOUNDER_ALLOCATION, PRESALE_ALLOCATION, RLYA_MAX_SUPPLY, RLYA_UNIT, STAKING_BONUS_RESERVE, USDC_UNIT
from model.ralya_core.ledger import Ledger
from model.ralya_core.live_sale import LiveSaleEngine, LiveSaleError


class FuzzInvariantTests(unittest.TestCase):
    def test_5000_random_live_sale_operations_preserve_supply_and_cap(self):
        rng = random.Random(839003)
        l = Ledger()
        l.mint("RLYA", "genesis", RLYA_MAX_SUPPLY)
        l.transfer("RLYA", "genesis", LiveSaleEngine.SALE_VAULT, PRESALE_ALLOCATION)
        l.transfer("RLYA", "genesis", LiveSaleEngine.STAKING_BONUS_VAULT, STAKING_BONUS_RESERVE)
        l.transfer("RLYA", "genesis", LiveSaleEngine.FOUNDER_VAULT, FOUNDER_ALLOCATION)
        l.transfer("RLYA", "genesis", LiveSaleEngine.TREASURY, l.balance("RLYA", "genesis"))
        buyers = [f"buyer-{i}" for i in range(100)]
        for b in buyers:
            l.mint("USDC", b, 1_000_000 * USDC_UNIT)
        sale = LiveSaleEngine(l, "admin")
        sale.activate("admin")
        last_price = sale.current_price_micro_usdc

        for _ in range(5000):
            buyer = rng.choice(buyers)
            try:
                if rng.random() < 0.18:
                    qty = rng.randint(1, 50_000) * RLYA_UNIT
                    sale.manual_sale("admin", buyer, qty)
                else:
                    usdc = rng.randint(1, 5_000) * USDC_UNIT
                    sale.buy(buyer, usdc)
            except LiveSaleError:
                pass
            self.assertLessEqual(sale.total_sold, PRESALE_ALLOCATION)
            self.assertGreaterEqual(sale.current_price_micro_usdc, last_price)
            last_price = sale.current_price_micro_usdc
            l.assert_conservation("RLYA")
            l.assert_conservation("USDC")

        self.assertEqual(l.issued("RLYA"), RLYA_MAX_SUPPLY)


if __name__ == "__main__":
    unittest.main()
