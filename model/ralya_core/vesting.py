from dataclasses import dataclass

from .config import FOUNDER_ALLOCATION, FOUNDER_LOCK_SECONDS


class VestingError(Exception):
    pass


@dataclass
class FounderLock:
    owner: str
    start_time: int
    amount: int = FOUNDER_ALLOCATION
    released: bool = False

    @property
    def unlock_time(self) -> int:
        return self.start_time + FOUNDER_LOCK_SECONDS

    def can_release(self, now: int) -> bool:
        return (not self.released) and now >= self.unlock_time

    def release(self, caller: str, now: int) -> int:
        if caller != self.owner:
            raise VestingError("owner authorization failed")
        if self.released:
            raise VestingError("founder allocation already released")
        if now < self.unlock_time:
            raise VestingError("founder lock is still active")
        self.released = True
        return self.amount
