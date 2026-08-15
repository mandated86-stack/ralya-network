import bs58 from 'bs58';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  PRESALE_TREASURY_WALLET, QUOTE_TTL_MS, USDC_MINT, assertWallet, computeState,
  decimalToBase, deliveryPolicy, getActiveQuotes, json, newId, quoteAllocation, referralReward,
  stakingBonus, store, withMutationLock,
} from './_shared/presale-core.mts';

const REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;
const MAX_SLIPPAGE_BPS = 500;

function buyerKey(wallet: string) {
  const raw = bs58.decode(wallet);
  if (raw.length !== 32) throw new Error('Invalid buyer public key length.');
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function quoteMessage(wallet: string, usdcAmount: string, referrer: string | null, stake: boolean, timestamp: string, nonce: string) {
  return [
    'RALYA prelaunch allocation quote',
    `Wallet: ${wallet}`,
    `USDC: ${usdcAmount}`,
    `Referrer: ${referrer || '-'}`,
    `Stake: ${stake ? 'YES' : 'NO'}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

function verifyBuyerRequest(body: any, buyer: string, referrer: string | null) {
  const usdcAmount = String(body?.usdcAmount || '').trim();
  const stake = body?.stake === true;
  const timestamp = String(body?.timestamp || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const message = String(body?.message || '');
  const signatureB64 = String(body?.signature || '').trim();
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('Invalid quote nonce.');
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > REQUEST_CLOCK_SKEW_MS) throw new Error('Quote authorization expired. Sign again.');
  const expected = quoteMessage(buyer, usdcAmount, referrer, stake, timestamp, nonce);
  if (message !== expected) throw new Error('Signed quote request does not match checkout.');
  let signature: Buffer;
  try { signature = Buffer.from(signatureB64, 'base64'); } catch { throw new Error('Invalid quote signature encoding.'); }
  if (signature.length !== 64) throw new Error('Invalid quote signature length.');
  if (!verifySignature(null, Buffer.from(message, 'utf8'), buyerKey(buyer), signature)) throw new Error('Buyer quote signature verification failed.');
  return { usdcAmount, stake, nonce };
}

function parseSlippageProtection(body: any) {
  const hasBps = body?.slippageBps !== undefined && body?.slippageBps !== null && body?.slippageBps !== '';
  const hasMinimum = body?.minRlyaBase !== undefined && body?.minRlyaBase !== null && body?.minRlyaBase !== '';
  if (!hasBps && !hasMinimum) return null;
  if (!hasBps || !hasMinimum) throw new Error('Incomplete slippage protection. Refresh the presale and try again.');

  const bps = Number(body.slippageBps);
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_SLIPPAGE_BPS) throw new Error('Slippage must be between 0% and 5%.');
  const minimumText = String(body.minRlyaBase).trim();
  if (!/^\d+$/.test(minimumText)) throw new Error('Invalid minimum RLYA output.');
  const minRlyaBase = BigInt(minimumText);
  if (minRlyaBase <= 0n) throw new Error('Minimum RLYA output must be greater than zero.');
  return { bps, minRlyaBase };
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
    const slippage = parseSlippageProtection(body);
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

      const active = await getActiveQuotes(s, now);
      for (const old of active) {
        if (old?.buyer === buyer) await s.setJSON(`quote/${old.quoteId}`, { ...old, status: 'replaced', replacedAt: new Date(now).toISOString() });
      }

      const state = await computeState(s, true);
      if (state.control.access !== 'open') throw new Error(state.control.access === 'paused' ? 'Presale allocation access is temporarily paused.' : 'Presale allocation access is not open yet.');

      const [storedReferral, storedStake]: any[] = await Promise.all([
        s.get(`referral/${buyer}`, { type: 'json' }),
        s.get(`stake/${buyer}`, { type: 'json' }),
      ]);
      let referrer: string | null = requestedReferrer;
      if (storedReferral?.referrer) {
        if (referrer && referrer !== storedReferral.referrer) throw new Error('This wallet already has a different locked referrer.');
        referrer = storedReferral.referrer;
      }
      if (storedStake && Boolean(storedStake.stake) !== auth.stake) {
        throw new Error(storedStake.stake ? 'This wallet already locked the 5% staking option for its presale purchases.' : 'This wallet already locked standard T-1 release for its presale purchases.');
      }
      if (referrer) {
        const reverse: any = await s.get(`referral/${referrer}`, { type: 'json' });
        if (reverse?.referrer === buyer) throw new Error('Direct two-wallet referral loops are not allowed.');
      }

      const progress = state.effectiveProgressBase;
      const quoted = quoteAllocation(progress, grossUsdcBase);
      if (quoted.rlyaBase > state.availableForNewQuotesBase) throw new Error('This order exceeds the remaining presale allocation.');
      if (slippage && quoted.rlyaBase < slippage.minRlyaBase) {
        throw new Error(`Price moved beyond your ${(slippage.bps / 100).toFixed(2)}% slippage limit. Refresh the quote and try again.`);
      }

      const stakingBonusBase = auth.stake ? stakingBonus(quoted.rlyaBase) : 0n;
      if (stakingBonusBase > state.availableStakingBonusBase) throw new Error('The fixed RLYA staking bonus reserve is fully committed.');
      const expectedTotalRlyaBase = quoted.rlyaBase + stakingBonusBase;

      const referralUsdcBase = referrer ? referralReward(grossUsdcBase) : 0n;
      if (referrer && referralUsdcBase <= 0n) throw new Error('Purchase is too small for the referral split.');
      const treasuryUsdcBase = grossUsdcBase - referralUsdcBase;
      const quoteId = newId('q');
      const quote = {
        quoteId,
        status: 'active',
        buyer,
        referrer,
        stake: auth.stake,
        stakingBonusBase: stakingBonusBase.toString(),
        expectedTotalRlyaBase: expectedTotalRlyaBase.toString(),
        deliveryPolicy: deliveryPolicy(auth.stake),
        grossUsdcBase: grossUsdcBase.toString(),
        treasuryUsdcBase: treasuryUsdcBase.toString(),
        referralUsdcBase: referralUsdcBase.toString(),
        rlyaBase: quoted.rlyaBase.toString(),
        curveStartBase: quoted.curveStartBase.toString(),
        curveEndBase: quoted.curveEndBase.toString(),
        priceBeforeMicroUsdc: quoted.priceBeforeMicroUsdc.toString(),
        priceAfterMicroUsdc: quoted.priceAfterMicroUsdc.toString(),
        slippageBps: slippage?.bps ?? null,
        minimumRlyaBase: slippage?.minRlyaBase?.toString() ?? null,
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
