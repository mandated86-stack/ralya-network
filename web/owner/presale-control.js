const cfg = window.RALYA_CONFIG;
const OWNER = cfg.ownerWallet;

function providerForOwner() {
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
function nonceHex() { const bytes = crypto.getRandomValues(new Uint8Array(20)); return [...bytes].map(v => v.toString(16).padStart(2, '0')).join(''); }
function toBase64(bytes) { let binary = ''; const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (const b of arr) binary += String.fromCharCode(b); return btoa(binary); }
function ownerMessage(wallet, operation, payload, timestamp, nonce) {
  return ['RALYA owner presale action', `Wallet: ${wallet}`, `Operation: ${operation}`, `Payload: ${stableStringify(payload || {})}`, `Timestamp: ${timestamp}`, `Nonce: ${nonce}`].join('\n');
}
async function fetchJson(url, options) { const response = await fetch(url, { cache: 'no-store', ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`); return data; }
async function connectAndSign(operation, payload = {}) {
  const provider = providerForOwner();
  if (!provider) throw new Error('Use Phantom or Solflare with message signing support.');
  const result = await provider.connect();
  const wallet = String(result?.publicKey || provider.publicKey || '');
  if (wallet !== OWNER) throw new Error('Connected wallet is not the configured RALYA owner wallet.');
  if (!provider.signMessage) throw new Error('Connected wallet does not support message signing.');
  const timestamp = new Date().toISOString(), nonce = nonceHex(), message = ownerMessage(wallet, operation, payload, timestamp, nonce);
  const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
  return { wallet, operation, payload, timestamp, nonce, message, signature: toBase64(signed?.signature || signed) };
}
async function ownerAction(operation, payload = {}) {
  const signed = await connectAndSign(operation, payload);
  return fetchJson('/api/presale/owner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signed) });
}
function fmtRlya(base, max = 2) { const n = BigInt(base || 0), unit = 1_000_000_000n, whole = n / unit; let frac = (n % unit).toString().padStart(9, '0').slice(0, max).replace(/0+$/, ''); return `${Number(whole).toLocaleString()}${frac ? `.${frac}` : ''}`; }
function fmtUsdc(base) { return (Number(BigInt(base || 0)) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function fmtPrice(micro) { return `$${(Number(BigInt(micro || 0)) / 1e6).toFixed(6)}`; }
function shorten(s) { s = String(s || ''); return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-6)}` : s; }
function log(msg) { const el = document.getElementById('prelaunchOwnerLog'); if (el) el.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n${el.textContent}`.slice(0, 8000); }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

async function refreshSummary() {
  try {
    const state = await fetchJson('/api/presale/state');
    setText('preAccess', String(state.access || '--').toUpperCase());
    setText('prePrice', fmtPrice(state.currentPriceMicroUsdc));
    setText('preTotal', `${fmtRlya(state.totalAllocatedBase)} RLYA`);
    setText('preWeb', `${fmtRlya(state.webAllocatedBase)} RLYA`);
    setText('preManual', `${fmtRlya(state.manualAllocatedBase)} RLYA`);
    setText('preUsdc', `${fmtUsdc(state.totalUsdcRaisedBase)} USDC`);
    setText('preReferral', `${fmtUsdc(state.totalReferralUsdcPaidBase)} USDC`);
  } catch (err) { log(`ERROR loading summary: ${err.message}`); }
}
async function runOpeningPreflight() {
  setText('preReadiness', 'CHECKING');
  const result = await ownerAction('preflight', {});
  setText('preReadiness', 'READY');
  log(`Opening preflight PASS · RPC ${result.readiness.rpc} · treasury USDC account ${result.readiness.treasuryUsdcAccount}`);
  return result;
}
async function setAccess(access) {
  if (!confirm(`Set pre-launch allocation access to ${access.toUpperCase()}? This does not launch the RLYA token.`)) return;
  setText('preReadiness', access === 'open' ? 'CHECKING' : '—');
  const result = await ownerAction('set_access', { access });
  if (access === 'open' && result.readiness?.treasuryUsdcAccountReady) setText('preReadiness', 'READY');
  log(`Pre-launch allocation access -> ${result.state.access.toUpperCase()}`);
  await refreshSummary();
}
async function manualAllocate() {
  const wallet = document.getElementById('preManualWallet').value.trim();
  const rlyaAmount = document.getElementById('preManualAmount').value.trim();
  const paymentReference = document.getElementById('preManualReference').value.trim();
  const note = document.getElementById('preManualNote').value.trim();
  if (!wallet || !rlyaAmount) throw new Error('Investor wallet and RLYA amount are required.');
  if (!confirm(`Confirm a private/off-site allocation of ${rlyaAmount} RLYA to ${shorten(wallet)}? This permanently advances the shared presale curve.`)) return;
  const result = await ownerAction('manual_allocate', { wallet, rlyaAmount, paymentReference, note });
  log(`Private allocation confirmed: ${fmtRlya(result.allocation.rlyaBase, 4)} RLYA -> ${result.allocation.wallet}`);
  document.getElementById('preManualAmount').value = '';
  document.getElementById('preManualReference').value = '';
  document.getElementById('preManualNote').value = '';
  await refreshSummary();
}
async function lookupBuyer() {
  const wallet = document.getElementById('preLookupWallet').value.trim();
  if (!wallet) throw new Error('Enter a buyer wallet.');
  const result = await ownerAction('lookup', { wallet });
  const out = document.getElementById('preLookupResult');
  if (!result.allocations.length) { out.textContent = 'No confirmed allocation for this wallet.'; return; }
  out.textContent = `TOTAL ${fmtRlya(result.totalRlyaBase, 4)} RLYA\n` + result.allocations.map(row => {
    const source = row.kind === 'web' ? `${fmtUsdc(row.grossUsdcBase)} USDC · ${shorten(row.signature || '')}` : `PRIVATE/OFF-SITE${row.paymentReference ? ` · ${row.paymentReference}` : ''}`;
    return `${row.createdAt}  ${fmtRlya(row.rlyaBase, 4)} RLYA  ${source}`;
  }).join('\n');
}
async function downloadManifest() {
  const result = await ownerAction('manifest', {}), manifest = result.manifest;
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `RALYA_PRELAUNCH_DELIVERY_MANIFEST_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); log(`Delivery manifest exported. SHA-256 ${manifest.sha256}`);
}

function install() {
  if (!location.pathname.includes('/owner/')) return;
  if (cfg.presaleMode === 'prelaunch-allocation') {
    const smokeButton = document.getElementById('runSmoke'), smokeCard = smokeButton?.closest('.owner-card');
    if (smokeCard) { smokeCard.hidden = true; smokeCard.dataset.rlyaDeferred = 'prelaunch-allocation'; }
  }
  const shell = document.querySelector('.owner-shell');
  if (!shell || document.getElementById('prelaunchPresaleControl')) return;
  const anchor = shell.querySelector('.owner-top')?.nextElementSibling, section = document.createElement('section');
  section.className = 'owner-card'; section.id = 'prelaunchPresaleControl';
  section.innerHTML = `
    <h2>Pre-launch presale control</h2>
    <p>This ledger is separate from public token launch. It records verified USDC allocations and authorized private/off-site allocations now; RLYA distribution remains scheduled for before public launch.</p>
    <div class="owner-grid" style="margin:14px 0">
      <div><span>Access</span><strong id="preAccess">--</strong></div><div><span>Opening readiness</span><strong id="preReadiness">NOT CHECKED</strong></div>
      <div><span>Current price</span><strong id="prePrice">--</strong></div><div><span>Total allocated</span><strong id="preTotal">--</strong></div>
      <div><span>USDC verified</span><strong id="preUsdc">--</strong></div><div><span>Website allocation</span><strong id="preWeb">--</strong></div>
      <div><span>Private/off-site</span><strong id="preManual">--</strong></div><div><span>Referral USDC</span><strong id="preReferral">--</strong></div>
    </div>
    <div class="owner-actions">
      <button class="btn btn-secondary" id="prePreflight">Run opening preflight</button>
      <button class="btn btn-primary" id="preOpen">Open allocation access</button>
      <button class="btn btn-secondary" id="prePause">Pause new allocations</button>
      <button class="btn btn-secondary" id="preClose">Close allocation access</button>
      <button class="btn btn-secondary" id="preRefresh">Refresh</button>
    </div>
    <p class="owner-note">OPEN is refused unless the server can reach Solana Mainnet and verify the configured treasury's USDC receiving account. Mainnet RLYA deployment is not required for this pre-launch allocation phase.</p>
    <hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:22px 0"/>
    <h3>Private / off-site investor allocation</h3>
    <p class="owner-note">The RLYA amount is added to the same 100.68M pool and immediately advances the same fixed price curve. If a buyer has a live locked quote, wait for it to confirm or clear before recording the private allocation.</p>
    <label>Investor Solana wallet</label><input id="preManualWallet" placeholder="Investor public wallet"/>
    <label>RLYA allocated</label><input id="preManualAmount" type="number" min="0.000000001" step="1" placeholder="Example: 2000000"/>
    <label>Payment / deal reference <small>(private owner note, optional)</small></label><input id="preManualReference" maxlength="120" placeholder="Example: INV-0042"/>
    <label>Owner note <small>(private, optional)</small></label><input id="preManualNote" maxlength="220" placeholder="Short reconciliation note"/>
    <button class="btn btn-primary" id="preManualAllocate">Confirm allocation + advance curve</button>
    <hr style="border:0;border-top:1px solid rgba(255,255,255,.08);margin:22px 0"/>
    <h3>Buyer allocation lookup</h3>
    <label>Buyer wallet</label><input id="preLookupWallet" placeholder="Solana wallet"/>
    <div class="owner-actions"><button class="btn btn-secondary" id="preLookup">Lookup</button><button class="btn btn-secondary" id="preManifest">Download final delivery manifest</button></div>
    <pre class="launch-log" id="preLookupResult" style="min-height:90px">No lookup yet.</pre>
    <pre class="launch-log" id="prelaunchOwnerLog" style="min-height:90px">Pre-launch presale controls ready. Allocation access remains closed until you deliberately open it.</pre>`;
  if (anchor) shell.insertBefore(section, anchor); else shell.appendChild(section);
  document.getElementById('prePreflight').onclick = () => runOpeningPreflight().catch(err => { setText('preReadiness', 'NOT READY'); log(`ERROR: ${err.message}`); });
  document.getElementById('preOpen').onclick = () => setAccess('open').catch(err => { setText('preReadiness', 'NOT READY'); log(`ERROR: ${err.message}`); });
  document.getElementById('prePause').onclick = () => setAccess('paused').catch(err => log(`ERROR: ${err.message}`));
  document.getElementById('preClose').onclick = () => setAccess('closed').catch(err => log(`ERROR: ${err.message}`));
  document.getElementById('preRefresh').onclick = () => refreshSummary();
  document.getElementById('preManualAllocate').onclick = () => manualAllocate().catch(err => log(`ERROR: ${err.message}`));
  document.getElementById('preLookup').onclick = () => lookupBuyer().catch(err => log(`ERROR: ${err.message}`));
  document.getElementById('preManifest').onclick = () => downloadManifest().catch(err => log(`ERROR: ${err.message}`));
  refreshSummary();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
