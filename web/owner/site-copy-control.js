(() => {
  const cfg = window.RALYA_CONFIG || {};
  const OWNER = cfg.ownerWallet || '';
  const FIELDS = [
    ['hero.lead', 'Hero introduction'],
    ['purpose.heading', 'Purpose heading'],
    ['purpose.body', 'Purpose introduction'],
    ['rlya.heading', 'RLYA heading'],
    ['rlya.body', 'RLYA introduction'],
    ['presale.heading', 'Presale heading'],
    ['presale.body', 'Presale introduction'],
    ['build.heading', 'Build-status heading'],
    ['build.body', 'Build-status introduction'],
    ['opensource.heading', 'Open-source heading'],
    ['opensource.body', 'Open-source introduction'],
    ['engineering.heading', 'Engineering-log heading'],
  ];
  const enc = new TextEncoder();
  let defaults = {}, overrides = {};

  function provider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
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
  function log(message) { const el = document.getElementById('siteCopyLog'); if (el) el.textContent = `${new Date().toLocaleTimeString()}  ${message}\n${el.textContent}`.slice(0, 6000); }

  async function signedBody(operation, payload) {
    const p = provider();
    if (!p) throw new Error('Use Phantom or Solflare with message signing support.');
    const result = await p.connect();
    const wallet = String(result?.publicKey || p.publicKey || '');
    if (wallet !== OWNER) throw new Error('Connected wallet is not the configured RALYA owner wallet.');
    const timestamp = new Date().toISOString(), requestNonce = nonce();
    const message = [
      'RALYA live site-copy update',
      `Wallet: ${wallet}`,
      `Operation: ${operation}`,
      `Payload: ${stableStringify(payload || {})}`,
      `Timestamp: ${timestamp}`,
      `Nonce: ${requestNonce}`,
    ].join('\n');
    const signed = await p.signMessage(enc.encode(message), 'utf8');
    return { wallet, operation, payload, timestamp, nonce: requestNonce, message, signature: toBase64(signed?.signature || signed) };
  }

  function makeCard() {
    if (!location.pathname.includes('/owner/') || document.getElementById('siteCopyControl')) return;
    const shell = document.querySelector('.owner-shell');
    const before = document.getElementById('mainnetDeferredTools');
    if (!shell) return;
    const card = document.createElement('section');
    card.className = 'owner-card';
    card.id = 'siteCopyControl';
    card.innerHTML = `
      <h2>Live website copy editor</h2>
      <p>Change approved public wording without a GitHub commit, blockchain build or Netlify redeploy. Live overrides are plain text only and cannot change pricing, token supply, referrals, wallets, payment logic, allocation access or Mainnet configuration.</p>
      <div class="safe"><strong>Instant path.</strong> Tick only the fields you want to override. Unticked fields continue using the version-controlled website defaults. New visitors see the update immediately; already-open pages refresh live copy automatically within about 30 seconds.</div>
      <div id="siteCopyFields"></div>
      <div class="owner-actions"><button class="btn btn-primary" id="siteCopySave">Sign + publish live text</button><button class="btn btn-secondary" id="siteCopyReload">Reload</button><button class="btn btn-secondary" id="siteCopyReset">Reset all live overrides</button></div>
      <pre class="launch-log" id="siteCopyLog" style="min-height:90px">Live-copy editor ready. No financial settings are editable here.</pre>`;
    if (before) shell.insertBefore(card, before); else shell.appendChild(card);
    document.getElementById('siteCopySave').onclick = () => save().catch(e => log(`ERROR: ${e.message}`));
    document.getElementById('siteCopyReload').onclick = () => load().catch(e => log(`ERROR: ${e.message}`));
    document.getElementById('siteCopyReset').onclick = () => reset().catch(e => log(`ERROR: ${e.message}`));
  }

  function render() {
    const host = document.getElementById('siteCopyFields'); if (!host) return;
    host.textContent = '';
    for (const [key, label] of FIELDS) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin:16px 0;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#081a25';
      const active = Object.prototype.hasOwnProperty.call(overrides, key);
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = active; check.dataset.copyToggle = key; check.style.width = 'auto'; check.style.marginRight = '8px';
      const title = document.createElement('label'); title.style.margin = '0 0 8px'; title.append(check, document.createTextNode(`${label} · ${key}`));
      const area = document.createElement('textarea'); area.dataset.copyField = key; area.rows = key.endsWith('heading') ? 2 : 4; area.value = active ? overrides[key] : (defaults[key] || ''); area.style.cssText = 'width:100%;padding:12px;border:1px solid #345064;background:#071822;color:#eaf4f8;border-radius:10px;resize:vertical;font:inherit';
      area.addEventListener('input', () => { check.checked = true; });
      const hint = document.createElement('small'); hint.textContent = active ? 'LIVE OVERRIDE ACTIVE' : 'Using version-controlled default'; hint.style.display = 'block'; hint.style.marginTop = '6px';
      check.addEventListener('change', () => { hint.textContent = check.checked ? 'Will publish as live override' : 'Will use version-controlled default'; if (!check.checked) area.value = defaults[key] || ''; });
      wrap.append(title, area, hint); host.appendChild(wrap);
    }
  }

  async function load() {
    const [d, live] = await Promise.all([json('/site-copy.json'), json('/api/site-content')]);
    defaults = d || {}; overrides = live?.overrides || {}; render();
    log(`Loaded ${Object.keys(overrides).length} live override(s).`);
  }
  async function save() {
    const next = {};
    for (const [key] of FIELDS) {
      const enabled = document.querySelector(`[data-copy-toggle="${key}"]`)?.checked;
      const value = document.querySelector(`[data-copy-field="${key}"]`)?.value?.trim() || '';
      if (enabled) { if (!value) throw new Error(`${key} cannot be empty while override is enabled.`); next[key] = value; }
    }
    const payload = { overrides: next }, body = await signedBody('save', payload);
    const result = await json('/api/site-content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    overrides = result.overrides || {}; render(); log(`Published ${Object.keys(overrides).length} live override(s). New visitors see it immediately; open pages refresh within about 30 seconds.`);
  }
  async function reset() {
    if (!confirm('Reset every live website-text override back to the version-controlled defaults?')) return;
    const body = await signedBody('reset', {});
    await json('/api/site-content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    overrides = {}; render(); log('All live overrides cleared. Public pages now use version-controlled defaults.');
  }

  function init() { makeCard(); load().catch(e => log(`Could not load live copy: ${e.message}`)); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
