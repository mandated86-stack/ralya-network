import { RLYA_UNIT, assertWallet, getAllocationEvents, json, store } from './_shared/presale-core.mts';

export default async (req: Request, context: any) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  try {
    const wallet = assertWallet(context?.params?.wallet, 'Wallet');
    const s = store();
    const [events, referral] = await Promise.all([
      getAllocationEvents(s),
      s.get(`referral/${wallet}`, { type: 'json' }),
    ]);
    const mine = events.filter(event => event.wallet === wallet).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let totalRlya = 0n;
    let totalUsdc = 0n;
    let totalReferral = 0n;
    for (const event of mine) {
      totalRlya += BigInt(event.rlyaBase || 0);
      totalUsdc += BigInt(event.grossUsdcBase || 0);
      totalReferral += BigInt(event.referralUsdcBase || 0);
    }
    const averagePriceMicroUsdc = totalRlya > 0n && totalUsdc > 0n ? totalUsdc * RLYA_UNIT / totalRlya : 0n;
    return json({
      wallet,
      status: totalRlya > 0n ? 'allocation-confirmed' : 'no-allocation',
      distributionStatus: totalRlya > 0n ? 'scheduled-before-public-launch' : null,
      totalRlyaBase: totalRlya.toString(),
      totalUsdcPaidBase: totalUsdc.toString(),
      totalReferralUsdcBase: totalReferral.toString(),
      averagePriceMicroUsdc: averagePriceMicroUsdc.toString(),
      lockedReferrer: (referral as any)?.referrer || null,
      allocations: mine.map(event => ({
        id: event.id,
        kind: event.kind,
        rlyaBase: event.rlyaBase,
        grossUsdcBase: event.grossUsdcBase,
        referralUsdcBase: event.referralUsdcBase,
        referrer: event.referrer,
        priceBeforeMicroUsdc: event.priceBeforeMicroUsdc,
        priceAfterMicroUsdc: event.priceAfterMicroUsdc,
        createdAt: event.createdAt,
        confirmedAt: event.confirmedAt || null,
        signature: event.signature || null,
        paymentReference: event.paymentReference || null,
      })),
    });
  } catch (err: any) {
    return json({ error: err?.message || 'Could not load wallet allocation.' }, 400);
  }
};

export const config = { path: '/api/presale/wallet/:wallet' };
