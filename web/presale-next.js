import { ConnectorClient, getDefaultConfig } from '@solana/connector/headless';
import { PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

const cfg = window.RALYA_CONFIG || {};
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const MAINNET_CHAIN = 'solana:mainnet';

const canonicalUrl = () => {
  const base = new URL(cfg.projectUrl || location.origin);
  base.pathname = location.pathname || '/';
  base.search = location.search;
  base.hash = '#presale';
  return base.toString();
};

const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth <= 760;
const rpcUrl = new URL(cfg.rpcEndpoint || '/api/solana/rpc', location.origin).href;

const client = new ConnectorClient(getDefaultConfig({
  appName: 'RALYA',
  appUrl: cfg.projectUrl || location.origin,
  autoConnect: true,
  enableMobile: true,
  network: 'mainnet-beta',
  clusters: [{ id: MAINNET_CHAIN, label: 'Solana Mainnet', url: rpcUrl }],
  wallets: {
    featured: ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask', 'Backpack'],
  },
}));
window.RALYA_CONNECTOR_CLIENT = client;

function shorten(value) {
  const s = String(value || '');
  return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-6)}` : s;
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

function installProvider() {
  const adapter = providerFromConnector();
  if (!adapter) return false;
  window.RALYA_WALLET_PROVIDER = adapter;
  window.dispatchEvent(new CustomEvent('ralya:wallet-standard-connected', { detail: { address: adapter.publicKey.toBase58() } }));
  return true;
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
      <p class="ralya-wallet-intro">Choose a wallet. RALYA connects in this browser when the wallet exposes Wallet Standard; app handoff is only offered as a fallback.</p>
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

const FALLBACKS = {
  phantom: () => `https://phantom.app/ul/browse/${encodeURIComponent(canonicalUrl())}?ref=${encodeURIComponent(cfg.projectUrl || location.origin)}`,
  solflare: () => `https://solflare.com/ul/v1/browse/${encodeURIComponent(canonicalUrl())}?ref=${encodeURIComponent(cfg.projectUrl || location.origin)}`,
  'trust wallet': () => `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(canonicalUrl())}`,
  metamask: () => {
    const u = new URL(canonicalUrl());
    return `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}${u.hash}`;
  },
};

function connectorRow(connector) {
  const icon = connector.icon ? `<img src="${connector.icon}" alt="" />` : `<span class="ralya-wallet-letter">${String(connector.name || 'W').slice(0, 1).toUpperCase()}</span>`;
  return `<button type="button" class="ralya-wallet-choice" data-connector-id="${String(connector.id).replace(/"/g, '&quot;')}">${icon}<span><strong>${connector.name}</strong><small>${connector.ready ? 'Wallet Standard · connect here' : 'Detected · waiting for wallet'}</small></span><b>${connector.ready ? 'CONNECT' : 'WAIT'}</b></button>`;
}
function fallbackRow(name) {
  return `<button type="button" class="ralya-wallet-choice fallback" data-wallet-fallback="${name.toLowerCase()}"><span class="ralya-wallet-letter">${name[0]}</span><span><strong>${name}</strong><small>Open the wallet app only if in-browser connection is unavailable</small></span><b>OPEN APP</b></button>`;
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
    const note = document.createElement('p');
    note.className = 'ralya-wallet-error';
    note.textContent = err?.message || 'Wallet connection was cancelled.';
    list?.appendChild(note);
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

function openWalletChooser() {
  const modal = ensureModal();
  const list = $('#ralyaWalletList', modal);
  const state = client.getSnapshot();
  const connectors = (state.connectors || []).filter(row => row && row.name);
  const preferred = ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask', 'Backpack'];
  connectors.sort((a, b) => {
    const ai = preferred.findIndex(name => name.toLowerCase() === String(a.name).toLowerCase());
    const bi = preferred.findIndex(name => name.toLowerCase() === String(b.name).toLowerCase());
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || String(a.name).localeCompare(String(b.name));
  });
  const names = new Set(connectors.map(row => String(row.name).toLowerCase()));
  list.innerHTML = connectors.map(connectorRow).join('');
  if (mobile) {
    for (const name of ['Phantom', 'Solflare', 'Trust Wallet', 'MetaMask']) {
      if (!names.has(name.toLowerCase())) list.insertAdjacentHTML('beforeend', fallbackRow(name));
    }
  }
  if (!connectors.length && !mobile) list.innerHTML = '<p class="ralya-wallet-empty">No Wallet Standard wallet detected. Install Phantom, Solflare, Backpack, or another compatible Solana wallet and reload this page.</p>';

  list.querySelectorAll('[data-connector-id]').forEach(button => button.addEventListener('click', () => connectConnector(button.dataset.connectorId), { once: true }));
  list.querySelectorAll('[data-wallet-fallback]').forEach(button => button.addEventListener('click', () => {
    const fn = FALLBACKS[button.dataset.walletFallback];
    if (fn) location.assign(fn());
  }));
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function enhanceWalletCtas() {
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
    cardButton.classList.add('ralya-presale-connect');
  }
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
    event.stopImmediatePropagation();
    openWalletChooser();
  }, true);
}

function syncConnectedState(state = client.getSnapshot()) {
  if (state.wallet?.status !== 'connected' && !state.connected) return;
  if (!installProvider()) return;
  const { address } = stateAccount(state);
  if (address) $$('.wallet-button').forEach(button => { button.textContent = shorten(address); });
}

function init() {
  enhanceWalletCtas();
  ensureStateNotice();
  installCaptureChooser();
  syncConnectedState();
  client.subscribe(syncConnectedState);
  window.addEventListener('ralya:presale-state', event => applyState(event.detail));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
