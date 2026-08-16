(() => {
  const RLYA_UNIT = 1_000_000_000n;
  const USDC_UNIT = 1_000_000n;
  const $ = (q, root = document) => root.querySelector(q);

  function formatBase(value, unit, maxFraction = 4) {
    const n = BigInt(value || 0);
    const whole = n / unit;
    let frac = (n % unit).toString().padStart(String(unit).length - 1, '0').slice(0, maxFraction).replace(/0+$/, '');
    return `${Number(whole).toLocaleString()}${frac ? `.${frac}` : ''}`;
  }
  function ensureModal() {
    let modal = $('#ralyaPurchaseCelebration');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'ralyaPurchaseCelebration';
    modal.className = 'ralya-celebration';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="ralya-celebration-backdrop"></div>
      <section class="ralya-celebration-card" role="dialog" aria-modal="true" aria-labelledby="ralyaCelebrationTitle">
        <button type="button" class="ralya-celebration-close" aria-label="Close">×</button>
        <div class="ralya-celebration-orbit"><span>R</span></div>
        <p class="ralya-celebration-kicker">PURCHASE CONFIRMED</p>
        <h2 id="ralyaCelebrationTitle">Welcome to RALYA 🎉</h2>
        <div class="ralya-celebration-amount" data-celebration-rlya>-- RLYA</div>
        <p class="ralya-celebration-paid" data-celebration-usdc></p>
        <div class="ralya-celebration-delivery" data-celebration-delivery></div>
        <p class="ralya-celebration-note"><strong>Not seeing RLYA in your wallet yet is normal.</strong> Your purchase is recorded against this same wallet. You do not need to claim anything.</p>
        <div class="ralya-celebration-actions">
          <button type="button" class="btn btn-primary" data-celebration-view>VIEW MY RLYA</button>
          <button type="button" class="btn btn-secondary" data-celebration-share>SHARE & EARN 1% USDC</button>
        </div>
        <a data-celebration-explorer target="_blank" rel="noopener">Verify transaction on Solana →</a>
        <div class="ralya-confetti" aria-hidden="true"></div>
      </section>`;
    document.body.appendChild(modal);
    const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
    $('.ralya-celebration-close', modal).addEventListener('click', close);
    $('.ralya-celebration-backdrop', modal).addEventListener('click', close);
    $('[data-celebration-view]', modal).addEventListener('click', () => {
      close();
      document.querySelector('.buy-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('[data-celebration-share]', modal).addEventListener('click', () => {
      close();
      document.getElementById('copyReferralLink')?.click();
    });
    return modal;
  }
  function makeConfetti(modal) {
    const host = $('.ralya-confetti', modal);
    if (!host) return;
    host.innerHTML = '';
    for (let i = 0; i < 42; i += 1) {
      const bit = document.createElement('i');
      bit.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
      bit.style.setProperty('--r', `${Math.round(Math.random() * 320 - 160)}deg`);
      bit.style.setProperty('--h', String(155 + Math.round(Math.random() * 55)));
      bit.style.setProperty('--d', `${(Math.random() * 1.2).toFixed(2)}s`);
      bit.style.setProperty('--t', `${(1.6 + Math.random() * 1.8).toFixed(2)}s`);
      host.appendChild(bit);
    }
  }
  window.addEventListener('ralya:purchase-confirmed', event => {
    const detail = event.detail || {};
    const modal = ensureModal();
    $('[data-celebration-rlya]', modal).textContent = `${formatBase(detail.totalRlyaBase, RLYA_UNIT, 4)} RLYA`;
    const usdc = formatBase(detail.grossUsdcBase, USDC_UNIT, 2);
    $('[data-celebration-usdc]', modal).textContent = usdc !== '0' ? `${usdc} USDC confirmed on Solana` : 'USDC payment confirmed on Solana';
    $('[data-celebration-delivery]', modal).innerHTML = detail.stake
      ? '<strong>BUY + STAKE · +5%</strong><span>Your base RLYA + fixed 5% bonus will be sent automatically to this same wallet 21 days after public launch.</span>'
      : '<strong>STANDARD DELIVERY</strong><span>Your RLYA will be sent automatically to this same wallet 1 day before public launch and will appear there automatically.</span>';
    const link = $('[data-celebration-explorer]', modal);
    if (link) link.href = detail.explorer || '#';
    makeConfetti(modal);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  });
})();
