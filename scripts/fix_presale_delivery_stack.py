#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'programs/rlya_sale/src/lib.rs'
s = p.read_text(encoding='utf-8')

start = s.index("pub struct DeliverPrelaunch<'info>")
end = s.index("pub struct WithdrawUnsold<'info>")
block = s[start:end]

replacements = {
    "pub sale_vault: Account<'info, TokenAccount>,": "pub sale_vault: Box<Account<'info, TokenAccount>>,",
    "pub staking_bonus_vault: Account<'info, TokenAccount>,": "pub staking_bonus_vault: Box<Account<'info, TokenAccount>>,",
    "pub recipient_rlya_account: Account<'info, TokenAccount>,": "pub recipient_rlya_account: Box<Account<'info, TokenAccount>>,",
    "pub delivery_receipt: Account<'info, PrelaunchDeliveryReceipt>,": "pub delivery_receipt: Box<Account<'info, PrelaunchDeliveryReceipt>>,",
}

for old, new in replacements.items():
    count = block.count(old)
    if count < 1:
        raise SystemExit(f'missing expected stack-heavy field: {old}')
    block = block.replace(old, new)

s = s[:start] + block + s[end:]
p.write_text(s, encoding='utf-8')
print('RALYA_PRESALE_DELIVERY_STACK_FIX=APPLIED')
