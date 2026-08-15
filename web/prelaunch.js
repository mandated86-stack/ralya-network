import { Connection, PublicKey, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg = window.RALYA_CONFIG;
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const connection = new Connection(cfg.rpcEndpoint, 'confirmed');
const RLYA_UNIT = 1_000_000_000n;
const USDC_UNIT = 1_000_000n;
const BPS_DENOMINATOR = 10_000n;
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

let provider = null;
let wallet = null;
let referralWallet = null;
let lockedReferrer = null;
let lockedStake = null;
let state = null;
let refreshTimer = null;
let allocationViewAuth = null;

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__ralyaToast);
  window.__ralyaToast = setTimeout(() => el.classList.remove('show'), 3600);
}
function getProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.solana?.connect) return window.solana;
  return null;
}
function shorten(value) { const s = String(value || ''); return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-6)}` : s; }
function decimalToBase(value, decimals) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('Enter a valid amount.');
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}
function formatBase(base, decimals = 9, maxFraction = 4) {
  const n = BigInt(base || 0); const unit = 10n ** BigInt(decimals); const whole = n / unit;
  let frac = (n % unit).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  return `${Number(whole).toLocaleString()}${frac ? `.${frac}` : ''}`;
}
function formatPrice(micro) { return `$${(Number(BigInt(micro || 0)) / 1_000_000).toFixed(6)}`; }
function referralLinkFor(address) { const url = new URL(window.location.href); url.searchParams.set('ref', address); url.hash = 'presale'; return url.toString(); }
function nonceHex() { const bytes = crypto.getRandomValues(new Uint8Array(20)); return [...bytes].map(v => v.toString(16).padStart(2, '0')).join(''); }
function toBase64(bytes) { let binary = ''; const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); for (const b of arr) binary += String.fromCharCode(b); return btoa(binary); }
function quoteAuthMessage(walletAddress, usdcAmount, referrer, stake, timestamp, nonce) {
  return [
    'RALYA prelaunch allocation quote',
    `Wallet: ${walletAddress}`,
    `USDC: ${usdcAmount}`,
    `Referrer: ${referrer || '-'}`,
    `Stake: ${stake ? 'YES' : 'NO'}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}
function allocationViewMessage(walletAddress, timestamp, nonce) {
  return [
    'RALYA allocation view',
    `Wallet: ${walletAddress}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

function setReferral(raw, quiet = false) {
  const input = $('#referralInput');
  if (lockedReferrer) {
    referralWallet = new PublicKey(lockedReferrer);
    if (input) { input.value = lockedReferrer; input.disabled = true; }
    if ($('#referralStatus')) $('#referralStatus').textContent = `Locked referral: ${shorten(lockedReferrer)} · receives 1% of referred USDC purchases`;
    return referralWallet;
  }
  const value = String(raw || '').trim();
  if (!value) {
    referralWallet = null;
    if (input) input.value = '';
    if ($('#referralStatus')) $('#referralStatus').textContent = 'No referral attached.';
    return null;
  }
  try {
    const pk = new PublicKey(value);
    if (wallet && pk.equals(wallet)) throw new Error('You cannot refer your own wallet.');
    referralWallet = pk;
    if (input) input.value = pk.toBase58();
    if ($('#referralStatus')) $('#referralStatus').textContent = `Referral: ${shorten(pk.toBase58())} · receives 1% of this purchase in USDC`;
    return pk;
  } catch (err) {
    referralWallet = null;
    if (!quiet) toast(err.message || 'Invalid referral wallet.');
    if ($('#referralStatus')) $('#referralStatus').textContent = 'Referral address is invalid.';
    return null;
  }
}
function loadReferralFromUrl() { const value = new URL(window.location.href).searchParams.get('ref'); if (value) setReferral(value, true); }
function updateReferralLink() {
  const input = $('#myReferralLink'); const button = $('#copyReferralLink'); if (!input || !button) return;
  if (!wallet) { input.value = 'Connect wallet to create your referral link'; button.disabled = true; }
  else { input.value = referralLinkFor(wallet.toBase58()); button.disabled = false; }
}
function wantsStake() {
  if (typeof lockedStake === 'boolean') return lockedStake;
  return Boolean($('#stakeToggle')?.checked);
}
function syncStakeUi() {
  const toggle = $('#stakeToggle'); const status = $('#stakeStatus');
  if (!toggle || !status) return;
  if (typeof lockedStake === 'boolean') {
    toggle.checked = lockedStake;
    toggle.disabled = true;
    status.textContent = lockedStake
      ? 'This wallet is locked to Buy + Stake: +5% RLYA, release 36 days after public launch.'
      : 'This wallet is locked to standard release: 21 days after public launch.';
  } else {
    toggle.disabled = false;
    status.textContent = 'Your first confirmed presale purchase locks this wallet\'s release option for later presale purchases.';
  }
}
const minBig = (a, b) => a < b ? a : b;
const ceilDiv = (n, d) => (n + d - 1n) / d;
function previewQuote(usdcBase) {
  if (!state) throw new Error('Live presale state is loading.');
  const cap = BigInt(state.presaleCapBase), step = BigInt(state.stepSizeBase), base = BigInt(state.basePriceMicroUsdc), increment = BigInt(state.stepIncrementMicroUsdc);
  let progress = BigInt(state.quoteProgressBase || state.totalAllocatedBase), remaining = usdcBase, allocation = 0n, loops = 0;
  while (remaining > 0n) {
    if (progress >= cap) throw new Error('Presale allocation is fully reserved.');
    if (++loops > 512) throw new Error('Order crosses too many price steps.');
    const idx = progress / step, price = base + idx * increment, boundary = minBig((idx + 1n) * step, cap), available = boundary - progress;
    const fillCost = ceilDiv(available * price, RLYA_UNIT);
    if (remaining >= fillCost) { allocation += available; progress += available; remaining -= fillCost; }
    else { const part = remaining * RLYA_UNIT / price; if (part <= 0n || part > available) throw new Error('Purchase amount is too small at the current price.'); allocation += part; remaining = 0n; }
  }
  return allocation;
}
function previewStakeBonus(base) {
  if (!wantsStake()) return 0n;
  const bps = BigInt(state?.stakingBonusBps || cfg.stakingBonusBps || 500);
  return BigInt(base) * bps / BPS_DENOMINATOR;
}
async function fetchJson(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}
async function refreshState() {
  try {
    state = await fetchJson('/api/presale/state');
    const open = state.access === 'open';
    const paused = state.access === 'paused';
    $('#currentPrice').textContent = formatPrice(state.currentPriceMicroUsdc);
    $('#soldRlya').textContent = `${formatBase(state.totalAllocatedBase, 9, 2)} RLYA`;
    $('#saleState').textContent = open ? 'PRESALE LIVE' : paused ? 'PAUSED' : 'OPENING AT LAUNCH';
    $('#saleDot')?.classList.toggle('amber', !open);
    $('#presaleHeroDot')?.classList.toggle('amber', !open);
    if ($('#presaleHeroStatus')) $('#presaleHeroStatus').textContent = open ? 'RLYA PRESALE • LIVE NOW' : paused ? 'RLYA PRESALE • TEMPORARILY PAUSED' : 'RLYA PRESALE • OPENING WITH SITE LAUNCH';
    if ($('#presaleEyebrow')) $('#presaleEyebrow').textContent = open ? 'RLYA PRESALE • LIVE' : paused ? 'RLYA PRESALE • PAUSED' : 'RLYA PRESALE • OPENING AT LAUNCH';
    if ($('#presaleHeading')) $('#presaleHeading').textContent = open ? 'RLYA presale is live.' : paused ? 'RLYA presale is temporarily paused.' : 'Secure your presale position before public launch.';
    if ($('#presaleHeroCta')) $('#presaleHeroCta').textContent = open ? 'Enter RLYA presale' : paused ? 'View presale status' : 'RLYA presale — opening at launch';
    updatePreview(); updateBuyAvailability();
  } catch (err) { if ($('#saleState')) $('#saleState').textContent = 'STATUS UPDATING'; toast(err.message || 'Could not load presale state.'); }
}
async function fetchUsdcBalance(owner) {
  const mint = new PublicKey(cfg.usdcMint); const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint }); let total = 0;
  for (const row of accounts.value) total += Number(row.account.data?.parsed?.info?.tokenAmount?.uiAmountString || 0);
  return total;
}
async function signedAllocationViewBody() {
  if (!wallet || !provider?.signMessage) throw new Error("Sign a harmless wallet-ownership message to view this wallet's RLYA allocation.");
  const walletAddress = wallet.toBase58();
  if (allocationViewAuth?.wallet === walletAddress && allocationViewAuth.expiresAtMs > Date.now()) return allocationViewAuth.body;
  const timestamp = new Date().toISOString(); const nonce = nonceHex();
  const message = allocationViewMessage(walletAddress, timestamp, nonce);
  if ($('#allocationStatus')) $('#allocationStatus').textContent = 'VERIFY WALLET';
  const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
  const signature = signed?.signature || signed;
  const body = { wallet: walletAddress, timestamp, nonce, message, signature: toBase64(signature) };
  allocationViewAuth = { wallet: walletAddress, body, expiresAtMs: Date.now() + 4 * 60 * 1000 };
  return body;
}
async function fetchWalletAllocation() {
  const auth = await signedAllocationViewBody();
  return fetchJson(`/api/presale/wallet/${wallet.toBase58()}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(auth),
  });
}
function releaseText(status, stake = false) {
  if (status === '36-days-after-public-launch' || stake) return 'Buy + Stake: release 36 days after public launch';
  if (status === 'mixed-21d-and-36d-after-public-launch') return 'Release schedule verified per allocation';
  return 'Standard: release 21 days after public launch';
}
async function refreshWallet() {
  if (!wallet) return;
  try {
    const usdc = await fetchUsdcBalance(wallet);
    $('#usdcBalance').textContent = `${usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
  } catch (err) { toast(err.message || 'Could not refresh USDC balance.'); }
  try {
    const allocation = await fetchWalletAllocation();
    $('#rlyaBalance').textContent = `${formatBase(allocation.totalRlyaBase, 9, 4)} RLYA`;
    if ($('#allocationStatus')) $('#allocationStatus').textContent = allocation.status === 'allocation-confirmed' ? 'EXPECTED ALLOCATION CONFIRMED' : 'NO ALLOCATION YET';
    if ($('#allocationDelivery')) $('#allocationDelivery').textContent = allocation.status === 'allocation-confirmed' ? releaseText(allocation.distributionStatus) : 'Standard: 21 days after public launch';
    if (allocation.lockedReferrer) { lockedReferrer = allocation.lockedReferrer; setReferral(lockedReferrer, true); }
    const webAllocation = (allocation.allocations || []).find(row => row.kind === 'web');
    lockedStake = webAllocation ? Boolean(webAllocation.stake) : null;
    syncStakeUi();
  } catch (err) {
    $('#rlyaBalance').textContent = '-- RLYA';
    if ($('#allocationStatus')) $('#allocationStatus').textContent = 'WALLET VERIFICATION REQUIRED';
    toast(err.message || 'Could not verify this wallet to load its allocation.');
  }
  updatePreview();
}
async function connectWallet() {
  provider = getProvider(); if (!provider) return toast('Install a Solana wallet such as Phantom or Solflare.');
  try {
    const result = await provider.connect(); wallet = new PublicKey(result?.publicKey || provider.publicKey);
    if (allocationViewAuth?.wallet !== wallet.toBase58()) allocationViewAuth = null;
    lockedStake = null; syncStakeUi();
    $$('.wallet-button').forEach(btn => btn.textContent = shorten(wallet.toBase58())); if ($('#walletLabel')) $('#walletLabel').textContent = shorten(wallet.toBase58());
    if (referralWallet && referralWallet.equals(wallet)) setReferral('', true); updateReferralLink(); await refreshWallet(); updateBuyAvailability();
  } catch (err) { toast(err.message || 'Wallet connection cancelled.'); }
}
function updatePreview() {
  const out = $('#quoteValue'), avg = $('#averagePrice'), breakdown = $('#quoteBreakdown'); if (!out || !avg) return;
  try {
    const gross = decimalToBase($('#usdcInput')?.value, 6); if (gross < USDC_UNIT) throw new Error('Minimum purchase is 1 USDC.');
    const baseRlya = previewQuote(gross); const bonus = previewStakeBonus(baseRlya); const total = baseRlya + bonus;
    out.textContent = `${formatBase(total, 9, 4)} RLYA`;
    if (breakdown) breakdown.innerHTML = `<small>Purchased allocation: ${formatBase(baseRlya, 9, 4)} RLYA</small><small>Staking bonus: ${bonus > 0n ? `+${formatBase(bonus, 9, 4)} RLYA (5%)` : 'Not selected'}</small>`;
    const avgMicro = baseRlya > 0n ? gross * RLYA_UNIT / baseRlya : 0n;
    avg.textContent = wantsStake()
      ? `Estimated base price: ${formatPrice(avgMicro)} · expected total includes fixed 5% bonus · release day 36`
      : `Estimated average price: ${formatPrice(avgMicro)} per RLYA · standard release day 21`;
    if ($('#allocationDelivery') && !lockedStake && wallet) $('#allocationDelivery').textContent = wantsStake() ? 'Buy + Stake: release 36 days after public launch' : 'Standard: release 21 days after public launch';
  } catch (err) {
    out.textContent = '-- RLYA';
    if (breakdown) breakdown.innerHTML = '<small>Purchased allocation: --</small><small>Staking bonus: --</small>';
    avg.textContent = err.message;
  }
}
function updateBuyAvailability() {
  const button = $('#buyRlya'), msg = $('#buyMessage'); if (!button || !msg) return; const open = state?.access === 'open';
  button.disabled = !(wallet && open); button.textContent = wantsStake() ? 'Buy + Stake · secure allocation' : 'Secure my presale allocation';
  if (!open) msg.textContent = state?.access === 'paused' ? 'RLYA presale is temporarily paused.' : 'RLYA presale opens with the production website launch.';
  else if (!wallet) msg.textContent = 'Connect a Solana wallet to continue.';
  else msg.textContent = wantsStake()
    ? 'After verified payment, your expected allocation includes a fixed 5% RLYA bonus and uses the 36-day release schedule.'
    : 'After verified payment, your expected allocation uses the standard 21-day release schedule.';
}
async function sendTransaction(tx) {
  const latest = await connection.getLatestBlockhash('confirmed'); tx.feePayer = wallet; tx.recentBlockhash = latest.blockhash; let signature;
  if (provider.signAndSendTransaction) { const result = await provider.signAndSendTransaction(tx); signature = typeof result === 'string' ? result : result?.signature; }
  else if (provider.signTransaction) { const signed = await provider.signTransaction(tx); signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 4 }); }
  else throw new Error('Connected wallet does not support transaction signing.');
  if (!signature) throw new Error('Wallet returned no transaction signature.');
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed'); return signature;
}
async function requiredAta(owner,mint,label){
  const ata=await getAssociatedTokenAddress(mint,owner);
  if(!await connection.getAccountInfo(ata,'confirmed'))throw new Error(`${label} USDC receiving account is not ready. No funds were moved. Please try again after it is prepared.`);
  return ata;
}
async function activateReferralReceiving(){
  if(!wallet||!provider)await connectWallet();
  const mint=new PublicKey(cfg.usdcMint),ata=await getAssociatedTokenAddress(mint,wallet);
  if(await connection.getAccountInfo(ata,'confirmed'))return ata;
  const tx=new Transaction().add(createAssociatedTokenAccountInstruction(wallet,ata,wallet,mint));
  toast('Activate your USDC receiving account once to use referral links.');
  await sendTransaction(tx);
  if(!await connection.getAccountInfo(ata,'confirmed'))throw new Error('USDC referral receiving account was not created.');
  toast('Referral USDC receiving account activated.');
  return ata;
}
async function signedQuoteBody(usdcAmount, stake) {
  if (!provider?.signMessage) throw new Error('This wallet must support message signing to lock a presale quote.');
  const walletAddress = wallet.toBase58(); const referrer = referralWallet?.toBase58() || null; const timestamp = new Date().toISOString(); const nonce = nonceHex();
  const message = quoteAuthMessage(walletAddress, usdcAmount, referrer, stake, timestamp, nonce);
  $('#buyMessage').textContent = 'Approve the allocation quote in your wallet. This message does not move funds.';
  const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8'); const signature = signed?.signature || signed;
  return { wallet: walletAddress, usdcAmount, referrer, stake, timestamp, nonce, message, signature: toBase64(signature) };
}
async function secureAllocation() {
  if (!wallet || !provider) return connectWallet();
  if (state?.access !== 'open') throw new Error('RLYA presale is not open yet.');
  const usdcAmount = String($('#usdcInput')?.value || '').trim(); decimalToBase(usdcAmount, 6);
  const stake = wantsStake();
  const typedReferral = String($('#referralInput')?.value || '').trim(); if (typedReferral) setReferral(typedReferral);
  const mint=new PublicKey(cfg.usdcMint),configuredTreasury=new PublicKey(cfg.prelaunchTreasuryWallet);
  const buyerUsdcAta=await getAssociatedTokenAddress(mint,wallet);
  if(!await connection.getAccountInfo(buyerUsdcAta,'confirmed'))throw new Error('Your wallet has no USDC token account on Solana.');
  const treasuryAta=await requiredAta(configuredTreasury,mint,'Treasury');
  let expectedReferrerAta=null;
  if(referralWallet)expectedReferrerAta=await requiredAta(referralWallet,mint,'Referrer');

  const signedRequest = await signedQuoteBody(usdcAmount, stake);
  const quoteResult = await fetchJson('/api/presale/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signedRequest) });
  const quote = quoteResult.quote;
  if(Boolean(quote.stake)!==stake)throw new Error('Server staking choice differs from the signed checkout state. Refresh and retry.');
  const baseRlya=BigInt(quote.rlyaBase), bonus=BigInt(quote.stakingBonusBase||0), expectedTotal=BigInt(quote.expectedTotalRlyaBase||baseRlya+bonus);
  $('#quoteValue').textContent = `${formatBase(expectedTotal, 9, 4)} RLYA`;
  if ($('#quoteBreakdown')) $('#quoteBreakdown').innerHTML = `<small>Purchased allocation: ${formatBase(baseRlya, 9, 4)} RLYA</small><small>Staking bonus: ${bonus > 0n ? `+${formatBase(bonus, 9, 4)} RLYA (5%)` : 'Not selected'}</small>`;
  $('#averagePrice').textContent = `Locked allocation · ${stake ? 'Buy + Stake / release day 36' : 'standard / release day 21'} · quote valid until ${new Date(quote.expiresAt).toLocaleTimeString()}`;
  if(quote.usdcMint!==cfg.usdcMint||quote.treasuryWallet!==configuredTreasury.toBase58())throw new Error('Server quote payment addresses do not match the reviewed website configuration.');
  if((quote.referrer||null)!==(referralWallet?.toBase58()||null))throw new Error('Server referral attribution differs from the wallet checkout state. Refresh and retry.');
  const tx = new Transaction(); const treasuryAmount = BigInt(quote.treasuryUsdcBase);
  if (treasuryAmount > 0n) tx.add(createTransferCheckedInstruction(buyerUsdcAta, mint, treasuryAta, wallet, treasuryAmount, 6));
  if (quote.referrer) {
    const referralAmount = BigInt(quote.referralUsdcBase);
    if(!expectedReferrerAta)throw new Error('Referrer USDC receiving account was not verified.');
    if (referralAmount > 0n) tx.add(createTransferCheckedInstruction(buyerUsdcAta, mint, expectedReferrerAta, wallet, referralAmount, 6));
  }
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: new TextEncoder().encode(quote.memo) }));
  $('#buyRlya').disabled = true; $('#buyMessage').textContent = 'Confirm the USDC transaction in your wallet…';
  const signature = await sendTransaction(tx); $('#buyMessage').textContent = 'USDC confirmed. Verifying your expected RLYA allocation…';
  const confirmed = await fetchJson('/api/presale/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId: quote.quoteId, signature }) });
  const receipt = confirmed.receipt, explorer = `${cfg.explorerBase}/tx/${signature}`, box = $('#txResult');
  const receiptBase=BigInt(receipt.rlyaBase||0), receiptBonus=BigInt(receipt.stakingBonusBase||0), receiptTotal=receiptBase+receiptBonus;
  const release = receipt.stake ? '36 days after public launch' : '21 days after public launch';
  if (box) {
    box.hidden = false;
    box.innerHTML = `<strong>Expected Allocation Confirmed.</strong> ${formatBase(receiptBase, 9, 4)} RLYA purchased${receiptBonus > 0n ? ` + ${formatBase(receiptBonus, 9, 4)} RLYA staking bonus` : ''} = <strong>${formatBase(receiptTotal, 9, 4)} RLYA expected</strong> for ${shorten(receipt.wallet)}. Release: ${release}. <a href="${explorer}" target="_blank" rel="noopener">Verify USDC transaction →</a>`;
  }
  toast(receipt.stake ? 'Buy + Stake allocation confirmed with 5% RLYA bonus.' : 'Expected RLYA allocation confirmed.');
  await Promise.all([refreshState(), refreshWallet()]);
}
function wireGithub() { const link = $('#githubLink'); if (!cfg.githubUrl || !link) return; link.href = cfg.githubUrl; link.removeAttribute('aria-disabled'); if ($('#githubLabel')) $('#githubLabel').textContent = 'View the public RALYA source →'; }

$('#menuButton')?.addEventListener('click', () => $('#mobileMenu')?.classList.toggle('open'));
$$('#mobileMenu a').forEach(a => a.addEventListener('click', () => $('#mobileMenu')?.classList.remove('open')));
$$('[data-wallet-connect]').forEach(btn => btn.addEventListener('click', connectWallet));
$('#usdcInput')?.addEventListener('input', updatePreview);
$('#stakeToggle')?.addEventListener('change', () => { updatePreview(); updateBuyAvailability(); });
$('#referralInput')?.addEventListener('change', e => setReferral(e.target.value));
$('#copyReferralLink')?.addEventListener('click', async () => {
  try{
    if(!wallet)await connectWallet();
    await activateReferralReceiving();
    await navigator.clipboard.writeText(referralLinkFor(wallet.toBase58()));
    toast('Referral link copied. Your wallet is ready to receive referral USDC.');
  }catch(err){toast(err.message||'Could not activate referral receiving account.');}
});
$('#buyRlya')?.addEventListener('click', () => secureAllocation().catch(err => { toast(err.message || 'Allocation purchase failed.'); updateBuyAvailability(); }));

wireGithub(); loadReferralFromUrl(); updateReferralLink(); syncStakeUi(); refreshState(); updatePreview(); updateBuyAvailability();
refreshTimer = setInterval(() => { refreshState(); if (wallet) refreshWallet(); }, 15_000);
window.addEventListener('beforeunload', () => clearInterval(refreshTimer));
