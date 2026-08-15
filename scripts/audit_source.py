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


j = json.loads(read('tokenomics/GENESIS_ALLOCATION.json'))
alloc = j['allocations']
check(j['hard_cap_tokens'] == 839_000_000, 'hard cap token count mismatch')
check(j['hard_cap_base_units'] == 839_000_000_000_000_000, 'hard cap base units mismatch')
check(sum(int(x['tokens']) for x in alloc.values()) == j['hard_cap_tokens'], 'allocation token amounts != hard cap')
check(sum(int(x['base_units']) for x in alloc.values()) == j['hard_cap_base_units'], 'allocation base units != hard cap')
check(alloc['founder']['tokens'] == 83_900_000, 'founder allocation mismatch')
check(alloc['founder']['initial_lock_days'] == 365, 'founder lock mismatch')
check(alloc['presale']['tokens'] == 288_000_000, 'public base presale allocation mismatch')
check(alloc['staking_bonus_reserve']['tokens'] == 14_400_000, 'staking bonus reserve mismatch')
check(j['presale_delivery']['staking_bonus_bps'] == 500, 'staking bonus is not fixed at 5%')
check(j['presale_delivery']['standard_release_offset_seconds'] == -86_400, 'standard presale release is not T-1 day')
check(j['presale_delivery']['staked_release_days_after_public_launch'] == 21, 'staked presale release is not day 21')
check(j['presale_delivery']['staking_choice_locks_for_wallet_after_first_confirmed_purchase'] is True, 'wallet-level staking choice lock missing')
check(j['public_sale_curve']['step_tokens'] == 1_000_000, 'internal 1M price step changed unexpectedly')
check(j['public_sale_curve']['step_increase_usdc'] == '0.000050', 'internal price increment changed unexpectedly')

# Program source remains future Mainnet work. This website deployment must not
# pretend production IDs exist or activate/deploy the program.
program = read('programs/rlya_sale/src/lib.rs')
lower = program.lower()
for forbidden in ('mint_to(', 'mintto', 'pub fn refund', 'pub fn claim', 'cancel_for_refunds', 'refunding', 'claim_vault'):
    check(forbidden not in lower, f'forbidden active-sale source item: {forbidden}')
check('839_000_000_000_000_000' in program, 'on-chain hard cap missing from deferred source')
check('83_900_000_000_000_000' in program, 'on-chain founder amount missing from deferred source')
check('STAKING_BONUS_BPS: u64 = 500' in program, 'on-chain fixed 5% staking bonus missing from deferred source')
check('REFERRAL_BPS: u64 = 100' in program, 'fixed 1% referral rate missing from deferred source')
check('set_price' not in lower and 'update_price' not in lower, 'arbitrary on-chain price setter found')
for opening, closing in [('(', ')'), ('[', ']'), ('{', '}')]:
    check(program.count(opening) == program.count(closing), f'unbalanced {opening}{closing} in active Rust program')

# Public website and current prelaunch intent.
index_text = read('web/index.html').lower()
site = read('web/site-config.js').lower()
whitepaper = read('web/RALYA_Whitepaper_v1.2.html').lower()
prelaunch_client = read('web/prelaunch.js').lower()
site_ui = read('web/site-ui.js').lower()
status_page = read('web/status.html').lower()
confirm_fn = read('netlify/functions/presale-confirm.mts').lower()
wallet_fn = read('netlify/functions/presale-wallet.mts').lower()
for forbidden in ('simulate purchase', 'simulated allocation', 'preview checkout', 'browser simulation', 'need 3 sol', 'cannot afford'):
    check(forbidden not in '\n'.join(p.read_text(errors='ignore').lower() for p in (ROOT / 'web').rglob('*') if p.is_file() and p.suffix in {'.html','.js'}), f'public release contains forbidden/internal language: {forbidden}')
check('ai-to-ai settlement' in index_text and 'autonomous work' in index_text, 'public AI-to-AI/autonomous-work positioning missing')
check('expected rlya allocation' in index_text, 'buyer expected-allocation wording missing')
check('288,000,000' in index_text or '288m' in index_text, '288M public base presale allocation missing')
check('buy + stake' in index_text and '5% more rlya' in index_text, 'public fixed 5% Buy + Stake option missing')
check('1 day before public launch' in index_text, 'public T-1 standard release wording missing')
check('21 days after public launch' in index_text, 'public day-21 staking unlock wording missing')
check('referral' in index_text and '1% usdc' in index_text, 'public 1% referral explanation missing')
check('every 1,000,000' not in index_text and 'next price step' not in index_text, 'homepage markets internal price-step mechanics')
check('ralya_whitepaper_v1.2.html' in index_text, 'public site does not link current whitepaper')
check('1 day before the public rlya launch' in whitepaper and '21 days after public launch' in whitepaper, 'whitepaper release rules are stale')
check('getparsedtokenaccountsbyowner' in prelaunch_client, 'real Solana token-account query missing from presale client')
check('createtransfercheckedinstruction' in prelaunch_client and "'/api/presale/confirm'" in prelaunch_client, 'real verified USDC presale path missing from existing client')

# Public UI v2 must remain visibly navigable and mobile-wallet friendly.
for required in ('data-site-tab="home"', 'data-site-tab="rlya"', 'data-site-tab="technology"', 'data-site-tab="roadmap"', 'data-site-tab="docs"'):
    check(required in site_ui, f'public tab navigation missing: {required}')
check('share & earn 1% usdc' in site_ui, 'prominent referral share action missing')
check('phantom' in site_ui and 'solflare' in site_ui and 'trust wallet' in site_ui and 'metamask' in site_ui, 'multi-wallet chooser is incomplete')
check('protocol step' in site_ui and 'open ${info.title} explanation' in site_ui, 'clickable Request/Bond/Work/Settle flow missing')
check('/site-v2.css' in site and '/site-ui.js' in site, 'public UI v2 assets are not loaded by site config')
check('100,680,000' not in status_page and '100.68m' not in status_page, 'status page contains obsolete presale allocation')
check('deferred' not in status_page and 'not open' not in status_page, 'status page still uses negative deferred/not-open launch wording')
check('next phase' in status_page and 'upcoming' in status_page, 'positive Mainnet/public-launch status wording missing')
check('every 1,000,000' not in status_page, 'status page publicly exposes internal price-step mechanic')

# Financial records must store the final owner-approved release policy even while
# real checkout remains privately gated.
for stale in ('staked-36d', 'standard-21d', "'36-days-after-public-launch'"):
    check(stale not in confirm_fn, f'confirmation function still stores stale release policy: {stale}')
    check(stale not in wallet_fn, f'wallet function still returns stale release policy: {stale}')
check("'staked-plus21d'" in confirm_fn and "'standard-tminus1'" in confirm_fn, 'confirmation function final delivery policy missing')
check("'21-days-after-public-launch'" in confirm_fn and "'1-day-before-public-launch'" in confirm_fn, 'confirmation distribution timing mismatch')
check("'21-days-after-public-launch'" in wallet_fn and "'1-day-before-public-launch'" in wallet_fn, 'wallet distribution timing mismatch')

# Private technical launch is deliberately purchase-gated until owner explicitly
# approves real checkout after the final controlled verification pass.
check("presalemode: 'prelaunch-allocation'" in site, 'pre-launch allocation mode is not configured')
check('presaleenabled: false' in site, 'post-launch atomic sale master switch is not default-off')
check('prelaunchcheckoutenabled: false' in site, 'private technical-launch checkout gate is not active')
check("standardreleasetiming: '1-day-before-public-launch'" in site, 'site T-1 release setting missing')
check('stakedreleasedaysafterlaunch: 21' in site, 'site day-21 staking setting missing')
check('presalecap: 288000000' in site and 'stakingbonusreserve: 14400000' in site and 'stakingbonusbps: 500' in site, 'website economics mismatch')
check("salepda: ''" in site and "rlyamint: ''" in site and "saleprogramid: ''" in site and "treasurywallet: ''" in site, 'production addresses must remain blank before signed Mainnet evidence')
check('https://x.com/ralyaai' in site and 'https://tiktok.com/@ralyaai' in site, 'official social links missing from config')

# Owner console keeps production/Mainnet work deferred internally; public wording
# is handled separately above and must remain progress-oriented.
owner_html = read('web/owner/index.html').lower()
check('ralya owner control center' in owner_html, 'owner control center heading missing')
check('mainnet is deliberately deferred' in owner_html, 'owner console does not clearly defer Mainnet')
check('id="mainnetdeferredtools"' in owner_html and 'hidden' in owner_html, 'future Mainnet controls are not hidden/deferred')

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
print('staking bonus reserve:', alloc['staking_bonus_reserve']['tokens'], 'RLYA')
print('public release intent: standard T-1; Buy + Stake +5% unlock day 21')
print('PUBLIC_UI_V2=PASS; tab navigation, visible socials/referrals and wallet chooser present')
print('PRIVATE_TEST_GATE=ACTIVE; production Mainnet addresses remain blank')