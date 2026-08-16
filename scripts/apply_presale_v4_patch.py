#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 regex match, found {count}')
    return out

# ---------------------------------------------------------------------------
# 1. Deterministic Android wallet chooser.
#    Do not route branded wallet buttons through generic MWA. If a Wallet
#    Standard connector is actually detected, use it. Otherwise open the
#    selected wallet's own dapp browser, which is the reliable fallback.
# ---------------------------------------------------------------------------
path = 'web/presale-next.js'
text = read(path)
text = replace_once(
    text,
    "if (android && window.isSecureContext) {",
    "if (false && android && window.isSecureContext) {",
    'disable generic MWA registration',
)
text = replace_once(
    text,
    "featured: ['Mobile Wallet Adapter', 'Phantom', 'Solflare', 'Trust Wallet', 'MetaMask', 'Backpack', 'WalletConnect'],",
    "featured: ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask', 'Backpack', 'WalletConnect'],",
    'remove MWA featured connector',
)
old_mobile_row = '''function mobileAuthorizationRow(name) {
  return `<button type="button" class="ralya-wallet-choice mobile-auth" data-mobile-authorize="${name.toLowerCase()}"><span class="ralya-wallet-letter">${name[0]}</span><span><strong>${name}</strong><small>Use Android wallet authorization — do not open RALYA inside the wallet browser</small></span><b>AUTHORIZE</b></button>`;
}'''
new_mobile_row = '''function walletBrowserTarget() {
  const target = new URL(cfg.projectUrl || location.origin);
  target.pathname = '/presale';
  target.search = location.search;
  target.hash = '';
  return target;
}
function walletBrowserUrl(name) {
  const target = walletBrowserTarget();
  const ref = new URL(cfg.projectUrl || location.origin).origin;
  const key = String(name || '').toLowerCase();
  if (key === 'phantom') return `https://phantom.app/ul/browse/${encodeURIComponent(target.toString())}?ref=${encodeURIComponent(ref)}`;
  if (key === 'solflare') return `https://solflare.com/ul/v1/browse/${encodeURIComponent(target.toString())}?ref=${encodeURIComponent(ref)}`;
  if (key === 'trust wallet') return `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(target.toString())}`;
  if (key === 'metamask') return `https://metamask.app.link/dapp/${target.host}${target.pathname}${target.search}`;
  return target.toString();
}
function mobileAppRow(name) {
  return `<button type="button" class="ralya-wallet-choice mobile-auth" data-mobile-open="${name.toLowerCase()}"><span class="ralya-wallet-letter">${name[0]}</span><span><strong>${name}</strong><small>Open RALYA inside ${name} and connect there</small></span><b>OPEN APP</b></button>`;
}'''
text = replace_once(text, old_mobile_row, new_mobile_row, 'replace mobile authorization row')
text = replace_once(
    text,
    "const connectors = (state.connectors || []).filter(row => row && row.name);",
    "const connectors = (state.connectors || []).filter(row => row && row.name && !isMwaConnector(row));",
    'filter generic MWA connector',
)
text = replace_once(
    text,
    "const preferred = ['Mobile Wallet Adapter', 'Phantom', 'Solflare', 'Trust Wallet', 'WalletConnect', 'MetaMask', 'Backpack'];",
    "const preferred = ['Phantom', 'Solflare', 'Trust Wallet', 'WalletConnect', 'MetaMask', 'Backpack'];",
    'update preferred wallet order',
)
old_android_block = '''  // Never fall back to a "browse this website inside the wallet" deep link. If a branded
  // wallet has not exposed Wallet Standard, Android uses Mobile Wallet Adapter authorization.
  if (android) {
    for (const name of ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask']) {
      if (!names.has(name.toLowerCase())) list.insertAdjacentHTML('beforeend', mobileAuthorizationRow(name));
    }
  }'''
new_android_block = '''  // On Android, use a real detected connector when available. Otherwise use the wallet's
  // documented dapp-browser handoff instead of pretending every brand supports generic MWA.
  if (android) {
    for (const name of ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask']) {
      if (!names.has(name.toLowerCase())) list.insertAdjacentHTML('beforeend', mobileAppRow(name));
    }
  }'''
text = replace_once(text, old_android_block, new_android_block, 'replace Android fallback block')
text = replace_once(
    text,
    "  list.querySelectorAll('[data-mobile-authorize]').forEach(button => button.addEventListener('click', () => connectMobileAuthorization(), { once: true }));",
    "  list.querySelectorAll('[data-mobile-open]').forEach(button => button.addEventListener('click', () => { location.assign(walletBrowserUrl(button.dataset.mobileOpen)); }, { once: true }));",
    'wire mobile wallet browser rows',
)
text = replace_once(
    text,
    "      <p class=\"ralya-wallet-intro\">Choose a wallet. On supported Android wallets, RALYA opens the wallet authorization screen and stays in this browser.</p>",
    "      <p class=\"ralya-wallet-intro\">Choose a wallet. Detected wallets connect here; on mobile, unavailable browser connectors open RALYA inside the selected wallet app.</p>",
    'wallet chooser intro',
)
write(path, text)

# Make the legacy hotfix intentionally tiny. The source chooser above is authoritative.
write('web/wallet-mobile-fix.js', r'''(() => {
  if (!/Android/i.test(navigator.userAgent)) return;
  const patch = () => {
    const intro = document.querySelector('.ralya-wallet-intro');
    if (intro) intro.textContent = 'Choose a wallet. Detected wallets connect here; otherwise tap OPEN APP to continue inside the selected wallet.';
    const list = document.getElementById('ralyaWalletList');
    if (!list) return;
    for (const row of [...list.querySelectorAll('[data-connector-id]')]) {
      if (/mobile wallet adapter/i.test(row.textContent || '')) row.remove();
    }
  };
  window.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-wallet-connect]')) setTimeout(patch, 0);
  }, true);
})();
''')

# ---------------------------------------------------------------------------
# 2. Public source copy: BUY button, direct allocation language, reassurance.
# ---------------------------------------------------------------------------
path = 'web/index.html'
text = read(path)
replacements = [
    ('Presale purchases record an expected RLYA allocation.', 'Presale purchases record your RLYA allocation.'),
    ('A confirmed purchase records the expected RLYA allocation', 'A confirmed purchase records your RLYA allocation'),
    ('Expected RLYA allocation', 'You will receive'),
    ('Expected RLYA', 'Your RLYA'),
    ('Secure my presale allocation', 'BUY'),
    ('Verified USDC. Expected allocation recorded now.', 'Verified USDC. RLYA allocation recorded now.'),
    ('Expected allocation confirmed', 'RLYA allocation confirmed'),
    ('confirmed expected RLYA', 'confirmed RLYA'),
]
for old, new in replacements:
    text = text.replace(old, new)
write(path, text)

path = 'web/prelaunch.js'
text = read(path)
text = replace_once(
    text,
    "  if (window.solflare?.isSolflare) return window.solflare;\n  if (window.solana?.connect) return window.solana;",
    "  if (window.solflare?.isSolflare) return window.solflare;\n  if (window.trustwallet?.solana?.connect) return window.trustwallet.solana;\n  if (window.solana?.connect) return window.solana;",
    'add Trust Solana provider',
)
text = text.replace("'EXPECTED ALLOCATION CONFIRMED'", "'RLYA ALLOCATION CONFIRMED'")
text = text.replace("'USDC confirmed. Verifying your expected RLYA allocation…'", "'USDC confirmed. Verifying your RLYA allocation…'")
old_receipt = '''  if (box) {
    box.hidden = false;
    box.innerHTML = `<strong>Expected Allocation Confirmed.</strong> ${formatBase(receiptBase, 9, 4)} RLYA purchased${receiptBonus > 0n ? ` + ${formatBase(receiptBonus, 9, 4)} RLYA staking bonus` : ''} = <strong>${formatBase(receiptTotal, 9, 4)} RLYA expected</strong> for ${shorten(receipt.wallet)}. Release: ${release}. <a href="${explorer}" target="_blank" rel="noopener">Verify USDC transaction →</a>`;
  }
  toast(receipt.stake ? 'Buy + Stake allocation confirmed with 5% RLYA bonus.' : 'Expected RLYA allocation confirmed.');
  await Promise.all([refreshState(), refreshWallet()]);'''
new_receipt = '''  const deliveryMessage = receipt.stake
    ? 'Your base RLYA + fixed 5% bonus will be sent automatically to this same wallet 21 days after public launch. No claim is required.'
    : 'Your RLYA will be sent automatically to this same wallet 1 day before public launch. No claim is required; it will appear in your wallet automatically.';
  if (box) {
    box.hidden = false;
    box.innerHTML = `<strong>Purchase confirmed.</strong> ${formatBase(receiptBase, 9, 4)} RLYA purchased${receiptBonus > 0n ? ` + ${formatBase(receiptBonus, 9, 4)} RLYA staking bonus` : ''} = <strong>${formatBase(receiptTotal, 9, 4)} RLYA</strong> for ${shorten(receipt.wallet)}.<br/><br/><strong>Your RLYA is recorded.</strong> ${deliveryMessage}<br/><a href="${explorer}" target="_blank" rel="noopener">Verify USDC transaction →</a>`;
  }
  window.dispatchEvent(new CustomEvent('ralya:purchase-confirmed', { detail: {
    wallet: receipt.wallet,
    signature,
    baseRlyaBase: receiptBase.toString(),
    bonusRlyaBase: receiptBonus.toString(),
    totalRlyaBase: receiptTotal.toString(),
    grossUsdcBase: String(receipt.grossUsdcBase || 0),
    stake: receipt.stake === true,
    release,
    explorer,
    deliveryMessage,
  }}));
  toast(receipt.stake ? 'Purchase confirmed · +5% Buy + Stake recorded.' : 'Purchase confirmed · your RLYA is recorded.');
  await Promise.all([refreshState(), refreshWallet()]);'''
text = replace_once(text, old_receipt, new_receipt, 'purchase confirmation UI/event')
write(path, text)

# Celebration popup shown ONLY after /api/presale/confirm has returned a verified receipt.
write('web/purchase-celebration.js', r'''(() => {
  const RLYA_UNIT = 1_000_000_000n;
  const USDC_UNIT = 1_000_000n;
  const $ = (q, root = document) => root.querySelector(q);

  function formatBase(value, unit, maxFraction = 4) {
    const n = BigInt(value || 0);
    const whole = n / unit;
    let frac = (n % unit).toString().padStart(String(unit).length - 1, '0').slice(0, maxFraction).replace(/0+$/, '');
    return `${Number(whole).toLocaleString()}${frac ? `.${frac}` : ''}`;
  }
  function ensureModal() {
    let modal = $('#ralyaPurchaseCelebration');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'ralyaPurchaseCelebration';
    modal.className = 'ralya-celebration';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ralya-celebration-backdrop"></div>
      <section class="ralya-celebration-card" role="dialog" aria-modal="true" aria-labelledby="ralyaCelebrationTitle">
        <button type="button" class="ralya-celebration-close" aria-label="Close">×</button>
        <div class="ralya-celebration-orbit"><span>R</span></div>
        <p class="ralya-celebration-kicker">PURCHASE CONFIRMED</p>
        <h2 id="ralyaCelebrationTitle">Welcome to RALYA 🎉</h2>
        <div class="ralya-celebration-amount" data-celebration-rlya>-- RLYA</div>
        <p class="ralya-celebration-paid" data-celebration-usdc></p>
        <div class="ralya-celebration-delivery" data-celebration-delivery></div>
        <p class="ralya-celebration-note"><strong>Not seeing RLYA in your wallet yet is normal.</strong> Your purchase is recorded against this same wallet. You do not need to claim anything.</p>
        <div class="ralya-celebration-actions">
          <button type="button" class="btn btn-primary" data-celebration-view>VIEW MY RLYA</button>
          <button type="button" class="btn btn-secondary" data-celebration-share>SHARE & EARN 1% USDC</button>
        </div>
        <a data-celebration-explorer target="_blank" rel="noopener">Verify transaction on Solana →</a>
        <div class="ralya-confetti" aria-hidden="true"></div>
      </section>`;
    document.body.appendChild(modal);
    const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
    $('.ralya-celebration-close', modal).addEventListener('click', close);
    $('.ralya-celebration-backdrop', modal).addEventListener('click', close);
    $('[data-celebration-view]', modal).addEventListener('click', () => {
      close();
      document.querySelector('.buy-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('[data-celebration-share]', modal).addEventListener('click', () => {
      close();
      document.getElementById('copyReferralLink')?.click();
    });
    return modal;
  }
  function makeConfetti(modal) {
    const host = $('.ralya-confetti', modal);
    if (!host) return;
    host.innerHTML = '';
    for (let i = 0; i < 42; i += 1) {
      const bit = document.createElement('i');
      bit.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
      bit.style.setProperty('--r', `${Math.round(Math.random() * 320 - 160)}deg`);
      bit.style.setProperty('--d', `${(Math.random() * 1.2).toFixed(2)}s`);
      bit.style.setProperty('--t', `${(1.6 + Math.random() * 1.8).toFixed(2)}s`);
      host.appendChild(bit);
    }
  }
  window.addEventListener('ralya:purchase-confirmed', event => {
    const detail = event.detail || {};
    const modal = ensureModal();
    $('[data-celebration-rlya]', modal).textContent = `${formatBase(detail.totalRlyaBase, RLYA_UNIT, 4)} RLYA`;
    const usdc = formatBase(detail.grossUsdcBase, USDC_UNIT, 2);
    $('[data-celebration-usdc]', modal).textContent = usdc !== '0' ? `${usdc} USDC confirmed on Solana` : 'USDC payment confirmed on Solana';
    $('[data-celebration-delivery]', modal).innerHTML = detail.stake
      ? '<strong>BUY + STAKE · +5%</strong><span>Your base RLYA + fixed 5% bonus will be sent automatically to this same wallet 21 days after public launch.</span>'
      : '<strong>STANDARD DELIVERY</strong><span>Your RLYA will be sent automatically to this same wallet 1 day before public launch and will appear there automatically.</span>';
    const link = $('[data-celebration-explorer]', modal);
    if (link) link.href = detail.explorer || '#';
    makeConfetti(modal);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  });
})();
''')

write('web/purchase-celebration.css', r'''.ralya-celebration[hidden]{display:none!important}.ralya-celebration{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px}.ralya-celebration-backdrop{position:absolute;inset:0;background:rgba(2,14,24,.76);backdrop-filter:blur(10px)}.ralya-celebration-card{position:relative;width:min(520px,100%);max-height:min(760px,92vh);overflow:auto;background:linear-gradient(160deg,#071b2a,#0b2730 58%,#0c3333);border:1px solid rgba(114,230,213,.36);border-radius:28px;padding:34px 28px 28px;color:#effffd;text-align:center;box-shadow:0 30px 100px rgba(0,0,0,.48);isolation:isolate}.ralya-celebration-close{position:absolute;right:15px;top:13px;width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:28px;cursor:pointer}.ralya-celebration-orbit{width:86px;height:86px;margin:2px auto 16px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 34% 28%,#9fffee,#20cbb6 44%,#087d78 72%,#052c38);box-shadow:0 0 0 10px rgba(95,240,216,.08),0 0 50px rgba(72,232,211,.35);animation:ralyaPulse 1.8s ease-in-out infinite}.ralya-celebration-orbit span{font-size:40px;font-weight:950;color:#032126}.ralya-celebration-kicker{margin:0;color:#6ef0dc;font-size:12px;font-weight:900;letter-spacing:.18em}.ralya-celebration-card h2{margin:8px 0 14px;font-size:clamp(28px,8vw,42px);line-height:1}.ralya-celebration-amount{font-size:clamp(32px,9vw,48px);font-weight:950;color:#79f3df;letter-spacing:-.03em}.ralya-celebration-paid{margin:6px 0 20px;color:#a9c7cf}.ralya-celebration-delivery{display:flex;flex-direction:column;gap:7px;text-align:left;padding:17px 18px;border:1px solid rgba(121,243,223,.25);border-radius:16px;background:rgba(121,243,223,.08)}.ralya-celebration-delivery strong{color:#79f3df;font-size:13px}.ralya-celebration-delivery span{color:#e6faf6;line-height:1.5}.ralya-celebration-note{text-align:left;color:#b9d2d7;line-height:1.55;margin:15px 2px}.ralya-celebration-note strong{color:#fff}.ralya-celebration-actions{display:grid;grid-template-columns:1fr;gap:10px;margin:18px 0}.ralya-celebration-actions .btn{min-height:52px}.ralya-celebration-card>a{color:#79f3df;font-size:12px;font-weight:800}.ralya-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1}.ralya-confetti i{position:absolute;left:var(--x);top:-18px;width:7px;height:14px;border-radius:2px;background:hsl(calc(160 + var(--x) * .4),75%,66%);transform:rotate(var(--r));animation:ralyaFall var(--t) cubic-bezier(.2,.7,.3,1) var(--d) both}@keyframes ralyaFall{0%{opacity:0;transform:translateY(-20px) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(700px) rotate(var(--r))}}@keyframes ralyaPulse{50%{transform:scale(1.045);box-shadow:0 0 0 15px rgba(95,240,216,.04),0 0 65px rgba(72,232,211,.45)}}@media(max-width:560px){.ralya-celebration{padding:10px}.ralya-celebration-card{border-radius:24px;padding:30px 20px 24px}.ralya-celebration-actions{gap:8px}}
''')

# ---------------------------------------------------------------------------
# 3. Persistent buyer ledger v4 + wallet index + immutable final manifest.
# ---------------------------------------------------------------------------
path = 'netlify/functions/_shared/presale-core.mts'
text = read(path)
text = replace_once(
    text,
    "  deliveryPolicy?: 'standard-tminus1' | 'staked-plus21d';\n};",
    "  deliveryPolicy?: 'standard-tminus1' | 'staked-plus21d';\n  ledgerVersion?: number;\n  deliveryStatus?: 'pending' | 'delivered';\n  automaticDelivery?: boolean;\n  claimRequired?: boolean;\n  ledgerRecordSha256?: string;\n};",
    'extend allocation ledger type',
)
old_get_events = '''export async function getAllocationEvents(s = store()) {
  const [web, manual] = await Promise.all([
    readPrefix<AllocationEvent>(s, 'purchase/'),
    readPrefix<AllocationEvent>(s, 'manual/'),
  ]);
  return [...web, ...manual];
}'''
new_get_events = '''export async function getAllocationEvents(s = store()) {
  const [web, manual] = await Promise.all([
    readPrefix<AllocationEvent>(s, 'purchase/'),
    readPrefix<AllocationEvent>(s, 'manual/'),
  ]);
  const events = [...web, ...manual];
  for (const event of events) {
    if (!event.ledgerRecordSha256) continue;
    const copy: any = { ...event };
    const supplied = String(copy.ledgerRecordSha256).toLowerCase();
    delete copy.ledgerRecordSha256;
    if (!/^[a-f0-9]{64}$/.test(supplied) || sha256Json(copy) !== supplied) {
      throw new Error(`Presale ledger integrity check failed for ${event.id}. Stop allocation/distribution operations.`);
    }
  }
  return events;
}'''
text = replace_once(text, old_get_events, new_get_events, 'ledger integrity reader')
write(path, text)

path = 'netlify/functions/presale-confirm.mts'
text = read(path)
text = replace_once(
    text,
    "  computeState, json, stakingBonus, store, withMutationLock,",
    "  computeState, json, sha256Json, stakingBonus, store, withMutationLock,",
    'import ledger hash helper',
)
old_event_start = '''      const event = {
        id: signature,
        kind: 'web',
        wallet: quote.buyer,'''
new_event_start = '''      const eventPayload = {
        id: signature,
        kind: 'web',
        wallet: quote.buyer,'''
text = replace_once(text, old_event_start, new_event_start, 'rename purchase event payload')
text = replace_once(
    text,
    "        status: 'allocation-confirmed',\n        distributionStatus: stake ? '21-days-after-public-launch' : '1-day-before-public-launch',\n      };\n      await s.setJSON(`purchase/${signature}`, event);",
    "        status: 'allocation-confirmed',\n        distributionStatus: stake ? '21-days-after-public-launch' : '1-day-before-public-launch',\n        ledgerVersion: 4,\n        deliveryStatus: 'pending',\n        automaticDelivery: true,\n        claimRequired: false,\n      };\n      const event = { ...eventPayload, ledgerRecordSha256: sha256Json(eventPayload) };\n      await s.setJSON(`purchase/${signature}`, event);\n      await s.setJSON(`wallet-purchase/${quote.buyer}/${signature}`, event);",
    'hash and index confirmed purchase',
)
write(path, text)

path = 'netlify/functions/presale-wallet.mts'
text = read(path)
text = replace_once(
    text,
    "      lockedReferrer: (referral as any)?.referrer || null,\n      allocations:",
    "      lockedReferrer: (referral as any)?.referrer || null,\n      automaticDelivery: true,\n      claimRequired: false,\n      deliveryMessage: hasStaked && !hasStandard\n        ? 'Base RLYA + fixed 5% bonus will be sent automatically to this same wallet 21 days after public launch.'\n        : 'Standard RLYA will be sent automatically to this same wallet 1 day before public launch.',\n      allocations:",
    'wallet delivery reassurance fields',
)
text = replace_once(
    text,
    "          signature: event.kind === 'web' ? event.signature || null : null,\n        };",
    "          signature: event.kind === 'web' ? event.signature || null : null,\n          ledgerVersion: event.ledgerVersion || null,\n          ledgerRecordSha256: event.ledgerRecordSha256 || null,\n          deliveryStatus: event.deliveryStatus || 'pending',\n          automaticDelivery: event.automaticDelivery !== false,\n          claimRequired: event.claimRequired === true,\n        };",
    'wallet allocation ledger fields',
)
write(path, text)

path = 'netlify/functions/presale-owner.mts'
text = read(path)
text = replace_once(
    text,
    "        sourceIds: [],\n      };",
    "        sourceIds: [],\n        sourceLedgerHashes: [],\n      };",
    'manifest group source hashes',
)
text = replace_once(
    text,
    "    row.sourceIds.push(event.id);",
    "    row.sourceIds.push(event.id);\n    if (event.ledgerRecordSha256) row.sourceLedgerHashes.push(event.ledgerRecordSha256);",
    'collect ledger hashes',
)
text = replace_once(
    text,
    "      sourceIds: row.sourceIds,\n    }));",
    "      sourceIds: row.sourceIds,\n      sourceLedgerHashes: row.sourceLedgerHashes,\n      automaticDelivery: true,\n      claimRequired: false,\n    }));",
    'manifest row automatic delivery',
)
text = replace_once(text, "    version: 3,", "    version: 4,", 'manifest v4')
text = replace_once(
    text,
    "      stakingBonusBps: 500,\n    },",
    "      stakingBonusBps: 500,\n      automaticDelivery: true,\n      claimRequired: false,\n      recipientWallet: 'same-wallet-used-for-presale-purchase',\n    },",
    'manifest delivery metadata',
)
old_manifest_op = '''    if (op === 'manifest') {
      const state = await computeState(s, true);
      if (state.control.access !== 'closed') throw new Error('Close pre-launch allocation access before exporting the final delivery manifest.');
      if (state.reservedBase > 0n) throw new Error('Active buyer quote windows are still clearing. Export the final manifest after all reservations expire or confirm.');
      const manifest = await makeManifest(s);
      if (BigInt(manifest.totals.totalPurchasedRlyaBase) > PRESALE_CAP_BASE) throw new Error('Manifest exceeds the 288M public allocation cap.');
      if (BigInt(manifest.totals.stakingBonusRlyaBase) > STAKING_BONUS_RESERVE_BASE) throw new Error('Manifest exceeds the 14.4M staking bonus reserve.');
      return json({ ok: true, manifest });
    }'''
new_manifest_op = '''    if (op === 'manifest') {
      const state = await computeState(s, true);
      if (state.control.access !== 'closed') throw new Error('Close pre-launch allocation access before exporting the final delivery manifest.');
      if (state.reservedBase > 0n) throw new Error('Active buyer quote windows are still clearing. Export the final manifest after all reservations expire or confirm.');
      const frozen: any = await s.get('final-manifest/v4', { type: 'json' });
      if (frozen) return json({ ok: true, frozen: true, manifest: frozen });
      const manifest = await makeManifest(s);
      if (BigInt(manifest.totals.totalPurchasedRlyaBase) > PRESALE_CAP_BASE) throw new Error('Manifest exceeds the 288M public allocation cap.');
      if (BigInt(manifest.totals.stakingBonusRlyaBase) > STAKING_BONUS_RESERVE_BASE) throw new Error('Manifest exceeds the 14.4M staking bonus reserve.');
      const stored: any = await s.setJSON('final-manifest/v4', manifest, { onlyIfNew: true });
      if (!stored.modified) {
        const existing: any = await s.get('final-manifest/v4', { type: 'json' });
        if (!existing || existing.sha256 !== manifest.sha256) throw new Error('A different final manifest is already frozen. STOP and reconcile before distribution.');
        return json({ ok: true, frozen: true, manifest: existing });
      }
      return json({ ok: true, frozen: true, manifest });
    }'''
text = replace_once(text, old_manifest_op, new_manifest_op, 'freeze final manifest')
write(path, text)

# ---------------------------------------------------------------------------
# 4. Future production distribution: T-1 Standard, T+21 Buy+Stake.
#    Add one-time scheduled launch timestamp to PrelaunchMetrics. Buyers never
#    need to claim; the owner signs batch transfers, and per-wallet receipt PDAs
#    make reruns safe/idempotent. Production program is still NOT deployed here.
# ---------------------------------------------------------------------------
path = 'programs/rlya_sale/src/lib.rs'
text = read(path)
text = replace_once(
    text,
    "const STANDARD_PRESALE_RELEASE_SECONDS: i64 = 21 * 24 * 60 * 60;\nconst STAKED_PRESALE_RELEASE_SECONDS: i64 = 36 * 24 * 60 * 60;",
    "const STANDARD_PRESALE_RELEASE_OFFSET_SECONDS: i64 = -24 * 60 * 60;\nconst STAKED_PRESALE_RELEASE_SECONDS: i64 = 21 * 24 * 60 * 60;\nconst MIN_LAUNCH_SCHEDULE_LEAD_SECONDS: i64 = 24 * 60 * 60;",
    'program release constants',
)
text = replace_once(
    text,
    "        metrics.expected_referral_usdc = expected_referral_usdc;\n        metrics.web_rlya_delivered = 0;",
    "        metrics.expected_referral_usdc = expected_referral_usdc;\n        metrics.scheduled_public_launch_at = 0;\n        metrics.web_rlya_delivered = 0;",
    'initialize scheduled launch timestamp',
)
# Insert schedule instruction before mark_public_launch.
needle = '''    /// Marks the deliberate public token launch once. Presale buyer release clocks
    /// and the founder one-year lock both begin from this public launch timestamp.
    pub fn mark_public_launch(ctx: Context<MarkPublicLaunch>) -> Result<()> {'''
replacement = '''    /// Commits the intended public launch timestamp once. This allows Standard
    /// presale allocations to be delivered automatically at T-1 without starting
    /// the founder lock early. Buy + Stake remains locked until 21 days after the
    /// actual public launch is marked.
    pub fn schedule_public_launch(ctx: Context<SchedulePublicLaunch>, scheduled_at: i64) -> Result<()> {
        require!(ctx.accounts.sale.status == SaleStatus::Paused as u8, SaleError::InvalidState);
        require!(ctx.accounts.sale.public_launch_at == 0, SaleError::PublicLaunchAlreadyMarked);
        require!(ctx.accounts.prelaunch_metrics.scheduled_public_launch_at == 0, SaleError::PublicLaunchAlreadyScheduled);
        let now = Clock::get()?.unix_timestamp;
        let minimum = now.checked_add(MIN_LAUNCH_SCHEDULE_LEAD_SECONDS).ok_or(SaleError::MathOverflow)?;
        require!(scheduled_at >= minimum, SaleError::PublicLaunchScheduleTooSoon);
        ctx.accounts.prelaunch_metrics.scheduled_public_launch_at = scheduled_at;
        emit!(PublicLaunchScheduled {
            scheduled_at,
            standard_presale_release_at: scheduled_at
                .checked_add(STANDARD_PRESALE_RELEASE_OFFSET_SECONDS)
                .ok_or(SaleError::MathOverflow)?,
        });
        Ok(())
    }

    /// Marks the deliberate public token launch once. The founder one-year lock
    /// and Buy + Stake +21-day clock begin from the actual public launch timestamp.
    pub fn mark_public_launch(ctx: Context<MarkPublicLaunch>) -> Result<()> {'''
text = replace_once(text, needle, replacement, 'insert public launch scheduling instruction')
text = replace_once(
    text,
    "        let now = Clock::get()?.unix_timestamp;\n        let founder_unlock_at = now",
    "        let scheduled_at = ctx.accounts.prelaunch_metrics.scheduled_public_launch_at;\n        require!(scheduled_at > 0, SaleError::PublicLaunchNotScheduled);\n        let now = Clock::get()?.unix_timestamp;\n        require!(now >= scheduled_at, SaleError::PublicLaunchTooEarly);\n        let founder_unlock_at = now",
    'mark launch requires schedule',
)
text = replace_once(
    text,
    "            standard_presale_release_at: now\n                .checked_add(STANDARD_PRESALE_RELEASE_SECONDS)\n                .ok_or(SaleError::MathOverflow)?,",
    "            standard_presale_release_at: scheduled_at\n                .checked_add(STANDARD_PRESALE_RELEASE_OFFSET_SECONDS)\n                .ok_or(SaleError::MathOverflow)?,",
    'public launch event standard T-1',
)
# Delivery release logic uses scheduled launch for Standard and actual launch for Buy+Stake.
old_release = '''        let release_delay = if staked {
            STAKED_PRESALE_RELEASE_SECONDS
        } else {
            STANDARD_PRESALE_RELEASE_SECONDS
        };
        require_release_elapsed(&ctx.accounts.sale, release_delay)?;'''
new_release = '''        if staked {
            require_release_elapsed(&ctx.accounts.sale, STAKED_PRESALE_RELEASE_SECONDS)?;
        } else {
            require_standard_release_elapsed(&ctx.accounts.prelaunch_metrics)?;
        }'''
text = replace_once(text, old_release, new_release, 'website delivery release rules')
text = replace_once(
    text,
    "        require_release_elapsed(&ctx.accounts.sale, STANDARD_PRESALE_RELEASE_SECONDS)?;",
    "        require_standard_release_elapsed(&ctx.accounts.prelaunch_metrics)?;",
    'manual delivery T-1 rule',
)
# Add helper before existing require_release_elapsed.
helper_needle = '''fn require_release_elapsed(sale: &Sale, delay_seconds: i64) -> Result<i64> {'''
helper_replacement = '''fn require_standard_release_elapsed(metrics: &PrelaunchMetrics) -> Result<i64> {
    require!(metrics.scheduled_public_launch_at > 0, SaleError::PublicLaunchNotScheduled);
    let release_at = metrics
        .scheduled_public_launch_at
        .checked_add(STANDARD_PRESALE_RELEASE_OFFSET_SECONDS)
        .ok_or(SaleError::MathOverflow)?;
    let now = Clock::get()?.unix_timestamp;
    require!(now >= release_at, SaleError::PresaleReleaseStillLocked);
    Ok(now)
}

fn require_release_elapsed(sale: &Sale, delay_seconds: i64) -> Result<i64> {'''
text = replace_once(text, helper_needle, helper_replacement, 'standard T-1 release helper')
# Insert SchedulePublicLaunch Accounts before MarkPublicLaunch.
accounts_needle = '''#[derive(Accounts)]
pub struct MarkPublicLaunch<'info> {'''
accounts_replacement = '''#[derive(Accounts)]
pub struct SchedulePublicLaunch<'info> {
    pub admin: Signer<'info>,
    pub rlya_mint: Account<'info, Mint>,
    #[account(
        seeds = [SALE_SEED, rlya_mint.key().as_ref()],
        bump = sale.bump,
        has_one = admin,
        has_one = rlya_mint
    )]
    pub sale: Account<'info, Sale>,
    #[account(
        mut,
        seeds = [PRELAUNCH_METRICS_SEED, rlya_mint.key().as_ref()],
        bump = prelaunch_metrics.bump,
        has_one = rlya_mint
    )]
    pub prelaunch_metrics: Account<'info, PrelaunchMetrics>,
}

#[derive(Accounts)]
pub struct MarkPublicLaunch<'info> {'''
text = replace_once(text, accounts_needle, accounts_replacement, 'schedule launch accounts')
# MarkPublicLaunch needs metrics to compare scheduled vs actual.
text = replace_once(
    text,
    "    pub sale: Account<'info, Sale>,\n    #[account(\n        mut,\n        seeds = [FOUNDER_LOCK_SEED, rlya_mint.key().as_ref()],",
    "    pub sale: Account<'info, Sale>,\n    #[account(\n        seeds = [PRELAUNCH_METRICS_SEED, rlya_mint.key().as_ref()],\n        bump = prelaunch_metrics.bump,\n        has_one = rlya_mint\n    )]\n    pub prelaunch_metrics: Account<'info, PrelaunchMetrics>,\n    #[account(\n        mut,\n        seeds = [FOUNDER_LOCK_SEED, rlya_mint.key().as_ref()],",
    'mark public launch metrics account',
)
# Add scheduled field and account space.
text = replace_once(
    text,
    "    pub expected_referral_usdc: u64,\n    pub web_rlya_delivered: u64,",
    "    pub expected_referral_usdc: u64,\n    pub scheduled_public_launch_at: i64,\n    pub web_rlya_delivered: u64,",
    'prelaunch metrics scheduled field',
)
text = replace_once(
    text,
    "    pub const SPACE: usize = 8 + 32 + 32 + (8 * 10) + 1 + 16;",
    "    pub const SPACE: usize = 8 + 32 + 32 + (8 * 11) + 1 + 16;",
    'prelaunch metrics account space',
)
# Event for schedule.
event_needle = '''#[event]
pub struct PublicLaunchMarked {'''
event_replacement = '''#[event]
pub struct PublicLaunchScheduled {
    pub scheduled_at: i64,
    pub standard_presale_release_at: i64,
}
#[event]
pub struct PublicLaunchMarked {'''
text = replace_once(text, event_needle, event_replacement, 'schedule event')
# Errors.
text = replace_once(
    text,
    "    #[msg(\"public RLYA launch has already been marked\")]\n    PublicLaunchAlreadyMarked,",
    "    #[msg(\"public RLYA launch has already been marked\")]\n    PublicLaunchAlreadyMarked,\n    #[msg(\"public RLYA launch must be scheduled before T-1 distribution\")]\n    PublicLaunchNotScheduled,\n    #[msg(\"public RLYA launch has already been scheduled\")]\n    PublicLaunchAlreadyScheduled,\n    #[msg(\"public RLYA launch must be scheduled at least 24 hours ahead\")]\n    PublicLaunchScheduleTooSoon,\n    #[msg(\"public RLYA launch cannot be marked before the scheduled timestamp\")]\n    PublicLaunchTooEarly,",
    'public launch schedule errors',
)
write(path, text)

# ---------------------------------------------------------------------------
# 5. Future owner distribution console follows the same v4/T-1/T+21 policy.
# ---------------------------------------------------------------------------
path = 'web/owner/prelaunch-delivery.js'
text = read(path)
text = replace_once(
    text,
    "const STANDARD_RELEASE_SECONDS = 21 * 24 * 60 * 60;\nconst STAKED_RELEASE_SECONDS = 36 * 24 * 60 * 60;",
    "const STANDARD_RELEASE_OFFSET_SECONDS = -24 * 60 * 60;\nconst STAKED_RELEASE_SECONDS = 21 * 24 * 60 * 60;",
    'owner distribution release constants',
)
text = replace_once(
    text,
    "function providerForBrowser(){ return window.phantom?.solana || window.solflare || window.solana || null; }",
    "function providerForBrowser(){ return window.RALYA_WALLET_PROVIDER || window.phantom?.solana || window.solflare || window.trustwallet?.solana || window.solana || null; }",
    'owner distribution Trust provider',
)
text = replace_once(
    text,
    "function u64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigUint64(0,BigInt(n),true); return b; }",
    "function u64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigUint64(0,BigInt(n),true); return b; }\nfunction i64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigInt64(0,BigInt(n),true); return b; }",
    'owner distribution i64 encoder',
)
text = replace_once(
    text,
    "async function dataU64(name,n){ const d=new Uint8Array(16); d.set(await discriminator(name),0); d.set(u64le(n),8); return d; }",
    "async function dataU64(name,n){ const d=new Uint8Array(16); d.set(await discriminator(name),0); d.set(u64le(n),8); return d; }\nasync function dataI64(name,n){ const d=new Uint8Array(16); d.set(await discriminator(name),0); d.set(i64le(n),8); return d; }",
    'owner distribution instruction i64',
)
# Decode scheduled timestamp in metrics.
text = replace_once(
    text,
    "if(b.length<153)throw new Error('Pre-launch metrics account is too small for the staking-aware schema.');",
    "if(b.length<161)throw new Error('Pre-launch metrics account is too small for the T-1/T+21 schema.');",
    'metrics size check',
)
text = replace_once(
    text,
    "const expectedWeb=v.getBigUint64(o,true);o+=8; const expectedManual=v.getBigUint64(o,true);o+=8; const expectedBonus=v.getBigUint64(o,true);o+=8; const expectedGross=v.getBigUint64(o,true);o+=8; const expectedReferral=v.getBigUint64(o,true);o+=8;\n  const webDelivered=",
    "const expectedWeb=v.getBigUint64(o,true);o+=8; const expectedManual=v.getBigUint64(o,true);o+=8; const expectedBonus=v.getBigUint64(o,true);o+=8; const expectedGross=v.getBigUint64(o,true);o+=8; const expectedReferral=v.getBigUint64(o,true);o+=8; const scheduledPublicLaunchAt=v.getBigInt64(o,true);o+=8;\n  const webDelivered=",
    'decode scheduled launch timestamp',
)
text = replace_once(
    text,
    "return {mint,manifestHash,expectedWeb,expectedManual,expectedBonus,expectedGross,expectedReferral,webDelivered,manualDelivered,bonusDelivered,grossImported,referralImported};",
    "return {mint,manifestHash,expectedWeb,expectedManual,expectedBonus,expectedGross,expectedReferral,scheduledPublicLaunchAt,webDelivered,manualDelivered,bonusDelivered,grossImported,referralImported};",
    'return scheduled launch timestamp',
)
# New scheduler and corrected mark launch.
mark_pattern = r"async function markPublicLaunch\(\)\{.*?\n\}\nasync function ensureMetrics"
mark_replacement = '''async function schedulePublicLaunch(){
  if(!manifest)throw new Error('Load the frozen final manifest first.');
  if(!owner)await connectOwner(); const a=addresses(); await ensureMetrics(a); const sale=await readSale(a); const metrics=await readMetrics(a);
  if(!sale.admin.equals(owner))throw new Error('Connected wallet is not the on-chain sale admin.');
  if(sale.status!==2)throw new Error('Sale must be PAUSED before scheduling public launch.');
  if(metrics?.scheduledPublicLaunchAt>0n){ log(`Public launch already scheduled: ${new Date(Number(metrics.scheduledPublicLaunchAt)*1000).toISOString()}.`); return; }
  const input=$('preScheduledLaunchAt'); const when=Date.parse(input?.value||'');
  if(!Number.isFinite(when))throw new Error('Choose the intended public launch date and time first.');
  const scheduled=Math.floor(when/1000); if(scheduled<Math.floor(Date.now()/1000)+24*60*60)throw new Error('Schedule public launch at least 24 hours ahead so Standard T-1 delivery is possible.');
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataI64('schedule_public_launch',scheduled),keys:[
    {pubkey:owner,isSigner:true,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:a.metrics,isSigner:false,isWritable:true}
  ]}));
  await send(tx,'Schedule public RLYA launch');
  const updated=await readMetrics(a); if(!updated||updated.scheduledPublicLaunchAt<=0n)throw new Error('Scheduled launch timestamp was not recorded.');
  log(`Public launch scheduled on-chain for ${new Date(Number(updated.scheduledPublicLaunchAt)*1000).toISOString()}. Standard buyers become eligible automatically at T-1.`);
}
async function markPublicLaunch(){
  if(!owner)await connectOwner(); const a=addresses(); const sale=await readSale(a); const metrics=await readMetrics(a);
  if(!sale.admin.equals(owner))throw new Error('Connected wallet is not the on-chain sale admin.');
  if(sale.publicLaunchAt>0n){ log(`Public launch was already marked at ${new Date(Number(sale.publicLaunchAt)*1000).toISOString()}.`); return; }
  if(!metrics||metrics.scheduledPublicLaunchAt<=0n)throw new Error('Schedule public launch before marking DAY 0.');
  if(BigInt(Math.floor(Date.now()/1000))<metrics.scheduledPublicLaunchAt)throw new Error('The scheduled public launch time has not arrived yet.');
  if(sale.status!==1&&sale.status!==2)throw new Error('Sale must be ACTIVE or PAUSED before marking public launch.');
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataNoArgs('mark_public_launch'),keys:[
    {pubkey:owner,isSigner:true,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.metrics,isSigner:false,isWritable:false},{pubkey:a.founderLock,isSigner:false,isWritable:true}
  ]}));
  await send(tx,'Mark public RLYA launch');
  const updated=await readSale(a); if(updated.publicLaunchAt<=0n)throw new Error('Public launch timestamp was not recorded.');
  log(`DAY 0 locked on-chain: ${new Date(Number(updated.publicLaunchAt)*1000).toISOString()}. Buy + Stake unlocks 21 days later. Founder one-year lock starts from this actual launch timestamp.`);
}
async function ensureMetrics'''
text = sub_once(text, mark_pattern, mark_replacement, 'replace distribution launch functions', flags=re.S)
# Manifest version/policy verification.
text = text.replace("parsed.version!==2", "parsed.version!==4")
text = text.replace("manifest v2", "manifest v4")
text = text.replace("Manifest v2", "Manifest v4")
text = replace_once(
    text,
    "const expectedPolicy=row.stake===true?'staked-36d':'standard-21d'; if(web>0n&&row.webDeliveryPolicy!==expectedPolicy)throw new Error(`Release policy mismatch for ${row.wallet}.`);",
    "const expectedPolicy=row.stake===true?'staked-plus21d':'standard-tminus1'; if(web>0n&&row.webDeliveryPolicy!==expectedPolicy)throw new Error(`Release policy mismatch for ${row.wallet}.`); if(row.claimRequired===true||row.automaticDelivery===false)throw new Error(`Automatic delivery policy mismatch for ${row.wallet}.`);",
    'manifest row final policy',
)
# Release readiness helpers.
old_ready = '''function rowReleaseReady(row,sale,nowSec){
  if(sale.publicLaunchAt<=0n)return false;
  const delay=row.stake===true?STAKED_RELEASE_SECONDS:STANDARD_RELEASE_SECONDS;
  return BigInt(nowSec)>=sale.publicLaunchAt+BigInt(delay);
}'''
new_ready = '''function standardReleaseReady(metrics,nowSec){ return Boolean(metrics&&metrics.scheduledPublicLaunchAt>0n&&BigInt(nowSec)>=metrics.scheduledPublicLaunchAt+BigInt(STANDARD_RELEASE_OFFSET_SECONDS)); }
function rowReleaseReady(row,sale,metrics,nowSec){
  if(row.stake===true) return sale.publicLaunchAt>0n&&BigInt(nowSec)>=sale.publicLaunchAt+BigInt(STAKED_RELEASE_SECONDS);
  return standardReleaseReady(metrics,nowSec);
}'''
text = replace_once(text, old_ready, new_ready, 'release readiness helper')
# Pass metrics through transaction builder.
text = text.replace("async function buildWalletTx(a,row,sale,nowSec){", "async function buildWalletTx(a,row,sale,metrics,nowSec){")
text = text.replace("rowReleaseReady(row,sale,nowSec)", "rowReleaseReady(row,sale,metrics,nowSec)")
text = text.replace("sale.publicLaunchAt>0n && BigInt(nowSec)>=sale.publicLaunchAt+BigInt(STANDARD_RELEASE_SECONDS)", "standardReleaseReady(metrics,nowSec)")
# pending state reads metrics once and uses T-1.
text = text.replace("async function pendingManifestState(a,sale){", "async function pendingManifestState(a,sale,metrics){")
text = text.replace("sale.publicLaunchAt>0n&&BigInt(nowSec)>=sale.publicLaunchAt+BigInt(STANDARD_RELEASE_SECONDS)", "standardReleaseReady(metrics,nowSec)")
# Preflight block: require scheduled, not DAY0, and pass metrics.
text = replace_once(
    text,
    "  if(sale.publicLaunchAt<=0n)throw new Error('Public launch DAY 0 has not been marked on-chain yet. Do not distribute presale RLYA.');\n  await ensureMetrics(a);\n  const pending=await pendingManifestState(a,sale);",
    "  const metrics=await ensureMetrics(a);\n  if(metrics.scheduledPublicLaunchAt<=0n)throw new Error('Public launch is not scheduled on-chain yet. Schedule it before T-1 distribution.');\n  const pending=await pendingManifestState(a,sale,metrics);",
    'distribution preflight scheduled launch',
)
text = replace_once(
    text,
    "  log(`Distribution preflight PASS · launch ${new Date(Number(sale.publicLaunchAt)*1000).toISOString()} · pending base",
    "  log(`Distribution preflight PASS · scheduled launch ${new Date(Number(metrics.scheduledPublicLaunchAt)*1000).toISOString()} · actual DAY 0 ${sale.publicLaunchAt>0n?new Date(Number(sale.publicLaunchAt)*1000).toISOString():'not marked yet'} · pending base",
    'distribution preflight log',
)
text = replace_once(text, "  return {a,sale,pending};", "  return {a,sale,metrics,pending};", 'preflight returns metrics')
text = replace_once(text, "const {a,sale,pending}=await preflight();", "const {a,sale,metrics,pending}=await preflight();", 'distribution gets metrics')
text = text.replace("Standard rows unlock on day 21; Buy + Stake rows unlock on day 36.", "Standard rows unlock automatically at T-1; Buy + Stake rows unlock 21 days after public launch.")
text = text.replace("const tx=await buildWalletTx(a,row,sale,nowSec);", "const tx=await buildWalletTx(a,row,sale,metrics,nowSec);")
text = text.replace("const after=await pendingManifestState(a,await readSale(a));", "const after=await pendingManifestState(a,await readSale(a),await readMetrics(a));")
# Replace owner UI content and wiring.
text = text.replace("then safely delivers standard presale allocations from day 21 and Buy + Stake allocations with their fixed 5% bonus from day 36", "then safely delivers Standard presale allocations at T-1 and Buy + Stake allocations with their fixed 5% bonus at T+21")
text = text.replace("<div class=\"danger\"><strong>Mark public launch only on the real public token-launch day.</strong> That one transaction starts the buyer release clocks and the founder 365-day lock. It cannot be reset.</div>", "<div class=\"danger\"><strong>Schedule the launch only after the date/time is final.</strong> Standard wallets become eligible at T-1. Mark DAY 0 at the actual public launch; that starts Buy + Stake T+21 and the founder 365-day lock.</div>")
text = text.replace("<div class=\"owner-actions\"><button class=\"btn btn-secondary\" id=\"preDeliveryConnect\">Connect owner</button><button class=\"btn btn-secondary\" id=\"preMarkPublicLaunch\">Mark public launch DAY 0</button></div>", "<div class=\"owner-actions\"><button class=\"btn btn-secondary\" id=\"preDeliveryConnect\">Connect owner</button></div><label>Final public launch date/time</label><input id=\"preScheduledLaunchAt\" type=\"datetime-local\"/><div class=\"owner-actions\"><button class=\"btn btn-secondary\" id=\"preSchedulePublicLaunch\">Schedule launch on-chain</button><button class=\"btn btn-secondary\" id=\"preMarkPublicLaunch\">Mark public launch DAY 0</button></div>")
text = text.replace("<label>Final delivery manifest v2</label>", "<label>Frozen final delivery manifest v4</label>")
text = replace_once(
    text,
    "  $('preDeliveryConnect').onclick=()=>connectOwner().catch(err=>log(`ERROR: ${err.message}`));\n  $('preMarkPublicLaunch').onclick=()=>{ if(!confirm('MARK PUBLIC RLYA LAUNCH DAY 0 ON-CHAIN NOW? This permanently starts the 21-day, 36-day and founder 365-day clocks.'))return; markPublicLaunch().catch(err=>log(`ERROR: ${err.message}`)); };",
    "  $('preDeliveryConnect').onclick=()=>connectOwner().catch(err=>log(`ERROR: ${err.message}`));\n  $('preSchedulePublicLaunch').onclick=()=>{ if(!confirm('LOCK THIS PUBLIC LAUNCH DATE/TIME ON-CHAIN? Standard T-1 delivery will be calculated from it.'))return; schedulePublicLaunch().catch(err=>log(`ERROR: ${err.message}`)); };\n  $('preMarkPublicLaunch').onclick=()=>{ if(!confirm('MARK PUBLIC RLYA LAUNCH DAY 0 ON-CHAIN NOW? This starts Buy + Stake T+21 and the founder 365-day lock.'))return; markPublicLaunch().catch(err=>log(`ERROR: ${err.message}`)); };",
    'wire schedule/mark launch buttons',
)
write(path, text)

# ---------------------------------------------------------------------------
# 6. Site loader + cache bust + release audit.
# ---------------------------------------------------------------------------
path = 'web/site-config.js'
text = read(path)
text = replace_once(text, "build: '1.0.3-wallet-browser-buy-copy'", "build: '1.0.4-presale-celebration-wallet-delivery'", 'build marker')
text = replace_once(
    text,
    "      loadStyle('/presale-next.css', 'data-rlya-presale-next-style');\n      loadScript('/presale-next.js', 'data-rlya-presale-next');\n      loadScript('/wallet-mobile-fix.js?v=1.0.3', 'data-rlya-wallet-mobile-fix');",
    "      loadStyle('/presale-next.css?v=1.0.4', 'data-rlya-presale-next-style');\n      loadStyle('/purchase-celebration.css?v=1.0.4', 'data-rlya-purchase-celebration-style');\n      loadScript('/presale-next.js?v=1.0.4', 'data-rlya-presale-next');\n      loadScript('/wallet-mobile-fix.js?v=1.0.4', 'data-rlya-wallet-mobile-fix');\n      loadScript('/purchase-celebration.js?v=1.0.4', 'data-rlya-purchase-celebration');",
    'cache-bust and celebration assets',
)
write(path, text)

path = 'scripts/audit_checkout_release.py'
text = read(path)
text = replace_once(text, "check(\"version: 3\" in owner, 'final delivery manifest version was not advanced')", "check(\"version: 4\" in owner, 'final delivery manifest must be v4')", 'audit manifest version')
text = replace_once(
    text,
    "hotfix = read('web/site-ui-hotfix.js')",
    "hotfix = read('web/site-ui-hotfix.js')\nprogram = read('programs/rlya_sale/src/lib.rs')\ndelivery = read('web/owner/prelaunch-delivery.js')\ncelebration = read('web/purchase-celebration.js')",
    'audit extra source files',
)
insert_after = "check('requestAnimationFrame' in hotfix and 'setText' in hotfix and 'setHtml' in hotfix, 'mobile mutation-loop guard is missing')"
extra = """check('STANDARD_PRESALE_RELEASE_OFFSET_SECONDS: i64 = -24 * 60 * 60' in program, 'program standard release is not T-1')
check('STAKED_PRESALE_RELEASE_SECONDS: i64 = 21 * 24 * 60 * 60' in program, 'program staked release is not T+21')
check('schedule_public_launch' in program and 'scheduled_public_launch_at' in program, 'program lacks one-time launch schedule required for T-1')
check('standard-tminus1' in delivery and 'staked-plus21d' in delivery, 'owner distribution manifest policy is stale')
check('Standard T-1 delivery' in delivery or 'Standard wallets become eligible at T-1' in delivery, 'owner distribution UI is missing T-1 copy')
check('ralya:purchase-confirmed' in celebration and 'claim' in celebration, 'verified-purchase celebration/reassurance is missing')
check('final-manifest/v4' in owner, 'final manifest is not frozen in persistent storage')
check('ledgerRecordSha256' in confirm and 'wallet-purchase/' in confirm, 'confirmed purchase ledger lacks hash/index hardening')"""
text = replace_once(text, insert_after, insert_after + "\n" + extra, 'audit v4 additions')
write(path, text)

print('RALYA_PRESALE_V4_PATCH=APPLIED')
