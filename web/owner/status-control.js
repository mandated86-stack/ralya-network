(() => {
  const cfg = window.RALYA_CONFIG || {};
  const OWNER = cfg.ownerWallet || 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo';
  const STAGES = [
    ['prelaunch', 'Pre-launch'],
    ['mainnet_preparing', 'Mainnet preparation'],
    ['mainnet_verified', 'Mainnet verified'],
    ['distribution_preparing', 'Distribution preparation'],
    ['distribution_scheduled', 'Distribution scheduled'],
    ['launch_approaching', 'Launch approaching'],
  ];

  const enc = new TextEncoder();
  let current = null;

  function provider() {
    if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
    if (window.solflare?.isSolflare) return window.solflare;
    if (window.solana?.connect) return window.solana;
    return null;
  }

  function toBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function nonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function buildCard() {
    const anchor = [...document.querySelectorAll('.owner-card')].find(card => card.querySelector('h2')?.textContent?.trim() === 'Launch inputs');
    if (!anchor || document.getElementById('publicStageControl')) return;

    const card = document.createElement('section');
    card.className = 'owner-card';
    card.id = 'publicStageControl';
    card.innerHTML = `
      <h2>Public launch-stage control</h2>
      <p>Private owner control for what the public website says about launch progress. These buttons <strong>do not</strong> deploy contracts, mint RLYA, open the presale, move funds, change pricing or resume the on-chain sale.</p>
      <div class="safe"><strong>Reveal only when you want.</strong> Technical work can be completed first and kept quiet. Publishing a stage changes only the public launch wording after your owner wallet signs the update.</div>
      <label>Current public stage</label>
      <div class="code-note" id="publicStageCurrent">Loading current stage…</div>
      <label>Optional public note</label>
      <input id="publicStageNote" maxlength="220" placeholder="Optional short update, e.g. Final verification sequence underway" />
      <div class="owner-actions" id="publicStageButtons"></div>
      <pre class="launch-log" id="publicStageLog" style="min-height:90px">Waiting.</pre>
    `;
    anchor.parentNode.insertBefore(card, anchor);

    const buttons = card.querySelector('#publicStageButtons');
    for (const [stage, label] of STAGES) {
      const button = document.createElement('button');
      button.className = stage === 'launch_approaching' ? 'btn btn-primary' : 'btn btn-secondary';
      button.type = 'button';
      button.textContent = label;
      button.dataset.publicStage = stage;
      button.addEventListener('click', () => publish(stage, button));
      buttons.appendChild(button);
    }
  }

  function render(status) {
    current = status;
    const el = document.getElementById('publicStageCurrent');
    if (!el || !status) return;
    el.innerHTML = `<strong>${escapeHtml(status.badge || status.stage || 'PRE-LAUNCH')}</strong><br>${escapeHtml(status.headline || '')}${status.note ? `<br><span class="muted">${escapeHtml(status.note)}</span>` : ''}`;
    document.querySelectorAll('[data-public-stage]').forEach(button => {
      button.disabled = button.dataset.publicStage === status.stage;
    });
  }

  function log(message) {
    const el = document.getElementById('publicStageLog');
    if (!el) return;
    el.textContent = `${new Date().toISOString()}  ${message}\n${el.textContent}`.slice(0, 5000);
  }

  async function loadCurrent() {
    try {
      const response = await fetch('/api/launch-status', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Status endpoint returned ${response.status}`);
      render(await response.json());
      log('Public launch stage loaded.');
    } catch (error) {
      log(`Could not load public stage: ${error?.message || error}`);
    }
  }

  async function publish(stage, button) {
    const walletProvider = provider();
    if (!walletProvider) {
      log('Install/connect Phantom or Solflare to publish a stage.');
      return;
    }
    if (!walletProvider.signMessage) {
      log('This wallet provider cannot sign messages. Use Phantom or Solflare with message signing enabled.');
      return;
    }

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Signing…';
    try {
      const result = await walletProvider.connect();
      const wallet = String(result?.publicKey || walletProvider.publicKey || '');
      if (wallet !== OWNER) throw new Error(`Wrong wallet. Owner wallet required: ${OWNER}`);

      const timestamp = new Date().toISOString();
      const requestNonce = nonce();
      const message = [
        'RALYA public launch-stage update',
        `Wallet: ${wallet}`,
        `Stage: ${stage}`,
        `Timestamp: ${timestamp}`,
        `Nonce: ${requestNonce}`,
      ].join('\n');

      const signed = await walletProvider.signMessage(enc.encode(message), 'utf8');
      const signatureBytes = signed?.signature || signed;
      const signature = toBase64(signatureBytes);
      const note = document.getElementById('publicStageNote')?.value?.trim() || '';

      const response = await fetch('/api/launch-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ wallet, stage, timestamp, nonce: requestNonce, message, signature, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Update failed (${response.status})`);

      render(payload.status);
      log(`Published public stage: ${payload.status.badge}. Website readers refresh automatically.`);
    } catch (error) {
      log(`Stage not changed: ${error?.message || error}`);
    } finally {
      button.textContent = oldText;
      button.disabled = current?.stage === stage;
    }
  }

  function init() {
    buildCard();
    loadCurrent();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
