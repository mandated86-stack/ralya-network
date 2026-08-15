#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
errors = []

def read(path):
    return (ROOT / path).read_text(encoding='utf-8', errors='ignore')

def check(condition, message):
    if not condition:
        errors.append(message)

readme = read('README.md')
site = read('web/site-config.js')
prelaunch = read('web/prelaunch.js')
wallet = read('web/presale-next.js')
hotfix = read('web/site-ui-hotfix.js')
index = read('web/index.html')
netlify = read('netlify.toml')
state = read('netlify/functions/presale-state.mts')
rpc = read('netlify/functions/solana-rpc.mts')
confirm = read('netlify/functions/presale-confirm.mts')
owner = read('netlify/functions/presale-owner.mts')
treasury = read('web/owner/treasury-prep.js')
build_status = read('docs/BUILD_STATUS.md')
owner_guide = read('docs/OWNER_GUIDE.md')
next_owner = read('NEXT_OWNER_ACTIONS.txt')

check("rpcEndpoint: 'https://ralyaai.com/api/solana/rpc'" in site, 'browser RPC is not routed through the canonical same-origin server proxy with an absolute web3.js-compatible URL')
check('https://api.mainnet-beta.solana.com' not in site, 'public Solana endpoint remains in browser site configuration')
check('https://api.mainnet-beta.solana.com' not in netlify, 'public Solana endpoint remains allowed by browser CSP')
check("Netlify?.env?.get?.('RALYA_SOLANA_RPC')" in rpc, 'server RPC proxy is not sourcing the dedicated endpoint from Netlify environment configuration')
check("path: '/api/solana/rpc'" in rpc, 'server RPC proxy route is missing')
check('https://api.mainnet-beta.solana.com' not in confirm and 'https://api.mainnet-beta.solana.com' not in owner, 'production presale server code still falls back to the public Solana RPC')
check("Dedicated Solana Mainnet RPC is not configured" in confirm and "Dedicated Solana Mainnet RPC is not configured" in owner, 'production presale server paths do not fail closed when dedicated RPC is missing')
check("getStore({ name: PRESALE_STORE, consistency: 'strong' })" in state, 'presale state does not use the current strong-consistency Netlify Blobs store form')
check('confirmTransaction(' not in prelaunch and 'confirmTransaction(' not in treasury, 'browser transaction confirmation still depends on an RPC WebSocket endpoint')
check('getSignatureStatuses' in prelaunch and 'getSignatureStatuses' in treasury, 'HTTP signature-status confirmation polling is missing')
check("await import('@netlify/blobs')" in state and 'backendReady: false' in state, 'presale state endpoint is not catching Blob/runtime initialization inside the handler')
check("const PRESALE_STORE = 'ralya-prelaunch-presale'" in state, 'presale state endpoint is not using the authoritative production Blob store')

check("@solana/connector/headless" in wallet and 'ConnectorClient' in wallet, 'Wallet Standard connector client is missing')
check('Connect Wallet — Enter Presale' in wallet, 'large hero wallet CTA is missing')
check('Live presale data reconnecting…' in wallet, 'small fail-closed reconnect status is missing')
check("let installedWalletAddress = ''" in wallet and "if (changed) window.dispatchEvent" in wallet, 'Wallet Standard subscription can emit duplicate reconnect events/signing prompts')
check('installWalletChooser();' not in hotfix, 'legacy provider-sniffing wallet chooser is still installed')
check('installSafeCopyObserver();' not in hotfix, 'old DOM mutation copy observer is still installed')

for stale in (
    '36 days after public launch',
    'release day 36',
    'standard release day 21',
    'standard 21-day release',
    'STATUS UPDATING',
    'OPENING WITH SITE LAUNCH',
    'RLYA PRESALE • OPENING AT LAUNCH',
):
    check(stale not in prelaunch and stale not in index, f'public buyer source still contains stale copy: {stale}')
check(not re.search(r'Standard.{0,50}(release|receive|unlock).{0,30}21 days after public launch', prelaunch, re.I), 'Standard buyer source still contains a day-21 release path')

check('RLYA PRESALE • FINAL SETUP' in index, 'static page does not start in FINAL SETUP state')
check('288M base RLYA is reserved for the public presale.' in index, 'static presale urgency heading is missing')
check('1 day before public launch' in prelaunch and '21 days after public launch' in prelaunch, 'final T-1 / T+21 buyer release copy is missing')

check('Public presale base allocation: `288,000,000 RLYA`' in readme, 'README does not state the authoritative 288M base presale allocation')
check('Whitepaper v1.2' in readme and 'Whitepaper v1.1' not in readme, 'README whitepaper version is stale')
check('100,680,000' not in readme, 'README contains the obsolete 100.68M pool')
check('1,000,000 RLYA' not in readme and '$0.000050' not in readme, 'README publicly advertises the internal price-step mechanic')
check('pre-launch presale phase' in readme and 'RLYA public token Mainnet Day 0' in readme, 'README does not distinguish presale LIVE from later public token Day 0')

check("presaleEnabled: false" in site, 'post-launch atomic sale switch must remain disabled')
check("rlyaMint: ''" in site and "saleProgramId: ''" in site and "salePda: ''" in site, 'Mainnet token/program/PDA values must remain blank')
check('presaleCap: 288000000' in site and 'stakingBonusReserve: 14400000' in site and 'stakingBonusBps: 500' in site, 'authoritative presale economics changed')

current_docs = build_status + owner_guide + next_owner
check('100,680,000' not in current_docs and '100.68M' not in current_docs, 'current owner/public status docs still contain the obsolete 100.68M pool')
check('36 days after public launch' not in current_docs, 'current owner/public status docs still contain the obsolete day-36 release')
check('DELIBERATELY DEFERRED' not in current_docs and 'deliberately deferred' not in current_docs, 'current owner/public status docs use stale intentional-delay wording')

if errors:
    print('PRESALE PUBLIC AUDIT FAILED')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('RALYA_PRESALE_PUBLIC_AUDIT=PASS')
print('canonical same-origin RPC proxy configured; provider credential stays server-side')
print('Wallet Standard chooser + prominent CTA present')
print('public state copy uses FINAL SETUP/LIVE and fails closed on reconnect')
print('README/public buyer copy uses 288M, T-1, T+21 and Whitepaper v1.2')
print('Mainnet mint/program/PDA remain blank and Day 0 is not launched')
