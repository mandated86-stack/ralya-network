import unittest

from model.ralya_core.ledger import Ledger, LedgerError


class LedgerTests(unittest.TestCase):
    def test_conservation(self):
        l = Ledger()
        l.mint("RLYA", "a", 100)
        l.transfer("RLYA", "a", "b", 37)
        l.assert_conservation("RLYA")
        self.assertEqual(l.balance("RLYA", "a"), 63)
        self.assertEqual(l.balance("RLYA", "b"), 37)

    def test_no_overspend(self):
        l = Ledger(); l.mint("X", "a", 10)
        with self.assertRaises(LedgerError):
            l.transfer("X", "a", "b", 11)

    def test_no_float_money(self):
        l = Ledger()
        with self.assertRaises(LedgerError):
            l.mint("X", "a", 1.5)

    def test_burn_conserves(self):
        l = Ledger(); l.mint("X", "a", 10); l.burn("X", "a", 4)
        l.assert_conservation("X")
        self.assertEqual(l.circulating("X"), 6)


if __name__ == "__main__": unittest.main()
