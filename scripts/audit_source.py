#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def read(path):
    return (ROOT / path).read_text(encoding='utf-8', errors='ignore')


# Fixed token economics: exact token/base-unit amounts are authoritative.
j = json.loads(read('tokenomics/GENESIS_ALLOCATION.json'))
alloc = j['allocations']
check(j['hard_cap_tokens'] == 839_000_000, 'hard cap token count mismatch')
check(j['hard_cap_base_units'] == 839_000_000_000_000_000, 'hard cap base units mismatch')
check(sum(int(x['tokens']) for x in alloc.values()) == j['hard_cap_tokens'], 'allocation token amounts != hard cap')
check(sum(int(x['base_units']) for x in alloc.values()) == j['hard_cap_base_units'], 'allocation base units != hard cap')
check(alloc['founder']['tokens'] == 83_900_000, 'founder allocation mismatch')
check(alloc['founder']['base_units'] == 83_900_000_000_000_000, 'founder base-unit allocation mismatch')
check(alloc['founder']['initial_lock_days'] == 365, 'founder lock mismatch')
check(alloc['presale']['tokens'] == 288_000_000, 'public base presale allocation mismatch')
check(alloc['presale']['base_units'] == 288_000_000_000_000_000, 'public base presale units mismatch')
check(alloc['staking_bonus_reserve']['tokens'] == 14_400_000, 'staking bonus reserve mismatch')
check(j['presale_delivery']['staking_bonus_bps'] == 500, 'staking bonus is not fixed at 5%')
check(j['presale_delivery']['standard_release_days_after_public_launch'] == 21, 'standard presale release is not day 21')
check(j['presale_delivery']['staked_release_days_after_public_launch'] == 36, 'staked presale release is not day 36')
check(j['presale_delivery']['staking_choice_locks_for_wallet_after_first_confirmed_purchase'] is True, 'wallet-level staking choice lock missing')
check(j['public_sale_curve']['step_tokens'] == 1_000_000, 'internal 1M price step changed unexpectedly')
check(j['public_sale_curve']['step_increase_usdc'] == '0.000050', 'internal price step increment changed unexpectedly')

# Program identity and source safety.
anchor = read('Anchor.toml')
m = re.search(r'rlya_sale\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"', anchor)
check(bool(m), 'rlya_sale program id missing from Anchor.toml')
if m:
    check(m.group(1) != '11111111111111111111111111111111', 'system program ID used as placeholder')

program = read('programs/rlya_sale/src/lib.rs')
lower = program.lower()
for forbidden in ('mint_to(', 'mintto', 'pub fn refund', 'pub fn claim', 'cancel_for_refunds', 'refunding', 'claim_vault'):
    check(forbidden not in lower, f'forbidden active-sale source item: {forbidden}')
for required, msg in [
    ('839_000_000_000_000_000', 'on-chain hard cap missing'),
    ('288_000_000_000_000_000', 'on-chain 288M base presale cap missing'),
    ('14_400_000_000_000_000', 'on-chain 14.4M staking bonus reserve missing'),
    ('83_900_000_000_000_000', 'on-chain founder amount missing'),
    ('365 * 24 * 60 * 60', 'on-chain founder lock missing'),
    ('21 * 24 * 60 * 60', 'on-chain standard day-21 release missing'),
    ('36 * 24 * 60 * 60', 'on-chain staked day-36 release missing'),
    ('STAKING_BONUS_BPS: u64 = 500', 'on-chain fixed 5% staking bonus missing'),
    ('STAKING_BONUS_VAULT_SEED', 'dedicated on-chain staking bonus vault missing'),
    ('pub fn mark_public_launch', 'owner-controlled public launch timestamp instruction missing'),
    ('public_launch_at', 'public launch timestamp not stored in sale state'),
    ('require_release_elapsed', 'delayed buyer distribution release gate missing'),
    ('mint_authority.is_none()', 'activation does not require revoked mint authority'),
    ('freeze_authority.is_none()', 'activation does not require absent freeze authority'),
    ('mint_authority == COption::Some(ctx.accounts.admin.key())', 'initialization does not prove RLYA mint authority'),
    ('min_rlya_out', 'buyer minimum-output/slippage protection missing'),
    ('sale.total_sold = new_total', 'manual/public base-distribution counter missing'),
    ('sale.manual_sold', 'manual distribution counter missing'),
    ('BASE_PRICE_MICRO_USDC: u64 = 3_000', 'compiled base price missing'),
    ('STEP_SIZE_RLYA: u64 = 1_000_000', 'compiled internal price step size missing'),
    ('STEP_INCREMENT_MICRO_USDC: u64 = 50', 'compiled internal price increment missing'),
    ('REFERRAL_BPS: u64 = 100', 'fixed 1% referral rate missing'),
    ('BPS_DENOMINATOR: u64 = 10_000', 'basis-point denominator missing'),
    ('pub fn buy_with_referral', 'referred post-launch purchase instruction missing'),
    ('pub fn register_referral', 'immutable first-attribution registry missing'),
    ('ReferralAttribution', 'referral attribution account missing'),
    ('ReferralRequired', 'direct referral bypass guard missing'),
    ('CircularReferral', 'direct two-wallet referral loop guard missing'),
    ('expected_staking_bonus', 'staking bonus manifest commitment missing'),
    ('staking_bonus_delivered', 'staking bonus delivery reconciliation missing'),
]:
    check(required in program, msg)
check('set_price' not in lower and 'update_price' not in lower, 'arbitrary on-chain price setter found')
for opening, closing in [('(', ')'), ('[', ']'), ('{', '}')]:
    check(program.count(opening) == program.count(closing), f'unbalanced {opening}{closing} in active Rust program')

# Public website: professional positioning + real wallet/payment/staking paths.
web_files = list((ROOT / 'web').rglob('*.html')) + list((ROOT / 'web').rglob('*.js'))
public_text = '\n'.join(p.read_text(errors='ignore').lower() for p in web_files)
for forbidden in ('simulate purchase', 'simulated allocation', 'preview checkout', 'browser simulation', 'need 3 sol', 'cannot afford'):
    check(forbidden not in public_text, f'public release contains forbidden/internal language: {forbidden}')
index_text = read('web/index.html').lower()
prelaunch_client = read('web/prelaunch.js').lower()
check('ai-to-ai settlement' in index_text and 'autonomous work' in index_text, 'public AI-to-AI/autonomous-work positioning missing')
check('fixed-supply' in index_text or 'fixed supply' in index_text, 'public fixed-supply positioning missing')
check('expected rlya allocation' in index_text, 'buyer expected-allocation wording missing')
check('288,000,000' in index_text or '288m' in index_text, '288M public base presale allocation missing from public page')
check('5% more rlya' in index_text and 'buy + stake' in index_text, 'public fixed 5% Buy + Stake option missing')
check('21 days after public launch' in index_text and '36 days after public launch' in index_text, 'public day-21/day-36 release rules missing')
check('referral' in index_text and '1% usdc' in index_text, 'public 1% referral explanation missing')
check('every 1,000,000' not in index_text and 'next price step' not in index_text, 'homepage markets the internal one-million price-step mechanic')
check('ralya_whitepaper_v1.2.html' in index_text, 'public site does not link current whitepaper')
check('getparsedtokenaccountsbyowner' in prelaunch_client, 'real Solana USDC balance query missing from presale client')
check('createtransfercheckedinstruction' in prelaunch_client and "'/api/presale/confirm'" in prelaunch_client, 'real verified USDC presale payment path missing')
check('stake: stake' in prelaunch_client or 'stake, timestamp' in prelaunch_client, 'staking choice is not sent in signed presale request')

# Owner console: pre-launch controls primary, production tooling hidden/deferred.
owner_html = read('web/owner/index.html').lower()
check('ralya owner control center' in owner_html, 'owner control center heading missing')
check('mainnet is deliberately deferred' in owner_html, 'owner console does not clearly defer Mainnet')
check('id="mainnetdeferredtools"' in owner_html and 'hidden' in owner_html, 'future Mainnet controls are not hidden/deferred')
check('prepare rlya mainnet' in owner_html and 'atomic activate + pause' in owner_html, 'future staged Mainnet controls missing')
check('id="legacyatomicsmoke"' in owner_html and 'run 1 usdc mainnet smoke test' in owner_html, 'legacy Mainnet smoke tool missing')
check(re.search(r'<section[^>]+id="legacyatomicsmoke"[^>]+hidden|<section[^>]+hidden[^>]+id="legacyatomicsmoke"', owner_html) is not None, 'legacy atomic smoke is not hidden during delayed-allocation mode')

atomic_launch = read('web/owner/atomic-launch.js')
smoke = read('web/owner/smoke.js')
launch = read('web/owner/launch.js')
delivery = read('web/owner/prelaunch-delivery.js')
check('new Transaction().add(activateIx,pauseIx)' in atomic_launch, 'mainnet activation and pause are not one atomic transaction')
check('stakingBonusVault' in launch and '14_400_000n * RLYA_UNIT' in launch, 'Mainnet preparation does not fund dedicated 14.4M staking bonus reserve')
check('288_000_000n * RLYA_UNIT' in launch, 'Mainnet preparation does not use 288M base presale vault')
check('mark_public_launch' in delivery and 'DAY 0' in delivery, 'owner distribution tool cannot mark the deliberate public launch timestamp')
check('STANDARD_RELEASE_SECONDS' in delivery and 'STAKED_RELEASE_SECONDS' in delivery, 'owner distribution tool lacks day-21/day-36 gating')
check('ATOMIC_PURCHASE_NOT_COMMITTED' in smoke and 'RECOVERY_KEY' in smoke, 'legacy Mainnet smoke recovery/idempotency guard missing')

# Website gates: pre-launch allocation mode may operate independently; post-launch atomic sale stays off.
site = read('web/site-config.js')
site_lower = site.lower()
check("presalemode: 'prelaunch-allocation'" in site_lower, 'pre-launch allocation mode is not configured')
check('presaleenabled: false' in site_lower, 'post-launch atomic sale master switch is not default-off')
check("cfg.presalemode === 'atomic' && !cfg.presaleenabled" in site_lower, 'atomic sale click guard missing')
check('mutationobserver' in site_lower and 'button.disabled = true' in site_lower, 'atomic-sale disabled state is not continuously enforced')
check('presalecap: 288000000' in site_lower, 'website config does not use 288M base allocation')
check('stakingbonusreserve: 14400000' in site_lower and 'stakingbonusbps: 500' in site_lower, 'website config does not use fixed 14.4M/5% staking model')
check('standardreleasedaysafterlaunch: 21' in site_lower and 'stakedreleasedaysafterlaunch: 36' in site_lower, 'website config release windows mismatch')
check("salepda: ''" in site_lower and "rlyamint: ''" in site_lower and "saleprogramid: ''" in site_lower, 'production addresses must remain blank before signed Mainnet record')
check('presale-control.js' in site_lower and 'treasury-prep.js' in site_lower, 'pre-launch owner controls are not wired')
check('cfg.saleprogramid && cfg.rlyamint && cfg.salepda' in site_lower and 'prelaunch-delivery.js' in site_lower, 'future distribution tool is not gated by production addresses')

# Owner-controlled local Mainnet path remains available for later.
for path in ('scripts/mainnet_program_deploy.sh', 'scripts/mainnet_program_deploy.ps1'):
    check((ROOT / path).exists(), f'{path} missing')
    body = read(path).lower()
    for required in ('rlya-mainnet-payer.json', 'rlya-program-keypair.json', 'rlya-upgrade-authority.json'):
        check(required in body, f'{required} missing from {path}')
    check('config set --url mainnet-beta --keypair' in body, f'dedicated payer not configured in {path}')
    check('program dump' in body and 'sha-256' in body, f'on-chain executable verification missing from {path}')
    check('program set-upgrade-authority' in body, f'upgrade-authority transfer missing from {path}')
check((ROOT / 'scripts/verify_mainnet_public.mjs').exists(), 'public-only Mainnet verifier missing')

build_gate = read('scripts/build_solana.sh')
check('release.anza.xyz/v3.1.10/install' in build_gate, 'CI does not explicitly pin Solana 3.1.10')
check('solana config set --help' in build_gate and '--keypair' in build_gate, 'CI does not verify dedicated-payer CLI option')

# Required documentation and secret scan.
check((ROOT / 'web/RALYA_Whitepaper_v1.2.html').exists(), 'current Whitepaper v1.2 HTML missing')
check((ROOT / 'whitepaper/RALYA_Whitepaper_v1.2.md').exists(), 'current Whitepaper v1.2 source missing')
check((ROOT / 'LICENSE').exists(), 'open-source license missing')
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
print('public base presale:', alloc['presale']['tokens'], 'RLYA')
print('fixed staking bonus reserve:', alloc['staking_bonus_reserve']['tokens'], 'RLYA')
print('founder:', alloc['founder']['tokens'], 'RLYA; lock', alloc['founder']['initial_lock_days'], 'days from public launch')
print('active program contains no RLYA mint/refund/claim instruction')
print('website contains real wallet/payment/referral/staking paths and default-closed atomic sale')
print('standard presale delivery is day 21; Buy + Stake is +5% at day 36')
