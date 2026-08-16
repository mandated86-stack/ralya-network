window.RALYA_CONFIG = Object.freeze({
  project: 'RALYA',
  symbol: 'RLYA',
  build: '1.0.5-live-presale-price-purchase-copy',
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
  // Published macro curve: +$0.000050 per 1M RLYA. Live prelaunch pricing
  // interpolates the same slope every 10,000 RLYA at half-micro precision.
  priceStepTokens: 1000000,
  priceStepIncrementMicroUsdc: 50,
  livePriceStepTokens: 10000,
  livePriceScale: 2,
  livePriceStepIncrementScaledUsdc: 1,
  livePriceStepIncrementUsdc: 0.0000005,
  minimumPurchaseUsdc: 1,
  referralBps: 100,
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  rlyaMint: '',
  saleProgramId: '',
  salePda: '',
  treasuryWallet: '',
  walletConnectProjectId: '',
  githubUrl: 'https://github.com/mandated86-stack/ralya-network',
  xUrl: 'https://x.com/Ralyaai',
  tiktokUrl: 'https://tiktok.com/@ralyaai',
  whitepaperUrl: 'RALYA_Whitepaper_v1.2.html'
});

(() => {
  const cfg = window.RALYA_CONFIG;
  const canonicalOrigin = new URL(cfg.projectUrl).origin;
  const isOwnerPath = /^\/owner(?:\/|$)/.test(location.pathname);

  // Trust Wallet's Android DApp browser exposes its native Solana provider on
  // window.trustwallet.solana. Prefer that provider only when it is actually injected.
  // ConnectorKit can still write its generic bridge to RALYA_WALLET_PROVIDER, but reads in
  // Trust's DApp browser resolve to Trust's native provider so legacy web3.js Transaction
  // objects reach Trust unchanged. Phantom, Solflare and every non-Trust browser continue to
  // receive the existing ConnectorKit provider without any routing change.
  if (!isOwnerPath && /Android/i.test(navigator.userAgent)) {
    let connectorProvider = window.RALYA_WALLET_PROVIDER || null;
    try {
      Object.defineProperty(window, 'RALYA_WALLET_PROVIDER', {
        configurable: true,
        get() {
          const trustSolana = window.trustwallet?.solana;
          return trustSolana?.connect ? trustSolana : connectorProvider;
        },
        set(value) {
          connectorProvider = value;
        },
      });
    } catch {}
  }

  // Trust Wallet may inject its Solana provider after the first page scripts execute.
  // Keep bridging it for a short startup window so every private owner tool sees the same
  // provider through window.solana without depending on injection timing.
  if (isOwnerPath) {
    let ownerBridgeChecks = 0;
    const bridgeOwnerTrust = () => {
      const trustSolana = window.trustwallet?.solana;
      if (trustSolana?.connect && !window.solana) {
        try { window.solana = trustSolana; } catch {}
      }
      ownerBridgeChecks += 1;
      return Boolean(window.solana?.connect) || ownerBridgeChecks >= 50;
    };
    if (!bridgeOwnerTrust()) {
      const bridgeTimer = setInterval(() => {
        if (bridgeOwnerTrust()) clearInterval(bridgeTimer);
      }, 100);
    }
  }

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
    if (!isOwnerPath) {
      loadStyle('/site-v2.css', 'data-rlya-site-v2-style');
      loadStyle('/mobile-stability.css', 'data-rlya-mobile-stability');
      loadStyle('/presale-next.css?v=1.0.4', 'data-rlya-presale-next-style');
      loadStyle('/purchase-celebration.css?v=1.0.4', 'data-rlya-purchase-celebration-style');
      loadScript('/presale-next.js?v=1.0.4', 'data-rlya-presale-next');
      loadScript('/wallet-mobile-fix.js?v=1.0.4', 'data-rlya-wallet-mobile-fix');
      loadScript('/purchase-celebration.js?v=1.0.4', 'data-rlya-purchase-celebration');
      loadScript('/site-ui-hotfix.js', 'data-rlya-site-v2');
      loadScript('/site-content.js', 'data-rlya-site-content');
      loadScript('/live-presale-ui.js?v=1.0.5', 'data-rlya-live-presale-ui');
    }
    if (cfg.presaleMode === 'atomic' && document.getElementById('marketPanel')) loadScript('/distribution-transparency.js', 'data-rlya-transparency');
    if (document.getElementById('networkStatus') || document.getElementById('programTag')) loadScript('/launch-status.js', 'data-rlya-launch-status');
    if (isOwnerPath) {
      loadScript('/owner/status-control.js', 'data-rlya-owner-status');
      loadScript('/owner/presale-control.js', 'data-rlya-owner-presale');
      loadScript('/owner/treasury-prep.js', 'data-rlya-owner-treasury');
      loadScript('/owner/site-copy-control.js', 'data-rlya-owner-site-copy');
      if (cfg.saleProgramId && cfg.rlyaMint && cfg.salePda) loadScript('/owner/prelaunch-delivery.js', 'data-rlya-owner-delivery');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadExtras, { once: true }); else loadExtras();
})();
