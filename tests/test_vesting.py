import unittest
from model.ralya_core.config import FOUNDER_ALLOCATION, FOUNDER_LOCK_SECONDS
from model.ralya_core.vesting import FounderLock, VestingError

class VestingTests(unittest.TestCase):
    def test_locked_one_year(self):
        v = FounderLock("founder", 1000)
        with self.assertRaises(VestingError): v.release("founder", 1000 + FOUNDER_LOCK_SECONDS - 1)
        self.assertEqual(v.release("founder", 1000 + FOUNDER_LOCK_SECONDS), FOUNDER_ALLOCATION)
        with self.assertRaises(VestingError): v.release("founder", 1000 + FOUNDER_LOCK_SECONDS + 1)

    def test_only_owner_can_release(self):
        v = FounderLock("founder", 0)
        with self.assertRaises(VestingError): v.release("attacker", FOUNDER_LOCK_SECONDS)

if __name__ == "__main__": unittest.main()
