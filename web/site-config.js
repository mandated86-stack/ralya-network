window.RALYA_CONFIG = Object.freeze({
  project: 'RALYA',
  symbol: 'RLYA',
  build: '0.5.0-referral-release-candidate',
  launchPhase: 'protocol-testing',
  presaleEnabled: false,
  network: 'mainnet-beta',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  explorerBase: 'https://explorer.solana.com',
  projectUrl: 'https://ralya-network.netlify.app',
  metadataUri: 'https://ralya-network.netlify.app/token-metadata.json',
  hardCap: 839000000,
  decimals: 9,
  presaleCap: 100680000,
  basePriceMicroUsdc: 3000,
  priceStepTokens: 1000000,
  priceStepIncrementMicroUsdc: 50,
  minimumPurchaseUsdc: 1,
  referralBps: 100,
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // These remain blank until the signed mainnet launch record exists.
  // presaleEnabled must also be changed to true in a separate reviewed launch commit
  // only after the mainnet smoke purchase/referral verification is complete.
  rlyaMint: '',
  saleProgramId: '',
  treasuryWallet: '',
  githubUrl: 'https://github.com/mandated86-stack/ralya-network',
  whitepaperPdf: 'RALYA_Whitepaper_v1.1.pdf'
});

// Production master switch. app.js intentionally remains unable to override this gate.
// The capture-phase guard blocks a purchase before any wallet-signing handler can run,
// and the observer keeps the purchase control disabled while presaleEnabled is false.
(() => {
  const cfg = window.RALYA_CONFIG;
  if (cfg.presaleEnabled) return;

  const enforce = () => {
    const button = document.getElementById('buyRlya');
    if (!button) return;
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    const message = document.getElementById('buyMessage');
    if (message) message.textContent = 'Presale is not enabled yet. Mainnet verification must complete before purchases open.';
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

  const observer = new MutationObserver(enforce);
  const startObserver = () => observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  if (document.documentElement) startObserver();
})();
