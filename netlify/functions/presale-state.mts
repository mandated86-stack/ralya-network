import {
  BASE_PRICE_MICRO_USDC,
  PRESALE_CAP_BASE,
  REFERRAL_BPS,
  STAKED_RELEASE_DAYS,
  STAKING_BONUS_BPS,
  STAKING_BONUS_RESERVE_BASE,
  STANDARD_RELEASE_OFFSET_SECONDS,
  STEP_INCREMENT_MICRO_USDC,
  STEP_SIZE_BASE,
  computeState,
  json,
  publicState,
  store,
} from './_shared/presale-core.mts';

function privateTestFallback() {
  return {
    access: 'closed',
    currentPriceMicroUsdc: BASE_PRICE_MICRO_USDC.toString(),
    nextPriceMicroUsdc: (BASE_PRICE_MICRO_USDC + STEP_INCREMENT_MICRO_USDC).toString(),
    totalAllocatedBase: '0',
    quoteProgressBase: '0',
    webAllocatedBase: '0',
    manualAllocatedBase: '0',
    totalUsdcRaisedBase: '0',
    totalReferralUsdcPaidBase: '0',
    totalStakedBase: '0',
    totalStakingBonusBase: '0',
    remainingBase: PRESALE_CAP_BASE.toString(),
    toNextStepBase: STEP_SIZE_BASE.toString(),
    presaleCapBase: PRESALE_CAP_BASE.toString(),
    stakingBonusReserveBase: STAKING_BONUS_RESERVE_BASE.toString(),
    stakingBonusBps: STAKING_BONUS_BPS.toString(),
    standardReleaseTiming: '1-day-before-public-launch',
    standardReleaseOffsetSeconds: STANDARD_RELEASE_OFFSET_SECONDS,
    stakedReleaseDays: STAKED_RELEASE_DAYS,
    basePriceMicroUsdc: BASE_PRICE_MICRO_USDC.toString(),
    stepSizeBase: STEP_SIZE_BASE.toString(),
    stepIncrementMicroUsdc: STEP_INCREMENT_MICRO_USDC.toString(),
    referralBps: REFERRAL_BPS.toString(),
    webPurchaseCount: 0,
    manualAllocationCount: 0,
    distributionStatus: 'standard-one-day-before-or-staked-21-days-after-public-launch',
    updatedAt: null,
    backendReady: false,
    privateTesting: true,
  };
}

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  try {
    const state = await computeState(store(), true);
    return json({ ...publicState(state), backendReady: true, privateTesting: false });
  } catch (err: any) {
    // The public site must remain readable during private testing even if the
    // newly provisioned Blob store has a transient initialization/runtime issue.
    // Real checkout is separately hard-gated in site-config.js, so this fallback
    // cannot accept or record a purchase.
    console.error('RALYA presale-state storage read failed:', err?.message || err);
    return json(privateTestFallback());
  }
};

export const config = { path: '/api/presale/state' };