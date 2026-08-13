from dataclasses import dataclass
from enum import Enum

from .config import (
    RLYA_MAX_SUPPLY,
    RLYA_UNIT,
    USDC_UNIT,
    FOUNDER_ALLOCATION,
    PRESALE_ALLOCATION,
)
from .ledger import Ledger, LedgerError


REFERRAL_BPS = 100
BPS_DENOMINATOR = 10_000


class LiveSaleError(Exception):
    pass


class LiveSaleState(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    CLOSED = "closed"


@dataclass(frozen=True)
class CurveConfig:
    base_price_micro_usdc: int = 3_000       # $0.003000
    step_size_rlya: int = 1_000_000          # price step every 1M distributed
    step_increment_micro_usdc: int = 50      # +$0.000050 each step
    min_purchase_micro_usdc: int = USDC_UNIT # 1 USDC

    @property
    def step_size_base_units(self) -> int:
        return self.step_size_rlya * RLYA_UNIT


class LiveSaleEngine:
    """Executable mirror of the RLYA mainnet sale design.

    Confirmed buys are final and deliver RLYA immediately. No buyer allocation
    database, claim phase, refund state or refund instruction exists. Referred
    buys split a fixed 1% of the buyer's gross USDC payment to the referrer and
    the remaining 99% to treasury; the buyer receives the same RLYA quote and
    pays no surcharge. Off-site sales move RLYA from the same program sale vault
    to the recipient and advance the same public demand curve.
    """

    RLYA = "RLYA"
    USDC = "USDC"
    SALE_VAULT = "__rlya_sale_vault__"
    FOUNDER_VAULT = "__rlya_founder_vault__"
    TREASURY = "__rlya_treasury__"

    def __init__(self, ledger: Ledger, admin: str, curve: CurveConfig | None = None):
        if not admin:
            raise LiveSaleError("admin required")
        self.ledger = ledger
        self.admin = admin
        self.curve = curve or CurveConfig()
        if min(self.curve.base_price_micro_usdc, self.curve.step_size_rlya,
               self.curve.step_increment_micro_usdc, self.curve.min_purchase_micro_usdc) <= 0:
            raise LiveSaleError("curve parameters must be positive")
        self.state = LiveSaleState.DRAFT
        self.total_sold = 0
        self.manual_sold = 0
        self.total_usdc_raised = 0
        self.total_referral_usdc_paid = 0
        self.referral_earnings: dict[str, int] = {}
        self.referrer_of: dict[str, str] = {}

    def activate(self, caller: str):
        self._admin(caller)
        if self.state not in (LiveSaleState.DRAFT, LiveSaleState.PAUSED):
            raise LiveSaleError("sale cannot activate from current state")
        if self.ledger.issued(self.RLYA) != RLYA_MAX_SUPPLY:
            raise LiveSaleError("RLYA issued supply must equal the 839M hard cap")
        if self.ledger.balance(self.RLYA, self.SALE_VAULT) != PRESALE_ALLOCATION:
            raise LiveSaleError("sale vault must hold the exact presale allocation")
        if self.ledger.balance(self.RLYA, self.FOUNDER_VAULT) != FOUNDER_ALLOCATION:
            raise LiveSaleError("founder vault must hold the exact founder allocation")
        self.state = LiveSaleState.ACTIVE

    def pause(self, caller: str):
        self._admin(caller)
        if self.state != LiveSaleState.ACTIVE:
            raise LiveSaleError("only active sale can pause")
        self.state = LiveSaleState.PAUSED

    def resume(self, caller: str):
        self._admin(caller)
        if self.state != LiveSaleState.PAUSED:
            raise LiveSaleError("only paused sale can resume")
        self.state = LiveSaleState.ACTIVE

    def close(self, caller: str):
        self._admin(caller)
        if self.state not in (LiveSaleState.ACTIVE, LiveSaleState.PAUSED):
            raise LiveSaleError("sale cannot close from current state")
        self.state = LiveSaleState.CLOSED

    @property
    def remaining(self) -> int:
        return PRESALE_ALLOCATION - self.total_sold

    @property
    def current_price_micro_usdc(self) -> int:
        step = self.total_sold // self.curve.step_size_base_units
        return self.curve.base_price_micro_usdc + step * self.curve.step_increment_micro_usdc

    def quote(self, usdc_amount: int) -> int:
        if usdc_amount < self.curve.min_purchase_micro_usdc:
            return 0
        remaining_usdc = usdc_amount
        progress = self.total_sold
        allocation = 0
        loops = 0
        while remaining_usdc > 0:
            if progress >= PRESALE_ALLOCATION:
                raise LiveSaleError("presale sold out")
            loops += 1
            if loops > 256:
                raise LiveSaleError("too many pricing steps")
            step_index = progress // self.curve.step_size_base_units
            price = self.curve.base_price_micro_usdc + step_index * self.curve.step_increment_micro_usdc
            next_boundary = min((step_index + 1) * self.curve.step_size_base_units, PRESALE_ALLOCATION)
            available = next_boundary - progress
            cost_to_fill = self._ceil_div(available * price, RLYA_UNIT)
            if remaining_usdc >= cost_to_fill:
                allocation += available
                progress += available
                remaining_usdc -= cost_to_fill
            else:
                part = remaining_usdc * RLYA_UNIT // price
                if part <= 0:
                    raise LiveSaleError("purchase too small")
                if part > available:
                    raise LiveSaleError("curve arithmetic error")
                allocation += part
                progress += part
                remaining_usdc = 0
        if progress > PRESALE_ALLOCATION:
            raise LiveSaleError("presale sold out")
        return allocation

    def buy(self, buyer: str, usdc_amount: int, min_rlya_out: int = 0, referrer: str | None = None) -> int:
        if self.state != LiveSaleState.ACTIVE:
            raise LiveSaleError("sale is not active")
        if not buyer or buyer == self.admin:
            raise LiveSaleError("invalid buyer")
        if referrer == buyer:
            raise LiveSaleError("self-referral is not allowed")
        if referrer is not None and not referrer:
            raise LiveSaleError("invalid referrer")
        existing_referrer = self.referrer_of.get(buyer)
        if existing_referrer and referrer != existing_referrer:
            raise LiveSaleError("buyer referral attribution is already locked")
        if not referrer and existing_referrer:
            raise LiveSaleError("registered referral must be honored")
        first_attribution = bool(referrer and not existing_referrer)
        if first_attribution and self.referrer_of.get(referrer) == buyer:
            raise LiveSaleError("direct circular referral is not allowed")
        if usdc_amount < self.curve.min_purchase_micro_usdc:
            raise LiveSaleError("minimum purchase is 1 USDC")
        allocation = self.quote(usdc_amount)
        if allocation < min_rlya_out:
            raise LiveSaleError("on-chain quote is below buyer minimum")
        if self.total_sold + allocation > PRESALE_ALLOCATION:
            raise LiveSaleError("presale sold out")

        referral_reward = 0
        treasury_amount = usdc_amount
        if referrer:
            referral_reward = usdc_amount * REFERRAL_BPS // BPS_DENOMINATOR
            if referral_reward <= 0:
                raise LiveSaleError("purchase too small for referral reward")
            treasury_amount = usdc_amount - referral_reward

        # Model Solana atomicity by proving all legs can complete before state is advanced.
        if self.ledger.balance(self.USDC, buyer) < usdc_amount:
            raise LiveSaleError("insufficient USDC")
        if self.ledger.balance(self.RLYA, self.SALE_VAULT) < allocation:
            raise LiveSaleError("sale vault underfunded")
        try:
            if referrer:
                self.ledger.transfer(self.USDC, buyer, self.TREASURY, treasury_amount)
                self.ledger.transfer(self.USDC, buyer, referrer, referral_reward)
            else:
                self.ledger.transfer(self.USDC, buyer, self.TREASURY, usdc_amount)
            self.ledger.transfer(self.RLYA, self.SALE_VAULT, buyer, allocation)
        except LedgerError as exc:
            raise LiveSaleError(str(exc)) from exc

        self.total_sold += allocation
        self.total_usdc_raised += usdc_amount
        if referrer:
            if first_attribution:
                self.referrer_of[buyer] = referrer
            self.total_referral_usdc_paid += referral_reward
            self.referral_earnings[referrer] = self.referral_earnings.get(referrer, 0) + referral_reward
        return allocation

    def referral_earned(self, referrer: str) -> int:
        return self.referral_earnings.get(referrer, 0)

    def manual_sale(self, caller: str, recipient: str, rlya_amount: int) -> int:
        self._admin(caller)
        if self.state not in (LiveSaleState.ACTIVE, LiveSaleState.PAUSED):
            raise LiveSaleError("manual sale unavailable in current state")
        if not recipient or rlya_amount <= 0:
            raise LiveSaleError("recipient and positive amount required")
        if self.total_sold + rlya_amount > PRESALE_ALLOCATION:
            raise LiveSaleError("presale sold out")
        try:
            self.ledger.transfer(self.RLYA, self.SALE_VAULT, recipient, rlya_amount)
        except LedgerError as exc:
            raise LiveSaleError(str(exc)) from exc
        self.total_sold += rlya_amount
        self.manual_sold += rlya_amount
        return self.current_price_micro_usdc

    def withdraw_unsold(self, caller: str) -> int:
        self._admin(caller)
        if self.state != LiveSaleState.CLOSED:
            raise LiveSaleError("sale must be closed")
        amount = self.ledger.balance(self.RLYA, self.SALE_VAULT)
        if amount:
            self.ledger.transfer(self.RLYA, self.SALE_VAULT, self.TREASURY, amount)
        return amount

    def _admin(self, caller: str):
        if caller != self.admin:
            raise LiveSaleError("admin authorization failed")

    @staticmethod
    def _ceil_div(n: int, d: int) -> int:
        return (n + d - 1) // d
