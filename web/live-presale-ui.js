(() => {
  if (/^\/owner(?:\/|$)/.test(location.pathname)) return;

  let lastPrice = null;
  let copyPassQueued = false;

  const exactCopyReplacements = [
    ['PRESALE ALLOCATION', 'PRESALE PURCHASE'],
    ['RLYA ALLOCATION CONFIRMED', 'RLYA PURCHASE CONFIRMED'],
    ['Purchased allocation:', 'RLYA purchased:'],
    ['Locked allocation', 'Purchase locked'],
    ['Approve the allocation quote', 'Approve the purchase quote'],
    ['Verifying your RLYA allocation', 'Verifying your RLYA purchase'],
    ['RLYA allocation recorded now', 'RLYA purchase recorded now'],
    ['an allocation is recorded', 'a purchase is recorded'],
    ['the base allocation, any fixed 5% staking bonus', 'the RLYA purchased, any fixed 5% staking bonus'],
    ['base allocation plus the fixed 5% bonus stay locked', 'purchased RLYA plus the fixed 5% bonus stay locked'],
    ['your base allocation plus fixed 5% RLYA bonus', 'your purchased RLYA plus the fixed 5% RLYA bonus'],
    ['Your base RLYA + fixed 5% bonus', 'Your purchased RLYA + fixed 5% bonus'],
  ];

  function replaceBuyerCopy(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,code,pre')) continue;
      const text = node.nodeValue || '';
      let next = text;
      for (const [from, to] of exactCopyReplacements) next = next.split(from).join(to);
      next = next.replace(/your RLYA allocation/gi, 'your purchased RLYA');
      next = next.replace(/RLYA allocation confirmed/gi, 'RLYA purchase confirmed');
      next = next.replace(/allocation recorded now/gi, 'purchase recorded now');
      if (next !== text) node.nodeValue = next;
    }
  }

  function queueCopyPass() {
    if (copyPassQueued) return;
    copyPassQueued = true;
    requestAnimationFrame(() => {
      copyPassQueued = false;
      replaceBuyerCopy(document.body);
      syncWalletSummary();
    });
  }

  function ensureStyle() {
    if (document.getElementById('ralyaLivePriceStyle')) return;
    const style = document.createElement('style');
    style.id = 'ralyaLivePriceStyle';
    style.textContent = `
      #currentPrice.ralya-live-price{font-variant-numeric:tabular-nums;letter-spacing:-.02em}
      .ralya-live-price-trend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0b7f68}
      .ralya-live-price-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:rgba(16,185,129,.10);border:1px solid rgba(16,185,129,.28);color:#078268}
      .ralya-live-price-arrow{display:inline-block;color:#10b981;font-size:14px;animation:ralyaPriceArrow 1.8s ease-in-out infinite}
      .ralya-live-price-copy{color:#078268;font-size:14px;font-weight:900;letter-spacing:.02em}
      .ralya-price-tick{animation:ralyaPriceTick .8s ease-out}
      @keyframes ralyaPriceArrow{0%,100%{transform:translateY(1px);opacity:.72}50%{transform:translateY(-2px);opacity:1}}
      @keyframes ralyaPriceTick{0%{filter:drop-shadow(0 0 0 rgba(16,185,129,0))}40%{filter:drop-shadow(0 0 12px rgba(16,185,129,.35))}100%{filter:drop-shadow(0 0 0 rgba(16,185,129,0))}}
    `;
    document.head.appendChild(style);
  }

  function ensureTrend(priceEl) {
    const card = priceEl?.closest('article');
    if (!card) return null;
    const heading = card.querySelector(':scope > span');
    if (heading) heading.textContent = 'LIVE PRICE';
    let trend = card.querySelector('.ralya-live-price-trend');
    if (!trend) {
      trend = document.createElement('div');
      trend.className = 'ralya-live-price-trend';
      const unit = card.querySelector('small');
      if (unit) unit.insertAdjacentElement('afterend', trend); else card.appendChild(trend);
    }
    return trend;
  }

  function syncWalletSummary() {
    const summary = document.getElementById('soldRlya');
    if (!summary) return;

    const source = document.getElementById('rlyaBalance');
    const sourceText = String(source?.textContent || '').trim();
    const walletText = sourceText && sourceText !== '--' ? sourceText : '-- RLYA';
    if (summary.textContent !== walletText) summary.textContent = walletText;
    summary.setAttribute('aria-live', 'polite');

    const card = summary.closest('article');
    if (!card) return;
    const heading = card.querySelector(':scope > span');
    if (heading && heading.textContent !== 'YOUR RLYA') heading.textContent = 'YOUR RLYA';

    // This summary is personal to the connected wallet. Do not show global sold totals or
    // the old "of 288M public presale" line here.
    const oldSubline = card.querySelector(':scope > small');
    if (oldSubline) oldSubline.remove();
  }

  function applyState(detail) {
    if (!detail || detail.backendReady === false) return;
    ensureStyle();
    const priceEl = document.getElementById('currentPrice');
    if (priceEl) {
      const exact = String(detail.currentPriceUsdc || '').trim();
      const price = exact && /^\d+\.\d+$/.test(exact)
        ? exact
        : (Number(detail.currentPriceMicroUsdc || 0) / 1_000_000).toFixed(6);
      const numeric = Number(price);
      const changedUp = Number.isFinite(numeric) && lastPrice !== null && numeric > lastPrice;
      priceEl.textContent = `$${price}`;
      priceEl.classList.add('ralya-live-price');
      if (changedUp) {
        priceEl.classList.remove('ralya-price-tick');
        void priceEl.offsetWidth;
        priceEl.classList.add('ralya-price-tick');
      }
      if (Number.isFinite(numeric)) lastPrice = numeric;

      const trend = ensureTrend(priceEl);
      if (trend) {
        const start = Number(detail.basePriceMicroUsdc || 3000) / 1_000_000;
        const gain = Number.isFinite(numeric) && start > 0 ? ((numeric / start) - 1) * 100 : 0;
        const gainText = gain > 0.0001 ? `+${gain.toFixed(2)}% from presale start` : 'Rises as RLYA is purchased';
        trend.innerHTML = `<span class="ralya-live-price-badge"><span class="ralya-live-price-arrow">▲</span> LIVE</span><span class="ralya-live-price-copy">${gainText}</span>`;
      }
    }

    syncWalletSummary();
    queueCopyPass();
  }

  window.addEventListener('ralya:presale-state', event => applyState(event.detail));
  window.addEventListener('ralya:purchase-confirmed', () => {
    setTimeout(() => {
      fetch('/api/presale/state', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(applyState)
        .catch(() => {});
    }, 700);
  });

  const observer = new MutationObserver(() => {
    queueCopyPass();
    syncWalletSummary();
  });

  const start = () => {
    ensureStyle();
    replaceBuyerCopy(document.body);
    syncWalletSummary();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    fetch('/api/presale/state', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(applyState)
      .catch(() => {});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
