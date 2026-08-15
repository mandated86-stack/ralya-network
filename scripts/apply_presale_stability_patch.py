#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def load(path):
    p = ROOT / path
    return p, p.read_text(encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)

def regex_once(text, pattern, replacement, label, flags=re.S):
    out, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, found {count}')
    return out

# --- buyer source ---
p, s = load('web/prelaunch.js')
s = replace_once(s, "function getProvider() {\n", "function getProvider() {\n  if (window.RALYA_WALLET_PROVIDER?.connect) return window.RALYA_WALLET_PROVIDER;\n", 'prefer Wallet Standard provider')

s = replace_once(
    s,
    "      ? 'This wallet is locked to Buy + Stake: +5% RLYA, release 36 days after public launch.'\n      : 'This wallet is locked to standard release: 21 days after public launch.';",
    "      ? 'This wallet is locked to Buy + Stake: base + fixed 5% bonus unlock 21 days after public launch.'\n      : 'This wallet is locked to Standard: actual RLYA 1 day before public launch.';",
    'locked release copy',
)

new_refresh = r'''async function refreshState() {
  try {
    state = await fetchJson('/api/presale/state');
    const verified = state?.backendReady !== false;
    const open = verified && state.access === 'open';
    const paused = verified && state.access === 'paused';
    $('#currentPrice').textContent = formatPrice(state.currentPriceMicroUsdc);
    $('#soldRlya').textContent = `${formatBase(state.totalAllocatedBase, 9, 2)} RLYA`;
    $('#saleState').textContent = open ? 'PRESALE LIVE' : paused ? 'PAUSED' : 'FINAL SETUP';
    $('#saleDot')?.classList.toggle('amber', !open);
    $('#presaleHeroDot')?.classList.toggle('amber', !open);
    if ($('#presaleHeroStatus')) $('#presaleHeroStatus').textContent = open ? 'RLYA PRESALE • LIVE' : paused ? 'RLYA PRESALE • TEMPORARILY PAUSED' : 'RLYA PRESALE • FINAL SETUP';
    if ($('#presaleEyebrow')) $('#presaleEyebrow').textContent = open ? 'RLYA PRESALE • LIVE' : paused ? 'RLYA PRESALE • PAUSED' : 'RLYA PRESALE • FINAL SETUP';
    if ($('#presaleHeading')) $('#presaleHeading').textContent = open ? 'Secure your pre-launch RLYA allocation.' : paused ? 'RLYA presale is temporarily paused.' : '288M base RLYA is reserved for the public presale.';
    if ($('#presaleHeroCta')) $('#presaleHeroCta').textContent = open ? 'Enter RLYA presale' : paused ? 'View presale status' : 'View RLYA presale';
    document.documentElement.dataset.ralyaPresaleState = verified ? String(state.access || 'closed') : 'reconnecting';
    window.dispatchEvent(new CustomEvent('ralya:presale-state', { detail: state }));
    updatePreview(); updateBuyAvailability();
  } catch (err) {
    state = null;
    if ($('#saleState')) $('#saleState').textContent = 'FINAL SETUP';
    document.documentElement.dataset.ralyaPresaleState = 'reconnecting';
    window.dispatchEvent(new CustomEvent('ralya:presale-state', { detail: { backendReady: false, access: 'closed' } }));
    updateBuyAvailability();
  }
}
'''
s = regex_once(s, r"async function refreshState\(\) \{.*?\n\}\nasync function fetchUsdcBalance", new_refresh + 'async function fetchUsdcBalance', 'refreshState')

new_release = r'''function releaseText(status, stake = false) {
  if (stake || status === '21-days-after-public-launch' || status === 'staked-plus21d') return 'Buy + Stake: base + fixed 5% bonus unlock 21 days after public launch';
  return 'Standard: actual RLYA 1 day before public launch';
}
'''
s = regex_once(s, r"function releaseText\(status, stake = false\) \{.*?\n\}\nasync function refreshWallet", new_release + 'async function refreshWallet', 'releaseText')
s = s.replace("'Standard: 21 days after public launch'", "'Standard: actual RLYA 1 day before public launch'")

new_connect = r'''let walletConnectInFlight = null;
async function connectWallet() {
  if (walletConnectInFlight) return walletConnectInFlight;
  walletConnectInFlight = (async () => {
    provider = getProvider();
    if (!provider) return toast('Choose a Solana wallet to continue.');
    try {
      const result = await provider.connect();
      wallet = new PublicKey(result?.publicKey || provider.publicKey);
      if (allocationViewAuth?.wallet !== wallet.toBase58()) allocationViewAuth = null;
      lockedStake = null; syncStakeUi();
      $$('.wallet-button').forEach(btn => btn.textContent = shorten(wallet.toBase58()));
      if ($('#walletLabel')) $('#walletLabel').textContent = shorten(wallet.toBase58());
      if (referralWallet && referralWallet.equals(wallet)) setReferral('', true);
      updateReferralLink();
      await refreshWallet();
      updateBuyAvailability();
    } catch (err) {
      toast(err.message || 'Wallet connection cancelled.');
    }
  })();
  try { return await walletConnectInFlight; }
  finally { walletConnectInFlight = null; }
}
'''
s = regex_once(s, r"async function connectWallet\(\) \{.*?\n\}\nfunction updatePreview", new_connect + 'function updatePreview', 'connectWallet')

s = s.replace('release day 36', 'unlock day 21')
s = s.replace('standard release day 21', 'standard release T-1')
s = s.replace('Buy + Stake: release 36 days after public launch', 'Buy + Stake: base + fixed 5% bonus unlock 21 days after public launch')
s = s.replace('36-day release schedule', 'day-21 unlock schedule')
s = s.replace('standard 21-day release schedule', 'standard T-1 release schedule')
s = s.replace("'Buy + Stake / release day 36'", "'Buy + Stake / unlock T+21'")
s = s.replace("'standard / release day 21'", "'standard / release T-1'")
s = s.replace("const release = receipt.stake ? '36 days after public launch' : '21 days after public launch';", "const release = receipt.stake ? '21 days after public launch' : '1 day before public launch';")
s = s.replace("if (state?.access !== 'open') throw new Error('RLYA presale is not open yet.');", "if (state?.backendReady === false || state?.access !== 'open') throw new Error('RLYA presale access is not verified open yet.');")

new_availability = r'''function updateBuyAvailability() {
  const button = $('#buyRlya'), msg = $('#buyMessage');
  if (!button || !msg) return;
  const verified = state?.backendReady !== false && Boolean(state);
  const open = verified && state?.access === 'open';
  button.disabled = !(wallet && open);
  button.textContent = wantsStake() ? 'Buy + Stake · secure allocation' : 'Secure my presale allocation';
  if (!verified) msg.textContent = 'Live presale data reconnecting… purchasing remains disabled until the verified state returns.';
  else if (!open) msg.textContent = state?.access === 'paused' ? 'RLYA presale is temporarily paused.' : 'RLYA presale is in final setup. Connect your wallet and be ready when access opens.';
  else if (!wallet) msg.textContent = 'Connect a Solana wallet to continue.';
  else msg.textContent = wantsStake()
    ? 'After verified payment, your base allocation plus fixed 5% RLYA bonus unlock 21 days after public launch.'
    : 'After verified payment, Standard buyers receive actual purchased RLYA 1 day before public launch.';
}
'''
s = regex_once(s, r"function updateBuyAvailability\(\) \{.*?\n\}\nasync function sendTransaction", new_availability + 'async function sendTransaction', 'updateBuyAvailability')

# Wallet Standard auto-reconnect is cross-tab persistent; bridge it into the existing buyer state.
listener_anchor = "$$('[data-wallet-connect]').forEach(btn => btn.addEventListener('click', connectWallet));\n"
s = replace_once(s, listener_anchor, listener_anchor + "window.addEventListener('ralya:wallet-standard-connected', () => connectWallet());\n", 'Wallet Standard reconnect bridge')

for forbidden in ('36 days after public launch', 'release day 36', 'standard release day 21', 'standard 21-day release', 'STATUS UPDATING', 'OPENING WITH SITE LAUNCH', 'RLYA PRESALE • OPENING AT LAUNCH'):
    if forbidden in s:
        raise SystemExit(f'prelaunch still contains stale copy: {forbidden}')
p.write_text(s, encoding='utf-8')

# --- static HTML: no stale flash before live state arrives ---
p, html = load('web/index.html')
html = replace_once(html, 'RLYA PRESALE • OPENING WITH SITE LAUNCH', 'RLYA PRESALE • FINAL SETUP', 'hero static status')
html = replace_once(html, 'RLYA presale — opening at launch', 'View RLYA presale', 'hero static cta')
html = replace_once(html, 'RLYA PRESALE • OPENING AT LAUNCH', 'RLYA PRESALE • FINAL SETUP', 'presale static eyebrow')
html = replace_once(html, 'Secure your presale position before public launch.', '288M base RLYA is reserved for the public presale.', 'presale static heading')
p.write_text(html, encoding='utf-8')

# --- v2 hotfix: keep tabs/social/referral/mobile stability, retire duplicate legacy wallet picker + copy observer ---
p, hotfix = load('web/site-ui-hotfix.js')
hotfix = replace_once(hotfix, '    installWalletChooser();\n', '', 'legacy chooser install')
hotfix = replace_once(hotfix, '    installSafeCopyObserver();\n', '', 'copy observer install')
hotfix = replace_once(hotfix, "      if (!/^https?:\\/\\//i.test(link)) return openWalletPicker(connect);", "      if (!/^https?:\\/\\//i.test(link)) return connect.click();", 'referral uses primary chooser')
p.write_text(hotfix, encoding='utf-8')

print('RALYA_PRESALE_SOURCE_PATCH=PASS')
