window.RALYA_CONFIG = Object.freeze({
  project: 'RALYA',
  symbol: 'RLYA',
  build: '0.7.0-prelaunch-presale',
  launchPhase: 'pre-launch',

  // Two deliberately separate sale modes:
  // - prelaunch-allocation: verified USDC now, RLYA allocation recorded for distribution before public launch.
  // - atomic: the already-built on-chain USDC -> RLYA settlement path used after production launch.
  presaleMode: 'prelaunch-allocation',
  presaleEnabled: false, // atomic Mainnet purchase gate; stays OFF until the later public token launch.

  network: 'mainnet-beta',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  explorerBase: 'https://explorer.solana.com',
  projectUrl: 'https://ralya-network.netlify.app',
  metadataUri: 'https://raw.githubusercontent.com/mandated86-stack/ralya-network/main/web/token-metadata.json',
  ownerWallet: 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo',
  prelaunchTreasuryWallet: 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo',

  hardCap: 839000000,
  decimals: 9,
  presaleCap: 100680000,
  basePriceMicroUsdc: 3000,
  priceStepTokens: 1000000,
  priceStepIncrementMicroUsdc: 50,
  minimumPurchaseUsdc: 1,
  referralBps: 100,
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',

  // Filled only after the signed production launch record exists.
  // Public messaging, prelaunch allocation access and atomic token-sale activation are separate controls.
  rlyaMint: '',
  saleProgramId: '',
  salePda: '',
  treasuryWallet: '',
  githubUrl: 'https://github.com/mandated86-stack/ralya-network',
  whitepaperPdf: 'RALYA_Whitepaper_v1.1.pdf'
});

(() => {
  const cfg = window.RALYA_CONFIG;

  // The atomic-sale master switch must never accidentally disable the separate
  // prelaunch allocation flow. Once presaleMode becomes `atomic`, this guard
  // again blocks purchase controls until the reviewed Mainnet gate is enabled.
  if (cfg.presaleMode === 'atomic' && !cfg.presaleEnabled) {
    const lockedMessage = 'Public token-sale access is not open yet.';
    const enforce = () => {
      const button = document.getElementById('buyRlya');
      if (!button) return;
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      const message = document.getElementById('buyMessage');
      if (message) message.textContent = lockedMessage;
    };
    document.addEventListener('click', event => {
      const target = event.target;
      if (target instanceof Element && target.closest('#buyRlya')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        enforce();
      }
    }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enforce, { once: true });
    else enforce();
  }

  const loadExtras = () => {
    // On-chain distribution transparency is only meaningful after the production
    // mint/program exist. The prelaunch page reads its verified allocation ledger instead.
    if (cfg.presaleMode === 'atomic' && document.getElementById('marketPanel') && !document.querySelector('script[data-rlya-transparency]')) {
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

    if (location.pathname.includes('/owner/') && !document.querySelector('script[data-rlya-owner-status]')) {
      const ownerStatus = document.createElement('script');
      ownerStatus.src = '/owner/status-control.js';
      ownerStatus.defer = true;
      ownerStatus.dataset.rlyaOwnerStatus = '1';
      document.body.appendChild(ownerStatus);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadExtras, { once: true });
  else loadExtras();
})();
