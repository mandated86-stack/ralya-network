import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAM = ROOT / "programs/rlya_sale/src/lib.rs"
WEB = ROOT / "web"


class ReleaseGuardTests(unittest.TestCase):
    def test_live_sale_has_no_refund_or_claim_instruction(self):
        text = PROGRAM.read_text().lower()
        for forbidden in (
            "pub fn refund",
            "pub fn claim",
            "cancel_for_refunds",
            "refunding",
            "claim_vault",
        ):
            self.assertNotIn(forbidden, text)

    def test_live_sale_contains_no_mint_instruction(self):
        text = PROGRAM.read_text().lower()
        self.assertNotIn("mint_to", text)
        self.assertNotIn("mintto", text)

    def test_activation_requires_revoked_mint_and_freeze_authorities(self):
        text = PROGRAM.read_text()
        self.assertIn("mint_authority.is_none()", text)
        self.assertIn("freeze_authority.is_none()", text)
        self.assertIn("rlya_mint.supply == HARD_CAP", text)
        self.assertIn("mint_authority == COption::Some(ctx.accounts.admin.key())", text)

    def test_published_price_curve_is_compiled_into_program(self):
        text = PROGRAM.read_text()
        self.assertIn("BASE_PRICE_MICRO_USDC: u64 = 3_000", text)
        self.assertIn("STEP_SIZE_RLYA: u64 = 1_000_000", text)
        self.assertIn("STEP_INCREMENT_MICRO_USDC: u64 = 50", text)
        init = text[text.index("pub fn initialize"):text.index("pub fn activate")]
        self.assertNotIn("base_price_micro_usdc:", init.split("-> Result", 1)[0])

    def test_buy_has_on_chain_minimum_output_protection(self):
        text = PROGRAM.read_text()
        buy = text[text.index("pub fn buy"):text.index("pub fn manual_sale")]
        self.assertIn("min_rlya_out", buy)
        self.assertIn("allocation >= min_rlya_out", buy)

    def test_manual_sale_advances_same_total_sold_counter(self):
        text = PROGRAM.read_text()
        manual = text[text.index("pub fn manual_sale"):text.index("pub fn close_sale")]
        self.assertIn("sale.total_sold = new_total", manual)
        self.assertIn("sale.manual_sold", manual)
        self.assertIn("sale_vault", manual)

    def test_no_simulated_purchase_language_in_public_site(self):
        public_text = "\n".join(p.read_text(errors="ignore").lower() for p in WEB.glob("*.html"))
        public_text += "\n" + "\n".join(p.read_text(errors="ignore").lower() for p in WEB.glob("*.js"))
        for forbidden in ("simulate purchase", "simulated allocation", "preview checkout"):
            self.assertNotIn(forbidden, public_text)

    def test_public_site_does_not_prominently_market_founder_percentage(self):
        home = (WEB / "index.html").read_text().lower()
        hero = home[: home.find('</section>') if '</section>' in home else 5000]
        self.assertNotIn("founder allocation", hero)
        self.assertNotIn("83,900,000", hero)

    def test_site_has_real_wallet_balance_code(self):
        text = (WEB / "app.js").read_text()
        self.assertRegex(text, re.compile(r"getParsedTokenAccountsByOwner|fetchTokenBalance"))

    def test_referral_rate_and_payout_path_are_fixed_in_program(self):
        text = PROGRAM.read_text()
        self.assertIn("REFERRAL_BPS: u64 = 100", text)
        self.assertIn("BPS_DENOMINATOR: u64 = 10_000", text)
        self.assertIn("pub fn buy_with_referral", text)
        self.assertIn("sale.referral_bps = REFERRAL_BPS", text)
        self.assertIn("buyer.key() != ctx.accounts.referrer.key()", text)
        self.assertIn("referrer_usdc_account", text)
        self.assertIn("total_referral_usdc_paid", text)
        self.assertIn("pub fn register_referral", text)
        self.assertIn("ReferralAttribution", text)
        self.assertIn("ReferralRequired", text)
        self.assertIn("CircularReferral", text)


if __name__ == "__main__":
    unittest.main()
