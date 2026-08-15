import { ConnectorClient, getDefaultConfig } from '@solana/connector/headless';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';
import bs58 from 'bs58';

const cfg = window.RALYA_CONFIG || {};
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const MAINNET_CHAIN = 'solana:mainnet';
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth <= 760;
const android = /Android/i.test(navigator.userAgent);
const rpcUrl = new URL(cfg.rpcEndpoint || '/api/solana/rpc', location.origin).href;
const nativeFetch = window.fetch.bind(window);
const SLIPPAGE_STORAGE_KEY = 'ralya:presale-slippage-bps:v1';
const DEFAULT_SLIPPAGE_BPS = 100;
const MAX_SLIPPAGE_BPS = 500;
const RLYA_UNIT = 1_000_000_000n;
const USDC_UNIT = 1_000_000n;

const canonicalUrl = () => {
  const base = new URL(cfg.projectUrl || location.origin);
  base.pathname = '/presale';
  base.search = location.search;
  base.hash = '';
  return base.toString();
};

// Register the official Solana Mobile Wallet Adapter before ConnectorKit discovers wallets.
// On supported Android wallets this opens the wallet authorization flow while RALYA remains
// in the user's browser instead of navigating the site into a wallet's internal dapp browser.
if (android && window.isSecureContext) {
  try {
    registerMwa({
      appIdentity: {
        uri: new URL(cfg.projectUrl || location.origin).origin,
        name: 'RALYA',
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: [MAINNET_CHAIN],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
  } catch (err) {
    console.warn('RALYA mobile wallet authorization registration unavailable:', err?.message || err);
  }
}

const client = new ConnectorClient(getDefaultConfig({
  appName: 'RALYA',
  appUrl: cfg.projectUrl || location.origin,
  autoConnect: true,
  enableMobile: true,
  network: 'mainnet-beta',
  clusters: [{ id: MAINNET_CHAIN, label: 'Solana Mainnet', url: rpcUrl }],
  wallets: {
    featured: ['Mobile Wallet Adapter', 'Phantom', 'Solflare', 'Trust Wallet', 'MetaMask', 'Backpack', 'WalletConnect'],
  },
  walletConnect: cfg.walletConnectProjectId
    ? {
        projectId: cfg.walletConnectProjectId,
        metadata: {
          name: 'RALYA',
          description: 'RALYA presale wallet connection',
          url: cfg.projectUrl || location.origin,
          icons: [`${new URL(cfg.projectUrl || location.origin).origin}/rlya-token.png`],
        },
        defaultChain: MAINNET_CHAIN,
      }
    : false,
}));
window.RALYA_CONNECTOR_CLIENT = client;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function shorten(value) {
  const s = String(value || '');
  return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-6)}` : s;
}
function shortenTiny(value) {
  const s = String(value || '');
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}
function stateAccount(state = client.getSnapshot()) {
  const wallet = state.selectedWallet;
  const address = String(state.selectedAccount || state.wallet?.session?.selectedAccount?.address || '');
  const account = wallet?.accounts?.find?.(row => String(row.address) === address) || wallet?.accounts?.[0] || null;
  return { wallet, account, address: String(account?.address || address) };
}
function extractBytes(value, key) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.length) return extractBytes(value[0], key);
  if (value && typeof value === 'object') {
    if (key && value[key] != null) return extractBytes(value[key], key);
    if (value.signature != null) return extractBytes(value.signature, key);
    if (value.signedTransaction != null) return extractBytes(value.signedTransaction, key);
    if (Array.isArray(value.signedTransactions) && value.signedTransactions.length) return extractBytes(value.signedTransactions[0], key);
  }
  throw new Error('Wallet returned an unsupported response format.');
}
function extractSignature(value) {
  if (typeof value === 'string') return value;
  const bytes = extractBytes(value, 'signature');
  return bs58.encode(bytes);
}
function serializeTransaction(tx) {
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

function providerFromConnector() {
  const state = client.getSnapshot();
  const { wallet, account, address } = stateAccount(state);
  if (!wallet || !account || !address) return null;
  const features = wallet.features || {};
  const chain = account.chains?.includes?.(MAINNET_CHAIN) ? MAINNET_CHAIN : (account.chains?.[0] || MAINNET_CHAIN);

  const adapter = {
    isConnected: true,
    publicKey: new PublicKey(address),
    async connect() {
      return { publicKey: new PublicKey(address) };
    },
    async disconnect() {
      await client.disconnectWallet();
    },
    async signMessage(message) {
      const feature = features['solana:signMessage'];
      if (!feature?.signMessage) throw new Error('Selected wallet does not support Solana message signing.');
      const result = await feature.signMessage({ account, message: message instanceof Uint8Array ? message : new Uint8Array(message), chain });
      return { signature: extractBytes(result, 'signature') };
    },
    async signTransaction(tx) {
      const feature = features['solana:signTransaction'];
      if (!feature?.signTransaction) throw new Error('Selected wallet does not support Solana transaction signing.');
      const serialized = serializeTransaction(tx);
      let result;
      try {
        result = await feature.signTransaction({ account, transactions: [serialized], chain });
      } catch {
        result = await feature.signTransaction({ account, transaction: serialized, chain });
      }
      return Transaction.from(extractBytes(result, 'signedTransaction'));
    },
  };
  const sendFeature = features['solana:signAndSendTransaction'];
  if (sendFeature?.signAndSendTransaction) {
    adapter.signAndSendTransaction = async tx => {
      const serialized = serializeTransaction(tx);
      let result;
      try {
        result = await sendFeature.signAndSendTransaction({ account, transactions: [serialized], chain });
      } catch {
        result = await sendFeature.signAndSendTransaction({ account, transaction: serialized, chain });
      }
      return { signature: extractSignature(result) };
    };
  }
  return adapter;
}

let installedWalletAddress = '';
function installProvider() {
  const adapter = providerFromConnector();
  if (!adapter) return false;
  const address = adapter.publicKey.toBase58();
  const changed = address !== installedWalletAddress;
  installedWalletAddress = address;
  window.RALYA_WALLET_PROVIDER = adapter;
  if (changed) window.dispatchEvent(new CustomEvent('ralya:wallet-standard-connected', { detail: { address } }));
  return true;
}

function ensureHeaderWalletChip() {
  let chip = $('#ralyaHeaderWallet');
  if (chip) return chip;
  const header = $('.header');
  if (!header) return null;
  chip = document.createElement('button');
  chip.type = 'button';
  chip.id = 'ralyaHeaderWallet';
  chip.className = 'ralya-header-wallet';
  chip.setAttribute('data-wallet-connect', '');
  chip.innerHTML = '<span class="ralya-wallet-chip-dot"></span><span data-wallet-chip-text>Connect</span>';
  const menu = $('#menuButton', header);
  if (menu) header.insertBefore(chip, menu); else header.appendChild(chip);
  return chip;
}
function syncHeaderWallet(address = '') {
  const chip = ensureHeaderWalletChip();
  if (!chip) return;
  const label = $('[data-wallet-chip-text]', chip);
  if (address) {
    chip.classList.add('connected');
    chip.title = `Connected wallet ${address}`;
    if (label) label.textContent = shortenTiny(address);
  } else {
    chip.classList.remove('connected');
    chip.title = 'Connect Solana wallet';
    if (label) label.textContent = 'Connect';
  }
}

function ensureModal() {
  let modal = $('#ralyaWalletModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'ralyaWalletModal';
  modal.className = 'ralya-wallet-modal';
  modal.hidden = true;
  modal.innerHTML = `<div class="ralya-wallet-backdrop" data-rlya-wallet-close></div>
    <section class="ralya-wallet-sheet" role="dialog" aria-modal="true" aria-labelledby="ralyaWalletTitle">
      <div class="ralya-wallet-head"><div><span>SOLANA WALLET</span><h3 id="ralyaWalletTitle">Connect to RALYA</h3></div><button type="button" data-rlya-wallet-close aria-label="Close">×</button></div>
      <p class="ralya-wallet-intro">Choose a wallet. On supported Android wallets, RALYA opens the wallet authorization screen and stays in this browser.</p>
      <div class="ralya-wallet-list" id="ralyaWalletList"></div>
      <p class="ralya-wallet-foot">RALYA never asks for a seed phrase or private key.</p>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-rlya-wallet-close]')) closeModal();
  });
  return modal;
}
function closeModal() {
  const modal = $('#ralyaWalletModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function isMwaConnector(connector) {
  return /mobile wallet adapter/i.test(String(connector?.name || ''));
}
function connectorRow(connector) {
  const mwa = isMwaConnector(connector);
  const displayName = mwa ? 'Mobile Wallet' : connector.name;
  const icon = connector.icon ? `<img src="${connector.icon}" alt="" />` : `<span class="ralya-wallet-letter">${String(displayName || 'W').slice(0, 1).toUpperCase()}</span>`;
  const detail = mwa
    ? 'Authorize in your wallet · RALYA stays in this browser'
    : connector.ready === false
      ? 'Detected · waiting for wallet'
      : 'Detected wallet · authorize connection';
  return `<button type="button" class="ralya-wallet-choice${mwa ? ' mobile-auth' : ''}" data-connector-id="${String(connector.id).replace(/"/g, '&quot;')}">${icon}<span><strong>${displayName}</strong><small>${detail}</small></span><b>${mwa ? 'AUTHORIZE' : 'CONNECT'}</b></button>`;
}
function mobileAuthorizationRow(name) {
  return `<button type="button" class="ralya-wallet-choice mobile-auth" data-mobile-authorize="${name.toLowerCase()}"><span class="ralya-wallet-letter">${name[0]}</span><span><strong>${name}</strong><small>Use Android wallet authorization — do not open RALYA inside the wallet browser</small></span><b>AUTHORIZE</b></button>`;
}
function appendWalletError(message) {
  const list = $('#ralyaWalletList');
  if (!list) return;
  list.querySelector('.ralya-wallet-error')?.remove();
  const note = document.createElement('p');
  note.className = 'ralya-wallet-error';
  note.textContent = message;
  list.appendChild(note);
}

async function connectConnector(connectorId) {
  const list = $('#ralyaWalletList');
  if (list) list.classList.add('busy');
  try {
    await client.connectWallet(connectorId, { silent: false, allowInteractiveFallback: true });
    if (!installProvider()) throw new Error('Wallet connected without a usable Solana account.');
    closeModal();
    runNativeConnect();
  } catch (err) {
    appendWalletError(err?.message || 'Wallet connection was cancelled.');
  } finally {
    list?.classList.remove('busy');
  }
}

async function connectMobileAuthorization() {
  const list = $('#ralyaWalletList');
  list?.classList.add('busy');
  try {
    let connector = client.getSnapshot().connectors?.find(isMwaConnector);
    if (!connector) {
      await sleep(250);
      connector = client.getSnapshot().connectors?.find(isMwaConnector);
    }
    if (!connector) throw new Error('No compatible Android authorization wallet answered. Try Phantom or Solflare, or use WalletConnect when available.');
    await connectConnector(connector.id);
  } catch (err) {
    appendWalletError(err?.message || 'Mobile wallet authorization was not available.');
  } finally {
    list?.classList.remove('busy');
  }
}

function runNativeConnect() {
  const button = $('.header-actions [data-wallet-connect]') || $('.buy-head [data-wallet-connect]');
  if (!button) {
    window.dispatchEvent(new CustomEvent('ralya:wallet-standard-connected'));
    return;
  }
  button.removeAttribute('data-wallet-connect');
  button.click();
  button.setAttribute('data-wallet-connect', '');
}

function renderWalletList(modal) {
  const list = $('#ralyaWalletList', modal);
  const state = client.getSnapshot();
  const connectors = (state.connectors || []).filter(row => row && row.name);
  const preferred = ['Mobile Wallet Adapter', 'Phantom', 'Solflare', 'Trust Wallet', 'WalletConnect', 'MetaMask', 'Backpack'];
  connectors.sort((a, b) => {
    const ai = preferred.findIndex(name => name.toLowerCase() === String(a.name).toLowerCase());
    const bi = preferred.findIndex(name => name.toLowerCase() === String(b.name).toLowerCase());
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || String(a.name).localeCompare(String(b.name));
  });
  const names = new Set(connectors.map(row => String(row.name).toLowerCase()));
  list.innerHTML = connectors.map(connectorRow).join('');

  // Never fall back to a "browse this website inside the wallet" deep link. If a branded
  // wallet has not exposed Wallet Standard, Android uses Mobile Wallet Adapter authorization.
  if (android) {
    for (const name of ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask']) {
      if (!names.has(name.toLowerCase())) list.insertAdjacentHTML('beforeend', mobileAuthorizationRow(name));
    }
  }
  if (!connectors.length && !android) {
    list.innerHTML = '<p class="ralya-wallet-empty">No compatible wallet was detected in this browser. Use a Wallet Standard wallet or WalletConnect-compatible Solana wallet.</p>';
  }

  list.querySelectorAll('[data-connector-id]').forEach(button => button.addEventListener('click', () => connectConnector(button.dataset.connectorId), { once: true }));
  list.querySelectorAll('[data-mobile-authorize]').forEach(button => button.addEventListener('click', () => connectMobileAuthorization(), { once: true }));
}

async function openWalletChooser() {
  const modal = ensureModal();
  const list = $('#ralyaWalletList', modal);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (list) list.innerHTML = '<p class="ralya-wallet-empty">Checking available wallets…</p>';
  // The official MWA package registers its Wallet Standard entry from the user's click.
  // Give that registration event a moment to reach ConnectorKit before rendering choices.
  if (android) await sleep(120);
  renderWalletList(modal);
}

function enhanceWalletCtas() {
  ensureHeaderWalletChip();
  const hero = $('.hero-copy');
  if (hero && !$('#heroWalletCta')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'heroWalletCta';
    button.className = 'btn btn-primary wallet-button ralya-hero-wallet';
    button.setAttribute('data-wallet-connect', '');
    button.textContent = 'Connect Wallet — Enter Presale';
    const row = $('.cta-row', hero);
    if (row) row.insertAdjacentElement('beforebegin', button); else hero.appendChild(button);
  }
  const cardButton = $('.buy-head [data-wallet-connect]');
  if (cardButton) {
    cardButton.textContent = 'Connect Wallet';
    cardButton.classList.remove('btn-secondary');
    cardButton.classList.add('btn-primary', 'ralya-presale-connect');
  }
}

let latestPresaleState = null;
function getSlippageBps() {
  const raw = Number(localStorage.getItem(SLIPPAGE_STORAGE_KEY));
  if (Number.isInteger(raw) && raw >= 0 && raw <= MAX_SLIPPAGE_BPS) return raw;
  return DEFAULT_SLIPPAGE_BPS;
}
function setSlippageBps(value) {
  const bps = Math.max(0, Math.min(MAX_SLIPPAGE_BPS, Math.round(Number(value) || 0)));
  localStorage.setItem(SLIPPAGE_STORAGE_KEY, String(bps));
  syncSlippageControls();
  updateSlippagePreview();
  return bps;
}
function decimalToBase(value, decimals) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('Enter a valid USDC amount.');
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}
const minBig = (a, b) => a < b ? a : b;
const ceilDiv = (n, d) => (n + d - 1n) / d;
function previewBaseRlya(state, usdcBase) {
  if (!state?.presaleCapBase) throw new Error('Live presale state is unavailable.');
  const cap = BigInt(state.presaleCapBase);
  const step = BigInt(state.stepSizeBase);
  const base = BigInt(state.basePriceMicroUsdc);
  const increment = BigInt(state.stepIncrementMicroUsdc);
  let progress = BigInt(state.quoteProgressBase || state.totalAllocatedBase || 0);
  let remaining = BigInt(usdcBase);
  let allocation = 0n;
  let loops = 0;
  while (remaining > 0n) {
    if (progress >= cap) throw new Error('Presale allocation is fully reserved.');
    if (++loops > 512) throw new Error('Order crosses too many price steps.');
    const idx = progress / step;
    const price = base + idx * increment;
    const boundary = minBig((idx + 1n) * step, cap);
    const available = boundary - progress;
    const fillCost = ceilDiv(available * price, RLYA_UNIT);
    if (remaining >= fillCost) {
      allocation += available;
      progress += available;
      remaining -= fillCost;
    } else {
      const part = remaining * RLYA_UNIT / price;
      if (part <= 0n || part > available) throw new Error('Purchase amount is too small at the current price.');
      allocation += part;
      remaining = 0n;
    }
  }
  return allocation;
}
function formatRlyaBase(base, maxFraction = 2) {
  const n = BigInt(base || 0);
  const whole = n / RLYA_UNIT;
  let frac = (n % RLYA_UNIT).toString().padStart(9, '0').slice(0, maxFraction).replace(/0+$/, '');
  return `${Number(whole).toLocaleString()}${frac ? `.${frac}` : ''}`;
}
function ensureSlippageControls() {
  if ($('#ralyaSlippage')) return;
  const amount = $('.buy-card .amount-box');
  if (!amount) return;
  const panel = document.createElement('div');
  panel.id = 'ralyaSlippage';
  panel.className = 'ralya-slippage';
  panel.innerHTML = `
    <div class="ralya-slippage-head"><span>PRICE SLIPPAGE</span><strong id="ralyaSlippageValue">1.00%</strong></div>
    <div class="ralya-slippage-options">
      <button type="button" data-slippage-bps="50">0.5%</button>
      <button type="button" data-slippage-bps="100">1%</button>
      <button type="button" data-slippage-bps="200">2%</button>
      <label>Custom <input id="ralyaSlippageCustom" type="number" min="0" max="5" step="0.1" inputmode="decimal" aria-label="Custom slippage percent" />%</label>
    </div>
    <small id="ralyaSlippageMinimum">Minimum RLYA output will be protected when you request a quote.</small>`;
  amount.insertAdjacentElement('afterend', panel);
  panel.querySelectorAll('[data-slippage-bps]').forEach(button => button.addEventListener('click', () => setSlippageBps(Number(button.dataset.slippageBps))));
  $('#ralyaSlippageCustom', panel)?.addEventListener('change', event => {
    const percent = Math.max(0, Math.min(5, Number(event.target.value) || 0));
    setSlippageBps(Math.round(percent * 100));
  });
  $('#usdcInput')?.addEventListener('input', updateSlippagePreview);
  syncSlippageControls();
  updateSlippagePreview();
}
function syncSlippageControls() {
  const panel = $('#ralyaSlippage');
  if (!panel) return;
  const bps = getSlippageBps();
  const value = $('#ralyaSlippageValue', panel);
  if (value) value.textContent = `${(bps / 100).toFixed(2)}%`;
  panel.querySelectorAll('[data-slippage-bps]').forEach(button => button.classList.toggle('active', Number(button.dataset.slippageBps) === bps));
  const custom = $('#ralyaSlippageCustom', panel);
  if (custom) custom.value = [50, 100, 200].includes(bps) ? '' : (bps / 100).toFixed(1).replace(/\.0$/, '');
}
function updateSlippagePreview() {
  const output = $('#ralyaSlippageMinimum');
  if (!output) return;
  try {
    const usdcBase = decimalToBase($('#usdcInput')?.value || '', 6);
    if (usdcBase < USDC_UNIT) throw new Error('Minimum purchase is 1 USDC.');
    const expected = previewBaseRlya(latestPresaleState, usdcBase);
    const bps = BigInt(getSlippageBps());
    const minimum = expected * (10_000n - bps) / 10_000n;
    output.textContent = `Protected minimum: ${formatRlyaBase(minimum, 2)} base RLYA · quote cancels below this amount.`;
  } catch {
    output.textContent = 'Minimum RLYA output will be protected when you request a quote.';
  }
}
async function refreshLatestPresaleState() {
  try {
    const response = await nativeFetch('/api/presale/state', { cache: 'no-store' });
    if (!response.ok) return null;
    const detail = await response.json();
    if (detail?.backendReady !== false) latestPresaleState = detail;
    updateSlippagePreview();
    return detail;
  } catch {
    return null;
  }
}
function installSlippageQuoteGuard() {
  if (window.__RALYA_SLIPPAGE_FETCH_INSTALLED__) return;
  window.__RALYA_SLIPPAGE_FETCH_INSTALLED__ = true;
  window.fetch = async (input, init = {}) => {
    let url;
    try { url = new URL(typeof input === 'string' ? input : input.url, location.origin); }
    catch { return nativeFetch(input, init); }
    const method = String(init?.method || (typeof input !== 'string' ? input.method : 'GET') || 'GET').toUpperCase();
    if (url.origin === location.origin && url.pathname === '/api/presale/quote' && method === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        const live = await refreshLatestPresaleState();
        if (!live || live.backendReady === false) {
          return new Response(JSON.stringify({ error: 'Could not verify live presale state for slippage protection. Refresh and try again.' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          });
        }
        const gross = decimalToBase(body.usdcAmount, 6);
        const expected = previewBaseRlya(live, gross);
        const bps = getSlippageBps();
        const minimum = expected * BigInt(10_000 - bps) / 10_000n;
        body.slippageBps = bps;
        body.minRlyaBase = minimum.toString();
        init = { ...init, body: JSON.stringify(body) };
      } catch (err) {
        return new Response(JSON.stringify({ error: err?.message || 'Could not apply slippage protection.' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return nativeFetch(input, init);
  };
}

function ensureStateNotice() {
  if ($('#ralyaStateNotice')) return;
  const panel = $('#marketPanel');
  if (!panel) return;
  const notice = document.createElement('p');
  notice.id = 'ralyaStateNotice';
  notice.className = 'ralya-state-notice';
  notice.hidden = true;
  panel.insertAdjacentElement('afterend', notice);
}
function applyState(detail) {
  ensureStateNotice();
  if (detail?.backendReady !== false) latestPresaleState = detail;
  updateSlippagePreview();
  const notice = $('#ralyaStateNotice');
  if (!detail || detail.backendReady === false) {
    if (notice) { notice.hidden = false; notice.textContent = 'Live presale data reconnecting… purchasing remains disabled until the verified state returns.'; }
    return;
  }
  if (notice) notice.hidden = true;
  const open = detail.access === 'open';
  const paused = detail.access === 'paused';
  const heroStatus = $('#presaleHeroStatus');
  const eyebrow = $('#presaleEyebrow');
  const heading = $('#presaleHeading');
  if (heroStatus) heroStatus.textContent = open ? 'RLYA PRESALE • LIVE' : paused ? 'RLYA PRESALE • TEMPORARILY PAUSED' : 'RLYA PRESALE • FINAL SETUP';
  if (eyebrow) eyebrow.textContent = open ? 'RLYA PRESALE • LIVE' : paused ? 'RLYA PRESALE • PAUSED' : 'RLYA PRESALE • FINAL SETUP';
  if (heading) heading.textContent = open ? 'Secure your pre-launch RLYA allocation.' : paused ? 'RLYA presale is temporarily paused.' : '288M base RLYA is reserved for the public presale.';
}

function installCaptureChooser() {
  window.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-wallet-connect]');
    if (!button) return;
    event.preventDefault();
    // Do not use stopImmediatePropagation here: the official Mobile Wallet Adapter also
    // registers from the user's click event and must be allowed to receive it.
    event.stopPropagation();
    void openWalletChooser();
  }, true);
}

function syncConnectedState(state = client.getSnapshot()) {
  if (state.wallet?.status !== 'connected' && !state.connected) {
    installedWalletAddress = '';
    window.RALYA_WALLET_PROVIDER = null;
    syncHeaderWallet('');
    return;
  }
  if (!installProvider()) return;
  const { address } = stateAccount(state);
  if (address) {
    $$('.wallet-button').forEach(button => { button.textContent = shorten(address); });
    syncHeaderWallet(address);
  }
}

function init() {
  enhanceWalletCtas();
  ensureSlippageControls();
  ensureStateNotice();
  installSlippageQuoteGuard();
  installCaptureChooser();
  syncConnectedState();
  client.subscribe(syncConnectedState);
  window.addEventListener('ralya:presale-state', event => applyState(event.detail));
  void refreshLatestPresaleState();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
