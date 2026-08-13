from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .config import (
    DEFAULT_JOB_TTL_SECONDS,
    DEFAULT_PROTOCOL_FEE_BPS,
    DEFAULT_PROVIDER_WORK_WINDOW_SECONDS,
    DEFAULT_REVIEW_WINDOW_SECONDS,
    DEV_SHARE_OF_PROTOCOL_FEE_BPS,
    SLASH_TO_BUYER_BPS,
    SLASH_TO_TREASURY_BPS,
)
from .ledger import Ledger, LedgerError


class JobError(Exception):
    pass


class JobState(str, Enum):
    OPEN = "open"
    ACCEPTED = "accepted"
    SUBMITTED = "submitted"
    DISPUTED = "disputed"
    COMPLETED = "completed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class VerificationMode(str, Enum):
    BUYER_ACCEPTANCE = "buyer_acceptance"
    DETERMINISTIC = "deterministic_future"
    COMMITTEE = "committee_future"


class DisputeDecision(str, Enum):
    PROVIDER_WINS = "provider_wins"
    BUYER_WINS = "buyer_wins"
    SPLIT = "split"


@dataclass
class Job:
    job_id: int
    buyer: str
    payment_asset: str
    payment_amount: int
    metadata_hash: str
    bond_amount_rlya: int
    created_at: int
    accept_deadline: int
    verification_mode: VerificationMode
    state: JobState = JobState.OPEN
    provider: Optional[str] = None
    provider_deadline: Optional[int] = None
    result_hash: Optional[str] = None
    submitted_at: Optional[int] = None
    review_deadline: Optional[int] = None
    dispute_reason_hash: Optional[str] = None
    settled_at: Optional[int] = None


class JobEngine:
    ESCROW_ACCOUNT = "__ralya_job_payment_escrow__"
    BOND_ACCOUNT = "__ralya_job_bond_escrow__"
    TREASURY_ACCOUNT = "__ralya_protocol_treasury__"
    DEV_FEE_ACCOUNT = "__ralya_dev_fee__"
    BOND_ASSET = "RLYA"

    def __init__(self, ledger: Ledger, arbiter: str = "ralya_arbiter"):
        self.ledger = ledger
        self.arbiter = arbiter
        self.jobs: dict[int, Job] = {}
        self.next_job_id = 1

    def create_job(
        self,
        buyer: str,
        payment_asset: str,
        payment_amount: int,
        metadata_hash: str,
        bond_amount_rlya: int,
        now: int,
        ttl_seconds: int = DEFAULT_JOB_TTL_SECONDS,
        verification_mode: VerificationMode = VerificationMode.BUYER_ACCEPTANCE,
    ) -> Job:
        if not buyer or not payment_asset or not metadata_hash:
            raise JobError("buyer, payment asset, and metadata hash are required")
        if payment_amount <= 0 or bond_amount_rlya <= 0:
            raise JobError("payment and bond must be positive")
        if ttl_seconds <= 0:
            raise JobError("job TTL must be positive")
        # V1 only supports buyer acceptance on-chain; future modes remain explicit rather than pretending.
        if verification_mode != VerificationMode.BUYER_ACCEPTANCE:
            raise JobError("verification mode not enabled in v1")
        try:
            self.ledger.transfer(payment_asset, buyer, self.ESCROW_ACCOUNT, payment_amount)
        except LedgerError as exc:
            raise JobError(str(exc)) from exc
        job = Job(
            job_id=self.next_job_id,
            buyer=buyer,
            payment_asset=payment_asset,
            payment_amount=payment_amount,
            metadata_hash=metadata_hash,
            bond_amount_rlya=bond_amount_rlya,
            created_at=now,
            accept_deadline=now + ttl_seconds,
            verification_mode=verification_mode,
        )
        self.jobs[job.job_id] = job
        self.next_job_id += 1
        return job

    def accept_job(self, job_id: int, provider: str, now: int,
                   work_window_seconds: int = DEFAULT_PROVIDER_WORK_WINDOW_SECONDS) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.OPEN)
        if provider == job.buyer:
            raise JobError("buyer cannot accept own job")
        if now > job.accept_deadline:
            raise JobError("job acceptance deadline passed")
        if work_window_seconds <= 0:
            raise JobError("work window must be positive")
        try:
            self.ledger.transfer(self.BOND_ASSET, provider, self.BOND_ACCOUNT, job.bond_amount_rlya)
        except LedgerError as exc:
            raise JobError(str(exc)) from exc
        job.provider = provider
        job.provider_deadline = now + work_window_seconds
        job.state = JobState.ACCEPTED
        return job

    def submit_result(self, job_id: int, provider: str, result_hash: str, now: int,
                      review_window_seconds: int = DEFAULT_REVIEW_WINDOW_SECONDS) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.ACCEPTED)
        self._require_provider(job, provider)
        if not result_hash:
            raise JobError("result hash required")
        if now > (job.provider_deadline or 0):
            raise JobError("provider deadline passed")
        if review_window_seconds <= 0:
            raise JobError("review window must be positive")
        job.result_hash = result_hash
        job.submitted_at = now
        job.review_deadline = now + review_window_seconds
        job.state = JobState.SUBMITTED
        return job

    def buyer_accept(self, job_id: int, buyer: str, now: int) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.SUBMITTED)
        self._require_buyer(job, buyer)
        self._settle_provider_win(job, now)
        return job

    def buyer_dispute(self, job_id: int, buyer: str, reason_hash: str, now: int) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.SUBMITTED)
        self._require_buyer(job, buyer)
        if not reason_hash:
            raise JobError("dispute reason hash required")
        if now > (job.review_deadline or 0):
            raise JobError("review deadline passed; use finalize_after_review")
        job.dispute_reason_hash = reason_hash
        job.state = JobState.DISPUTED
        return job

    def finalize_after_review(self, job_id: int, provider: str, now: int) -> Job:
        """Prevents a silent buyer from freezing a provider's money forever."""
        job = self._job(job_id)
        self._require_state(job, JobState.SUBMITTED)
        self._require_provider(job, provider)
        if now <= (job.review_deadline or 0):
            raise JobError("review window still open")
        self._settle_provider_win(job, now)
        return job

    def cancel_unaccepted(self, job_id: int, buyer: str, now: int) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.OPEN)
        self._require_buyer(job, buyer)
        self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, buyer, job.payment_amount)
        job.state = JobState.CANCELLED
        job.settled_at = now
        return job

    def expire_unaccepted(self, job_id: int, now: int) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.OPEN)
        if now <= job.accept_deadline:
            raise JobError("job not expired")
        self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, job.buyer, job.payment_amount)
        job.state = JobState.REFUNDED
        job.settled_at = now
        return job

    def provider_timeout(self, job_id: int, buyer: str, now: int) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.ACCEPTED)
        self._require_buyer(job, buyer)
        if now <= (job.provider_deadline or 0):
            raise JobError("provider still within work window")
        self._settle_buyer_win(job, now)
        return job

    def resolve_dispute(self, job_id: int, caller: str, decision: DisputeDecision,
                        now: int, provider_payment_bps: int = 5_000) -> Job:
        job = self._job(job_id)
        self._require_state(job, JobState.DISPUTED)
        if caller != self.arbiter:
            raise JobError("only configured arbiter may resolve v1 disputes")
        if decision == DisputeDecision.PROVIDER_WINS:
            self._settle_provider_win(job, now)
        elif decision == DisputeDecision.BUYER_WINS:
            self._settle_buyer_win(job, now)
        elif decision == DisputeDecision.SPLIT:
            if provider_payment_bps < 0 or provider_payment_bps > 10_000:
                raise JobError("split basis points out of range")
            self._settle_split(job, now, provider_payment_bps)
        else:
            raise JobError("unsupported dispute decision")
        return job

    def _settle_provider_win(self, job: Job, now: int):
        fee = job.payment_amount * DEFAULT_PROTOCOL_FEE_BPS // 10_000
        provider_payment = job.payment_amount - fee
        dev_fee = fee * DEV_SHARE_OF_PROTOCOL_FEE_BPS // 10_000
        treasury_fee = fee - dev_fee
        if provider_payment:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, job.provider, provider_payment)
        if treasury_fee:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, self.TREASURY_ACCOUNT, treasury_fee)
        if dev_fee:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, self.DEV_FEE_ACCOUNT, dev_fee)
        self.ledger.transfer(self.BOND_ASSET, self.BOND_ACCOUNT, job.provider, job.bond_amount_rlya)
        job.state = JobState.COMPLETED
        job.settled_at = now

    def _settle_buyer_win(self, job: Job, now: int):
        self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, job.buyer, job.payment_amount)
        buyer_slash = job.bond_amount_rlya * SLASH_TO_BUYER_BPS // 10_000
        treasury_slash = job.bond_amount_rlya - buyer_slash
        if buyer_slash:
            self.ledger.transfer(self.BOND_ASSET, self.BOND_ACCOUNT, job.buyer, buyer_slash)
        if treasury_slash:
            self.ledger.transfer(self.BOND_ASSET, self.BOND_ACCOUNT, self.TREASURY_ACCOUNT, treasury_slash)
        job.state = JobState.REFUNDED
        job.settled_at = now

    def _settle_split(self, job: Job, now: int, provider_payment_bps: int):
        provider_gross = job.payment_amount * provider_payment_bps // 10_000
        buyer_refund = job.payment_amount - provider_gross
        fee = provider_gross * DEFAULT_PROTOCOL_FEE_BPS // 10_000
        provider_net = provider_gross - fee
        dev_fee = fee * DEV_SHARE_OF_PROTOCOL_FEE_BPS // 10_000
        treasury_fee = fee - dev_fee
        if provider_net:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, job.provider, provider_net)
        if buyer_refund:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, job.buyer, buyer_refund)
        if treasury_fee:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, self.TREASURY_ACCOUNT, treasury_fee)
        if dev_fee:
            self.ledger.transfer(job.payment_asset, self.ESCROW_ACCOUNT, self.DEV_FEE_ACCOUNT, dev_fee)
        self.ledger.transfer(self.BOND_ASSET, self.BOND_ACCOUNT, job.provider, job.bond_amount_rlya)
        job.state = JobState.COMPLETED
        job.settled_at = now

    def _job(self, job_id: int) -> Job:
        try:
            return self.jobs[job_id]
        except KeyError as exc:
            raise JobError("job not found") from exc

    @staticmethod
    def _require_state(job: Job, expected: JobState):
        if job.state != expected:
            raise JobError(f"invalid state: expected {expected.value}, got {job.state.value}")

    @staticmethod
    def _require_buyer(job: Job, buyer: str):
        if buyer != job.buyer:
            raise JobError("buyer authorization failed")

    @staticmethod
    def _require_provider(job: Job, provider: str):
        if provider != job.provider:
            raise JobError("provider authorization failed")
