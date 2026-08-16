(() => {
  if (!/Android/i.test(navigator.userAgent)) return;
  const patch = () => {
    const intro = document.querySelector('.ralya-wallet-intro');
    if (intro) intro.textContent = 'Choose a wallet. Detected wallets connect here; otherwise tap OPEN APP to continue inside the selected wallet.';
    const list = document.getElementById('ralyaWalletList');
    if (!list) return;
    for (const row of [...list.querySelectorAll('[data-connector-id]')]) {
      if (/mobile wallet adapter/i.test(row.textContent || '')) row.remove();
    }
  };
  window.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-wallet-connect]')) setTimeout(patch, 0);
  }, true);
})();
