(() => {
  const STAGE_ORDER = [
    'prelaunch',
    'mainnet_preparing',
    'mainnet_verified',
    'distribution_preparing',
    'distribution_scheduled',
    'launch_approaching',
  ];

  const styleId = 'ralya-launch-status-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .launch-public-card{margin:22px 0 0;padding:18px 20px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(7,24,34,.72);display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start}
      .launch-public-badge{font-size:10px;font-weight:900;letter-spacing:.12em;border-radius:999px;padding:7px 10px;background:#123b35;color:#72e6d5;white-space:nowrap}
      .launch-public-copy strong{display:block;font-size:16px;color:#eaf4f8;margin-bottom:4px}.launch-public-copy p{margin:0;color:#91a8b7;line-height:1.55}.launch-public-copy small{display:block;margin-top:7px;color:#708897}
      @media(max-width:640px){.launch-public-card{grid-template-columns:1fr}.launch-public-badge{width:max-content}}
    `;
    document.head.appendChild(style);
  }

  function apply(status) {
    if (!status || !status.stage) return;
    const networkStatus = document.getElementById('networkStatus');
    if (networkStatus && status.badge) networkStatus.textContent = status.badge;

    const build = document.getElementById('build');
    if (build) {
      const shell = build.querySelector('.shell');
      if (shell) {
        let card = document.getElementById('publicLaunchStageCard');
        if (!card) {
          card = document.createElement('div');
          card.id = 'publicLaunchStageCard';
          card.className = 'launch-public-card';
          const head = shell.querySelector('.section-head');
          if (head) head.insertAdjacentElement('afterend', card);
          else shell.prepend(card);
        }
        const note = status.note ? `<small>${escapeHtml(status.note)}</small>` : '';
        card.innerHTML = `<span class="launch-public-badge">${escapeHtml(status.badge || 'PRE-LAUNCH')}</span><div class="launch-public-copy"><strong>${escapeHtml(status.headline || '')}</strong><p>${escapeHtml(status.detail || '')}</p>${note}</div>`;
      }
    }

    const rank = STAGE_ORDER.indexOf(status.stage);
    const programTag = document.getElementById('programTag');
    const deployItem = document.getElementById('deployProgramItem');
    const mintItem = document.getElementById('mintItem');

    if (rank >= STAGE_ORDER.indexOf('mainnet_verified')) {
      if (programTag) {
        programTag.textContent = 'MAINNET VERIFIED';
        programTag.classList.remove('warn');
        programTag.classList.add('good');
      }
      if (deployItem) deployItem.classList.add('done');
    }
    if (rank >= STAGE_ORDER.indexOf('distribution_preparing') && mintItem) mintItem.classList.add('done');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  async function refresh() {
    try {
      const response = await fetch('/api/launch-status', { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) return;
      apply(await response.json());
    } catch {
      // Public status is supplementary; the core site continues to work if the status endpoint is unavailable.
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
  setInterval(refresh, 30000);
})();
