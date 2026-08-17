import { createHash } from 'node:crypto';
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  PRESALE_TREASURY_WALLET,
  QUOTE_TTL_MS,
  USDC_MINT,
  USDC_UNIT,
  assertWallet,
  baseToDecimal,
  computeState,
  decimalToBase,
  deliveryPolicy,
  getActiveQuotes,
  newId,
  publicState,
  quoteAllocation,
  referralReward,
  stakingBonus,
  store,
  withMutationLock,
} from './_shared/presale-core.mts';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const ICON_URL = 'https://ralyaai.com/rlya-token.png';
const ACTION_PATH = '/api/actions/rlya';
const CONFIRM_PATH = '/api/actions/rlya/confirm';
const MAX_BLINK_USDC_BASE = 1_000n * USDC_UNIT;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 8;
const CODE_RE = /^[A-F0-9]{10}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding',
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };
}

function actionJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function actionError(message: string, status = 400) {
  return actionJson({ message }, status);
}

function rpcEndpoint() {
  const endpoint = (globalThis as any).Netlify?.env?.get?.('RALYA_SOLANA_RPC');
  if (!endpoint) throw new Error('Dedicated Solana Mainnet RPC is not configured.');
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:') throw new Error('Dedicated Solana Mainnet RPC must use HTTPS.');
  return parsed.toString();
}

function deploymentContext() {
  const netlify = (globalThis as any).Netlify;
  return String(netlify?.context?.deploy?.context || netlify?.env?.get?.('CONTEXT') || '').trim().toLowerCase();
}

function assertProductionMutation() {
  const context = deploymentContext();
  if (context && context !== 'production') {
    throw new Error('RLYA Blink purchases are disabled on preview deployments. Open ralyaai.com/buy to use production.');
  }
}

function ipKey(context: any) {
  const source = String(context?.ip || 'unknown');
  return createHash('sha256').update(`ralya-blink:${source}`).digest('hex').slice(0, 32);
}

function normalizedRef(value: string | null) {
  return String(value || '').trim().slice(0, 64);
}

async function resolveRequestedReferrer(s: ReturnType<typeof store>, raw: string | null) {
  const value = normalizedRef(raw);
  if (!value) return null;
  const upper = value.toUpperCase();
  if (CODE_RE.test(upper)) {
    const record: any = await s.get(`refcode/${upper}`, { type: 'json' });
    if (!record?.wallet) throw new Error('Referral code was not found. Open the RALYA presale and check the link.');
    return assertWallet(record.wallet, 'Referral wallet');
  }
  return assertWallet(value, 'Referral wallet');
}

function requestedRelease(value: string | null) {
  const mode = String(value || 'auto').trim().toLowerCase();
  if (!['auto', 'standard', 'stake'].includes(mode)) throw new Error('Choose Standard or Buy + Stake.');
  return mode as 'auto' | 'standard' | 'stake';
}

function formatRlya(base: string | bigint) {
  return baseToDecimal(BigInt(base), 9, 4);
}

function formatUsdc(base: string | bigint) {
  return baseToDecimal(BigInt(base), 6, 6);
}

function withRef(href: string, ref: string) {
  if (!ref) return href;
  return `${href}${href.includes('?') ? '&' : '?'}ref=${encodeURIComponent(ref)}`;
}

async function metadata(req: Request) {
  const url = new URL(req.url);
  const ref = normalizedRef(url.searchParams.get('ref'));
  const s = store();
  const state = await computeState(s, true);
  const publicData = publicState(state);
  const open = state.control.access === 'open';
  const referralText = ref ? ' Referral link attached.' : '';
  const description = open
    ? `Live RLYA presale on Solana. Current price $${publicData.currentPriceUsdc} USDC/RLYA. Standard release is T-1; Buy + Stake adds a fixed 5% RLYA bonus and unlocks T+21.${referralText}`
    : `RLYA presale is currently ${state.control.access}. No Blink purchase can be created until access is open.`;

  const response: any = {
    type: 'action',
    icon: ICON_URL,
    title: 'RALYA — RLYA Presale',
    description,
    label: open ? 'Buy RLYA' : 'Presale unavailable',
    disabled: !open,
  };

  if (open) {
    response.links = {
      actions: [
        { type: 'transaction', label: 'Buy 1 USDC', href: withRef(`${ACTION_PATH}?amount=1&release=auto`, ref) },
        { type: 'transaction', label: 'Buy 10 USDC', href: withRef(`${ACTION_PATH}?amount=10&release=auto`, ref) },
        { type: 'transaction', label: 'Buy 50 USDC', href: withRef(`${ACTION_PATH}?amount=50&release=auto`, ref) },
        {
          type: 'transaction',
          label: 'Custom buy',
          href: withRef(`${ACTION_PATH}?amount={amount}&release={release}`, ref),
          parameters: [
            {
              name: 'amount',
              type: 'number',
              label: 'USDC amount (1–1000)',
              required: true,
              min: 1,
              max: 1000,
            },
            {
              name: 'release',
              type: 'select',
              label: 'Release option',
              required: true,
              options: [
                { label: 'Standard — RLYA T-1', value: 'standard', selected: true },
                { label: 'Buy + Stake — +5%, unlock T+21', value: 'stake' },
              ],
            },
          ],
        },
      ],
    };
  } else {
    response.error = { message: 'The presale must be open before a Blink transaction can be created.' };
  }

  return actionJson(response);
}

async function createBlinkQuote(req: Request, context: any) {
  assertProductionMutation();
  let body: any;
  try { body = await req.json(); } catch { throw new Error('Invalid Action request body.'); }

  const url = new URL(req.url);
  const buyer = assertWallet(body?.account, 'Buyer wallet');
  if (buyer === PRESALE_TREASURY_WALLET) throw new Error('Treasury wallet cannot create a public presale order.');

  const amountText = String(url.searchParams.get('amount') || '').trim();
  const grossUsdcBase = decimalToBase(amountText, 6, 'USDC amount');
  if (grossUsdcBase > MAX_BLINK_USDC_BASE) throw new Error('Blink purchases are limited to 1,000 USDC per transaction. Use the full RALYA presale for larger orders.');
  const release = requestedRelease(url.searchParams.get('release'));
  const requestedRef = url.searchParams.get('ref');
  const s = store();

  const quote = await withMutationLock(s, async () => {
    const now = Date.now();
    const [requestedReferrer, storedReferral, storedStake]: any[] = await Promise.all([
      resolveRequestedReferrer(s, requestedRef),
      s.get(`referral/${buyer}`, { type: 'json' }),
      s.get(`stake/${buyer}`, { type: 'json' }),
    ]);

    let referrer: string | null = requestedReferrer;
    if (storedReferral?.referrer) {
      const locked = assertWallet(storedReferral.referrer, 'Locked referral wallet');
      if (referrer && referrer !== locked) throw new Error('This wallet already has a different locked referrer.');
      referrer = locked;
    }
    if (referrer === buyer) throw new Error('You cannot refer your own wallet.');
    if (referrer) {
      const reverse: any = await s.get(`referral/${referrer}`, { type: 'json' });
      if (reverse?.referrer === buyer) throw new Error('Direct two-wallet referral loops are not allowed.');
    }

    let stake: boolean;
    if (storedStake) {
      stake = Boolean(storedStake.stake);
      if (release === 'standard' && stake) throw new Error('This wallet is already locked to Buy + Stake for presale purchases.');
      if (release === 'stake' && !stake) throw new Error('This wallet is already locked to Standard T-1 release for presale purchases.');
    } else {
      stake = release === 'stake';
    }

    const active = await getActiveQuotes(s, now);
    const reusable = active.find((old: any) =>
      old?.source === 'blink'
      && old?.buyer === buyer
      && String(old?.grossUsdcBase || '') === grossUsdcBase.toString()
      && Boolean(old?.stake) === stake
      && (old?.referrer || null) === referrer
      && Number(old?.expiresAtMs || 0) > now + 45_000
    );
    if (reusable) return reusable;

    const rateKey = `blink-rate/${ipKey(context)}`;
    const rate: any = await s.get(rateKey, { type: 'json' });
    const currentRate = rate && Number(rate.windowStartMs || 0) + RATE_WINDOW_MS > now
      ? { windowStartMs: Number(rate.windowStartMs), count: Number(rate.count || 0) }
      : { windowStartMs: now, count: 0 };
    if (currentRate.count >= RATE_LIMIT) throw new Error('Too many Blink quote requests. Please try again shortly.');
    await s.setJSON(rateKey, { windowStartMs: currentRate.windowStartMs, count: currentRate.count + 1 });

    for (const old of active) {
      if (old?.buyer === buyer) {
        await s.setJSON(`quote/${old.quoteId}`, { ...old, status: 'replaced', replacedAt: new Date(now).toISOString() });
      }
    }

    const state = await computeState(s, true);
    if (state.control.access !== 'open') {
      throw new Error(state.control.access === 'paused'
        ? 'RLYA presale is temporarily paused.'
        : 'RLYA presale is not open yet.');
    }

    const quoted = quoteAllocation(state.effectiveProgressBase, grossUsdcBase);
    if (quoted.rlyaBase > state.availableForNewQuotesBase) throw new Error('This order exceeds the remaining presale allocation.');
    const stakingBonusBase = stake ? stakingBonus(quoted.rlyaBase) : 0n;
    if (stakingBonusBase > state.availableStakingBonusBase) throw new Error('The fixed RLYA staking bonus reserve is fully committed.');
    const referralUsdcBase = referrer ? referralReward(grossUsdcBase) : 0n;
    if (referrer && referralUsdcBase <= 0n) throw new Error('Purchase is too small for the referral split.');
    const treasuryUsdcBase = grossUsdcBase - referralUsdcBase;
    const quoteId = newId('q');
    const createdAt = new Date(now).toISOString();
    const record = {
      quoteId,
      status: 'active',
      source: 'blink',
      buyer,
      referrer,
      stake,
      stakingBonusBase: stakingBonusBase.toString(),
      expectedTotalRlyaBase: (quoted.rlyaBase + stakingBonusBase).toString(),
      deliveryPolicy: deliveryPolicy(stake),
      grossUsdcBase: grossUsdcBase.toString(),
      treasuryUsdcBase: treasuryUsdcBase.toString(),
      referralUsdcBase: referralUsdcBase.toString(),
      rlyaBase: quoted.rlyaBase.toString(),
      curveStartBase: quoted.curveStartBase.toString(),
      curveEndBase: quoted.curveEndBase.toString(),
      priceBeforeMicroUsdc: quoted.priceBeforeMicroUsdc.toString(),
      priceAfterMicroUsdc: quoted.priceAfterMicroUsdc.toString(),
      treasuryWallet: PRESALE_TREASURY_WALLET,
      usdcMint: USDC_MINT,
      memo: `RALYA-PRELAUNCH:${quoteId}`,
      createdAt,
      createdAtMs: now,
      expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
      expiresAtMs: now + QUOTE_TTL_MS,
    };
    await s.setJSON(`quote/${quoteId}`, record);
    return record;
  });

  return { quote, s };
}

async function buildTransaction(quote: any) {
  const connection = new Connection(rpcEndpoint(), 'confirmed');
  const buyer = new PublicKey(assertWallet(quote.buyer, 'Buyer wallet'));
  const mint = new PublicKey(USDC_MINT);
  const treasury = new PublicKey(PRESALE_TREASURY_WALLET);
  const buyerAta = await getAssociatedTokenAddress(mint, buyer);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasury);

  const [buyerInfo, treasuryInfo] = await Promise.all([
    connection.getAccountInfo(buyerAta, 'confirmed'),
    connection.getAccountInfo(treasuryAta, 'confirmed'),
  ]);
  if (!buyerInfo) throw new Error('This wallet has no USDC token account on Solana.');
  if (!treasuryInfo) throw new Error('RALYA treasury USDC receiving account is not ready. No funds were moved.');

  const balance = await connection.getTokenAccountBalance(buyerAta, 'confirmed');
  if (BigInt(balance.value.amount || '0') < BigInt(quote.grossUsdcBase)) {
    throw new Error(`Wallet has ${balance.value.uiAmountString || '0'} USDC; this Blink requires ${formatUsdc(quote.grossUsdcBase)} USDC.`);
  }

  let referrerAta: PublicKey | null = null;
  if (quote.referrer) {
    const referrer = new PublicKey(assertWallet(quote.referrer, 'Referral wallet'));
    referrerAta = await getAssociatedTokenAddress(mint, referrer);
    if (!await connection.getAccountInfo(referrerAta, 'confirmed')) {
      throw new Error('Referral wallet is not ready to receive USDC. Open the full RALYA presale to continue.');
    }
  }

  const tx = new Transaction();
  const treasuryAmount = BigInt(quote.treasuryUsdcBase);
  if (treasuryAmount > 0n) {
    tx.add(createTransferCheckedInstruction(buyerAta, mint, treasuryAta, buyer, treasuryAmount, 6));
  }
  const referralAmount = BigInt(quote.referralUsdcBase || 0);
  if (quote.referrer && referralAmount > 0n && referrerAta) {
    tx.add(createTransferCheckedInstruction(buyerAta, mint, referrerAta, buyer, referralAmount, 6));
  }
  tx.add(new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [],
    data: Buffer.from(String(quote.memo), 'utf8'),
  }));

  const latest = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = buyer;
  tx.recentBlockhash = latest.blockhash;
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

async function handlePurchase(req: Request, context: any) {
  const { quote, s } = await createBlinkQuote(req, context);
  try {
    const transaction = await buildTransaction(quote);
    const base = formatRlya(quote.rlyaBase);
    const bonus = BigInt(quote.stakingBonusBase || 0);
    const total = formatRlya(BigInt(quote.rlyaBase) + bonus);
    const release = quote.stake
      ? `Buy + Stake: ${base} RLYA + ${formatRlya(bonus)} bonus = ${total} RLYA, unlock T+21.`
      : `Standard: ${base} RLYA, release T-1.`;
    return actionJson({
      transaction,
      message: `Pay ${formatUsdc(quote.grossUsdcBase)} USDC for a locked RLYA presale allocation. ${release}`,
      links: {
        next: {
          type: 'post',
          href: `${CONFIRM_PATH}?quoteId=${encodeURIComponent(quote.quoteId)}`,
        },
      },
    });
  } catch (err) {
    try {
      const current: any = await s.get(`quote/${quote.quoteId}`, { type: 'json' });
      if (current?.status === 'active') {
        await s.setJSON(`quote/${quote.quoteId}`, { ...current, status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: 'blink-transaction-build-failed' });
      }
    } catch {}
    throw err;
  }
}

async function confirmBlink(req: Request) {
  assertProductionMutation();
  const url = new URL(req.url);
  const quoteId = String(url.searchParams.get('quoteId') || '').trim();
  if (!/^q_[a-f0-9]{32}$/i.test(quoteId)) throw new Error('Invalid RLYA Blink quote ID.');

  let body: any;
  try { body = await req.json(); } catch { throw new Error('Invalid Blink confirmation body.'); }
  const account = assertWallet(body?.account, 'Buyer wallet');
  const signature = String(body?.signature || '').trim();
  if (!SIGNATURE_RE.test(signature)) throw new Error('Invalid Solana transaction signature.');

  const s = store();
  const quote: any = await s.get(`quote/${quoteId}`, { type: 'json' });
  if (!quote) throw new Error('RLYA Blink quote was not found.');
  if (quote.buyer !== account) throw new Error('Blink confirmation wallet does not match the locked quote.');

  const confirmUrl = new URL('/api/presale/confirm', req.url);
  let response: Response | null = null;
  let data: any = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(confirmUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ quoteId, signature }),
    });
    data = await response.json().catch(() => ({}));
    if (response.ok) break;
    if (!/not confirmed on Solana yet/i.test(String(data?.error || '')) || attempt === 3) break;
    await sleep(900);
  }
  if (!response?.ok) throw new Error(data?.error || 'Could not verify the RLYA Blink purchase.');

  const receipt = data.receipt || {};
  const base = BigInt(receipt.rlyaBase || 0);
  const bonus = BigInt(receipt.stakingBonusBase || 0);
  const total = base + bonus;
  const release = receipt.stake
    ? 'Base allocation + fixed 5% bonus unlock 21 days after public launch.'
    : 'Purchased RLYA is scheduled for automatic delivery 1 day before public launch.';
  return actionJson({
    type: 'completed',
    icon: ICON_URL,
    title: 'RLYA purchase confirmed',
    description: `${formatRlya(total)} RLYA recorded for your wallet. ${release} Transaction verified on Solana.`,
    label: 'Purchase confirmed',
    disabled: true,
  });
}

export default async (req: Request, context: any) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  const path = new URL(req.url).pathname;

  try {
    if (path === CONFIRM_PATH) {
      if (req.method !== 'POST') return actionError('Method not allowed.', 405);
      return await confirmBlink(req);
    }
    if (path !== ACTION_PATH) return actionError('Action route not found.', 404);
    if (req.method === 'GET') return await metadata(req);
    if (req.method === 'POST') return await handlePurchase(req, context);
    return actionError('Method not allowed.', 405);
  } catch (err: any) {
    return actionError(err?.message || 'RLYA Blink request failed.');
  }
};

export const config = {
  path: [ACTION_PATH, CONFIRM_PATH],
};
