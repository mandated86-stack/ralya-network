import {
  PRESALE_TREASURY_WALLET, QUOTE_TTL_MS, USDC_MINT, assertWallet, computeState,
  decimalToBase, json, newId, quoteAllocation, referralReward, store, withMutationLock,
} from './_shared/presale-core.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }

  try {
    const buyer = assertWallet(body?.wallet, 'Buyer wallet');
    const requestedReferrer = body?.referrer ? assertWallet(body.referrer, 'Referral wallet') : null;
    const grossUsdcBase = decimalToBase(body?.usdcAmount, 6, 'USDC amount');
    if (buyer === PRESALE_TREASURY_WALLET) throw new Error('Treasury wallet cannot create a public presale order.');
    if (requestedReferrer === buyer) throw new Error('You cannot refer your own wallet.');

    const s = store();
    const result = await withMutationLock(s, async () => {
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
      if (quoted.curveEndBase > state.totalAllocatedBase + state.availableForNewQuotesBase) {
        throw new Error('This order exceeds the remaining presale allocation.');
      }

      const referralUsdcBase = referrer ? referralReward(grossUsdcBase) : 0n;
      if (referrer && referralUsdcBase <= 0n) throw new Error('Purchase is too small for the referral split.');
      const treasuryUsdcBase = grossUsdcBase - referralUsdcBase;
      const now = Date.now();
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
