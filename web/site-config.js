window.RALYA_CONFIG = Object.freeze({
  project: 'RALYA',
  symbol: 'RLYA',
  build: '0.8.1-prelaunch-staking',
  launchPhase: 'pre-launch',
  presaleMode: 'prelaunch-allocation',
  presaleEnabled: false,
  prelaunchCheckoutEnabled: false,
  network: 'mainnet-beta',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  explorerBase: 'https://explorer.solana.com',
  projectUrl: 'https://ralyaai.com',
  metadataUri: 'https://raw.githubusercontent.com/mandated86-stack/ralya-network/main/web/token-metadata.json',
  ownerWallet: 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo',
  prelaunchTreasuryWallet: 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo',
  hardCap: 839000000,
  decimals: 9,
  presaleCap: 288000000,
  stakingBonusReserve: 14400000,
  stakingBonusBps: 500,
  standardReleaseTiming: '1-day-before-public-launch',
  standardReleaseOffsetSeconds: -86400,
  stakedReleaseDaysAfterLaunch: 21,
  basePriceMicroUsdc: 3000,
  priceStepTokens: 1000000,
  priceStepIncrementMicroUsdc: 50,
  minimumPurchaseUsdc: 1,
  referralBps: 100,
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  rlyaMint: '',
  saleProgramId: '',
  salePda: '',
  treasuryWallet: '',
  githubUrl: 'https://github.com/mandated86-stack/ralya-network',
  xUrl: 'https://x.com/Ralyaai',
  tiktokUrl: 'https://tiktok.com/@ralyaai',
  whitepaperUrl: 'RALYA_Whitepaper_v1.2.html'
});

(() => {
  const cfg = window.RALYA_CONFIG;
  const atomicLocked = cfg.presaleMode === 'atomic' && !cfg.presaleEnabled;
  const prelaunchLocked = cfg.presaleMode === 'prelaunch-allocation' && !cfg.prelaunchCheckoutEnabled;
  if (atomicLocked || prelaunchLocked) {
    const lockedMessage = atomicLocked
      ? 'Public token-sale access is not open yet.'
      : 'Private launch testing is active. Presale checkout opens after final release-policy verification.';
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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enforce, { once: true }); else enforce();
    const observer = new MutationObserver(() => {
      const button = document.getElementById('buyRlya');
      if (button && !button.disabled) enforce();
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  }

  const loadScript = (src, marker) => {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(marker, '1');
    document.body.appendChild(script);
  };
  const loadExtras = () => {
    if (cfg.presaleMode === 'prelaunch-allocation' && !document.querySelector('link[data-rlya-prelaunch-style]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = '/prelaunch.css';
      style.dataset.rlyaPrelaunchStyle = '1';
      document.head.appendChild(style);
    }
    if (!location.pathname.includes('/owner/')) loadScript('/site-content.js', 'data-rlya-site-content');
    if (cfg.presaleMode === 'atomic' && document.getElementById('marketPanel')) loadScript('/distribution-transparency.js', 'data-rlya-transparency');
    if (document.getElementById('networkStatus') || document.getElementById('programTag')) loadScript('/launch-status.js', 'data-rlya-launch-status');
    if (location.pathname.includes('/owner/')) {
      loadScript('/owner/status-control.js', 'data-rlya-owner-status');
      loadScript('/owner/presale-control.js', 'data-rlya-owner-presale');
      loadScript('/owner/treasury-prep.js', 'data-rlya-owner-treasury');
      loadScript('/owner/site-copy-control.js', 'data-rlya-owner-site-copy');
      if (cfg.saleProgramId && cfg.rlyaMint && cfg.salePda) loadScript('/owner/prelaunch-delivery.js', 'data-rlya-owner-delivery');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadExtras, { once: true }); else loadExtras();
})();
