window.RALYA_CONFIG = Object.freeze({
  project: 'RALYA',
  symbol: 'RLYA',
  build: '0.6.0-mainnet-prep',
  launchPhase: 'pre-launch',
  presaleEnabled: false,
  network: 'mainnet-beta',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  explorerBase: 'https://explorer.solana.com',
  projectUrl: 'https://ralya-network.netlify.app',
  metadataUri: 'https://raw.githubusercontent.com/mandated86-stack/ralya-network/main/web/token-metadata.json',
  ownerWallet: 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo',
  hardCap: 839000000,
  decimals: 9,
  presaleCap: 100680000,
  basePriceMicroUsdc: 3000,
  priceStepTokens: 1000000,
  priceStepIncrementMicroUsdc: 50,
  minimumPurchaseUsdc: 1,
  referralBps: 100,
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // These remain blank until the signed Mainnet launch record exists.
  // Public launch timing and technical readiness are intentionally controlled separately.
  rlyaMint: '',
  saleProgramId: '',
  salePda: '',
  treasuryWallet: '',
  githubUrl: 'https://github.com/mandated86-stack/ralya-network',
  whitepaperPdf: 'RALYA_Whitepaper_v1.1.pdf'
});

// Production purchase master switch. app.js intentionally remains unable to override this gate.
// Public launch-stage messaging is separate and can never turn buying on by itself.
(() => {
  const cfg = window.RALYA_CONFIG;
  if (!cfg.presaleEnabled) {
    const lockedMessage = 'Presale access is not open yet. Connect your wallet later when allocation access is announced.';
    const enforce = () => {
      const button = document.getElementById('buyRlya');
      if (!button) return;
      if (!button.disabled) button.disabled = true;
      if (button.getAttribute('aria-disabled') !== 'true') button.setAttribute('aria-disabled', 'true');
      const message = document.getElementById('buyMessage');
      if (message && message.textContent !== lockedMessage) message.textContent = lockedMessage;
    };

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#buyRlya')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        enforce();
      }
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enforce, { once: true });
    else enforce();

    const observer = new MutationObserver(() => {
      const button = document.getElementById('buyRlya');
      if (button && !button.disabled) enforce();
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  }

  const loadPublicExtras = () => {
    if (document.getElementById('marketPanel') && !document.querySelector('script[data-rlya-transparency]')) {
      const transparency = document.createElement('script');
      transparency.src = 'distribution-transparency.js';
      transparency.defer = true;
      transparency.dataset.rlyaTransparency = '1';
      document.body.appendChild(transparency);
    }

    if ((document.getElementById('networkStatus') || document.getElementById('programTag')) && !document.querySelector('script[data-rlya-launch-status]')) {
      const status = document.createElement('script');
      status.src = '/launch-status.js';
      status.defer = true;
      status.dataset.rlyaLaunchStatus = '1';
      document.body.appendChild(status);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadPublicExtras, { once: true });
  else loadPublicExtras();
})();
