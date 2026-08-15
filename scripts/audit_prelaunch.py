#!/usr/bin/env python3
from pathlib import Path

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
owner_html = text('web/owner/index.html')
owner_html_lower = owner_html.lower()
treasury_client = text('web/owner/treasury-prep.js')
delivery = text('web/owner/prelaunch-delivery.js')
site = text('web/site-config.js')
index = text('web/index.html')
program = text('programs/rlya_sale/src/lib.rs')
local_integration = text('scripts/local_validator_smoke.sh')
package = text('package.json')

check('PRESALE_CAP_BASE = 100_680_000n * RLYA_UNIT' in core, 'prelaunch presale cap is not fixed to 100.68M RLYA')
check('BASE_PRICE_MICRO_USDC = 3_000n' in core and 'STEP_INCREMENT_MICRO_USDC = 50n' in core, 'prelaunch price constants mismatch')
check('STEP_SIZE_BASE = 1_000_000n * RLYA_UNIT' in core, 'prelaunch one-million RLYA price step missing')
check('REFERRAL_BPS = 100n' in core, 'prelaunch referral is not fixed at 1%')
check('quoteAllocation' in core and 'progressBase' in core, 'shared prelaunch stepped quote function missing')
check("kind: 'web' | 'manual'" in core, 'website/private allocation categories are not separated')
check('QUOTE_CONFIRMATION_GRACE_MS' in core, 'quote reservation is not retained through confirmation grace')
check('getWithMetadata' in core and 'onlyIfNew: true' in core and 'onlyIfMatch: current.etag' in core and 'MUTATION_LOCK_LEASE_MS = 120_000' in core, 'financial mutation lock is not atomic/lease-safe')
check('nonceClaim' in core and 'onlyIfNew: true' in core, 'owner signed-action nonce is not atomically replay-protected')
check('quoteProgressBase' in core, 'reservation-aware public quote progress is missing')

check('verifySignature' in quote and 'buyerKey' in quote, 'quote reservations are not wallet-signature authenticated')
check('quote-auth/' in quote and 'has already been used' in quote, 'quote signature replay protection missing')
check('RATE_LIMIT' in quote and 'rate/' in quote, 'quote request abuse rate limit missing')
check('one live reservation' in quote.lower() and "status: 'replaced'" in quote, 'one-active-quote-per-buyer replacement missing')
check("state.control.access !== 'open'" in quote, 'server-side allocation access gate missing')
check('storedReferral' in quote and 'Direct two-wallet referral loops' in quote, 'prelaunch immutable/circular referral checks missing')

for required in ('getParsedTransaction', 'Buyer wallet did not sign', 'Transaction is not linked to this RALYA quote', 'preTokenBalances', 'postTokenBalances', 'USDC debit does not match', 'USDC credit to'):
    check(required in confirm, f'confirmed-purchase verification missing: {required}')
check('before.totalAllocatedBase + quoteRlya > PRESALE_CAP_BASE' in confirm, 'confirmation-time presale cap guard missing')
check("distributionStatus: 'scheduled-before-public-launch'" in confirm, 'confirmed web allocation is not marked for scheduled distribution')
check('refund' not in (quote + confirm + owner).lower(), 'prelaunch financial API contains refund functionality')

check("op === 'manual_allocate'" in owner, 'owner private/off-site allocation operation missing')
check('state.reservedBase > 0n' in owner and 'state.totalAllocatedBase' in owner and 'priceAt(start)' in owner and 'priceAt(end)' in owner, 'private/off-site allocation is not serialized against active buyer reservations')
check('PRESALE_CAP_BASE' in owner, 'owner manual allocation cap guard missing')
check("op === 'manifest'" in owner and 'sha256' in owner, 'delivery manifest export/hash missing')
check("state.control.access !== 'closed'" in owner and 'Active buyer quote windows are still clearing' in owner, 'final manifest can be exported while the ledger is still moving')
check('prelaunchOpeningPreflight' in owner and "op === 'preflight'" in owner and "access === 'open' ? await prelaunchOpeningPreflight()" in owner, 'owner can open allocations without server-side payment-rail preflight')
check('getLatestBlockhash' in owner and 'getParsedAccountInfo' in owner and 'treasuryUsdcAccountReady' in owner, 'opening preflight does not verify RPC + treasury USDC account')
check('paymentReference' not in wallet, 'private owner payment references leak through buyer wallet endpoint')
check("req.method !== 'POST'" in wallet and 'verifySignature' in wallet and 'RALYA allocation view' in wallet and 'Allocation-view wallet signature verification failed.' in wallet, 'buyer allocation history is not wallet-signature protected')
check('signedAllocationViewBody' in client and 'allocationViewMessage' in client and "method: 'POST'" in client, 'buyer client does not authenticate allocation-history reads')
check('quoteProgressBase || state.totalAllocatedBase' in client, 'buyer preview does not include active quote reservations')

check('signMessage' in client and 'RALYA prelaunch allocation quote' in client, 'buyer does not authenticate locked quote before payment')
check("'/api/presale/confirm'" in client, 'buyer client does not independently confirm payment through backend')
check('createTransferCheckedInstruction' in client, 'buyer USDC transfer builder missing')
check('MEMO_PROGRAM' in client and 'quote.memo' in client, 'quote-to-transaction memo binding missing')
check('Allocation Confirmed' in client, 'buyer confirmed allocation receipt UI missing')
check('requiredAta' in client and 'configuredTreasury' in client and 'No funds were moved' in client, 'buyer can still be charged to create the treasury USDC account')
check('activateReferralReceiving' in client, 'referrer self-funded USDC receiving-account activation missing')

check('manual_allocate' in owner_client and 'set_access' in owner_client and 'manifest' in owner_client and 'runOpeningPreflight' in owner_client, 'owner prelaunch controls incomplete')
check('id="mainnetdeferredtools" hidden' in owner_html_lower and 'mainnet is deliberately deferred' in owner_html_lower, 'future Mainnet controls are not hidden/deferred during prelaunch mode')
check('run 1 usdc mainnet smoke test' in owner_html_lower and '<section class="owner-card" hidden>' in owner_html_lower, 'legacy atomic smoke is not hidden during delayed-allocation mode')
check('verifyOwnerAction' in owner and 'Owner wallet required.' in core, 'server owner-wallet authorization missing')
check('Prepare / verify USDC receiving account' in treasury_client and 'createAssociatedTokenAccountInstruction' in treasury_client, 'owner treasury USDC preparation control missing')

for required in ('initialize_prelaunch_metrics', 'import_prelaunch_referral', 'deliver_prelaunch', 'deliver_prelaunch_manual', 'PrelaunchMetrics', 'PrelaunchDeliveryReceipt'):
    check(required in program, f'on-chain prelaunch reconciliation missing: {required}')
check('PRELAUNCH_DELIVERY_SEED' in program and 'PRELAUNCH_MANUAL_DELIVERY_SEED' in program, 'idempotent delivery receipt seeds missing')
check('sale.total_sold = new_total' in program and 'metrics.web_rlya_delivered' in program, 'website prelaunch delivery does not advance on-chain total sold + metrics')
check('sale.manual_sold = sale' in program, 'private/off-site prelaunch delivery does not advance manual counter')
check('gross_usdc_imported' in program and 'total_usdc_raised' in program, 'prelaunch USDC reconciliation counters missing')
check('manifest_sha256' in program and 'expected_web_rlya' in program and 'expected_manual_rlya' in program, 'final manifest hash/totals are not committed on-chain')
check('PrelaunchCommitmentMismatch' in program, 'on-chain manifest commitment bounds are missing')
check('manual_rlya_delivered' in program, 'private/off-site manifest delivery total is not independently reconciled')

check('pendingManifestAmount' in delivery, 'distribution rerun preflight is not receipt-aware')
check("enc.encode('prelaunch_delivery')" in delivery and "enc.encode('prelaunch_manual_delivery')" in delivery, 'distribution tool cannot detect idempotent receipts')
check('sale.status!==2' in delivery, 'distribution tool does not require PAUSED state')
check('Manifest SHA-256 does not match' in delivery, 'distribution manifest hash verification missing')
check('manifest commitment verified on-chain' in delivery.lower(), 'distribution tool does not verify the on-chain manifest commitment')
check('expectedWeb' in delivery and 'manualDelivered' in delivery, 'distribution tool does not reconcile committed expected/actual metrics')
check('signAllTransactions' in delivery, 'distribution tool lacks safe small-batch wallet signing path')

check("presaleMode: 'prelaunch-allocation'" in site and 'presaleEnabled: false' in site, 'prelaunch/atomic launch gates are not separated')
check("cfg.presaleMode === 'atomic' && !cfg.presaleEnabled" in site, 'atomic sale master gate is not preserved')
check('prelaunch-delivery.js' in site and 'presale-control.js' in site and 'treasury-prep.js' in site, 'private owner prelaunch tools are not wired')
check('cfg.saleProgramId && cfg.rlyaMint && cfg.salePda' in site, 'future Mainnet distribution tool is loaded before production addresses exist')
check('Secure your RLYA allocation ahead of public launch' in index, 'professional prelaunch allocation wording missing')
check('distribution is scheduled before public launch' in index.lower(), 'buyer distribution timing wording missing')
check('AI-to-AI settlement' in index and 'autonomous work' in index, 'main AI-to-AI/autonomous-work purpose missing from public website')
check('need 3 sol' not in index.lower() and 'cannot afford' not in index.lower(), 'internal launch financing language leaked into public website')
check('RALYA_Whitepaper_v1.2.html' in index, 'public site still links the obsolete instant-delivery whitepaper')

check("schedule: '@daily'" in cleanup and "cleanupPrefix(s, 'quote/'" in cleanup, 'ephemeral quote/auth cleanup is missing')
check('build:functions' in package and 'test:prelaunch' in package and 'presale-cleanup.mts' in package, 'prelaunch function compile/economics/cleanup build gates missing')
check('PRELAUNCH_RECONCILIATION PASS' in local_integration and 'RALYA_LOCAL_PRELAUNCH_INTEGRATION=PASS' in local_integration, 'localhost integration does not exercise prelaunch reconciliation')

if errors:
    print('PRELAUNCH AUDIT FAILED')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('RALYA_PRELAUNCH_AUDIT=PASS')
print('verified USDC -> wallet allocation path present')
print('website + private/off-site allocations share one fixed curve/cap')
print('owner allocation/final-manifest serialization present')
print('opening access requires live RPC + treasury USDC-account verification')
print('final manifest hash/totals committed and bounded on-chain')
print('Mainnet delivery uses distinct web/manual counters and idempotent receipt PDAs')
print('treasury/referrer USDC receiving accounts are prepared by their owners, not buyers')
print('atomic public token-sale gate remains separately default-OFF')
