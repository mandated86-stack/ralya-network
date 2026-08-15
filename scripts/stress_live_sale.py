#!/usr/bin/env python3
import argparse
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from model.ralya_core.config import FOUNDER_ALLOCATION, PRESALE_ALLOCATION, RLYA_MAX_SUPPLY, RLYA_UNIT, STAKING_BONUS_RESERVE, USDC_UNIT
from model.ralya_core.ledger import Ledger
from model.ralya_core.live_sale import LiveSaleEngine, LiveSaleError


def build_engine():
    l = Ledger()
    l.mint("RLYA", "genesis", RLYA_MAX_SUPPLY)
    l.transfer("RLYA", "genesis", LiveSaleEngine.SALE_VAULT, PRESALE_ALLOCATION)
    l.transfer("RLYA", "genesis", LiveSaleEngine.STAKING_BONUS_VAULT, STAKING_BONUS_RESERVE)
    l.transfer("RLYA", "genesis", LiveSaleEngine.FOUNDER_VAULT, FOUNDER_ALLOCATION)
    l.transfer("RLYA", "genesis", LiveSaleEngine.TREASURY, l.balance("RLYA", "genesis"))
    for i in range(200):
        l.mint("USDC", f"buyer{i}", 1_000_000 * USDC_UNIT)
    s = LiveSaleEngine(l, "admin")
    s.activate("admin")
    return l, s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--operations", type=int, default=50_000)
    args = ap.parse_args()
    random.seed(839_003)
    l, s = build_engine()
    operations = 0
    rejected = 0
    gross_web_usdc = 0
    last_price = s.current_price_micro_usdc
    referrers = [f"referrer{i}" for i in range(50)]
    buyer_referrer = {}

    for _ in range(args.operations):
        if s.remaining <= 0:
            break
        if random.random() < 0.86:
            buyer = f"buyer{random.randrange(200)}"
            # Small orders keep the test running for the full requested operation
            # count instead of selling out after only a few hundred iterations.
            usdc = random.randint(1, 4) * USDC_UNIT
            if buyer in buyer_referrer:
                referrer = buyer_referrer[buyer]
            elif random.random() < 0.35:
                referrer = random.choice(referrers)
                buyer_referrer[buyer] = referrer
            else:
                referrer = None
            try:
                s.buy(buyer, usdc, referrer=referrer)
                gross_web_usdc += usdc
            except LiveSaleError:
                rejected += 1
        else:
            recipient = f"manual{random.randrange(200)}"
            amount = min(random.randint(1, 100) * RLYA_UNIT, s.remaining)
            if amount:
                try:
                    s.manual_sale("admin", recipient, amount)
                except LiveSaleError:
                    rejected += 1
        operations += 1
        if s.total_sold > PRESALE_ALLOCATION:
            raise AssertionError("presale cap exceeded")
        if s.current_price_micro_usdc < last_price:
            raise AssertionError("price moved backwards")
        last_price = s.current_price_micro_usdc
        l.assert_conservation("RLYA")
        l.assert_conservation("USDC")

    treasury_usdc = l.balance("USDC", LiveSaleEngine.TREASURY)
    if treasury_usdc + s.total_referral_usdc_paid != gross_web_usdc:
        raise AssertionError("gross USDC does not reconcile to treasury + referral rewards")
    if sum(s.referral_earnings.values()) != s.total_referral_usdc_paid:
        raise AssertionError("per-referrer earnings do not reconcile to aggregate referral payout")

    print(
        f"live-sale stress passed: {operations:,} operations; {rejected:,} rejected; "
        f"sold={s.total_sold/RLYA_UNIT:,.3f} RLYA; "
        f"referral_paid={s.total_referral_usdc_paid/USDC_UNIT:,.2f} USDC; "
        f"price=${s.current_price_micro_usdc/1_000_000:.6f}"
    )


if __name__ == "__main__":
    main()
