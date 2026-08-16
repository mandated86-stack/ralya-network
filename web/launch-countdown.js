(() => {
  if (/^\/owner(?:\/|$)/.test(location.pathname)) return;
  const $ = (q, root = document) => root.querySelector(q);
  let targetAtMs = null;
  let timer = null;
  let lastHeroPrice = null;

  const pad = value => String(value).padStart(2, '0');

  function insertLaunchBoard() {
    if ($('#ralyaLaunchBoard')) return;
    const heroCopy = $('.hero-copy');
    const heading = heroCopy?.querySelector('h1');
    if (!heroCopy || !heading) return;
    const board = document.createElement('div');
    board.className = 'ralya-launch-board';
    board.id = 'ralyaLaunchBoard';
    board.innerHTML = `
      <article class="ralya-countdown-card" aria-label="RLYA DEX and exchange launch countdown">
        <span class="ralya-countdown-eyebrow">PUBLIC TRADING COUNTDOWN</span>
        <h2>RLYA DEX &amp; EXCHANGE LAUNCH</h2>
        <div class="ralya-countdown-grid">
          <div class="ralya-countdown-unit"><strong id="ralyaLaunchDays">--</strong><span>DAYS</span></div>
          <div class="ralya-countdown-unit"><strong id="ralyaLaunchHours">--</strong><span>HRS</span></div>
          <div class="ralya-countdown-unit"><strong id="ralyaLaunchMinutes">--</strong><span>MIN</span></div>
          <div class="ralya-countdown-unit"><strong id="ralyaLaunchSeconds">--</strong><span>SEC</span></div>
        </div>
        <p class="ralya-countdown-fomo"><strong>The countdown is moving. The price is too.</strong><br/>Presale price rises as RLYA is purchased — earlier buyers enter at lower price tiers.</p>
      </article>
      <article class="ralya-hero-price-card" aria-label="Live RLYA presale price">
        <span class="ralya-hero-price-label">LIVE RLYA PRICE</span>
        <strong class="ralya-hero-price" id="ralyaHeroLivePrice">--</strong>
        <div class="ralya-hero-price-trend"><span class="ralya-hero-price-badge"><span class="ralya-hero-price-arrow">▲</span> LIVE</span><span class="ralya-hero-price-gain" id="ralyaHeroPriceGain">Rises as RLYA is purchased</span></div>
      </article>`;
    heading.insertAdjacentElement('beforebegin', board);
  }

  function transformRoadmap() {
    const build = $('#build');
    if (!build || build.dataset.ralyaRoadmapV2 === '1') return;
    build.dataset.ralyaRoadmapV2 = '1';
    build.classList.add('ralya-roadmap-v2');
    const shell = build.querySelector('.shell');
    if (!shell) return;
    shell.innerHTML = `
      <div class="section-head"><div><span class="eyebrow">ROADMAP</span><h2>From presale to an autonomous economy.</h2></div><p>Core economics and the live presale foundation are already built. The next milestones take RLYA through Solana Mainnet, public trading, autonomous-work utility and finally a purpose-built RALYA blockchain.</p></div>
      <div class="ralya-roadmap-shell">
        <div class="ralya-roadmap-progress"><div><strong>RALYA BUILD PROGRESS</strong><small>Core economic + presale foundation built. Mainnet, trading and autonomous-work layers follow.</small><div class="ralya-progress-track"><div class="ralya-progress-fill"></div></div></div><div class="ralya-progress-value">56%</div></div>
        <div class="ralya-roadmap-list">
          <article class="ralya-milestone ralya-roadmap-complete"><div class="ralya-milestone-num">01</div><div><h3>Economic Model &amp; Supply Design</h3><p>839M lifetime maximum, presale allocation, staking-bonus reserve, referral economics and founder-lock model defined and tested.</p></div><span class="ralya-roadmap-badge">✓ COMPLETE</span></article>
          <article class="ralya-milestone ralya-roadmap-complete"><div class="ralya-milestone-num">02</div><div><h3>Solana Presale Infrastructure</h3><p>Wallet connection, verified USDC receipts, signed quotes, buyer records, owner tools and public presale state are operational.</p></div><span class="ralya-roadmap-badge">✓ COMPLETE</span></article>
          <article class="ralya-milestone ralya-roadmap-complete"><div class="ralya-milestone-num">03</div><div><h3>Buy + Stake &amp; Referral System</h3><p>Wallet-locked release choice, fixed +5% RLYA bonus and 1% USDC referral settlement are built into the presale flow.</p></div><span class="ralya-roadmap-badge">✓ COMPLETE</span></article>
          <article class="ralya-milestone ralya-roadmap-complete"><div class="ralya-milestone-num">04</div><div><h3>Public RLYA Presale</h3><p>Live USDC purchasing, live price progression and connected-wallet RLYA tracking.</p></div><span class="ralya-roadmap-badge">● LIVE NOW</span></article>
          <article class="ralya-milestone ralya-roadmap-next"><div class="ralya-milestone-num">05</div><div><h3>Solana Mainnet Launch</h3><p><span id="deployProgramItem">Production RLYA deployment</span>, Mainnet program activation and final supply/security controls.</p></div><span class="ralya-roadmap-badge" id="programTag">NEXT</span></article>
          <article class="ralya-milestone"><div class="ralya-milestone-num">06</div><div><h3>Presale Distribution</h3><p id="mintItem">Standard presale RLYA distributed T-1; Buy + Stake base + fixed 5% bonus unlocks T+21.</p></div><span class="ralya-roadmap-badge">PLANNED</span></article>
          <article class="ralya-milestone"><div class="ralya-milestone-num">07</div><div><h3>DEX &amp; Exchange Launch</h3><p>Public liquidity and trading begin. This milestone is tied directly to the homepage countdown.</p></div><span class="ralya-roadmap-badge">COUNTDOWN</span></article>
          <article class="ralya-milestone"><div class="ralya-milestone-num">08</div><div><h3>AI-to-AI Economy</h3><p>Autonomous agents commission work, settle practical payment and use RLYA for bonding, collateral and economic accountability.</p></div><span class="ralya-roadmap-badge">UTILITY</span></article>
          <article class="ralya-milestone ralya-roadmap-final"><div class="ralya-milestone-num">09</div><div><h3>RALYA Blockchain Deployed</h3><p>Final roadmap milestone: graduate from the initial Solana settlement foundation to RALYA's own purpose-built blockchain for autonomous economic activity.</p></div><span class="ralya-roadmap-badge">FINAL MILESTONE</span></article>
        </div>
        <div class="ralya-roadmap-note">Solana remains the initial settlement foundation. The RALYA blockchain stays at the end of the roadmap, after public trading and real autonomous-work utility are established.</div>
      </div>`;
  }

  function paintCountdown() {
    if (!Number.isFinite(targetAtMs)) return;
    let remaining = Math.max(0, targetAtMs - Date.now());
    const days = Math.floor(remaining / 86400000); remaining %= 86400000;
    const hours = Math.floor(remaining / 3600000); remaining %= 3600000;
    const minutes = Math.floor(remaining / 60000); remaining %= 60000;
    const seconds = Math.floor(remaining / 1000);
    const values = {
      ralyaLaunchDays: String(days),
      ralyaLaunchHours: pad(hours),
      ralyaLaunchMinutes: pad(minutes),
      ralyaLaunchSeconds: pad(seconds),
    };
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }
  }

  async function refreshCountdown() {
    try {
      const response = await fetch('/api/launch-countdown', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      const parsed = Date.parse(data?.targetAt || '');
      if (!Number.isFinite(parsed)) return;
      targetAtMs = parsed;
      paintCountdown();
      if (!timer) timer = setInterval(paintCountdown, 1000);
    } catch {
      // Countdown is supplemental and must never interfere with the presale.
    }
  }

  function applyPrice(detail) {
    if (!detail || detail.backendReady === false) return;
    const priceEl = $('#ralyaHeroLivePrice');
    const gainEl = $('#ralyaHeroPriceGain');
    if (!priceEl) return;
    const exact = String(detail.currentPriceUsdc || '').trim();
    const price = exact && /^\d+\.\d+$/.test(exact)
      ? exact
      : (Number(detail.currentPriceMicroUsdc || 0) / 1_000_000).toFixed(6);
    const numeric = Number(price);
    priceEl.textContent = `$${price}`;
    if (Number.isFinite(numeric) && lastHeroPrice !== null && numeric > lastHeroPrice) {
      priceEl.classList.remove('ralya-price-rise');
      void priceEl.offsetWidth;
      priceEl.classList.add('ralya-price-rise');
    }
    if (Number.isFinite(numeric)) lastHeroPrice = numeric;
    if (gainEl && Number.isFinite(numeric)) {
      const start = Number(detail.basePriceMicroUsdc || 3000) / 1_000_000;
      const gain = start > 0 ? ((numeric / start) - 1) * 100 : 0;
      gainEl.textContent = gain > 0.0001 ? `+${gain.toFixed(2)}% FROM PRESALE START` : 'Rises as RLYA is purchased';
    }
  }

  async function refreshPrice() {
    try {
      const response = await fetch('/api/presale/state', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (response.ok) applyPrice(await response.json());
    } catch {
      // Existing presale UI remains authoritative if this supplemental card cannot refresh.
    }
  }

  function init() {
    insertLaunchBoard();
    transformRoadmap();
    refreshCountdown();
    refreshPrice();
    window.addEventListener('ralya:presale-state', event => applyPrice(event.detail));
    setInterval(refreshCountdown, 30000);
    setInterval(refreshPrice, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
