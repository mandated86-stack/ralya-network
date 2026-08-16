(() => {
  const cfg = window.RALYA_CONFIG || {};
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (!isAndroid) return;

  const shorten = value => {
    const s = String(value || '');
    return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
  };

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

  function addCapabilityNote(list) {
    if (list.querySelector('[data-rlya-mobile-capability-note]')) return;
    const note = document.createElement('p');
    note.className = 'ralya-wallet-empty';
    note.dataset.rlyaMobileCapabilityNote = '1';
    note.textContent = cfg.walletConnectProjectId
      ? 'Mobile Wallet uses Solana Mobile Wallet Adapter. Trust Wallet from Chrome pairs through WalletConnect.'
      : 'Mobile Wallet uses Solana Mobile Wallet Adapter only. Trust Wallet from Chrome needs WalletConnect pairing, which is not configured yet.';
    list.appendChild(note);
  }

  function fixSyntheticRows() {
    const list = document.getElementById('ralyaWalletList');
    if (!list) return;
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

      if (name === 'trust wallet') {
        if (small) small.textContent = cfg.walletConnectProjectId
          ? 'Use the WalletConnect option to pair Trust Wallet from Chrome'
          : 'Chrome pairing requires WalletConnect setup';
        if (action) action.textContent = cfg.walletConnectProjectId ? 'WALLETCONNECT' : 'SETUP';
        button.addEventListener('click', () => showError(cfg.walletConnectProjectId
          ? 'Choose WalletConnect to pair Trust Wallet.'
          : 'Trust Wallet from Chrome cannot be paired until a WalletConnect project ID is configured for RALYA.'));
        continue;
      }

      if (small) small.textContent = 'This branded shortcut is unavailable here; use a detected connector or Mobile Wallet if your wallet supports Solana MWA.';
      if (action) action.textContent = 'UNAVAILABLE';
      button.addEventListener('click', () => showError('This wallet did not expose a compatible connector in this browser. The old generic Android authorization shortcut has been disabled because it could hang without opening a wallet.'));
    }
    if (rows.length) addCapabilityNote(list);
  }

  const observer = new MutationObserver(fixSyntheticRows);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  fixSyntheticRows();
})();
