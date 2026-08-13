import unittest

from model.ralya_core.config import RLYA_UNIT, USDC_UNIT
from model.ralya_core.jobs import JobEngine, JobError, JobState, DisputeDecision, VerificationMode
from model.ralya_core.ledger import Ledger


class JobTests(unittest.TestCase):
    def setUp(self):
        self.l = Ledger()
        self.l.mint("USDC", "buyer", 1_000 * USDC_UNIT)
        self.l.mint("RLYA", "provider", 100_000 * RLYA_UNIT)
        self.e = JobEngine(self.l, arbiter="arb")
        self.t0 = 1_000_000

    def create_accept_submit(self):
        j = self.e.create_job("buyer", "USDC", 100 * USDC_UNIT, "meta1", 1000 * RLYA_UNIT, self.t0)
        self.e.accept_job(j.job_id, "provider", self.t0 + 10)
        self.e.submit_result(j.job_id, "provider", "result1", self.t0 + 20)
        return j

    def test_success_path(self):
        j = self.create_accept_submit()
        self.e.buyer_accept(j.job_id, "buyer", self.t0 + 30)
        self.assertEqual(j.state, JobState.COMPLETED)
        self.assertEqual(self.l.balance("USDC", JobEngine.ESCROW_ACCOUNT), 0)
        self.assertEqual(self.l.balance("RLYA", JobEngine.BOND_ACCOUNT), 0)
        self.assertGreater(self.l.balance("USDC", "provider"), 0)
        self.l.assert_conservation("USDC"); self.l.assert_conservation("RLYA")

    def test_default_fee_distribution_is_exact(self):
        j = self.create_accept_submit()
        self.e.buyer_accept(j.job_id, "buyer", self.t0 + 30)
        self.assertEqual(self.l.balance("USDC", "provider"), 99 * USDC_UNIT)
        self.assertEqual(self.l.balance("USDC", JobEngine.TREASURY_ACCOUNT), 900_000)
        self.assertEqual(self.l.balance("USDC", JobEngine.DEV_FEE_ACCOUNT), 100_000)

    def test_buyer_cannot_accept_own_job(self):
        j = self.e.create_job("buyer", "USDC", 10 * USDC_UNIT, "meta", RLYA_UNIT, self.t0)
        self.l.mint("RLYA", "buyer", 10 * RLYA_UNIT)
        with self.assertRaises(JobError):
            self.e.accept_job(j.job_id, "buyer", self.t0 + 1)

    def test_unauthorized_accept_result(self):
        j = self.create_accept_submit()
        with self.assertRaises(JobError):
            self.e.buyer_accept(j.job_id, "attacker", self.t0 + 30)

    def test_double_settlement_rejected(self):
        j = self.create_accept_submit()
        self.e.buyer_accept(j.job_id, "buyer", self.t0 + 30)
        with self.assertRaises(JobError):
            self.e.buyer_accept(j.job_id, "buyer", self.t0 + 31)

    def test_dispute_buyer_wins_refund_and_slash(self):
        j = self.create_accept_submit()
        buyer_before = self.l.balance("USDC", "buyer")
        self.e.buyer_dispute(j.job_id, "buyer", "reason", self.t0 + 30)
        self.e.resolve_dispute(j.job_id, "arb", DisputeDecision.BUYER_WINS, self.t0 + 40)
        self.assertEqual(j.state, JobState.REFUNDED)
        self.assertEqual(self.l.balance("USDC", "buyer"), buyer_before + 100 * USDC_UNIT)
        self.assertEqual(self.l.balance("RLYA", JobEngine.BOND_ACCOUNT), 0)

    def test_dispute_provider_wins(self):
        j = self.create_accept_submit()
        self.e.buyer_dispute(j.job_id, "buyer", "reason", self.t0 + 30)
        self.e.resolve_dispute(j.job_id, "arb", DisputeDecision.PROVIDER_WINS, self.t0 + 40)
        self.assertEqual(j.state, JobState.COMPLETED)
        self.assertEqual(self.l.balance("RLYA", JobEngine.BOND_ACCOUNT), 0)

    def test_only_arbiter_resolves(self):
        j = self.create_accept_submit(); self.e.buyer_dispute(j.job_id, "buyer", "reason", self.t0 + 30)
        with self.assertRaises(JobError):
            self.e.resolve_dispute(j.job_id, "buyer", DisputeDecision.BUYER_WINS, self.t0 + 40)

    def test_silent_buyer_cannot_freeze_provider_forever(self):
        j = self.create_accept_submit()
        with self.assertRaises(JobError):
            self.e.finalize_after_review(j.job_id, "provider", j.review_deadline)
        self.e.finalize_after_review(j.job_id, "provider", j.review_deadline + 1)
        self.assertEqual(j.state, JobState.COMPLETED)

    def test_provider_timeout_refunds_and_slashes(self):
        j = self.e.create_job("buyer", "USDC", 50 * USDC_UNIT, "meta", 250 * RLYA_UNIT, self.t0)
        self.e.accept_job(j.job_id, "provider", self.t0 + 1, work_window_seconds=100)
        with self.assertRaises(JobError):
            self.e.provider_timeout(j.job_id, "buyer", self.t0 + 101)
        self.e.provider_timeout(j.job_id, "buyer", self.t0 + 102)
        self.assertEqual(j.state, JobState.REFUNDED)

    def test_open_job_cancel(self):
        before = self.l.balance("USDC", "buyer")
        j = self.e.create_job("buyer", "USDC", 25 * USDC_UNIT, "meta", RLYA_UNIT, self.t0)
        self.e.cancel_unaccepted(j.job_id, "buyer", self.t0 + 1)
        self.assertEqual(self.l.balance("USDC", "buyer"), before)
        self.assertEqual(j.state, JobState.CANCELLED)

    def test_expired_open_job_refund(self):
        j = self.e.create_job("buyer", "USDC", 25 * USDC_UNIT, "meta", RLYA_UNIT, self.t0, ttl_seconds=100)
        with self.assertRaises(JobError): self.e.expire_unaccepted(j.job_id, self.t0 + 100)
        self.e.expire_unaccepted(j.job_id, self.t0 + 101)
        self.assertEqual(j.state, JobState.REFUNDED)

    def test_future_verification_mode_not_fake_enabled(self):
        with self.assertRaises(JobError):
            self.e.create_job("buyer", "USDC", USDC_UNIT, "m", RLYA_UNIT, self.t0,
                              verification_mode=VerificationMode.DETERMINISTIC)

    def test_split_dispute_conserves_money(self):
        j = self.create_accept_submit(); self.e.buyer_dispute(j.job_id, "buyer", "reason", self.t0+30)
        self.e.resolve_dispute(j.job_id, "arb", DisputeDecision.SPLIT, self.t0+40, provider_payment_bps=4000)
        self.l.assert_conservation("USDC"); self.l.assert_conservation("RLYA")
        self.assertEqual(self.l.balance("USDC", JobEngine.ESCROW_ACCOUNT), 0)


if __name__ == "__main__": unittest.main()
