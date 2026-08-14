(() => {
  const cfg = window.RALYA_CONFIG;
  const panel = document.getElementById('marketPanel');
  if (!cfg || !panel) return;

  const card = document.createElement('article');
  card.id = 'manualDistributionCard';
  card.innerHTML = '<span>Off-site / manual</span><strong id="manualRlya">--</strong><small>included in the distributed total</small>';
  panel.appendChild(card);

  const out = document.getElementById('manualRlya');
  const U64_OFFSET_MANUAL_SOLD = 216;
  const RLYA_UNIT = 1_000_000_000n;

  function readU64LE(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getBigUint64(offset, true);
  }

  function formatRlya(base) {
    const whole = base / RLYA_UNIT;
    const frac = (base % RLYA_UNIT).toString().padStart(9, '0').slice(0, 2).replace(/0+$/, '');
    return `${Number(whole).toLocaleString()}${frac ? `.${frac}` : ''} RLYA`;
  }

  async function refresh() {
    if (!cfg.salePda) {
      out.textContent = 'PENDING LAUNCH';
      return;
    }
    try {
      const response = await fetch(cfg.rpcEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [cfg.salePda, { encoding: 'base64', commitment: 'confirmed' }]
        })
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json();
      const encoded = body?.result?.value?.data?.[0];
      if (!encoded) throw new Error('Sale account unavailable');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      if (bytes.length < U64_OFFSET_MANUAL_SOLD + 8) throw new Error('Sale account is incomplete');
      out.textContent = formatRlya(readU64LE(bytes, U64_OFFSET_MANUAL_SOLD));
    } catch {
      out.textContent = 'RPC UNAVAILABLE';
    }
  }

  refresh();
  setInterval(refresh, 30_000);
})();
