(() => {
  const SELECTORS = Object.freeze({
    'hero.lead': '.hero-copy > p.lead',
    'purpose.heading': '#purpose .section-head h2',
    'purpose.body': '#purpose .section-head > p',
    'rlya.heading': '#rlya .section-head h2',
    'rlya.body': '#rlya .section-head > p',
    'presale.heading': '#presale .section-head h2',
    'presale.body': '#presale .section-head > p',
    'build.heading': '#build .section-head h2',
    'build.body': '#build .section-head > p',
    'opensource.heading': '#open-source .section-head h2',
    'opensource.body': '#open-source .section-head > p',
    'engineering.heading': '.dark-panel .section-head h2',
  });
  const REFRESH_MS = 30_000;
  let refreshTimer = null;
  let lastEffective = '';

  async function readJson(url) {
    const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  }

  function apply(copy) {
    for (const [key, selector] of Object.entries(SELECTORS)) {
      const value = copy?.[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      const node = document.querySelector(selector);
      if (node && node.textContent !== value.trim()) node.textContent = value.trim();
    }
  }

  async function refresh() {
    let defaults = {};
    try { defaults = await readJson('/site-copy.json'); } catch { return; }
    let overrides = {};
    try {
      const live = await readJson('/api/site-content');
      overrides = live?.overrides && typeof live.overrides === 'object' ? live.overrides : {};
    } catch {
      // Static defaults remain the safe fallback if the live-copy service is unavailable.
    }
    const effective = { ...defaults, ...overrides };
    const fingerprint = JSON.stringify(effective);
    if (fingerprint === lastEffective) return;
    lastEffective = fingerprint;
    apply(effective);
    document.dispatchEvent(new CustomEvent('ralya:site-copy-applied', { detail: { effective } }));
  }

  function schedule() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
    }, REFRESH_MS);
  }

  window.RALYA_SITE_COPY = Object.freeze({ refresh });
  const init = () => {
    refresh().catch(() => {});
    schedule();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
