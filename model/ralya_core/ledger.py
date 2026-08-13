from collections import defaultdict


class LedgerError(Exception):
    pass


class Ledger:
    """Minimal deterministic multi-asset ledger for protocol testing.

    It intentionally behaves more strictly than a spreadsheet: all values are non-negative
    integers and every transfer is checked. It is not a blockchain replacement; it is the
    executable economic reference model used to prove invariants before on-chain deployment.
    """

    def __init__(self):
        self._balances = defaultdict(lambda: defaultdict(int))
        self._total_issued = defaultdict(int)
        self._total_burned = defaultdict(int)

    def mint(self, asset: str, account: str, amount: int):
        self._validate_amount(amount, allow_zero=False)
        if not account:
            raise LedgerError("account required")
        self._balances[asset][account] += amount
        self._total_issued[asset] += amount

    def burn(self, asset: str, account: str, amount: int):
        self._validate_amount(amount, allow_zero=False)
        self._debit(asset, account, amount)
        self._total_burned[asset] += amount

    def transfer(self, asset: str, sender: str, recipient: str, amount: int):
        self._validate_amount(amount, allow_zero=False)
        if not sender or not recipient:
            raise LedgerError("sender and recipient required")
        if sender == recipient:
            raise LedgerError("self-transfer rejected in reference model")
        self._debit(asset, sender, amount)
        self._balances[asset][recipient] += amount

    def balance(self, asset: str, account: str) -> int:
        return self._balances[asset][account]

    def issued(self, asset: str) -> int:
        return self._total_issued[asset]

    def burned(self, asset: str) -> int:
        return self._total_burned[asset]

    def circulating(self, asset: str) -> int:
        return self.issued(asset) - self.burned(asset)

    def accounts_total(self, asset: str) -> int:
        return sum(self._balances[asset].values())

    def assert_conservation(self, asset: str):
        expected = self.circulating(asset)
        actual = self.accounts_total(asset)
        if actual != expected:
            raise LedgerError(f"ledger conservation failure for {asset}: {actual} != {expected}")

    def snapshot(self, asset: str) -> dict[str, int]:
        return dict(self._balances[asset])

    def _debit(self, asset: str, account: str, amount: int):
        if self._balances[asset][account] < amount:
            raise LedgerError(f"insufficient {asset} balance")
        self._balances[asset][account] -= amount

    @staticmethod
    def _validate_amount(amount: int, allow_zero: bool):
        if isinstance(amount, bool) or not isinstance(amount, int):
            raise LedgerError("amount must be an integer base-unit value")
        if amount < 0 or (amount == 0 and not allow_zero):
            raise LedgerError("amount must be positive")
