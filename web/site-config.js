window.RALYA_CONFIG = Object.freeze({
  project: 'RALYA',
  symbol: 'RLYA',
  build: '1.0.0-presale-stability-wallet',
  launchPhase: 'pre-launch',
  presaleMode: 'prelaunch-allocation',
  presaleEnabled: false,
  prelaunchCheckoutEnabled: true,
  network: 'mainnet-beta',
  rpcEndpoint: 'https://ralyaai.com/api/solana/rpc',
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
  const canonicalOrigin = new URL(cfg.projectUrl).origin;

  // Never let public traffic or wallet deep-links settle on the Netlify fallback hostname.
  if (/\.netlify\.app$/i.test(location.hostname) && location.origin !== canonicalOrigin) {
    location.replace(`${canonicalOrigin}${location.pathname}${location.search}${location.hash}`);
    return;
  }

  // Give Chrome/Android an ordinary PNG icon in addition to the SVG favicon.
  const ensureIcon = (rel, href, type = null) => {
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (type) link.type = type;
    document.head.appendChild(link);
  };
  ensureIcon('icon', '/rlya-token.png', 'image/png');
  ensureIcon('shortcut icon', '/rlya-token.png', 'image/png');
  ensureIcon('apple-touch-icon', '/rlya-token.png');

  const atomicLocked = cfg.presaleMode === 'atomic' && !cfg.presaleEnabled;
  const prelaunchLocked = cfg.presaleMode === 'prelaunch-allocation' && !cfg.prelaunchCheckoutEnabled;
  if (atomicLocked || prelaunchLocked) {
    const lockedMessage = atomicLocked
      ? 'Public token-sale access is not open yet.'
      : 'Presale checkout is not enabled yet.';
    const enforce = () => {
      const button = document.getElementById('buyRlya');
      if (!button) return;
      if (!button.disabled) button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      const message = document.getElementById('buyMessage');
      if (message && message.textContent !== lockedMessage) message.textContent = lockedMessage;
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
  }

  const loadScript = (src, marker) => {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.defer = true;
    script.setAttribute(marker, '1');
    document.body.appendChild(script);
  };
  const loadStyle = (href, marker) => {
    if (document.querySelector(`link[${marker}]`)) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = href;
    style.setAttribute(marker, '1');
    document.head.appendChild(style);
  };
  const loadExtras = () => {
    if (cfg.presaleMode === 'prelaunch-allocation') loadStyle('/prelaunch.css', 'data-rlya-prelaunch-style');
    if (!location.pathname.includes('/owner/')) {
      loadStyle('/site-v2.css', 'data-rlya-site-v2-style');
      loadStyle('/mobile-stability.css', 'data-rlya-mobile-stability');
      loadStyle('/presale-next.css', 'data-rlya-presale-next-style');
      loadScript('/presale-next.js', 'data-rlya-presale-next');
      loadScript('/site-ui-hotfix.js', 'data-rlya-site-v2');
      loadScript('/site-content.js', 'data-rlya-site-content');
    }
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
