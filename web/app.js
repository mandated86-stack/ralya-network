import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg = window.RALYA_CONFIG;
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const enc = new TextEncoder();
const connection = new Connection(cfg.rpcEndpoint, 'confirmed');
const RLYA_UNIT = 1_000_000_000n;
const USDC_UNIT = 1_000_000n;
const STATUS = ['DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED'];

let provider = null;
let wallet = null;
let referralWallet = null;
let saleState = null;
let salePda = null;
let saleVaultPda = null;
let refreshTimer = null;

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__ralyaToast);
  window.__ralyaToast = setTimeout(() => el.classList.remove('show'), 3200);
}

function launchConfigured() {
  return Boolean(cfg.rlyaMint && cfg.saleProgramId && cfg.treasuryWallet);
}

function getProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.solana?.connect) return window.solana;
  return null;
}

function shorten(v) {
  const s = String(v || '');
  return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-6)}` : s;
}

function referralLinkFor(address) {
  const url = new URL(window.location.href);
  url.searchParams.set('ref', address);
  url.hash = 'presale';
  return url.toString();
}

function setReferral(raw, { quiet = false } = {}) {
  const input = $('#referralInput');
  const value = String(raw || '').trim();
  if (!value) {
    referralWallet = null;
    if (input) input.value = '';
    $('#referralStatus') && ($('#referralStatus').textContent = 'No referral attached.');
    return null;
  }
  try {
    const pk = new PublicKey(value);
    if (wallet && pk.equals(wallet)) throw new Error('You cannot refer your own wallet.');
    referralWallet = pk;
    if (input) input.value = pk.toBase58();
    $('#referralStatus') && ($('#referralStatus').textContent = `Referral: ${shorten(pk.toBase58())} · earns 1% of this purchase in USDC`);
    return pk;
  } catch (err) {
    referralWallet = null;
    if (!quiet) toast(err.message || 'Invalid referral wallet.');
    $('#referralStatus') && ($('#referralStatus').textContent = 'Referral address is invalid.');
    return null;
  }
}

function loadReferralFromUrl() {
  const value = new URL(window.location.href).searchParams.get('ref');
  if (value) setReferral(value, { quiet: true });
}

function updateMyReferralLink() {
  const input = $('#myReferralLink');
  const button = $('#copyReferralLink');
  if (!input || !button) return;
  if (!wallet) {
    input.value = 'Connect wallet to create your referral link';
    button.disabled = true;
    return;
  }
  input.value = referralLinkFor(wallet.toBase58());
  button.disabled = false;
}

function formatBigIntAmount(base, decimals = 9, maxFraction = 3) {
  const negative = base < 0n;
  let n = negative ? -base : base;
  const unit = 10n ** BigInt(decimals);
  const whole = n / unit;
  let frac = (n % unit).toString().padStart(decimals, '0');
  frac = frac.slice(0, maxFraction).replace(/0+$/, '');
  const grouped = Number(whole).toLocaleString();
  return `${negative ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

function formatPrice(micro) {
  return `$${(Number(micro) / 1_000_000).toFixed(6)}`;
}

function decimalToBase(value, decimals) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('Enter a valid amount.');
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}

function readU64(view, offset) {
  return view.getBigUint64(offset, true);
}

function readI64(view, offset) {
  return view.getBigInt64(offset, true);
}

function decodeSaleAccount(data) {
  if (!data || data.length < 250) throw new Error('Sale account data is incomplete.');
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8 + 32 * 5;
  const presaleCap = readU64(view, o); o += 8;
  const basePrice = readU64(view, o); o += 8;
  const stepSize = readU64(view, o); o += 8;
  const stepIncrement = readU64(view, o); o += 8;
  const referralBps = readU64(view, o); o += 8;
  const totalSold = readU64(view, o); o += 8;
  const manualSold = readU64(view, o); o += 8;
  const totalUsdcRaised = readU64(view, o); o += 8;
  const totalReferralUsdcPaid = readU64(view, o); o += 8;
  const startedAt = readI64(view, o); o += 8;
  const status = view.getUint8(o); o += 1;
  const bump = view.getUint8(o);
  return { presaleCap, basePrice, stepSize, stepIncrement, referralBps, totalSold, manualSold, totalUsdcRaised, totalReferralUsdcPaid, startedAt, status, bump };
}

function currentPrice(state) {
  if (!state || state.stepSize === 0n) return 0n;
  return state.basePrice + (state.totalSold / state.stepSize) * state.stepIncrement;
}

function quoteCurve(usdcBase, state) {
  if (!state || usdcBase <= 0n) return 0n;
  let remainingUsdc = usdcBase;
  let progress = state.totalSold;
  let allocation = 0n;
  let loops = 0;
  while (remainingUsdc > 0n) {
    if (progress >= state.presaleCap) throw new Error('Presale is sold out.');
    if (++loops > 256) throw new Error('Quote crosses too many price steps.');
    const stepIndex = progress / state.stepSize;
    const price = state.basePrice + stepIndex * state.stepIncrement;
    const nextBoundary = minBigInt((stepIndex + 1n) * state.stepSize, state.presaleCap);
    const available = nextBoundary - progress;
    const costToFill = ceilDiv(available * price, RLYA_UNIT);
    if (remainingUsdc >= costToFill) {
      allocation += available;
      progress += available;
      remainingUsdc -= costToFill;
    } else {
      const part = remainingUsdc * RLYA_UNIT / price;
      if (part <= 0n || part > available) throw new Error('Purchase is too small at the current price.');
      allocation += part;
      progress += part;
      remainingUsdc = 0n;
    }
  }
  return allocation;
}

const minBigInt = (a, b) => a < b ? a : b;
const ceilDiv = (n, d) => (n + d - 1n) / d;

async function anchorDiscriminator(name) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(`global:${name}`));
  return new Uint8Array(hash).slice(0, 8);
}

async function instructionDataU64s(name, ...amounts) {
  const disc = await anchorDiscriminator(name);
  const data = new Uint8Array(8 + (8 * amounts.length));
  data.set(disc, 0);
  const view = new DataView(data.buffer);
  amounts.forEach((amount, index) => view.setBigUint64(8 + (index * 8), BigInt(amount), true));
  return data;
}


function referralPdaFor(owner, programId = new PublicKey(cfg.saleProgramId)) {
  return PublicKey.findProgramAddressSync([enc.encode('referral'), owner.toBytes()], programId)[0];
}

function decodeReferralAttribution(data) {
  if (!data || data.length < 73) throw new Error('Referral attribution account is incomplete.');
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return {
    buyer: new PublicKey(bytes.slice(8, 40)),
    referrer: new PublicKey(bytes.slice(40, 72)),
    bump: bytes[72],
  };
}

async function refreshReferralAttribution() {
  if (!wallet || !launchConfigured()) return;
  const pda = referralPdaFor(wallet);
  const info = await connection.getAccountInfo(pda, 'confirmed');
  if (!info) return;
  const stored = decodeReferralAttribution(info.data);
  if (!stored.buyer.equals(wallet)) throw new Error('Referral attribution buyer mismatch.');
  if (referralWallet && !referralWallet.equals(stored.referrer)) {
    toast('This wallet already has a different locked referrer. Using the on-chain attribution.');
  }
  setReferral(stored.referrer.toBase58(), { quiet: true });
  $('#referralStatus') && ($('#referralStatus').textContent = `Locked referral: ${shorten(stored.referrer.toBase58())} · earns 1% of your RLYA purchases in USDC`);
}

async function fetchTokenBalance(owner, mint) {
  const result = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  let total = 0;
  for (const row of result.value) {
    const amount = row.account.data?.parsed?.info?.tokenAmount?.uiAmountString;
    if (amount) total += Number(amount);
  }
  return total;
}

function configureAddresses() {
  if (!launchConfigured()) return false;
  const program = new PublicKey(cfg.saleProgramId);
  const mint = new PublicKey(cfg.rlyaMint);
  [salePda] = PublicKey.findProgramAddressSync([enc.encode('sale'), mint.toBytes()], program);
  [saleVaultPda] = PublicKey.findProgramAddressSync([enc.encode('sale_vault'), mint.toBytes()], program);
  return true;
}

async function refreshSaleState() {
  if (!configureAddresses()) {
    saleState = null;
    $('#saleState').textContent = 'PENDING LAUNCH';
    $('#currentPrice').textContent = formatPrice(BigInt(cfg.basePriceMicroUsdc));
    $('#nextPrice').textContent = formatPrice(BigInt(cfg.basePriceMicroUsdc + cfg.priceStepIncrementMicroUsdc));
    $('#soldRlya').textContent = '0 RLYA';
    $('#nextStepText').textContent = `after ${cfg.priceStepTokens.toLocaleString()} RLYA distributed`;
    $('#networkStatus').textContent = 'MAINNET LAUNCH CONFIGURATION PENDING';
    $('#saleDot')?.classList.add('amber');
    updateBuyAvailability();
    return;
  }
  try {
    const account = await connection.getAccountInfo(salePda, 'confirmed');
    if (!account) throw new Error('Published sale account not found on Solana.');
    saleState = decodeSaleAccount(account.data);
    const price = currentPrice(saleState);
    const nextPrice = price + saleState.stepIncrement;
    $('#currentPrice').textContent = formatPrice(price);
    $('#nextPrice').textContent = formatPrice(nextPrice);
    $('#soldRlya').textContent = `${formatBigIntAmount(saleState.totalSold, 9, 2)} RLYA`;
    $('#saleState').textContent = STATUS[saleState.status] || `STATE ${saleState.status}`;
    const nextBoundary = minBigInt(((saleState.totalSold / saleState.stepSize) + 1n) * saleState.stepSize, saleState.presaleCap);
    const toNext = nextBoundary > saleState.totalSold ? nextBoundary - saleState.totalSold : 0n;
    $('#nextStepText').textContent = `${formatBigIntAmount(toNext, 9, 2)} RLYA until next step`;
    $('#networkStatus').textContent = 'SOLANA MAINNET · ON-CHAIN SALE STATE';
    $('#saleDot')?.classList.toggle('amber', saleState.status !== 1);
    $('#programTag').textContent = 'ON-CHAIN';
    $('#programTag').className = 'tag good';
    $('#deployProgramItem').classList.add('done');
    $('#mintItem').classList.add('done');
  } catch (err) {
    saleState = null;
    $('#saleState').textContent = 'RPC ERROR';
    $('#networkStatus').textContent = 'SOLANA RPC UNAVAILABLE';
    toast(err.message || 'Could not read sale state.');
  }
  updateQuote();
  updateBuyAvailability();
}

async function refreshWalletBalances() {
  if (!wallet) {
    $('#rlyaBalance').textContent = '--';
    $('#usdcBalance').textContent = '--';
    return;
  }
  try {
    const usdcMint = new PublicKey(cfg.usdcMint);
    const usdc = await fetchTokenBalance(wallet, usdcMint);
    $('#usdcBalance').textContent = `${usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
    if (cfg.rlyaMint) {
      const rlya = await fetchTokenBalance(wallet, new PublicKey(cfg.rlyaMint));
      $('#rlyaBalance').textContent = `${rlya.toLocaleString(undefined, { maximumFractionDigits: 4 })} RLYA`;
    } else {
      $('#rlyaBalance').textContent = '0 RLYA';
    }
  } catch (err) {
    toast(err.message || 'Could not read wallet balances.');
  }
}

async function connectWallet() {
  provider = getProvider();
  if (!provider) {
    toast('Install a Solana wallet such as Phantom or Solflare.');
    return;
  }
  try {
    const response = await provider.connect();
    wallet = new PublicKey(response?.publicKey || provider.publicKey);
    $$('.wallet-button').forEach(b => b.textContent = shorten(wallet.toBase58()));
    $('#walletLabel').textContent = shorten(wallet.toBase58());
    if (referralWallet && referralWallet.equals(wallet)) setReferral('', { quiet: true });
    updateMyReferralLink();
    await refreshReferralAttribution();
    await refreshWalletBalances();
    updateBuyAvailability();
  } catch (err) {
    toast(err.message || 'Wallet connection cancelled.');
  }
}

function updateQuote() {
  const out = $('#quoteValue');
  const avg = $('#averagePrice');
  if (!saleState) {
    out.textContent = '-- RLYA';
    avg.textContent = launchConfigured() ? 'Waiting for on-chain state' : 'Sale activates after mainnet configuration';
    return;
  }
  try {
    const usdcBase = decimalToBase($('#usdcInput').value, 6);
    if (usdcBase < USDC_UNIT) throw new Error('Minimum purchase is 1 USDC.');
    const tokens = quoteCurve(usdcBase, saleState);
    out.textContent = `${formatBigIntAmount(tokens, 9, 4)} RLYA`;
    const avgMicro = tokens > 0n ? Number(usdcBase) * 1e9 / Number(tokens) : 0;
    avg.textContent = `Average price for this order: $${(avgMicro / 1_000_000).toFixed(6)} per RLYA`;
  } catch (err) {
    out.textContent = '-- RLYA';
    avg.textContent = err.message;
  }
}

function updateBuyAvailability() {
  const button = $('#buyRlya');
  const msg = $('#buyMessage');
  const ready = launchConfigured() && saleState?.status === 1 && wallet;
  button.disabled = !ready;
  if (!launchConfigured()) msg.textContent = 'Mainnet addresses will appear here immediately after the one-time launch transaction.';
  else if (!wallet) msg.textContent = 'Connect a Solana wallet to continue.';
  else if (!saleState) msg.textContent = 'Waiting for the Solana sale account.';
  else if (saleState.status !== 1) msg.textContent = `Sale is ${STATUS[saleState.status] || 'not active'}.`;
  else msg.textContent = 'Your wallet will approve one atomic Solana transaction. If the on-chain price moves above your displayed quote first, the transaction fails instead of giving you fewer RLYA.';
}

async function sendTransaction(tx, extraSigners = []) {
  const latest = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = wallet;
  if (extraSigners.length) tx.partialSign(...extraSigners);
  let signature;
  if (provider.signAndSendTransaction) {
    const result = await provider.signAndSendTransaction(tx);
    signature = typeof result === 'string' ? result : result?.signature;
  } else if (provider.signTransaction) {
    const signed = await provider.signTransaction(tx);
    signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  } else {
    throw new Error('Connected wallet does not support transaction signing.');
  }
  if (!signature) throw new Error('Wallet did not return a transaction signature.');
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  return signature;
}

async function buyRlya() {
  if (!wallet || !provider) return connectWallet();
  if (!launchConfigured() || saleState?.status !== 1) throw new Error('RLYA sale is not active.');
  const usdcAmount = decimalToBase($('#usdcInput').value, 6);
  if (usdcAmount < USDC_UNIT) throw new Error('Minimum purchase is 1 USDC.');
  const minimumRlyaOut = quoteCurve(usdcAmount, saleState); // exact displayed quote becomes the on-chain minimum

  const programId = new PublicKey(cfg.saleProgramId);
  const rlyaMint = new PublicKey(cfg.rlyaMint);
  const usdcMint = new PublicKey(cfg.usdcMint);
  const treasury = new PublicKey(cfg.treasuryWallet);
  const buyerUsdcAta = await getAssociatedTokenAddress(usdcMint, wallet);
  const buyerRlyaAta = await getAssociatedTokenAddress(rlyaMint, wallet);
  const treasuryUsdcAta = await getAssociatedTokenAddress(usdcMint, treasury);

  const buyerUsdcInfo = await connection.getAccountInfo(buyerUsdcAta);
  if (!buyerUsdcInfo) throw new Error('Your wallet has no USDC token account on Solana.');
  const treasuryInfo = await connection.getAccountInfo(treasuryUsdcAta);
  if (!treasuryInfo) throw new Error('Sale treasury USDC account is not initialized.');

  const typedReferral = String($('#referralInput')?.value || '').trim();
  let referrer = typedReferral ? setReferral(typedReferral) : null;
  if (typedReferral && !referrer) throw new Error('Enter a valid referral wallet or leave it blank.');
  if (referrer && referrer.equals(wallet)) throw new Error('You cannot refer your own wallet.');

  const buyerReferralPda = referralPdaFor(wallet, programId);
  const buyerReferralInfo = await connection.getAccountInfo(buyerReferralPda, 'confirmed');
  let storedReferral = null;
  if (buyerReferralInfo) {
    storedReferral = decodeReferralAttribution(buyerReferralInfo.data);
    if (!storedReferral.buyer.equals(wallet)) throw new Error('Stored referral attribution does not belong to this wallet.');
    if (referrer && !referrer.equals(storedReferral.referrer)) throw new Error('This wallet already has a different on-chain referrer.');
    referrer = storedReferral.referrer;
    setReferral(referrer.toBase58(), { quiet: true });
  }

  const tx = new Transaction();
  if (!buyerReferralInfo && referrer) {
    const referrerReferralPda = referralPdaFor(referrer, programId);
    tx.add(new TransactionInstruction({
      programId,
      data: await anchorDiscriminator('register_referral'),
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: referrer, isSigner: false, isWritable: false },
        { pubkey: buyerReferralPda, isSigner: false, isWritable: true },
        { pubkey: referrerReferralPda, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ]
    }));
  }
  if (!await connection.getAccountInfo(buyerRlyaAta)) {
    tx.add(createAssociatedTokenAccountInstruction(wallet, buyerRlyaAta, wallet, rlyaMint));
  }

  if (referrer) {
    const referrerUsdcAta = await getAssociatedTokenAddress(usdcMint, referrer);
    if (!await connection.getAccountInfo(referrerUsdcAta)) {
      tx.add(createAssociatedTokenAccountInstruction(wallet, referrerUsdcAta, referrer, usdcMint));
    }
    const data = await instructionDataU64s('buy_with_referral', usdcAmount, minimumRlyaOut);
    tx.add(new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: referrer, isSigner: false, isWritable: false },
        { pubkey: buyerReferralPda, isSigner: false, isWritable: false },
        { pubkey: rlyaMint, isSigner: false, isWritable: false },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: salePda, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: false },
        { pubkey: buyerUsdcAta, isSigner: false, isWritable: true },
        { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: referrerUsdcAta, isSigner: false, isWritable: true },
        { pubkey: buyerRlyaAta, isSigner: false, isWritable: true },
        { pubkey: saleVaultPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ]
    }));
  } else {
    const data = await instructionDataU64s('buy', usdcAmount, minimumRlyaOut);
    tx.add(new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: buyerReferralPda, isSigner: false, isWritable: false },
        { pubkey: rlyaMint, isSigner: false, isWritable: false },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: salePda, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: false },
        { pubkey: buyerUsdcAta, isSigner: false, isWritable: true },
        { pubkey: treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: buyerRlyaAta, isSigner: false, isWritable: true },
        { pubkey: saleVaultPda, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ]
    }));
  }

  $('#buyRlya').disabled = true;
  $('#buyMessage').textContent = 'Waiting for wallet confirmation…';
  const signature = await sendTransaction(tx);
  const url = `${cfg.explorerBase}/tx/${signature}`;
  const box = $('#txResult');
  box.hidden = false;
  const referralNote = referralWallet ? ` · referrer receives ${Number(usdcAmount * BigInt(saleState.referralBps || BigInt(cfg.referralBps || 100)) / 10_000n) / 1_000_000} USDC` : '';
  box.innerHTML = `<strong>Purchase confirmed.</strong>${referralNote} <a href="${url}" target="_blank" rel="noopener">View transaction on Solana Explorer →</a>`;
  toast('RLYA purchase confirmed on Solana.');
  await Promise.all([refreshSaleState(), refreshWalletBalances()]);
}

function wireGithub() {
  if (!cfg.githubUrl) return;
  const link = $('#githubLink');
  link.href = cfg.githubUrl;
  link.removeAttribute('aria-disabled');
  $('#githubLabel').textContent = 'View the public RALYA source →';
}

$('#menuButton')?.addEventListener('click', () => $('#mobileMenu')?.classList.toggle('open'));
$$('#mobileMenu a').forEach(a => a.addEventListener('click', () => $('#mobileMenu')?.classList.remove('open')));
$$('[data-wallet-connect]').forEach(b => b.addEventListener('click', connectWallet));
$('#usdcInput')?.addEventListener('input', updateQuote);
$('#referralInput')?.addEventListener('change', e => setReferral(e.target.value));
$('#copyReferralLink')?.addEventListener('click', async () => {
  if (!wallet) return connectWallet();
  const link = referralLinkFor(wallet.toBase58());
  await navigator.clipboard.writeText(link);
  toast('Referral link copied.');
});
$('#buyRlya')?.addEventListener('click', async () => {
  try { await buyRlya(); }
  catch (err) { toast(err.message || 'Purchase failed.'); updateBuyAvailability(); }
});

wireGithub();
loadReferralFromUrl();
updateMyReferralLink();
refreshSaleState();
updateQuote();
updateBuyAvailability();
refreshTimer = setInterval(() => {
  refreshSaleState();
  if (wallet) refreshWalletBalances();
}, 20_000);
window.addEventListener('beforeunload', () => clearInterval(refreshTimer));
