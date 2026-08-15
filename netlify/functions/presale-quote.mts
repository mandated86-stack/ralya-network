import bs58 from 'bs58';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  PRESALE_TREASURY_WALLET, QUOTE_TTL_MS, USDC_MINT, assertWallet, computeState,
  decimalToBase, getActiveQuotes, json, newId, quoteAllocation, referralReward, store, withMutationLock,
} from './_shared/presale-core.mts';

const REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;

function buyerKey(wallet: string) {
  const raw = bs58.decode(wallet);
  if (raw.length !== 32) throw new Error('Invalid buyer public key length.');
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function quoteMessage(wallet: string, usdcAmount: string, referrer: string | null, timestamp: string, nonce: string) {
  return [
    'RALYA prelaunch allocation quote',
    `Wallet: ${wallet}`,
    `USDC: ${usdcAmount}`,
    `Referrer: ${referrer || '-'}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

function verifyBuyerRequest(body: any, buyer: string, referrer: string | null) {
  const usdcAmount = String(body?.usdcAmount || '').trim();
  const timestamp = String(body?.timestamp || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const message = String(body?.message || '');
  const signatureB64 = String(body?.signature || '').trim();
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('Invalid quote nonce.');
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > REQUEST_CLOCK_SKEW_MS) throw new Error('Quote authorization expired. Sign again.');
  const expected = quoteMessage(buyer, usdcAmount, referrer, timestamp, nonce);
  if (message !== expected) throw new Error('Signed quote request does not match checkout.');
  let signature: Buffer;
  try { signature = Buffer.from(signatureB64, 'base64'); } catch { throw new Error('Invalid quote signature encoding.'); }
  if (signature.length !== 64) throw new Error('Invalid quote signature length.');
  if (!verifySignature(null, Buffer.from(message, 'utf8'), buyerKey(buyer), signature)) throw new Error('Buyer quote signature verification failed.');
  return { usdcAmount, nonce };
}

function ipKey(context: any) {
  const source = String(context?.ip || 'unknown');
  return createHash('sha256').update(`ralya:${source}`).digest('hex').slice(0, 32);
}

export default async (req: Request, context: any) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

  try {
    const buyer = assertWallet(body?.wallet, 'Buyer wallet');
    const requestedReferrer = body?.referrer ? assertWallet(body.referrer, 'Referral wallet') : null;
    const auth = verifyBuyerRequest(body, buyer, requestedReferrer);
    const grossUsdcBase = decimalToBase(auth.usdcAmount, 6, 'USDC amount');
    if (buyer === PRESALE_TREASURY_WALLET) throw new Error('Treasury wallet cannot create a public presale order.');
    if (requestedReferrer === buyer) throw new Error('You cannot refer your own wallet.');

    const s = store();
    const result = await withMutationLock(s, async () => {
      const replay = await s.get(`quote-auth/${auth.nonce}`, { type: 'json' });
      if (replay) throw new Error('This quote authorization has already been used.');

      const now = Date.now();
      const rateKey = `rate/${ipKey(context)}`;
      const rate: any = await s.get(rateKey, { type: 'json' });
      const currentRate = rate && Number(rate.windowStartMs || 0) + RATE_WINDOW_MS > now
        ? { windowStartMs: Number(rate.windowStartMs), count: Number(rate.count || 0) }
        : { windowStartMs: now, count: 0 };
      if (currentRate.count >= RATE_LIMIT) throw new Error('Too many quote requests. Please try again shortly.');
      await s.setJSON(rateKey, { windowStartMs: currentRate.windowStartMs, count: currentRate.count + 1 });
      const authClaim = await s.setJSON(`quote-auth/${auth.nonce}`, { buyer, usedAt: new Date(now).toISOString() }, { onlyIfNew: true });
      if (!authClaim.modified) throw new Error('This quote authorization has already been used.');

      // A buyer can hold only one live reservation. Replacing a quote releases the
      // old reservation before the new one is priced, preventing accidental self-blocking.
      const active = await getActiveQuotes(s, now);
      for (const old of active) {
        if (old?.buyer === buyer) await s.setJSON(`quote/${old.quoteId}`, { ...old, status: 'replaced', replacedAt: new Date(now).toISOString() });
      }

      const state = await computeState(s, true);
      if (state.control.access !== 'open') throw new Error(state.control.access === 'paused' ? 'Presale allocation access is temporarily paused.' : 'Presale allocation access is not open yet.');

      const storedReferral: any = await s.get(`referral/${buyer}`, { type: 'json' });
      let referrer: string | null = requestedReferrer;
      if (storedReferral?.referrer) {
        if (referrer && referrer !== storedReferral.referrer) throw new Error('This wallet already has a different locked referrer.');
        referrer = storedReferral.referrer;
      }
      if (referrer) {
        const reverse: any = await s.get(`referral/${referrer}`, { type: 'json' });
        if (reverse?.referrer === buyer) throw new Error('Direct two-wallet referral loops are not allowed.');
      }

      const progress = state.effectiveProgressBase;
      const quoted = quoteAllocation(progress, grossUsdcBase);
      if (quoted.rlyaBase > state.availableForNewQuotesBase) throw new Error('This order exceeds the remaining presale allocation.');

      const referralUsdcBase = referrer ? referralReward(grossUsdcBase) : 0n;
      if (referrer && referralUsdcBase <= 0n) throw new Error('Purchase is too small for the referral split.');
      const treasuryUsdcBase = grossUsdcBase - referralUsdcBase;
      const quoteId = newId('q');
      const quote = {
        quoteId,
        status: 'active',
        buyer,
        referrer,
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
        createdAt: new Date(now).toISOString(),
        createdAtMs: now,
        expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
        expiresAtMs: now + QUOTE_TTL_MS,
      };
      await s.setJSON(`quote/${quoteId}`, quote);
      return quote;
    });

    return json({ ok: true, quote: result });
  } catch (err: any) {
    return json({ error: err?.message || 'Could not create presale quote.' }, 400);
  }
};

export const config = { path: '/api/presale/quote' };
