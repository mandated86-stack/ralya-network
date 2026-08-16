#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
errors = []


def check(cond, message):
    if not cond:
        errors.append(message)


def text(path):
    return (ROOT / path).read_text(encoding='utf-8', errors='ignore')


core = text('netlify/functions/_shared/presale-core.mts')
quote = text('netlify/functions/presale-quote.mts')
confirm = text('netlify/functions/presale-confirm.mts')
wallet = text('netlify/functions/presale-wallet.mts')
owner = text('netlify/functions/presale-owner.mts')
cleanup = text('netlify/functions/presale-cleanup.mts')
client = text('web/prelaunch.js')
owner_client = text('web/owner/presale-control.js')
owner_html = text('web/owner/index.html').lower()
treasury_client = text('web/owner/treasury-prep.js')
site = text('web/site-config.js')
site_lower = site.lower()
index = text('web/index.html')
index_lower = index.lower()
whitepaper = text('web/RALYA_Whitepaper_v1.2.html').lower()
program = text('programs/rlya_sale/src/lib.rs')
package = text('package.json')

# Fixed pre-launch economics.
check('PRESALE_CAP_BASE = 288_000_000n * RLYA_UNIT' in core, 'prelaunch base allocation is not fixed to 288M RLYA')
check('STAKING_BONUS_RESERVE_BASE = 14_400_000n * RLYA_UNIT' in core, 'fixed 14.4M RLYA staking-bonus reserve missing')
check('STAKING_BONUS_BPS = 500n' in core, 'presale staking bonus is not fixed at 5%')
check('STANDARD_RELEASE_OFFSET_SECONDS = -24 * 60 * 60' in core, 'standard T-1 release metadata missing')
check('STAKED_RELEASE_DAYS = 21' in core, 'staked day-21 release metadata missing')
check('BASE_PRICE_MICRO_USDC = 3_000n' in core, 'prelaunch base price mismatch')
check('STEP_SIZE_BASE = 1_000_000n * RLYA_UNIT' in core, 'internal one-million-RLYA price step missing')
check('STEP_INCREMENT_MICRO_USDC = 50n' in core, 'internal price-step increment mismatch')
check('REFERRAL_BPS = 100n' in core, 'prelaunch referral is not fixed at 1%')
check('stakingBonus' in core and 'availableStakingBonusBase' in core, 'staking bonus reserve accounting missing')
check('quoteAllocation' in core and 'priceAt' in core, 'deterministic quote curve missing')
check('getWithMetadata' in core and 'onlyIfNew: true' in core and 'onlyIfMatch: current.etag' in core, 'financial mutation lock is not compare-and-set safe')

# Existing real buyer verification path remains present. Accept the original native
# Node Ed25519 verifier or the WebCrypto raw Ed25519 verifier used by the Netlify runtime.
native_quote_auth = 'verifySignature' in quote and 'buyerKey' in quote
webcrypto_quote_auth = 'webcrypto.subtle.importKey' in quote and 'webcrypto.subtle.verify' in quote and "{ name: 'Ed25519' }" in quote
check(native_quote_auth or webcrypto_quote_auth, 'quote reservations are not wallet-signature authenticated')
check('`Stake: ${stake ? \'YES\' : \'NO\'}`' in quote, 'staking choice is not bound into the signed quote request')
check("state.control.access !== 'open'" in quote, 'server-side allocation access gate missing')
check('RATE_LIMIT' in quote and 'quote-auth/' in quote, 'quote replay/rate protection missing')
for required in (
    'getParsedTransaction', 'Buyer wallet did not sign', 'Transaction is not linked to this RALYA quote',
    'preTokenBalances', 'postTokenBalances', 'USDC debit does not match', 'USDC credit to'
):
    check(required in confirm, f'confirmed-purchase verification missing: {required}')
check('before.totalAllocatedBase + quoteRlya > PRESALE_CAP_BASE' in confirm, 'confirmation-time presale cap guard missing')
check('before.totalStakingBonusBase + quoteBonus > STAKING_BONUS_RESERVE_BASE' in confirm, 'confirmation-time staking-bonus reserve guard missing')
check('refund' not in (quote + confirm + owner).lower(), 'prelaunch financial API contains refund functionality')

# Buyer reconnect/privacy path.
check("req.method !== 'POST'" in wallet, 'buyer allocation history endpoint is not POST-only')
check('verifySignature' in wallet and 'RALYA allocation view' in wallet, 'buyer allocation view is not wallet-signature authenticated')
check('Allocation-view wallet signature verification failed.' in wallet, 'buyer allocation view signature failure guard missing')
check('paymentReference' not in wallet and 'note:' not in wallet, 'private reconciliation details leak through buyer endpoint')

# Private technical-launch safety gate.
# The final T-1 / +21 release policy must be migrated through every financial
# receipt path before public checkout is enabled. Until then, the browser-level
# checkout switch is deliberately false even if an owner accidentally changes
# the runtime allocation access state.
private_gate = 'prelaunchcheckoutenabled: false' in site_lower
backend_release_ready = (
    "'standard-tminus1'" in confirm
    and "'staked-plus21d'" in confirm
    and "'1-day-before-public-launch'" in confirm
    and "'21-days-after-public-launch'" in confirm
)
check(private_gate or backend_release_ready, 'release-policy migration is incomplete but private checkout gate is not active')
check('private launch testing is active' in site_lower if private_gate else True, 'private checkout gate message missing')

# Owner controls and opening preflight remain available, but OPEN is not enough
# to bypass the private browser gate while this build is being tested.
check("op === 'manual_allocate'" in owner, 'owner private/off-site allocation operation missing')
check('prelaunchOpeningPreflight' in owner and "op === 'preflight'" in owner, 'server-side opening preflight missing')
check('getLatestBlockhash' in owner and 'treasuryUsdcAccountReady' in owner, 'opening preflight does not verify RPC + treasury USDC account')
check('manual_allocate' in owner_client and 'set_access' in owner_client and 'manifest' in owner_client, 'owner prelaunch controls incomplete')
check('Prepare / verify USDC receiving account' in treasury_client, 'owner treasury USDC preparation control missing')

# Mainnet remains explicitly deferred in this website deployment.
check('mainnet is deliberately deferred' in owner_html, 'owner console does not clearly defer Mainnet')
check('id="mainnetdeferredtools"' in owner_html and 'hidden' in owner_html, 'future Mainnet controls are not hidden during pre-launch mode')
check("rlyamint: ''" in site_lower and "saleprogramid: ''" in site_lower and "salepda: ''" in site_lower and "treasurywallet: ''" in site_lower, 'production Mainnet addresses must remain blank before genuine launch evidence')
check('839_000_000_000_000_000' in program, 'fixed 839M on-chain hard cap disappeared from deferred program source')

# Public site and whitepaper must reflect the latest owner-approved release policy.
check("presalemode: 'prelaunch-allocation'" in site_lower and 'presaleenabled: false' in site_lower, 'prelaunch/atomic launch gates are not separated')
check('presalecap: 288000000' in site_lower and 'stakingbonusreserve: 14400000' in site_lower and 'stakingbonusbps: 500' in site_lower, 'website configuration does not match revised economics')
check("standardreleasetiming: '1-day-before-public-launch'" in site_lower, 'website standard T-1 release setting missing')
check('stakedreleasedaysafterlaunch: 21' in site_lower, 'website staked day-21 release setting missing')
check('you will receive' in index_lower, 'buyer receive-amount wording missing')
check('expected rlya allocation' not in index_lower, 'obsolete expected-allocation wording returned to the public page')
check('1 day before public launch' in index_lower, 'public standard T-1 release wording missing')
check('21 days after public launch' in index_lower, 'public Buy + Stake day-21 release wording missing')
check('buy + stake' in index_lower and '5% more rlya' in index_lower, 'public fixed 5% staking option missing')
check('288,000,000' in index_lower or '288m' in index_lower, 'public 288M presale allocation missing')
check('referral' in index_lower and '1% usdc' in index_lower, 'public 1% referral explanation missing')
check('https://x.com/ralyaai' in index_lower and 'https://tiktok.com/@ralyaai' in index_lower, 'official X/TikTok links missing')
check('ralya_whitepaper_v1.2.html' in index_lower, 'public site does not link current whitepaper')
check('1 day before the public rlya launch' in whitepaper and '21 days after public launch' in whitepaper, 'whitepaper release schedule is stale')
check('every 1,000,000' not in index_lower and 'next price step' not in index_lower, 'internal price-step mechanic is being marketed on the homepage')
check('need 3 sol' not in index_lower and 'cannot afford' not in index_lower, 'internal financing language leaked into public website')

# Cleanup/build gates.
check("schedule: '@daily'" in cleanup and "cleanupPrefix(s, 'quote/'" in cleanup, 'ephemeral quote/auth cleanup missing')
check('build:functions' in package and 'test:prelaunch' in package, 'prelaunch compile/economic build gates missing')

if errors:
    print('PRELAUNCH AUDIT FAILED')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('RALYA_PRELAUNCH_AUDIT=PASS')
print('288M base presale + fixed 14.4M staking reserve are configured')
print('public copy: standard T-1 release; Buy + Stake +5% unlock day 21')
print('1% USDC referral program and wallet allocation view remain present')
if private_gate and not backend_release_ready:
    print('PRIVATE_TEST_GATE=ACTIVE: checkout is disabled pending final financial release-policy migration')
else:
    print('RELEASE_POLICY_BACKEND=READY')
print('production Mainnet addresses remain blank and Mainnet controls remain deferred')
