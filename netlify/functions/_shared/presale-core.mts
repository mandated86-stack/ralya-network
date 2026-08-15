import { getStore } from '@netlify/blobs';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { createHash, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';

export const OWNER_WALLET = 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo';
export const PRESALE_TREASURY_WALLET = OWNER_WALLET;
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const PRESALE_STORE = 'ralya-prelaunch-presale';
export const RLYA_UNIT = 1_000_000_000n;
export const USDC_UNIT = 1_000_000n;
export const PRESALE_CAP_BASE = 100_680_000n * RLYA_UNIT;
export const BASE_PRICE_MICRO_USDC = 3_000n;
export const STEP_SIZE_BASE = 1_000_000n * RLYA_UNIT;
export const STEP_INCREMENT_MICRO_USDC = 50n;
export const REFERRAL_BPS = 100n;
export const BPS_DENOMINATOR = 10_000n;
export const MIN_PURCHASE_USDC_BASE = USDC_UNIT;
export const QUOTE_TTL_MS = 5 * 60 * 1000;
export const MAX_OWNER_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type AllocationEvent = {
  id: string;
  kind: 'web' | 'manual';
  wallet: string;
  rlyaBase: string;
  grossUsdcBase: string;
  referralUsdcBase: string;
  referrer: string | null;
  curveStartBase: string;
  curveEndBase: string;
  priceBeforeMicroUsdc: string;
  priceAfterMicroUsdc: string;
  createdAt: string;
  confirmedAt?: string;
  signature?: string;
  paymentReference?: string;
  note?: string;
};

export type PresaleControl = {
  access: 'closed' | 'open' | 'paused';
  updatedAt: string | null;
  updatedBy: string | null;
};

const DEFAULT_CONTROL: PresaleControl = {
  access: 'closed',
  updatedAt: null,
  updatedBy: null,
};

export function store() {
  return getStore({ name: PRESALE_STORE, consistency: 'strong' });
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function assertWallet(value: unknown, label = 'wallet') {
  const text = String(value || '').trim();
  try {
    const key = new PublicKey(text);
    if (key.toBytes().length !== 32) throw new Error('length');
    return key.toBase58();
  } catch {
    throw new Error(`${label} is not a valid Solana public address.`);
  }
}

export function cleanText(value: unknown, max = 220) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function decimalToBase(value: unknown, decimals: number, label = 'amount') {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Enter a valid ${label}.`);
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) throw new Error(`${label} supports at most ${decimals} decimal places.`);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals));
}

export function baseToDecimal(base: bigint, decimals: number, maxFraction = decimals) {
  const unit = 10n ** BigInt(decimals);
  const whole = base / unit;
  let frac = (base % unit).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}`;
}

export function priceAt(progressBase: bigint) {
  return BASE_PRICE_MICRO_USDC + (progressBase / STEP_SIZE_BASE) * STEP_INCREMENT_MICRO_USDC;
}

const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
const minBig = (a: bigint, b: bigint) => a < b ? a : b;

export function quoteAllocation(progressBase: bigint, usdcBase: bigint) {
  if (usdcBase < MIN_PURCHASE_USDC_BASE) throw new Error('Minimum purchase is 1 USDC.');
  if (progressBase >= PRESALE_CAP_BASE) throw new Error('Presale allocation is fully reserved.');
  let remaining = usdcBase;
  let progress = progressBase;
  let allocation = 0n;
  let loops = 0;

  while (remaining > 0n) {
    if (progress >= PRESALE_CAP_BASE) throw new Error('This order exceeds the remaining presale allocation.');
    loops += 1;
    if (loops > 256) throw new Error('Order crosses too many pricing steps.');
    const stepIndex = progress / STEP_SIZE_BASE;
    const price = BASE_PRICE_MICRO_USDC + stepIndex * STEP_INCREMENT_MICRO_USDC;
    const nextBoundary = minBig((stepIndex + 1n) * STEP_SIZE_BASE, PRESALE_CAP_BASE);
    const available = nextBoundary - progress;
    const costToFill = ceilDiv(available * price, RLYA_UNIT);
    if (remaining >= costToFill) {
      allocation += available;
      progress += available;
      remaining -= costToFill;
    } else {
      const part = remaining * RLYA_UNIT / price;
      if (part <= 0n || part > available) throw new Error('Purchase amount is too small for the current price.');
      allocation += part;
      progress += part;
      remaining = 0n;
    }
  }

  return {
    rlyaBase: allocation,
    curveStartBase: progressBase,
    curveEndBase: progress,
    priceBeforeMicroUsdc: priceAt(progressBase),
    priceAfterMicroUsdc: priceAt(progress),
  };
}

async function readPrefix<T = any>(s: ReturnType<typeof store>, prefix: string): Promise<T[]> {
  const listed = await s.list({ prefix });
  if (!listed?.blobs?.length) return [];
  const values = await Promise.all(listed.blobs.map(async (row: any) => s.get(row.key, { type: 'json' })));
  return values.filter(Boolean) as T[];
}

export async function getControl(s = store()) {
  return (await s.get('control', { type: 'json' }) as PresaleControl | null) || DEFAULT_CONTROL;
}

export async function getAllocationEvents(s = store()) {
  const [web, manual] = await Promise.all([
    readPrefix<AllocationEvent>(s, 'purchase/'),
    readPrefix<AllocationEvent>(s, 'manual/'),
  ]);
  return [...web, ...manual];
}

export async function getActiveQuotes(s = store(), now = Date.now()) {
  const quotes = await readPrefix<any>(s, 'quote/');
  return quotes.filter(q => q?.status === 'active' && Number(q?.expiresAtMs || 0) > now);
}

export async function computeState(s = store(), includeReservations = false) {
  const [events, control, activeQuotes] = await Promise.all([
    getAllocationEvents(s),
    getControl(s),
    includeReservations ? getActiveQuotes(s) : Promise.resolve([]),
  ]);

  let totalAllocated = 0n;
  let webAllocated = 0n;
  let manualAllocated = 0n;
  let totalUsdc = 0n;
  let totalReferral = 0n;
  let webCount = 0;
  let manualCount = 0;

  for (const event of events) {
    const rlya = BigInt(event.rlyaBase || 0);
    totalAllocated += rlya;
    totalUsdc += BigInt(event.grossUsdcBase || 0);
    totalReferral += BigInt(event.referralUsdcBase || 0);
    if (event.kind === 'manual') {
      manualAllocated += rlya;
      manualCount += 1;
    } else {
      webAllocated += rlya;
      webCount += 1;
    }
  }

  let reserved = 0n;
  for (const quote of activeQuotes) reserved += BigInt(quote.rlyaBase || 0);
  const effectiveProgress = totalAllocated + reserved;
  const current = priceAt(totalAllocated);
  const nextBoundary = minBig(((totalAllocated / STEP_SIZE_BASE) + 1n) * STEP_SIZE_BASE, PRESALE_CAP_BASE);

  return {
    control,
    events,
    activeQuotes,
    totalAllocatedBase: totalAllocated,
    webAllocatedBase: webAllocated,
    manualAllocatedBase: manualAllocated,
    totalUsdcRaisedBase: totalUsdc,
    totalReferralUsdcPaidBase: totalReferral,
    reservedBase: reserved,
    effectiveProgressBase: effectiveProgress,
    remainingBase: PRESALE_CAP_BASE - totalAllocated,
    availableForNewQuotesBase: PRESALE_CAP_BASE - effectiveProgress,
    currentPriceMicroUsdc: current,
    nextPriceMicroUsdc: current + STEP_INCREMENT_MICRO_USDC,
    toNextStepBase: nextBoundary > totalAllocated ? nextBoundary - totalAllocated : 0n,
    webCount,
    manualCount,
  };
}

export function publicState(state: Awaited<ReturnType<typeof computeState>>) {
  return {
    access: state.control.access,
    currentPriceMicroUsdc: state.currentPriceMicroUsdc.toString(),
    nextPriceMicroUsdc: state.nextPriceMicroUsdc.toString(),
    totalAllocatedBase: state.totalAllocatedBase.toString(),
    webAllocatedBase: state.webAllocatedBase.toString(),
    manualAllocatedBase: state.manualAllocatedBase.toString(),
    totalUsdcRaisedBase: state.totalUsdcRaisedBase.toString(),
    totalReferralUsdcPaidBase: state.totalReferralUsdcPaidBase.toString(),
    remainingBase: state.remainingBase.toString(),
    toNextStepBase: state.toNextStepBase.toString(),
    presaleCapBase: PRESALE_CAP_BASE.toString(),
    basePriceMicroUsdc: BASE_PRICE_MICRO_USDC.toString(),
    stepSizeBase: STEP_SIZE_BASE.toString(),
    stepIncrementMicroUsdc: STEP_INCREMENT_MICRO_USDC.toString(),
    referralBps: REFERRAL_BPS.toString(),
    webPurchaseCount: state.webCount,
    manualAllocationCount: state.manualCount,
    distributionStatus: 'scheduled-before-public-launch',
    updatedAt: state.control.updatedAt,
  };
}

function ownerKey(wallet: string) {
  const raw = bs58.decode(wallet);
  if (raw.length !== 32) throw new Error('Invalid owner public key length.');
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function ownerMessage(wallet: string, operation: string, payload: any, timestamp: string, nonce: string) {
  return [
    'RALYA owner presale action',
    `Wallet: ${wallet}`,
    `Operation: ${operation}`,
    `Payload: ${stableStringify(payload || {})}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

export async function verifyOwnerAction(s: ReturnType<typeof store>, body: any) {
  const wallet = assertWallet(body?.wallet, 'Owner wallet');
  if (wallet !== OWNER_WALLET) throw new Error('Owner wallet required.');
  const operation = cleanText(body?.operation, 64);
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  const timestamp = String(body?.timestamp || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const message = String(body?.message || '');
  const signatureB64 = String(body?.signature || '').trim();
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('Invalid owner action nonce.');
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > MAX_OWNER_CLOCK_SKEW_MS) throw new Error('Owner signature expired. Sign again.');
  const expected = ownerMessage(wallet, operation, payload, timestamp, nonce);
  if (message !== expected) throw new Error('Signed owner message does not match the action.');
  const used = await s.get(`auth/${nonce}`, { type: 'json' });
  if (used) throw new Error('Owner action nonce has already been used.');
  let signature: Buffer;
  try { signature = Buffer.from(signatureB64, 'base64'); } catch { throw new Error('Invalid owner signature encoding.'); }
  if (signature.length !== 64) throw new Error('Invalid owner signature length.');
  const ok = verifySignature(null, Buffer.from(message, 'utf8'), ownerKey(wallet), signature);
  if (!ok) throw new Error('Owner signature verification failed.');
  await s.setJSON(`auth/${nonce}`, { operation, usedAt: new Date().toISOString() });
  return { wallet, operation, payload };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withMutationLock<T>(s: ReturnType<typeof store>, fn: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const key = 'lock/mutation';
  let acquired = false;
  for (let attempt = 0; attempt < 12 && !acquired; attempt += 1) {
    const now = Date.now();
    const current: any = await s.get(key, { type: 'json' });
    if (current?.expiresAtMs && Number(current.expiresAtMs) > now) {
      await sleep(70 + Math.floor(Math.random() * 90));
      continue;
    }
    await s.setJSON(key, { token, expiresAtMs: now + 8_000 });
    await sleep(90 + Math.floor(Math.random() * 50));
    const check1: any = await s.get(key, { type: 'json' });
    if (check1?.token !== token) continue;
    await sleep(45);
    const check2: any = await s.get(key, { type: 'json' });
    if (check2?.token === token) acquired = true;
  }
  if (!acquired) throw new Error('Presale is busy. Please retry in a moment.');
  try {
    return await fn();
  } finally {
    const current: any = await s.get(key, { type: 'json' });
    if (current?.token === token) await s.delete(key);
  }
}

export function referralReward(grossUsdcBase: bigint) {
  return grossUsdcBase * REFERRAL_BPS / BPS_DENOMINATOR;
}

export function sha256Json(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}
