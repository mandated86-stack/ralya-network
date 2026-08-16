(() => {
  const cfg = window.RALYA_CONFIG || {};
  const OWNER = cfg.ownerWallet || '';
  const enc = new TextEncoder();
  let current = null;
  let localTimer = null;

  function provider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    if (window.trustwallet?.solana?.connect && window.trustwallet?.solana?.signMessage) return window.trustwallet.solana;
    if (window.solana?.connect && window.solana?.signMessage) return window.solana;
    return null;
  }
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  function nonce() { const b = crypto.getRandomValues(new Uint8Array(20)); return [...b].map(v => v.toString(16).padStart(2, '0')).join(''); }
  function toBase64(bytes) { const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let s = ''; for (const b of a) s += String.fromCharCode(b); return btoa(s); }
  async function json(url, options = {}) { const r = await fetch(url, { cache: 'no-store', ...options }); const p = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p?.error || `Request failed (${r.status})`); return p; }
  function log(message) { const el = document.getElementById('launchCountdownLog'); if (el) el.textContent = `${new Date().toLocaleTimeString()}  ${message}\n${el.textContent}`.slice(0, 5000); }

  async function signedBody(operation, payload) {
    const p = provider();
    if (!p) throw new Error('Use the configured owner wallet in Phantom, Solflare or Trust Wallet with message signing support.');
    const result = await p.connect();
    const wallet = String(result?.publicKey || p.publicKey || '');
    if (wallet !== OWNER) throw new Error('Connected wallet is not the configured RALYA owner wallet.');
    const timestamp = new Date().toISOString(), requestNonce = nonce();
    const message = [
      'RALYA launch countdown update',
      `Wallet: ${wallet}`,
      `Operation: ${operation}`,
      `Payload: ${stableStringify(payload || {})}`,
      `Timestamp: ${timestamp}`,
      `Nonce: ${requestNonce}`,
    ].join('\n');
    const signed = await p.signMessage(enc.encode(message), 'utf8');
    return { wallet, operation, payload, timestamp, nonce: requestNonce, message, signature: toBase64(signed?.signature || signed) };
  }

  function formatLocalInput(iso) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  function remainingText() {
    if (!current?.targetAt) return 'Countdown target unavailable.';
    let left = Math.max(0, Date.parse(current.targetAt) - Date.now());
    const d = Math.floor(left / 86400000); left %= 86400000;
    const h = Math.floor(left / 3600000); left %= 3600000;
    const m = Math.floor(left / 60000); left %= 60000;
    const s = Math.floor(left / 1000);
    return `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  }
  function paint() {
    const target = document.getElementById('launchCountdownTarget');
    const remaining = document.getElementById('launchCountdownRemaining');
    const input = document.getElementById('launchCountdownCustom');
    if (target) target.textContent = current?.targetAt ? new Date(current.targetAt).toLocaleString() : 'Loading…';
    if (remaining) remaining.textContent = remainingText();
    if (input && current?.targetAt && document.activeElement !== input) input.value = formatLocalInput(current.targetAt);
  }

  function makeCard() {
    if (!location.pathname.includes('/owner/') || document.getElementById('launchCountdownControl')) return;
    const shell = document.querySelector('.owner-shell');
    const before = document.getElementById('mainnetDeferredTools');
    if (!shell) return;
    const card = document.createElement('section');
    card.className = 'owner-card';
    card.id = 'launchCountdownControl';
    card.innerHTML = `
      <h2>DEX &amp; exchange launch countdown</h2>
      <p>Controls the public countdown shown above the homepage hero. Changing the date does not change pricing, purchases, token supply, wallet code, distribution rules or Mainnet state.</p>
      <div class="safe"><strong>Current public target:</strong> <span id="launchCountdownTarget">Loading…</span><br/><strong>Time remaining:</strong> <span id="launchCountdownRemaining">--</span></div>
      <div class="owner-actions"><button class="btn btn-secondary" data-countdown-extend="1">+1 day</button><button class="btn btn-secondary" data-countdown-extend="7">+7 days</button><button class="btn btn-secondary" data-countdown-extend="30">+30 days</button><button class="btn btn-secondary" id="launchCountdownReset60">Set 60 days from now</button></div>
      <label>Custom launch date/time</label>
      <input id="launchCountdownCustom" type="datetime-local" />
      <div class="owner-actions"><button class="btn btn-primary" id="launchCountdownSet">Sign + set custom target</button><button class="btn btn-secondary" id="launchCountdownReload">Reload</button></div>
      <pre class="launch-log" id="launchCountdownLog" style="min-height:90px">Countdown control ready. Updates require an owner-wallet signature.</pre>`;
    if (before) shell.insertBefore(card, before); else shell.appendChild(card);
    card.querySelectorAll('[data-countdown-extend]').forEach(button => {
      button.addEventListener('click', () => extend(Number(button.dataset.countdownExtend)).catch(e => log(`ERROR: ${e.message}`)));
    });
    document.getElementById('launchCountdownReset60').onclick = () => update('reset60', {}).catch(e => log(`ERROR: ${e.message}`));
    document.getElementById('launchCountdownSet').onclick = () => setCustom().catch(e => log(`ERROR: ${e.message}`));
    document.getElementById('launchCountdownReload').onclick = () => load().catch(e => log(`ERROR: ${e.message}`));
  }

  async function load() {
    current = await json('/api/launch-countdown');
    paint();
    log(`Loaded public target ${new Date(current.targetAt).toLocaleString()}.`);
  }
  async function update(operation, payload) {
    const body = await signedBody(operation, payload);
    current = await json('/api/launch-countdown', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    paint();
    log(`Countdown updated to ${new Date(current.targetAt).toLocaleString()}. Public pages pick it up automatically.`);
  }
  async function extend(days) {
    if (!confirm(`Extend the current public launch countdown by ${days} day${days === 1 ? '' : 's'}?`)) return;
    await update('extend', { days });
  }
  async function setCustom() {
    const raw = document.getElementById('launchCountdownCustom')?.value || '';
    const date = new Date(raw);
    if (!raw || !Number.isFinite(date.getTime())) throw new Error('Choose a valid custom launch date and time.');
    if (!confirm(`Set the public launch countdown target to ${date.toLocaleString()}?`)) return;
    await update('set', { targetAt: date.toISOString() });
  }

  function init() {
    makeCard();
    load().catch(e => log(`Could not load countdown: ${e.message}`));
    localTimer = setInterval(paint, 1000);
  }
  window.addEventListener('pagehide', () => { if (localTimer) clearInterval(localTimer); }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
