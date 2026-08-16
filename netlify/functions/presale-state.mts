const PRESALE_STORE = 'ralya-prelaunch-presale';
const RLYA_UNIT = 1_000_000_000n;
const PRESALE_CAP_BASE = 288_000_000n * RLYA_UNIT;
const STAKING_BONUS_RESERVE_BASE = 14_400_000n * RLYA_UNIT;
const STAKING_BONUS_BPS = 500n;
const PRICE_STEP_BASE = 1_000_000n * RLYA_UNIT;
const BASE_PRICE_MICRO_USDC = 3_000n;
const STEP_INCREMENT_MICRO_USDC = 50n;
const REFERRAL_BPS = 100n;
const STANDARD_RELEASE_OFFSET_SECONDS = -24 * 60 * 60;
const STAKED_RELEASE_DAYS = 21;
const QUOTE_CONFIRMATION_GRACE_MS = 2 * 60 * 1000;

function forcePresaleOpen() {
  const value = (globalThis as any).Netlify?.env?.get?.('RALYA_PRESALE_FORCE_OPEN');
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function priceAt(progressBase: bigint) {
  return BASE_PRICE_MICRO_USDC + (progressBase / PRICE_STEP_BASE) * STEP_INCREMENT_MICRO_USDC;
}

function nextBoundary(progressBase: bigint) {
  if (progressBase >= PRESALE_CAP_BASE) return PRESALE_CAP_BASE;
  const boundary = ((progressBase / PRICE_STEP_BASE) + 1n) * PRICE_STEP_BASE;
  return boundary < PRESALE_CAP_BASE ? boundary : PRESALE_CAP_BASE;
}

function publicShape(input: any) {
  const progress = BigInt(input.quoteProgressBase || 0);
  const current = priceAt(progress);
  const boundary = nextBoundary(progress);
  return {
    access: input.access,
    currentPriceMicroUsdc: current.toString(),
    nextPriceMicroUsdc: (current + STEP_INCREMENT_MICRO_USDC).toString(),
    totalAllocatedBase: String(input.totalAllocatedBase || '0'),
    quoteProgressBase: progress.toString(),
    webAllocatedBase: String(input.webAllocatedBase || '0'),
    manualAllocatedBase: String(input.manualAllocatedBase || '0'),
    totalUsdcRaisedBase: String(input.totalUsdcRaisedBase || '0'),
    totalReferralUsdcPaidBase: String(input.totalReferralUsdcPaidBase || '0'),
    totalStakedBase: String(input.totalStakedBase || '0'),
    totalStakingBonusBase: String(input.totalStakingBonusBase || '0'),
    remainingBase: String(input.remainingBase || PRESALE_CAP_BASE.toString()),
    toNextStepBase: (boundary > progress ? boundary - progress : 0n).toString(),
    presaleCapBase: PRESALE_CAP_BASE.toString(),
    stakingBonusReserveBase: STAKING_BONUS_RESERVE_BASE.toString(),
    stakingBonusBps: STAKING_BONUS_BPS.toString(),
    standardReleaseTiming: '1-day-before-public-launch',
    standardReleaseOffsetSeconds: STANDARD_RELEASE_OFFSET_SECONDS,
    stakedReleaseDays: STAKED_RELEASE_DAYS,
    basePriceMicroUsdc: BASE_PRICE_MICRO_USDC.toString(),
    stepSizeBase: PRICE_STEP_BASE.toString(),
    stepIncrementMicroUsdc: STEP_INCREMENT_MICRO_USDC.toString(),
    referralBps: REFERRAL_BPS.toString(),
    webPurchaseCount: Number(input.webPurchaseCount || 0),
    manualAllocationCount: Number(input.manualAllocationCount || 0),
    distributionStatus: 'standard-one-day-before-or-staked-21-days-after-public-launch',
    updatedAt: input.updatedAt || null,
    backendReady: input.backendReady === true,
    privateTesting: input.backendReady !== true,
  };
}

function closedFallback() {
  return publicShape({
    access: 'closed',
    totalAllocatedBase: '0',
    quoteProgressBase: '0',
    webAllocatedBase: '0',
    manualAllocatedBase: '0',
    totalUsdcRaisedBase: '0',
    totalReferralUsdcPaidBase: '0',
    totalStakedBase: '0',
    totalStakingBonusBase: '0',
    remainingBase: PRESALE_CAP_BASE.toString(),
    webPurchaseCount: 0,
    manualAllocationCount: 0,
    updatedAt: null,
    backendReady: false,
  });
}

function response(value: unknown, backendReady: boolean, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'x-ralya-backend-ready': backendReady ? '1' : '0',
    },
  });
}

async function listJson(store: any, prefix: string) {
  const listing = await store.list({ prefix });
  const rows = listing?.blobs || [];
  if (!rows.length) return [];
  return Promise.all(rows.map(async (row: any) => {
    try { return await store.get(row.key, { type: 'json' }); }
    catch { return null; }
  }));
}

export default async (req: Request) => {
  if (req.method !== 'GET') return response({ error: 'Method not allowed.' }, false, 405);

  try {
    // Dynamic import + store creation inside the request handler is deliberate. If Blobs or
    // runtime initialization is unavailable, this handler can still return a CLOSED 200 state
    // instead of allowing an uncaught module-load failure to surface as a platform 502.
    const { getStore } = await import('@netlify/blobs');
    const s = getStore({ name: PRESALE_STORE, consistency: 'strong' });
    const [controlRaw, purchases, manual, quotes] = await Promise.all([
      s.get('control', { type: 'json' }),
      listJson(s, 'purchase/'),
      listJson(s, 'manual/'),
      listJson(s, 'quote/'),
    ]);

    const storedControl = controlRaw && ['closed', 'open', 'paused'].includes(String(controlRaw.access))
      ? controlRaw
      : { access: 'open', updatedAt: null };
    const control = forcePresaleOpen() && storedControl.access === 'closed'
      ? { ...storedControl, access: 'open' }
      : storedControl;
    const events = [...purchases, ...manual].filter((row: any) => row && row.rlyaBase != null);

    let webAllocatedBase = 0n;
    let manualAllocatedBase = 0n;
    let totalStakedBase = 0n;
    let totalStakingBonusBase = 0n;
    let totalUsdcRaisedBase = 0n;
    let totalReferralUsdcPaidBase = 0n;
    let webPurchaseCount = 0;
    let manualAllocationCount = 0;

    for (const row of events as any[]) {
      const base = BigInt(row.rlyaBase || 0);
      if (row.kind === 'manual') {
        manualAllocatedBase += base;
        manualAllocationCount += 1;
      } else {
        webAllocatedBase += base;
        webPurchaseCount += 1;
      }
      if (row.stake === true) totalStakedBase += base;
      totalStakingBonusBase += BigInt(row.stakingBonusBase || 0);
      totalUsdcRaisedBase += BigInt(row.grossUsdcBase || 0);
      totalReferralUsdcPaidBase += BigInt(row.referralUsdcBase || 0);
    }

    const totalAllocatedBase = webAllocatedBase + manualAllocatedBase;
    const now = Date.now();
    let activeQuoteReservedBase = 0n;
    for (const quote of quotes as any[]) {
      if (!quote || quote.status !== 'active') continue;
      if (Number(quote.expiresAtMs || 0) + QUOTE_CONFIRMATION_GRACE_MS <= now) continue;
      activeQuoteReservedBase += BigInt(quote.rlyaBase || 0);
    }

    const quoteProgressBase = totalAllocatedBase + activeQuoteReservedBase;
    if (totalAllocatedBase > PRESALE_CAP_BASE) throw new Error('Confirmed allocation exceeds the fixed 288M presale cap.');
    if (totalStakingBonusBase > STAKING_BONUS_RESERVE_BASE) throw new Error('Confirmed staking bonuses exceed the fixed reserve.');
    if (quoteProgressBase > PRESALE_CAP_BASE) throw new Error('Confirmed plus reserved allocation exceeds the fixed presale cap.');

    return response(publicShape({
      access: String(control.access || 'open'),
      totalAllocatedBase: totalAllocatedBase.toString(),
      quoteProgressBase: quoteProgressBase.toString(),
      webAllocatedBase: webAllocatedBase.toString(),
      manualAllocatedBase: manualAllocatedBase.toString(),
      totalUsdcRaisedBase: totalUsdcRaisedBase.toString(),
      totalReferralUsdcPaidBase: totalReferralUsdcPaidBase.toString(),
      totalStakedBase: totalStakedBase.toString(),
      totalStakingBonusBase: totalStakingBonusBase.toString(),
      remainingBase: (PRESALE_CAP_BASE - totalAllocatedBase).toString(),
      webPurchaseCount,
      manualAllocationCount,
      updatedAt: control.updatedAt || null,
      backendReady: true,
    }), true);
  } catch (err: any) {
    console.error('RALYA presale-state backend unavailable; serving CLOSED fallback:', err?.message || err);
    return response(closedFallback(), false);
  }
};

export const config = { path: '/api/presale/state' };
