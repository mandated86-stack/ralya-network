(() => {
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const cfg = window.RALYA_CONFIG || {};

  if (location.pathname.includes('/owner/')) return;
  const hero = $('.hero');
  const presale = $('#presale');
  if (!hero || !presale) return; // Homepage-only enhancement.

  const uiToast = message => {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(window.__ralyaUiToast);
    window.__ralyaUiToast = setTimeout(() => el.classList.remove('show'), 3600);
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
      if (event.target.closest('[data-modal-close]')) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
    return modal;
  }

  function showModal({ eyebrow = 'RALYA', title, html }) {
    const modal = createModal();
    $('#ralyaModalEyebrow', modal).textContent = eyebrow;
    $('#ralyaModalTitle', modal).textContent = title;
    $('#ralyaModalBody', modal).innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('.ralya-modal-close', modal)?.focus(), 0);
  }

  function closeModal() {
    const modal = $('#ralyaModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  const protocolDetails = {
    '01': {
      title: 'Request',
      body: '<p><strong>Work begins with a defined request.</strong> A person, AI agent, machine or software service can specify the task, payment terms and expected result.</p><p>RALYA is being designed so the economic terms are explicit before value is put at risk.</p>',
    },
    '02': {
      title: 'Bond',
      body: '<p><strong>Economic security sits underneath the work.</strong> RLYA is designed for bonding, collateral and staking so a participant can put value at risk around performance.</p><p>The purpose is accountability — not forcing every practical payment to be made in RLYA.</p>',
    },
    '03': {
      title: 'Work',
      body: '<p><strong>The provider performs the requested work.</strong> The long-term RALYA protocol is intended to support work performed by AI agents, software, machines and people.</p><p>Execution and evidence can remain specialized while the economic layer stays consistent.</p>',
    },
    '04': {
      title: 'Settle',
      body: '<p><strong>Practical payment can settle in assets such as USDC.</strong> RLYA is designed to secure the economic relationship around the result through bond release, staking and accountability rules.</p><p>This separation lets RLYA act as the security asset underneath autonomous work rather than as the only payment currency.</p>',
    },
  };

  function makeNetworkClickable() {
    $$('.network-card .node:not(.core)').forEach(node => {
      const code = node.querySelector('span')?.textContent?.trim();
      const info = protocolDetails[code];
      if (!info) return;
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Open ${info.title} explanation`);
      const open = () => showModal({ eyebrow: `PROTOCOL STEP ${code}`, title: info.title, html: info.body });
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
  function registerTab(name, nodes) { tabMap[name] = nodes.filter(Boolean); }

  function createTabs() {
    if ($('#ralyaSiteTabs')) return;
    const tech = createTechnologySection();
    const engineering = $('section.dark-panel');
    const faq = $('section.faq');
    registerTab('home', [hero, $('#purpose'), presale]);
    registerTab('rlya', [$('#rlya')]);
    registerTab('technology', [tech]);
    registerTab('roadmap', [$('#build'), engineering]);
    registerTab('docs', [$('#open-source'), faq]);

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
      mobile.innerHTML = `<a href="#home" data-mobile-tab="home">Home</a><a href="#rlya" data-mobile-tab="rlya">RLYA</a><a href="#technology" data-mobile-tab="technology">Technology</a><a href="#build" data-mobile-tab="roadmap">Roadmap</a><a href="#open-source" data-mobile-tab="docs">Docs</a><a href="#presale" data-mobile-presale>Presale</a><a href="RALYA_Whitepaper_v1.2.html">Whitepaper v1.2</a><a href="https://x.com/Ralyaai" target="_blank" rel="noopener noreferrer">X / @Ralyaai</a><a href="https://tiktok.com/@ralyaai" target="_blank" rel="noopener noreferrer">TikTok / @ralyaai</a><a href="https://github.com/mandated86-stack/ralya-network" target="_blank" rel="noopener noreferrer">GitHub source</a>`;
    }
  }

  function createSocialRibbon() {
    if ($('#ralyaSocialRibbon')) return;
    const ribbon = document.createElement('div');
    ribbon.id = 'ralyaSocialRibbon';
    ribbon.className = 'social-ribbon';
    ribbon.innerHTML = `<span class="social-label">Official</span>
      <a href="${cfg.xUrl || 'https://x.com/Ralyaai'}" target="_blank" rel="noopener noreferrer" aria-label="RALYA on X"><span>𝕏</span><span>@Ralyaai</span></a>
      <a href="${cfg.tiktokUrl || 'https://tiktok.com/@ralyaai'}" target="_blank" rel="noopener noreferrer" aria-label="RALYA on TikTok"><span>♪</span><span>@ralyaai</span></a>
      <a href="${cfg.githubUrl || 'https://github.com/mandated86-stack/ralya-network'}" target="_blank" rel="noopener noreferrer" aria-label="RALYA source on GitHub"><span>⌘</span><span>GitHub source</span></a>`;
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
    if (scroll) {
      const target = anchor ? $(anchor) : tabMap[safe][0];
      const offset = innerWidth <= 950 ? 126 : 138;
      const top = Math.max(0, (target?.getBoundingClientRect().top || 0) + scrollY - offset);
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  function routeInitialHash() {
    const hash = location.hash.toLowerCase();
    if (hash === '#rlya') return setTab('rlya', { scroll: false });
    if (hash === '#technology') return setTab('technology', { scroll: false });
    if (hash === '#build' || hash === '#roadmap') return setTab('roadmap', { scroll: false });
    if (hash === '#open-source' || hash === '#docs') return setTab('docs', { scroll: false });
    setTab('home', { scroll: false });
    if (hash === '#presale') setTimeout(() => setTab('home', { scroll: true, anchor: '#presale' }), 80);
  }

  function wireTabs() {
    $('#ralyaSiteTabs')?.addEventListener('click', event => {
      const tab = event.target.closest('[data-site-tab]');
      if (tab) {
        setTab(tab.dataset.siteTab);
        history.replaceState(null, '', tab.dataset.siteTab === 'home' ? '#home' : `#${tab.dataset.siteTab}`);
        return;
      }
      if (event.target.closest('[data-presale-shortcut]')) {
        setTab('home', { anchor: '#presale' });
        history.replaceState(null, '', '#presale');
      }
    });

    document.addEventListener('click', event => {
      const mobileTab = event.target.closest('[data-mobile-tab]');
      if (mobileTab) {
        event.preventDefault();
        setTab(mobileTab.dataset.mobileTab);
        $('#mobileMenu')?.classList.remove('open');
        return;
      }
      const mobilePresale = event.target.closest('[data-mobile-presale]');
      if (mobilePresale) {
        event.preventDefault();
        setTab('home', { anchor: '#presale' });
        $('#mobileMenu')?.classList.remove('open');
        return;
      }
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href === '#presale') { event.preventDefault(); setTab('home', { anchor: '#presale' }); }
      else if (href === '#rlya') { event.preventDefault(); setTab('rlya'); }
      else if (href === '#purpose' || href === '#top' || href === '#home') { event.preventDefault(); setTab('home', { anchor: href === '#purpose' ? '#purpose' : null }); }
      else if (href === '#build') { event.preventDefault(); setTab('roadmap'); }
      else if (href === '#open-source') { event.preventDefault(); setTab('docs'); }
    });
  }

  function polishBuildLanguage() {
    const build = $('#build');
    if (!build) return;
    const heading = $('.section-head h2', build);
    const description = $('.section-head > p', build);
    if (heading) heading.textContent = 'Building toward Mainnet.';
    if (description) description.textContent = 'RALYA is progressing through live testing, production-readiness and launch-infrastructure milestones ahead of RLYA Mainnet.';
    const programTag = $('#programTag');
    if (programTag && /pre-launch/i.test(programTag.textContent || '')) programTag.textContent = 'DEVNET VERIFIED';
    const cards = $$('.build-grid article', build);
    cards.forEach(card => {
      const title = card.querySelector('h3')?.textContent?.trim();
      const tag = card.querySelector('.tag');
      if (title === 'Pre-launch product' && tag) { tag.textContent = 'PRIVATE TESTING'; tag.classList.remove('good','warn'); tag.classList.add('progress'); }
      if (title === 'Solana foundation' && tag && !/MAINNET/i.test(tag.textContent || '')) { tag.textContent = 'DEVNET VERIFIED'; tag.classList.remove('warn'); tag.classList.add('good'); }
    });
  }

  function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth <= 760; }
  function currentDappUrl() { return `${location.origin}${location.pathname}${location.search}${location.hash || '#presale'}`; }
  function phantomBrowseUrl() { return `https://phantom.app/ul/browse/${encodeURIComponent(currentDappUrl())}?ref=${encodeURIComponent(location.origin)}`; }
  function solflareBrowseUrl() { return `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentDappUrl())}?ref=${encodeURIComponent(location.origin)}`; }
  function trustBrowseUrl() { return `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(currentDappUrl())}`; }
  function metamaskBrowseUrl() { return `https://metamask.app.link/dapp/${location.host}${location.pathname}${location.search}${location.hash || '#presale'}`; }

  let nativeConnectPass = false;
  function triggerNativeConnect(originButton, providerOverride = null) {
    if (providerOverride) {
      try { window.solana = providerOverride; } catch { /* provider may expose a read-only global */ }
    }
    nativeConnectPass = true;
    closeModal();
    setTimeout(() => originButton.click(), 30);
  }

  function walletChoice(name, mark, detected, detail, onClick) {
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
      html: `<p>On mobile, RALYA can open the site inside a wallet's secure in-app browser when the normal browser cannot see the installed wallet.</p>
        <div class="wallet-picker">
          ${walletChoice('Phantom','P',phantom,'Direct Solana connection · recommended','')}
          ${walletChoice('Solflare','S',solflare,'Direct Solana connection','')}
          ${walletChoice('Trust Wallet','T',trust,'Solana wallet / mobile dApp browser','')}
          ${walletChoice('MetaMask','M',metamask,'Solana-capable MetaMask connection / app browser','')}
          ${generic && !phantom && !solflare && !trust ? walletChoice('Detected wallet','W',true,'Browser-provided Solana wallet','') : ''}
        </div>
        <div class="wallet-help"><strong>Already installed but not detected?</strong> This is common when a mobile wallet is installed as an app but RALYA is open in Chrome or Samsung Internet. Choose the wallet above to reopen RALYA inside that wallet's dApp browser.</div>`
    });

    const modal = $('#ralyaModal');
    modal?.querySelector('[data-wallet-choice="phantom"]')?.addEventListener('click', () => {
      if (phantom) triggerNativeConnect(originButton); else if (isMobile()) location.href = phantomBrowseUrl(); else window.open('https://phantom.com/download','_blank','noopener');
    });
    modal?.querySelector('[data-wallet-choice="solflare"]')?.addEventListener('click', () => {
      if (solflare) triggerNativeConnect(originButton); else if (isMobile()) location.href = solflareBrowseUrl(); else window.open('https://solflare.com','_blank','noopener');
    });
    modal?.querySelector('[data-wallet-choice="trust wallet"]')?.addEventListener('click', () => {
      if (trust) triggerNativeConnect(originButton, trustProvider); else if (isMobile()) location.href = trustBrowseUrl(); else window.open('https://trustwallet.com/download','_blank','noopener');
    });
    modal?.querySelector('[data-wallet-choice="metamask"]')?.addEventListener('click', () => {
      if (metamask) triggerNativeConnect(originButton, metamaskSolana); else if (isMobile()) location.href = metamaskBrowseUrl(); else window.open('https://metamask.io/download/','_blank','noopener');
    });
    modal?.querySelector('[data-wallet-choice="detected wallet"]')?.addEventListener('click', () => triggerNativeConnect(originButton));
  }

  function installWalletChooser() {
    document.addEventListener('click', event => {
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
      const linkField = $('#myReferralLink');
      const link = String(linkField?.value || '');
      if (!/^https?:\/\//i.test(link)) {
        openWalletPicker(connect);
        return;
      }
      showModal({
        eyebrow: 'RLYA REFERRAL',
        title: 'Share your link. Earn 1% USDC.',
        html: `<p>Your referred buyer pays the normal amount and keeps their full expected RLYA allocation. Your wallet receives <strong>1% of confirmed referred USDC purchases</strong>.</p>
          <div class="referral-link-row"><input id="quickReferralLink" readonly value="${link.replace(/"/g,'&quot;')}" /></div>
          <div class="share-actions"><button type="button" class="btn btn-primary" id="quickActivateCopy">Activate payout & copy</button><button type="button" class="btn btn-secondary" id="quickShareLink">Share link</button></div>
          <div class="wallet-help">The first time you activate referrals, your wallet may ask to create its Solana USDC receiving account. RALYA never asks for a seed phrase or private key.</div>`
      });
      $('#quickActivateCopy')?.addEventListener('click', () => {
        $('#copyReferralLink')?.click();
        uiToast('Referral activation started. Approve the wallet request if one appears.');
      });
      $('#quickShareLink')?.addEventListener('click', async () => {
        try {
          if (navigator.share) await navigator.share({ title: 'RALYA Presale', text: 'RLYA presale — use my referral link.', url: link });
          else { await navigator.clipboard.writeText(link); uiToast('Referral link copied.'); }
        } catch (err) {
          if (err?.name !== 'AbortError') uiToast('Could not open the share sheet. Copy the referral link instead.');
        }
      });
    });
  }

  function normalizeReleaseCopy() {
    const stakeStatus = $('#stakeStatus');
    if (stakeStatus) {
      const t = stakeStatus.textContent || '';
      if (/locked to Buy \+ Stake/i.test(t)) stakeStatus.textContent = 'This wallet is locked to Buy + Stake: +5% RLYA, unlock 21 days after public launch.';
      else if (/locked to standard/i.test(t)) stakeStatus.textContent = 'This wallet is locked to standard release: actual RLYA 1 day before public launch.';
    }
    const delivery = $('#allocationDelivery');
    if (delivery) {
      const t = delivery.textContent || '';
      if (/Buy \+ Stake/i.test(t)) delivery.textContent = 'Buy + Stake: base + 5% bonus unlock 21 days after public launch';
      else if (/Standard/i.test(t)) delivery.textContent = 'Standard: actual RLYA 1 day before public launch';
    }
    const avg = $('#averagePrice');
    if (avg) avg.textContent = (avg.textContent || '')
      .replace(/release day 36/gi, 'unlock day 21')
      .replace(/standard release day 21/gi, 'standard release T-1');
    const msg = $('#buyMessage');
    if (msg) msg.textContent = (msg.textContent || '')
      .replace(/36-day release schedule/gi, 'day-21 unlock schedule')
      .replace(/standard 21-day release schedule/gi, 'standard T-1 release schedule')
      .replace(/standard 21-day release/gi, 'standard T-1 release');
    const result = $('#txResult');
    if (result && !result.hidden) {
      if (/staking bonus/i.test(result.innerHTML)) result.innerHTML = result.innerHTML.replace(/36 days after public launch/gi, '21 days after public launch');
      else result.innerHTML = result.innerHTML.replace(/21 days after public launch/gi, '1 day before public launch');
    }
    if (!cfg.prelaunchCheckoutEnabled) {
      if ($('#presaleHeroStatus')) $('#presaleHeroStatus').textContent = 'RLYA PRESALE • PRIVATE TESTING';
      if ($('#presaleEyebrow')) $('#presaleEyebrow').textContent = 'RLYA PRESALE • PRIVATE TESTING';
      if ($('#presaleHeroCta')) $('#presaleHeroCta').textContent = 'View RLYA presale';
    }
  }

  function observeDynamicCopy() {
    const targets = ['stakeStatus','allocationDelivery','averagePrice','buyMessage','txResult'].map(id => document.getElementById(id)).filter(Boolean);
    const observer = new MutationObserver(() => normalizeReleaseCopy());
    targets.forEach(node => observer.observe(node, { childList: true, subtree: true, characterData: true }));
    normalizeReleaseCopy();
  }

  function init() {
    createTabs();
    createSocialRibbon();
    makeNetworkClickable();
    polishBuildLanguage();
    wireTabs();
    installWalletChooser();
    installReferralShortcut();
    observeDynamicCopy();
    routeInitialHash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
