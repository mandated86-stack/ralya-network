(() => {
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const cfg = window.RALYA_CONFIG || {};

  if (location.pathname.includes('/owner/')) return;
  const hero = $('.hero');
  const presale = $('#presale');
  if (!hero || !presale) return;

  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };
  const setHtml = (node, value) => {
    if (node && node.innerHTML !== value) node.innerHTML = value;
  };
  const toast = message => {
    const el = $('#toast');
    if (!el) return;
    setText(el, message);
    el.classList.add('show');
    clearTimeout(window.__ralyaUiToast);
    window.__ralyaUiToast = setTimeout(() => el.classList.remove('show'), 3200);
  };

  function createModal() {
    let modal = $('#ralyaModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'ralyaModal';
    modal.className = 'ralya-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ralya-modal-backdrop" data-modal-close></div>
      <section class="ralya-modal-card" role="dialog" aria-modal="true" aria-labelledby="ralyaModalTitle">
        <div class="ralya-modal-head">
          <div><span id="ralyaModalEyebrow">RALYA</span><h3 id="ralyaModalTitle"></h3></div>
          <button class="ralya-modal-close" type="button" data-modal-close aria-label="Close">×</button>
        </div>
        <div class="ralya-modal-body" id="ralyaModalBody"></div>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[data-modal-close]')) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
    return modal;
  }

  function showModal({ eyebrow = 'RALYA', title, html }) {
    const modal = createModal();
    setText($('#ralyaModalEyebrow', modal), eyebrow);
    setText($('#ralyaModalTitle', modal), title);
    setHtml($('#ralyaModalBody', modal), html);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = $('#ralyaModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  const protocolDetails = {
    '01': ['Request', '<p><strong>Work begins with a defined request.</strong> A person, AI agent, machine or software service specifies the task, payment terms and expected result.</p><p>The economic terms are meant to be explicit before value is put at risk.</p>'],
    '02': ['Bond', '<p><strong>Economic security sits underneath the work.</strong> RLYA is designed for bonding, collateral and staking so a participant can put value at risk around performance.</p><p>Practical payments can still settle in assets such as USDC.</p>'],
    '03': ['Work', '<p><strong>The provider performs the requested work.</strong> The long-term RALYA protocol is intended to support work performed by AI agents, software, machines and people.</p><p>Execution can stay specialized while the economic layer remains consistent.</p>'],
    '04': ['Settle', '<p><strong>Payment and economic security resolve at settlement.</strong> Practical payment can settle in assets such as USDC while RLYA is used for bond release, staking and accountability rules around the result.</p>'],
  };

  function makeNetworkClickable() {
    $$('.network-card .node:not(.core)').forEach(node => {
      const code = node.querySelector('span')?.textContent?.trim();
      const info = protocolDetails[code];
      if (!info || node.dataset.ralyaClickable === '1') return;
      node.dataset.ralyaClickable = '1';
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Open ${info[0]} explanation`);
      const open = () => showModal({ eyebrow: `PROTOCOL STEP ${code}`, title: info[0], html: info[1] });
      node.addEventListener('click', open);
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
    });
  }

  function createTechnologySection() {
    if ($('#technology')) return $('#technology');
    const section = document.createElement('section');
    section.className = 'section shell generated-tech';
    section.id = 'technology';
    section.innerHTML = `
      <div class="section-head">
        <div><span class="eyebrow">TECHNOLOGY</span><h2>One economic flow. Different kinds of workers.</h2></div>
        <p>RALYA is being built as economic infrastructure for autonomous work. Practical settlement can use assets such as USDC while RLYA provides bonding, collateral, staking and accountability around performance.</p>
      </div>
      <div class="tech-flow">
        <article><b>01</b><h3>Request</h3><p>Define the work, result and economic terms before execution begins.</p></article>
        <article><b>02</b><h3>Bond</h3><p>Use RLYA as economic security around participation and performance.</p></article>
        <article><b>03</b><h3>Work</h3><p>AI agents, software, machines or people perform the requested task.</p></article>
        <article><b>04</b><h3>Settle</h3><p>Settle practical payment and release or enforce the economic security rules.</p></article>
      </div>
      <div class="tech-note"><strong>Solana first.</strong> The initial RLYA foundation is being built on Solana. A purpose-built RALYA network remains a later evolution after the economic layer and real usage are proven.</div>`;
    $('#build')?.insertAdjacentElement('beforebegin', section);
    return section;
  }

  const tabMap = {};
  const ROUTE_PATHS = Object.freeze({ home: '/', rlya: '/rlya', technology: '/technology', roadmap: '/roadmap', docs: '/docs', presale: '/presale' });
  const register = (name, nodes) => { tabMap[name] = nodes.filter(Boolean); };

  function createTabs() {
    if ($('#ralyaSiteTabs')) return;
    const tech = createTechnologySection();
    register('home', [hero, $('#purpose'), presale]);
    register('rlya', [$('#rlya')]);
    register('technology', [tech]);
    register('roadmap', [$('#build'), $('section.dark-panel')]);
    register('docs', [$('#open-source'), $('section.faq')]);

    const wrap = document.createElement('div');
    wrap.className = 'site-tabs-wrap';
    wrap.id = 'ralyaSiteTabs';
    wrap.innerHTML = `<nav class="site-tabs" aria-label="RALYA site sections">
      <button class="site-tab" type="button" data-site-tab="home">Home</button>
      <button class="site-tab" type="button" data-site-tab="rlya">RLYA</button>
      <button class="site-tab" type="button" data-site-tab="technology">Technology</button>
      <button class="site-tab" type="button" data-site-tab="roadmap">Roadmap</button>
      <button class="site-tab" type="button" data-site-tab="docs">Docs</button>
      <button class="site-tab presale-shortcut" type="button" data-presale-shortcut>Presale</button>
    </nav>`;
    $('.header')?.insertAdjacentElement('afterend', wrap);

    const mobile = $('#mobileMenu');
    if (mobile) {
      mobile.innerHTML = `<a href="/" data-mobile-tab="home">Home</a><a href="/rlya" data-mobile-tab="rlya">RLYA</a><a href="/technology" data-mobile-tab="technology">Technology</a><a href="/roadmap" data-mobile-tab="roadmap">Roadmap</a><a href="/docs" data-mobile-tab="docs">Docs</a><a href="/presale" data-mobile-presale>Presale</a><a href="RALYA_Whitepaper_v1.2.html">Whitepaper v1.2</a><a href="https://x.com/Ralyaai" target="_blank" rel="noopener noreferrer">X / @Ralyaai</a><a href="https://tiktok.com/@ralyaai" target="_blank" rel="noopener noreferrer">TikTok / @ralyaai</a><a href="https://github.com/mandated86-stack/ralya-network" target="_blank" rel="noopener noreferrer">GitHub source</a>`;
    }
  }

  function createSocialRibbon() {
    if ($('#ralyaSocialRibbon')) return;
    const ribbon = document.createElement('div');
    ribbon.id = 'ralyaSocialRibbon';
    ribbon.className = 'social-ribbon';
    ribbon.innerHTML = `<span class="social-label">Official</span>
      <a href="${cfg.xUrl || 'https://x.com/Ralyaai'}" target="_blank" rel="noopener noreferrer"><span>𝕏</span><span>@Ralyaai</span></a>
      <a href="${cfg.tiktokUrl || 'https://tiktok.com/@ralyaai'}" target="_blank" rel="noopener noreferrer"><span>♪</span><span>@ralyaai</span></a>
      <a href="${cfg.githubUrl || 'https://github.com/mandated86-stack/ralya-network'}" target="_blank" rel="noopener noreferrer"><span>⌘</span><span>GitHub source</span></a>`;
    $('#ralyaSiteTabs')?.insertAdjacentElement('afterend', ribbon);
  }

  function setTab(name, { scroll = true, anchor = null } = {}) {
    const safe = tabMap[name] ? name : 'home';
    const all = new Set(Object.values(tabMap).flat());
    all.forEach(node => node?.classList.add('site-tab-hidden'));
    tabMap[safe].forEach(node => node?.classList.remove('site-tab-hidden'));
    $$('[data-site-tab]').forEach(button => {
      const active = button.dataset.siteTab === safe;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.documentElement.dataset.ralyaTab = safe;
    if (!scroll) return;
    const target = anchor ? $(anchor) : tabMap[safe][0];
    if (!target) return;
    const offset = innerWidth <= 950 ? 120 : 136;
    const top = Math.max(0, target.getBoundingClientRect().top + scrollY - offset);
    window.scrollTo({ top, behavior: innerWidth <= 760 ? 'auto' : 'smooth' });
  }

  function cleanRoutePath(value = location.pathname) {
    const path = String(value || '/').replace(/\/+$/, '') || '/';
    return Object.values(ROUTE_PATHS).includes(path) ? path : '/';
  }

  function routeMeta(routeName) {
    const route = routeName === 'presale' ? 'presale' : (ROUTE_PATHS[routeName] ? routeName : 'home');
    const titles = {
      home: 'RALYA — Economic trust for autonomous work',
      rlya: 'RLYA — Token & Economics | RALYA',
      technology: 'Technology | RALYA',
      roadmap: 'Roadmap | RALYA',
      docs: 'Docs & Open Source | RALYA',
      presale: 'RLYA Presale | RALYA',
    };
    document.title = titles[route];
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const base = new URL(cfg.projectUrl || location.origin);
    base.pathname = ROUTE_PATHS[route];
    base.search = '';
    base.hash = '';
    if (canonical) canonical.href = base.href;
    if (ogUrl) ogUrl.content = base.href;
  }

  function writeRoute(path, { replace = false } = {}) {
    const clean = cleanRoutePath(path);
    history[replace ? 'replaceState' : 'pushState'](null, '', `${clean}${location.search}`);
  }

  function routeLocation({ normalizeLegacy = true } = {}) {
    const legacy = {
      '#home': '/', '#top': '/', '#purpose': '/',
      '#rlya': '/rlya', '#technology': '/technology',
      '#build': '/roadmap', '#roadmap': '/roadmap',
      '#open-source': '/docs', '#docs': '/docs', '#presale': '/presale',
    };
    const hash = location.hash.toLowerCase();
    let path = cleanRoutePath();
    if (legacy[hash]) {
      path = legacy[hash];
      if (normalizeLegacy) history.replaceState(null, '', `${path}${location.search}`);
    }
    if (path === '/rlya') { setTab('rlya', { scroll: false }); routeMeta('rlya'); return; }
    if (path === '/technology') { setTab('technology', { scroll: false }); routeMeta('technology'); return; }
    if (path === '/roadmap') { setTab('roadmap', { scroll: false }); routeMeta('roadmap'); return; }
    if (path === '/docs') { setTab('docs', { scroll: false }); routeMeta('docs'); return; }
    setTab('home', { scroll: false });
    if (path === '/presale') {
      routeMeta('presale');
      requestAnimationFrame(() => setTab('home', { anchor: '#presale' }));
      return;
    }
    routeMeta('home');
  }

  function wireTabs() {
    $('#ralyaSiteTabs')?.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const tab = event.target.closest('[data-site-tab]');
      if (tab) {
        const name = tab.dataset.siteTab;
        setTab(name);
        writeRoute(ROUTE_PATHS[name] || '/');
        routeMeta(name);
        return;
      }
      if (event.target.closest('[data-presale-shortcut]')) {
        setTab('home', { anchor: '#presale' });
        writeRoute('/presale');
        routeMeta('presale');
      }
    });
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const mobileTab = event.target.closest('[data-mobile-tab]');
      if (mobileTab) {
        event.preventDefault();
        const name = mobileTab.dataset.mobileTab;
        setTab(name);
        writeRoute(ROUTE_PATHS[name] || '/');
        routeMeta(name);
        $('#mobileMenu')?.classList.remove('open');
        return;
      }
      if (event.target.closest('[data-mobile-presale]')) {
        event.preventDefault();
        setTab('home', { anchor: '#presale' });
        writeRoute('/presale');
        routeMeta('presale');
        $('#mobileMenu')?.classList.remove('open');
        return;
      }
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      const map = { '#rlya': 'rlya', '#technology': 'technology', '#build': 'roadmap', '#roadmap': 'roadmap', '#open-source': 'docs', '#docs': 'docs' };
      if (href === '#presale') { event.preventDefault(); setTab('home', { anchor: '#presale' }); writeRoute('/presale'); routeMeta('presale'); }
      else if (map[href]) { event.preventDefault(); setTab(map[href]); writeRoute(ROUTE_PATHS[map[href]]); routeMeta(map[href]); }
      else if (href === '#purpose' || href === '#top' || href === '#home') { event.preventDefault(); setTab('home', { anchor: href === '#purpose' ? '#purpose' : null }); writeRoute('/'); routeMeta('home'); }
    });
  }

  function polishBuildLanguage() {
    const build = $('#build');
    if (!build) return;
    setText($('.section-head h2', build), 'Building toward Mainnet.');
    setText($('.section-head > p', build), 'RALYA is progressing through live testing, production-readiness and launch-infrastructure milestones ahead of RLYA Mainnet.');
    const cards = $$('.build-grid article', build);
    cards.forEach(card => {
      const title = card.querySelector('h3')?.textContent?.trim();
      const tag = card.querySelector('.tag');
      if (title === 'Pre-launch product' && tag) { setText(tag, 'PRIVATE TESTING'); tag.classList.remove('good','warn'); tag.classList.add('progress'); }
      if (title === 'Solana foundation' && tag && !/MAINNET/i.test(tag.textContent || '')) { setText(tag, 'DEVNET VERIFIED'); tag.classList.remove('warn'); tag.classList.add('good'); }
    });
  }

  function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth <= 760; }
  function canonicalDappUrl() {
    const base = new URL(cfg.projectUrl || location.origin);
    base.pathname = '/presale';
    base.search = location.search;
    base.hash = '';
    return base.toString();
  }
  const phantomUrl = () => `https://phantom.app/ul/browse/${encodeURIComponent(canonicalDappUrl())}?ref=${encodeURIComponent(cfg.projectUrl || location.origin)}`;
  const solflareUrl = () => `https://solflare.com/ul/v1/browse/${encodeURIComponent(canonicalDappUrl())}?ref=${encodeURIComponent(cfg.projectUrl || location.origin)}`;
  const trustUrl = () => `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(canonicalDappUrl())}`;
  const metamaskUrl = () => {
    const target = new URL(canonicalDappUrl());
    return `https://metamask.app.link/dapp/${target.host}${target.pathname}${target.search}${target.hash}`;
  };

  let nativeConnectPass = false;
  function triggerNativeConnect(originButton, providerOverride = null) {
    if (providerOverride) {
      try { window.solana = providerOverride; } catch { /* read-only provider global */ }
    }
    nativeConnectPass = true;
    closeModal();
    setTimeout(() => originButton.click(), 20);
  }

  function walletChoice(name, mark, detected, detail) {
    return `<button type="button" class="wallet-choice" data-wallet-choice="${name.toLowerCase()}"><span class="wallet-mark">${mark}</span><span><strong>${name}</strong><small>${detail}</small></span><span class="wallet-state ${detected ? '' : 'open'}">${detected ? 'DETECTED' : (isMobile() ? 'OPEN APP' : 'VIEW')}</span></button>`;
  }

  function openWalletPicker(originButton) {
    const phantom = Boolean(window.phantom?.solana?.isPhantom);
    const solflare = Boolean(window.solflare?.isSolflare);
    const trustProvider = window.trustwallet?.solana || null;
    const trust = Boolean(trustProvider?.connect);
    const generic = Boolean(window.solana?.connect);
    const metamaskSolana = window.metamask?.solana || (window.solana?.isMetaMask ? window.solana : null);
    const metamask = Boolean(metamaskSolana?.connect);
    showModal({
      eyebrow: 'CONNECT WALLET',
      title: 'Choose your Solana wallet',
      html: `<p>On mobile, RALYA can reopen the canonical ralyaai.com site inside a wallet's secure in-app browser when Chrome cannot see the installed wallet.</p><div class="wallet-picker">
        ${walletChoice('Phantom','P',phantom,'Direct Solana connection · recommended')}
        ${walletChoice('Solflare','S',solflare,'Direct Solana connection')}
        ${walletChoice('Trust Wallet','T',trust,'Solana wallet / mobile dApp browser')}
        ${walletChoice('MetaMask','M',metamask,'Solana-capable MetaMask / app browser')}
        ${generic && !phantom && !solflare && !trust ? walletChoice('Detected wallet','W',true,'Browser-provided Solana wallet') : ''}
      </div><div class="wallet-help"><strong>Already installed but not detected?</strong> Choose the wallet above to reopen ralyaai.com inside that wallet's dApp browser.</div>`
    });
    const modal = $('#ralyaModal');
    modal?.querySelector('[data-wallet-choice="phantom"]')?.addEventListener('click', () => phantom ? triggerNativeConnect(originButton) : isMobile() ? location.assign(phantomUrl()) : window.open('https://phantom.com/download','_blank','noopener'));
    modal?.querySelector('[data-wallet-choice="solflare"]')?.addEventListener('click', () => solflare ? triggerNativeConnect(originButton) : isMobile() ? location.assign(solflareUrl()) : window.open('https://solflare.com','_blank','noopener'));
    modal?.querySelector('[data-wallet-choice="trust wallet"]')?.addEventListener('click', () => trust ? triggerNativeConnect(originButton, trustProvider) : isMobile() ? location.assign(trustUrl()) : window.open('https://trustwallet.com/download','_blank','noopener'));
    modal?.querySelector('[data-wallet-choice="metamask"]')?.addEventListener('click', () => metamask ? triggerNativeConnect(originButton, metamaskSolana) : isMobile() ? location.assign(metamaskUrl()) : window.open('https://metamask.io/download/','_blank','noopener'));
    modal?.querySelector('[data-wallet-choice="detected wallet"]')?.addEventListener('click', () => triggerNativeConnect(originButton));
  }

  function installWalletChooser() {
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('[data-wallet-connect]');
      if (!button) return;
      if (nativeConnectPass) { nativeConnectPass = false; return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      openWalletPicker(button);
    }, true);
  }

  function installReferralShortcut() {
    const head = $('.buy-head');
    const connect = $('.wallet-button', head || document);
    if (!head || !connect || $('#quickReferralButton')) return;
    const actions = document.createElement('div');
    actions.className = 'wallet-quick-actions';
    connect.insertAdjacentElement('beforebegin', actions);
    actions.appendChild(connect);
    const share = document.createElement('button');
    share.type = 'button';
    share.id = 'quickReferralButton';
    share.className = 'wallet-share-btn';
    share.textContent = 'Share & earn 1% USDC';
    actions.appendChild(share);
    const note = document.createElement('p');
    note.className = 'quick-referral-note';
    note.textContent = 'Your personal link pays 1% USDC on confirmed referred purchases.';
    head.insertAdjacentElement('afterend', note);
    share.addEventListener('click', () => {
      const link = String($('#myReferralLink')?.value || '');
      if (!/^https?:\/\//i.test(link)) return connect.click();
      showModal({
        eyebrow: 'RLYA REFERRAL',
        title: 'Share your link. Earn 1% USDC.',
        html: `<p>Your referred buyer pays the normal amount and keeps the full RLYA allocation. Your wallet receives <strong>1% of confirmed referred USDC purchases</strong>.</p><div class="referral-link-row"><input id="quickReferralLink" readonly value="${link.replace(/"/g,'&quot;')}" /></div><div class="share-actions"><button type="button" class="btn btn-primary" id="quickActivateCopy">Activate payout & copy</button><button type="button" class="btn btn-secondary" id="quickShareLink">Share link</button></div>`
      });
      $('#quickActivateCopy')?.addEventListener('click', () => $('#copyReferralLink')?.click());
      $('#quickShareLink')?.addEventListener('click', async () => {
        try {
          if (navigator.share) await navigator.share({ title: 'RALYA Presale', text: 'RLYA presale — use my referral link.', url: link });
          else { await navigator.clipboard.writeText(link); toast('Referral link copied.'); }
        } catch (err) { if (err?.name !== 'AbortError') toast('Could not open the share sheet.'); }
      });
    });
  }

  function normalizeReleaseCopy() {
    const stakeStatus = $('#stakeStatus');
    if (stakeStatus) {
      const t = stakeStatus.textContent || '';
      if (/locked to Buy \+ Stake/i.test(t)) setText(stakeStatus, 'This wallet is locked to Buy + Stake: +5% RLYA, unlock 21 days after public launch.');
      else if (/locked to standard/i.test(t)) setText(stakeStatus, 'This wallet is locked to standard release: actual RLYA 1 day before public launch.');
    }
    const delivery = $('#allocationDelivery');
    if (delivery) {
      const t = delivery.textContent || '';
      if (/Buy \+ Stake/i.test(t)) setText(delivery, 'Buy + Stake: base + 5% bonus unlock 21 days after public launch');
      else if (/Standard/i.test(t)) setText(delivery, 'Standard: actual RLYA 1 day before public launch');
    }
    const avg = $('#averagePrice');
    if (avg) {
      const next = (avg.textContent || '')
        .replace(/release day 36/gi, 'unlock day 21')
        .replace(/standard release day 21/gi, 'standard release T-1')
        .replace(/standard \/ release day 21/gi, 'standard / release T-1');
      setText(avg, next);
    }
    const msg = $('#buyMessage');
    if (msg) {
      const next = (msg.textContent || '')
        .replace(/36-day release schedule/gi, 'day-21 unlock schedule')
        .replace(/standard 21-day release schedule/gi, 'standard T-1 release schedule')
        .replace(/standard 21-day release/gi, 'standard T-1 release');
      setText(msg, next);
    }
    const result = $('#txResult');
    if (result && !result.hidden) {
      let next = result.innerHTML;
      if (/staking bonus/i.test(next)) next = next.replace(/36 days after public launch/gi, '21 days after public launch');
      else next = next.replace(/21 days after public launch/gi, '1 day before public launch');
      setHtml(result, next);
    }
  }

  function installSafeCopyObserver() {
    const targets = ['stakeStatus','allocationDelivery','averagePrice','buyMessage','txResult'].map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        normalizeReleaseCopy();
      });
    });
    targets.forEach(node => observer.observe(node, { childList: true, subtree: true, characterData: true }));
    normalizeReleaseCopy();
  }

  function init() {
    createTabs();
    createSocialRibbon();
    makeNetworkClickable();
    polishBuildLanguage();
    wireTabs();
    installReferralShortcut();
    routeLocation();
    window.addEventListener('popstate', () => routeLocation({ normalizeLegacy: false }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();