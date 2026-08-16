(() => {
  const cfg = window.RALYA_CONFIG || {};
  const isAndroid = /Android/i.test(navigator.userAgent);

  const shorten = value => {
    const s = String(value || '');
    return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
  };

  function ensureBuyStyle() {
    if (document.getElementById('ralyaBuySimpleStyle')) return;
    const style = document.createElement('style');
    style.id = 'ralyaBuySimpleStyle';
    style.textContent = `
      #buyRlya.ralya-buy-simple {
        min-height: 74px;
        font-size: clamp(22px, 5vw, 30px);
        font-weight: 950;
        letter-spacing: .12em;
        text-transform: uppercase;
        box-shadow: 0 14px 32px rgba(37, 190, 201, .22);
      }
      #buyRlya.ralya-buy-simple:not(:disabled) {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  function replaceTextNodes(root, replacements) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let next = node.nodeValue || '';
      for (const [from, to] of replacements) next = next.split(from).join(to);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  }

  function applyPresaleCopy() {
    ensureBuyStyle();
    const buy = document.getElementById('buyRlya');
    if (buy) {
      buy.classList.add('ralya-buy-simple');
      if (buy.textContent !== 'BUY') buy.textContent = 'BUY';
      buy.setAttribute('aria-label', 'Buy RLYA');
    }

    const quoteLabel = document.querySelector('.quote-box > span');
    if (quoteLabel && quoteLabel.textContent !== 'You will receive') quoteLabel.textContent = 'You will receive';
    const balanceLabel = document.querySelector('#rlyaBalance')?.previousElementSibling;
    if (balanceLabel && balanceLabel.textContent !== 'Your RLYA') balanceLabel.textContent = 'Your RLYA';

    replaceTextNodes(document.querySelector('main'), [
      ['Presale purchases record an expected RLYA allocation.', 'Presale purchases record your RLYA allocation.'],
      ['A confirmed purchase records the expected RLYA allocation', 'A confirmed purchase records your RLYA allocation'],
      ['Verified USDC. Expected allocation recorded now.', 'Verified USDC. RLYA allocation recorded now.'],
      ['confirmed expected RLYA', 'confirmed RLYA'],
      ['Expected allocation confirmed', 'RLYA allocation confirmed'],
      ['EXPECTED ALLOCATION CONFIRMED', 'RLYA ALLOCATION CONFIRMED'],
      ['Expected Allocation Confirmed.', 'Purchase Confirmed.'],
      ['Expected RLYA allocation', 'You will receive'],
      ['Expected RLYA', 'Your RLYA'],
      ['expected RLYA allocation', 'RLYA allocation'],
      ['Expected allocation', 'RLYA allocation'],
      ['expected allocation', 'RLYA allocation'],
    ]);
  }

  const publicObserver = new MutationObserver(() => applyPresaleCopy());
  publicObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyPresaleCopy, { once: true });
  else applyPresaleCopy();

  if (!isAndroid) return;

  function showError(message) {
    const list = document.getElementById('ralyaWalletList');
    if (!list) return;
    list.querySelector('.ralya-wallet-error')?.remove();
    const note = document.createElement('p');
    note.className = 'ralya-wallet-error';
    note.textContent = message;
    list.appendChild(note);
  }

  function closeWalletModal() {
    const modal = document.getElementById('ralyaWalletModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  function presaleTarget() {
    const target = new URL(cfg.projectUrl || location.origin);
    target.pathname = '/presale';
    target.search = location.search;
    target.hash = '';
    return target;
  }

  function walletBrowserUrl(name) {
    const target = presaleTarget();
    const appOrigin = new URL(cfg.projectUrl || location.origin).origin;
    if (name === 'phantom') {
      return `https://phantom.app/ul/browse/${encodeURIComponent(target.toString())}?ref=${encodeURIComponent(appOrigin)}`;
    }
    if (name === 'solflare') {
      return `https://solflare.com/ul/v1/browse/${encodeURIComponent(target.toString())}?ref=${encodeURIComponent(appOrigin)}`;
    }
    if (name === 'trust wallet') {
      return `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(target.toString())}`;
    }
    if (name === 'metamask') {
      return `https://metamask.app.link/dapp/${target.host}${target.pathname}${target.search}`;
    }
    return target.toString();
  }

  function openWalletBrowser(name) {
    location.assign(walletBrowserUrl(name));
  }

  async function connectInjectedTrust(button) {
    const provider = window.trustwallet?.solana;
    if (!provider?.connect) throw new Error('Trust Wallet Solana provider was not detected in this browser.');
    button.disabled = true;
    try {
      const result = await provider.connect();
      const address = String(result?.publicKey || provider.publicKey || '');
      if (!address) throw new Error('Trust Wallet connected without returning a Solana address.');
      window.RALYA_WALLET_PROVIDER = provider;
      const chip = document.getElementById('ralyaHeaderWallet');
      const label = chip?.querySelector('[data-wallet-chip-text]');
      if (chip) chip.classList.add('connected');
      if (label) label.textContent = shorten(address);
      closeWalletModal();
      window.dispatchEvent(new CustomEvent('ralya:wallet-standard-connected', { detail: { address, wallet: 'Trust Wallet' } }));
    } finally {
      button.disabled = false;
    }
  }

  function setWalletIntro() {
    const intro = document.querySelector('.ralya-wallet-intro');
    if (intro) intro.textContent = 'Choose your wallet. On mobile, RALYA opens inside the selected wallet so you can connect and approve there.';
  }

  function removeHangingGenericMwa(list) {
    const rows = [...list.querySelectorAll('[data-connector-id]')];
    for (const row of rows) {
      const name = row.querySelector('strong')?.textContent?.trim().toLowerCase();
      if (name === 'mobile wallet') row.remove();
    }
  }

  function addCapabilityNote(list) {
    let note = list.querySelector('[data-rlya-mobile-capability-note]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'ralya-wallet-empty';
      note.dataset.rlyaMobileCapabilityNote = '1';
      list.appendChild(note);
    }
    note.textContent = 'Tap a wallet to open RALYA inside that wallet app. Connect there, then approve purchases and signatures normally.';
  }

  function fixSyntheticRows() {
    const list = document.getElementById('ralyaWalletList');
    if (!list) return;
    setWalletIntro();
    removeHangingGenericMwa(list);

    const rows = [...list.querySelectorAll('[data-mobile-authorize]:not([data-rlya-mobile-fixed])')];
    for (const original of rows) {
      const name = String(original.dataset.mobileAuthorize || '').trim().toLowerCase();
      const button = original.cloneNode(true);
      button.dataset.rlyaMobileFixed = '1';
      button.removeAttribute('data-mobile-authorize');
      original.replaceWith(button);
      const small = button.querySelector('small');
      const action = button.querySelector('b');

      if (name === 'trust wallet' && window.trustwallet?.solana?.connect) {
        if (small) small.textContent = 'Trust Wallet detected here · connect directly';
        if (action) action.textContent = 'CONNECT';
        button.addEventListener('click', () => connectInjectedTrust(button).catch(err => showError(err?.message || 'Trust Wallet connection failed.')));
        continue;
      }

      if (['phantom', 'solflare', 'trust wallet', 'metamask'].includes(name)) {
        if (small) small.textContent = `Open RALYA inside ${name === 'trust wallet' ? 'Trust Wallet' : name[0].toUpperCase() + name.slice(1)} and connect there`;
        if (action) action.textContent = 'OPEN APP';
        button.addEventListener('click', () => openWalletBrowser(name));
        continue;
      }

      if (small) small.textContent = 'Open this wallet app and use its browser to visit ralyaai.com/presale.';
      if (action) action.textContent = 'OPEN';
      button.addEventListener('click', () => showError('Open your wallet app, visit ralyaai.com/presale in its browser, and connect there.'));
    }
    if (rows.length || list.children.length) addCapabilityNote(list);
  }

  const walletObserver = new MutationObserver(fixSyntheticRows);
  walletObserver.observe(document.documentElement, { childList: true, subtree: true });
  fixSyntheticRows();
})();
