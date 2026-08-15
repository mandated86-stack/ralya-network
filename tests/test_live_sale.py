import unittest

from model.ralya_core.config import (
    FOUNDER_ALLOCATION,
    PRESALE_ALLOCATION,
    RLYA_MAX_SUPPLY,
    RLYA_UNIT,
    STAKING_BONUS_RESERVE,
    USDC_UNIT,
)
from model.ralya_core.ledger import Ledger
from model.ralya_core.live_sale import CurveConfig, LiveSaleEngine, LiveSaleError, LiveSaleState


class LiveSaleTests(unittest.TestCase):
    def setUp(self):
        self.l = Ledger()
        self.l.mint("RLYA", "genesis", RLYA_MAX_SUPPLY)
        self.l.transfer("RLYA", "genesis", LiveSaleEngine.SALE_VAULT, PRESALE_ALLOCATION)
        self.l.transfer("RLYA", "genesis", LiveSaleEngine.STAKING_BONUS_VAULT, STAKING_BONUS_RESERVE)
        self.l.transfer("RLYA", "genesis", LiveSaleEngine.FOUNDER_VAULT, FOUNDER_ALLOCATION)
        remaining = self.l.balance("RLYA", "genesis")
        self.l.transfer("RLYA", "genesis", LiveSaleEngine.TREASURY, remaining)
        self.l.mint("USDC", "alice", 2_000_000 * USDC_UNIT)
        self.l.mint("USDC", "bob", 2_000_000 * USDC_UNIT)
        self.s = LiveSaleEngine(self.l, "admin")
        self.s.activate("admin")

    def test_start_price_is_point_zero_zero_three(self):
        self.assertEqual(self.s.current_price_micro_usdc, 3_000)

    def test_buy_delivers_tokens_immediately_and_usdc_goes_to_treasury(self):
        before = self.l.balance("RLYA", "alice")
        got = self.s.buy("alice", 300 * USDC_UNIT)
        self.assertEqual(got, 100_000 * RLYA_UNIT)
        self.assertEqual(self.l.balance("RLYA", "alice") - before, got)
        self.assertEqual(self.l.balance("USDC", LiveSaleEngine.TREASURY), 300 * USDC_UNIT)

    def test_activation_requires_exact_staking_bonus_reserve(self):
        bad = Ledger()
        bad.mint("RLYA", "genesis", RLYA_MAX_SUPPLY)
        bad.transfer("RLYA", "genesis", LiveSaleEngine.SALE_VAULT, PRESALE_ALLOCATION)
        bad.transfer("RLYA", "genesis", LiveSaleEngine.FOUNDER_VAULT, FOUNDER_ALLOCATION)
        bad.transfer("RLYA", "genesis", LiveSaleEngine.TREASURY, bad.balance("RLYA", "genesis"))
        s = LiveSaleEngine(bad, "admin")
        with self.assertRaises(LiveSaleError):
            s.activate("admin")

    def test_buyer_minimum_output_protects_against_price_step_movement(self):
        displayed = self.s.quote(300 * USDC_UNIT)
        self.s.manual_sale("admin", "bob", 1_000_000 * RLYA_UNIT)
        alice_usdc_before = self.l.balance("USDC", "alice")
        treasury_before = self.l.balance("USDC", LiveSaleEngine.TREASURY)
        with self.assertRaises(LiveSaleError):
            self.s.buy("alice", 300 * USDC_UNIT, min_rlya_out=displayed)
        self.assertEqual(self.l.balance("USDC", "alice"), alice_usdc_before)
        self.assertEqual(self.l.balance("USDC", LiveSaleEngine.TREASURY), treasury_before)

    def test_failed_buy_does_not_move_usdc(self):
        quoted = self.s.quote(10 * USDC_UNIT)
        self.l.transfer("USDC", "alice", "drain", self.l.balance("USDC", "alice"))
        treasury_before = self.l.balance("USDC", LiveSaleEngine.TREASURY)
        with self.assertRaises(LiveSaleError):
            self.s.buy("alice", 10 * USDC_UNIT, min_rlya_out=quoted)
        self.assertEqual(self.l.balance("USDC", LiveSaleEngine.TREASURY), treasury_before)

    def test_price_rises_each_million_distributed(self):
        self.s.manual_sale("admin", "bob", 1_000_000 * RLYA_UNIT)
        self.assertEqual(self.s.current_price_micro_usdc, 3_050)
        self.s.manual_sale("admin", "bob", 4_000_000 * RLYA_UNIT)
        self.assertEqual(self.s.current_price_micro_usdc, 3_250)

    def test_large_purchase_crosses_price_steps_piecewise(self):
        quoted = self.s.quote(6_050 * USDC_UNIT)
        self.assertEqual(quoted, 2_000_000 * RLYA_UNIT)

    def test_manual_sale_uses_same_presale_vault_and_advances_curve(self):
        before = self.l.balance("RLYA", LiveSaleEngine.SALE_VAULT)
        next_price = self.s.manual_sale("admin", "bob", 2_000_000 * RLYA_UNIT)
        self.assertEqual(self.l.balance("RLYA", "bob"), 2_000_000 * RLYA_UNIT)
        self.assertEqual(before - self.l.balance("RLYA", LiveSaleEngine.SALE_VAULT), 2_000_000 * RLYA_UNIT)
        self.assertEqual(self.s.manual_sold, 2_000_000 * RLYA_UNIT)
        self.assertEqual(next_price, 3_100)

    def test_non_admin_cannot_manual_sale(self):
        with self.assertRaises(LiveSaleError):
            self.s.manual_sale("alice", "bob", RLYA_UNIT)

    def test_pause_blocks_web_buy_but_allows_admin_offsite_distribution(self):
        self.s.pause("admin")
        with self.assertRaises(LiveSaleError):
            self.s.buy("alice", 10 * USDC_UNIT)
        self.s.manual_sale("admin", "bob", 10 * RLYA_UNIT)
        self.assertEqual(self.l.balance("RLYA", "bob"), 10 * RLYA_UNIT)

    def test_no_refund_or_claim_api(self):
        for forbidden in ("refund", "claim", "cancel_for_refunds"):
            self.assertFalse(hasattr(self.s, forbidden))
        self.assertNotIn("refunding", {s.value for s in LiveSaleState})

    def test_exact_hard_cap_required_before_activation(self):
        bad = Ledger()
        bad.mint("RLYA", LiveSaleEngine.SALE_VAULT, PRESALE_ALLOCATION)
        bad.mint("RLYA", LiveSaleEngine.STAKING_BONUS_VAULT, STAKING_BONUS_RESERVE)
        bad.mint("RLYA", LiveSaleEngine.FOUNDER_VAULT, FOUNDER_ALLOCATION)
        s = LiveSaleEngine(bad, "admin")
        with self.assertRaises(LiveSaleError):
            s.activate("admin")

    def test_sale_cannot_exceed_presale_cap(self):
        self.s.manual_sale("admin", "bob", PRESALE_ALLOCATION)
        with self.assertRaises(LiveSaleError):
            self.s.manual_sale("admin", "bob", 1)

    def test_withdraw_unsold_only_after_close(self):
        with self.assertRaises(LiveSaleError):
            self.s.withdraw_unsold("admin")
        self.s.close("admin")
        amount = self.s.withdraw_unsold("admin")
        self.assertEqual(amount, PRESALE_ALLOCATION)
        self.assertEqual(self.l.balance("RLYA", LiveSaleEngine.SALE_VAULT), 0)
        self.assertEqual(self.l.balance("RLYA", LiveSaleEngine.STAKING_BONUS_VAULT), 0)

    def test_ledger_conservation_after_mixed_sales(self):
        self.s.buy("alice", 1_000 * USDC_UNIT)
        self.s.manual_sale("admin", "bob", 777_777 * RLYA_UNIT)
        self.l.assert_conservation("RLYA")
        self.l.assert_conservation("USDC")

    def test_referred_purchase_pays_one_percent_usdc_and_same_rlya_quote(self):
        gross = 500 * USDC_UNIT
        expected = self.s.quote(gross)
        alice_before = self.l.balance("USDC", "alice")
        treasury_before = self.l.balance("USDC", LiveSaleEngine.TREASURY)
        got = self.s.buy("alice", gross, referrer="referrer")
        self.assertEqual(got, expected)
        self.assertEqual(self.l.balance("USDC", "alice"), alice_before - gross)
        self.assertEqual(self.l.balance("USDC", "referrer"), 5 * USDC_UNIT)
        self.assertEqual(self.l.balance("USDC", LiveSaleEngine.TREASURY) - treasury_before, 495 * USDC_UNIT)
        self.assertEqual(self.s.total_referral_usdc_paid, 5 * USDC_UNIT)
        self.assertEqual(self.s.referral_earned("referrer"), 5 * USDC_UNIT)

    def test_direct_purchase_has_no_referral_payout(self):
        self.s.buy("alice", 500 * USDC_UNIT)
        self.assertEqual(self.s.total_referral_usdc_paid, 0)
        self.assertEqual(self.s.referral_earned("referrer"), 0)
        self.assertEqual(self.l.balance("USDC", LiveSaleEngine.TREASURY), 500 * USDC_UNIT)

    def test_self_referral_is_blocked_before_funds_move(self):
        alice_before = self.l.balance("USDC", "alice")
        treasury_before = self.l.balance("USDC", LiveSaleEngine.TREASURY)
        with self.assertRaises(LiveSaleError):
            self.s.buy("alice", 500 * USDC_UNIT, referrer="alice")
        self.assertEqual(self.l.balance("USDC", "alice"), alice_before)
        self.assertEqual(self.l.balance("USDC", LiveSaleEngine.TREASURY), treasury_before)
        self.assertEqual(self.s.total_sold, 0)

    def test_referral_is_not_a_buyer_surcharge(self):
        gross = 1_234 * USDC_UNIT
        direct_quote = self.s.quote(gross)
        buyer_before = self.l.balance("USDC", "alice")
        got = self.s.buy("alice", gross, referrer="partner")
        self.assertEqual(got, direct_quote)
        self.assertEqual(buyer_before - self.l.balance("USDC", "alice"), gross)

    def test_first_referral_attribution_is_locked(self):
        self.s.buy("alice", 10 * USDC_UNIT, referrer="partner")
        with self.assertRaises(LiveSaleError):
            self.s.buy("alice", 10 * USDC_UNIT, referrer="other")
        self.assertEqual(self.s.referrer_of["alice"], "partner")

    def test_registered_referral_cannot_be_bypassed_with_direct_buy(self):
        self.s.buy("alice", 10 * USDC_UNIT, referrer="partner")
        with self.assertRaises(LiveSaleError):
            self.s.buy("alice", 10 * USDC_UNIT)
        self.s.buy("alice", 10 * USDC_UNIT, referrer="partner")
        self.assertEqual(self.s.referral_earned("partner"), 200_000)

    def test_direct_two_wallet_referral_loop_is_blocked(self):
        self.s.buy("alice", 10 * USDC_UNIT, referrer="bob")
        with self.assertRaises(LiveSaleError):
            self.s.buy("bob", 10 * USDC_UNIT, referrer="alice")


if __name__ == "__main__":
    unittest.main()
