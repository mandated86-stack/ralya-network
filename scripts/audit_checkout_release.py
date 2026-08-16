#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []

def read(path):
    return (ROOT / path).read_text(encoding='utf-8', errors='ignore')

def check(condition, message):
    if not condition:
        errors.append(message)

site = read('web/site-config.js')
confirm = read('netlify/functions/presale-confirm.mts')
wallet = read('netlify/functions/presale-wallet.mts')
owner = read('netlify/functions/presale-owner.mts')
owner_ui = read('web/owner/presale-control.js')
hotfix = read('web/site-ui-hotfix.js')
program = read('programs/rlya_sale/src/lib.rs')
delivery = read('web/owner/prelaunch-delivery.js')
celebration = read('web/purchase-celebration.js')

check('prelaunchCheckoutEnabled: true' in site, 'prelaunch browser checkout gate is not enabled')
check("presaleEnabled: false" in site, 'post-launch atomic sale switch must remain disabled')
check("rlyaMint: ''" in site and "saleProgramId: ''" in site and "salePda: ''" in site, 'Mainnet token/program values must remain blank')

for body, label in ((confirm, 'confirmation'), (wallet, 'wallet')):
    check("standard-tminus1" in body, f'{label} path missing standard T-1 policy')
    check("staked-plus21d" in body, f'{label} path missing Buy + Stake day-21 policy')
    check("1-day-before-public-launch" in body, f'{label} path missing standard T-1 distribution status')
    check("21-days-after-public-launch" in body, f'{label} path missing staked day-21 distribution status')

check("const STANDARD_POLICY = 'standard-tminus1'" in owner, 'owner path missing standard T-1 policy constant')
check("const STAKED_POLICY = 'staked-plus21d'" in owner, 'owner path missing staked day-21 policy constant')
check("const STANDARD_DISTRIBUTION = '1-day-before-public-launch'" in owner, 'owner manifest missing T-1 distribution constant')
check("const STAKED_DISTRIBUTION = '21-days-after-public-launch'" in owner, 'owner manifest missing day-21 distribution constant')
check("version: 4" in owner, 'final delivery manifest must be v4')
check("manualDeliveryPolicy: STANDARD_POLICY" in owner and "manualDistributionStatus: STANDARD_DISTRIBUTION" in owner, 'manual allocation manifest policy is not T-1')
for stale in ('staked-36d', 'standard-21d', "'36-days-after-public-launch'"):
    check(stale not in owner, f'owner/manifest path still contains stale release identifier: {stale}')

check('same 288M base public presale pool' in owner_ui, 'owner UI still describes an obsolete presale pool size')
check('1 day before public launch' in owner_ui and '21 days after public launch' in owner_ui, 'owner UI release copy is stale')
check('requestAnimationFrame' in hotfix and 'setText' in hotfix and 'setHtml' in hotfix, 'mobile mutation-loop guard is missing')
check('STANDARD_PRESALE_RELEASE_OFFSET_SECONDS: i64 = -24 * 60 * 60' in program, 'program standard release is not T-1')
check('STAKED_PRESALE_RELEASE_SECONDS: i64 = 21 * 24 * 60 * 60' in program, 'program staked release is not T+21')
check('schedule_public_launch' in program and 'scheduled_public_launch_at' in program, 'program lacks one-time launch schedule required for T-1')
check('standard-tminus1' in delivery and 'staked-plus21d' in delivery, 'owner distribution manifest policy is stale')
check('Standard T-1 delivery' in delivery or 'Standard wallets become eligible at T-1' in delivery, 'owner distribution UI is missing T-1 copy')
check('ralya:purchase-confirmed' in celebration and 'claim' in celebration, 'verified-purchase celebration/reassurance is missing')
check('final-manifest/v4' in owner, 'final manifest is not frozen in persistent storage')
check('ledgerRecordSha256' in confirm and 'wallet-purchase/' in confirm, 'confirmed purchase ledger lacks hash/index hardening')

if errors:
    print('CHECKOUT RELEASE AUDIT FAILED')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('RALYA_CHECKOUT_RELEASE_AUDIT=PASS')
print('browser checkout gate enabled; runtime owner OPEN remains independent')
print('standard release=T-1; Buy+Stake=+5% at T+21')
print('owner manifest/manual allocation records use final policy')
print('Mainnet token/program values remain blank')
