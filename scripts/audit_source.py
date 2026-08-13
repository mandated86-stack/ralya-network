#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []

def check(cond, msg):
    if not cond:
        errors.append(msg)

alloc_file = ROOT / 'tokenomics/GENESIS_ALLOCATION.json'
j = json.loads(alloc_file.read_text())
alloc = j['allocations']
check(j['hard_cap_tokens'] == 839_000_000, 'hard cap token count mismatch')
check(j['hard_cap_base_units'] == 839_000_000_000_000_000, 'hard cap base units mismatch')
check(sum(x['bps'] for x in alloc.values()) == 10_000, 'allocation bps != 100%')
check(sum(x['base_units'] for x in alloc.values()) == j['hard_cap_base_units'], 'allocation units != hard cap')
check(alloc['founder']['base_units'] == 83_900_000_000_000_000, 'founder allocation mismatch')
check(alloc['founder']['initial_lock_days'] == 365, 'founder lock mismatch')
check(alloc['presale']['base_units'] == 100_680_000_000_000_000, 'presale allocation mismatch')

anchor = (ROOT / 'Anchor.toml').read_text()
m = re.search(r'rlya_sale\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"', anchor)
check(bool(m), 'rlya_sale program id missing from Anchor.toml')
if m:
    check(m.group(1) != '11111111111111111111111111111111', 'system program ID used as placeholder')

program = ROOT / 'programs/rlya_sale/src/lib.rs'
text = program.read_text()
lower = text.lower()
for forbidden in ('mint_to(', 'mintto', 'pub fn refund', 'pub fn claim', 'cancel_for_refunds', 'refunding', 'claim_vault'):
    check(forbidden not in lower, f'forbidden active-sale source item: {forbidden}')
check('839_000_000_000_000_000' in text, 'on-chain hard cap missing')
check('100_680_000_000_000_000' in text, 'on-chain public-sale cap missing')
check('83_900_000_000_000_000' in text, 'on-chain founder amount missing')
check('365 * 24 * 60 * 60' in text, 'on-chain founder lock missing')
check('mint_authority.is_none()' in text, 'activation does not require revoked mint authority')
check('freeze_authority.is_none()' in text, 'activation does not require absent freeze authority')
check('mint_authority == COption::Some(ctx.accounts.admin.key())' in text, 'initialization does not prove RLYA mint authority')
check('min_rlya_out' in text and 'allocation >= min_rlya_out' in text, 'buyer minimum-output/slippage protection missing')
check('sale.total_sold = new_total' in text, 'manual/public distribution counter missing')
check('sale.manual_sold' in text, 'manual distribution counter missing')
check('BASE_PRICE_MICRO_USDC: u64 = 3_000' in text, 'compiled base price missing')
check('STEP_SIZE_RLYA: u64 = 1_000_000' in text, 'compiled price step size missing')
check('STEP_INCREMENT_MICRO_USDC: u64 = 50' in text, 'compiled price increment missing')
check('REFERRAL_BPS: u64 = 100' in text, 'fixed 1% referral rate missing')
check('BPS_DENOMINATOR: u64 = 10_000' in text, 'referral denominator missing')
check('sale.referral_bps = REFERRAL_BPS' in text, 'on-chain referral rate not stored')
check('pub fn buy_with_referral' in text, 'referred purchase instruction missing')
check('referrer_usdc_account' in text, 'referrer USDC payout account missing')
check('buyer.key() != ctx.accounts.referrer.key()' in text, 'same-wallet self-referral guard missing')
check('total_referral_usdc_paid' in text, 'aggregate referral accounting missing')
check('pub fn register_referral' in text and 'ReferralAttribution' in text, 'immutable first-attribution registry missing')
check('ReferralRequired' in text, 'direct referral bypass guard missing')
check('CircularReferral' in text, 'direct two-wallet referral loop guard missing')
check('pub referral_bps: u64' in text and 'pub total_referral_usdc_paid: u64' in text, 'referral sale-state fields missing')
check('set_price' not in lower and 'update_price' not in lower, 'arbitrary on-chain price setter found')

for opening, closing in [('(', ')'), ('[', ']'), ('{', '}')]:
    check(text.count(opening) == text.count(closing), f'unbalanced {opening}{closing} in active Rust program')

web_files = list((ROOT / 'web').rglob('*.html')) + list((ROOT / 'web').rglob('*.js'))
public_text = '\n'.join(p.read_text(errors='ignore').lower() for p in web_files)
for forbidden in ('simulate purchase', 'simulated allocation', 'preview checkout', 'browser simulation'):
    check(forbidden not in public_text, f'public release contains simulation language: {forbidden}')
check('not another fake coin' in (ROOT/'web/index.html').read_text().lower(), 'requested public anti-fake-coin statement missing')
check('getparsedtokenaccountsbyowner' in (ROOT/'web/app.js').read_text().lower(), 'real token balance query missing')
check('manual_sale' in (ROOT/'web/admin/admin.js').read_text().lower(), 'owner off-site sale action missing')
check('buy_with_referral' in (ROOT/'web/app.js').read_text().lower(), 'website referred purchase path missing')
check('referral' in (ROOT/'web/index.html').read_text().lower() and '1%' in (ROOT/'web/index.html').read_text(), 'public 1% referral explanation missing')
check('launch rlya' in (ROOT/'web/owner/index.html').read_text().lower(), 'owner mainnet launch console missing')
check((ROOT/'web/RALYA_Whitepaper_v1.1.pdf').exists(), 'whitepaper PDF missing')
check((ROOT/'whitepaper/RALYA_Whitepaper_v1.1.md').exists(), 'whitepaper source missing')
check((ROOT/'LICENSE').exists(), 'open-source license missing')

# No private credentials in tracked source.
secret_patterns = [
    r'(?i)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    r'(?i)private[_-]?key\s*=\s*["\'][^"\']+["\']',
    r'(?i)api[_-]?key\s*=\s*["\'][^"\']+["\']+',
]
for f in ROOT.rglob('*'):
    if f.is_file() and f.suffix in {'.py','.rs','.js','.json','.toml','.md','.html','.yml','.yaml'}:
        body = f.read_text(errors='ignore')
        for pat in secret_patterns:
            if re.search(pat, body):
                errors.append(f'possible secret-like content in {f.relative_to(ROOT)}')

if errors:
    print('AUDIT FAILED')
    for e in errors:
        print('-', e)
    raise SystemExit(1)

print('AUDIT OK')
print('hard cap:', j['hard_cap_tokens'], 'RLYA')
print('public sale:', alloc['presale']['tokens'], 'RLYA')
print('founder initial lock:', alloc['founder']['initial_lock_days'], 'days')
print('active program contains no RLYA mint/refund/claim instruction')
print('website contains real wallet/balance/purchase/referral paths and owner launch tools')
