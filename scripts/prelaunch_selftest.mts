import assert from 'node:assert/strict';
import {
  BASE_PRICE_MICRO_USDC,
  LIVE_PRICE_SCALE,
  LIVE_STEP_INCREMENT_SCALED,
  LIVE_STEP_SIZE_BASE,
  PRESALE_CAP_BASE,
  RLYA_UNIT,
  STAKING_BONUS_BPS,
  STAKING_BONUS_RESERVE_BASE,
  STANDARD_RELEASE_OFFSET_SECONDS,
  STAKED_RELEASE_DAYS,
  STEP_INCREMENT_MICRO_USDC,
  STEP_SIZE_BASE,
  USDC_UNIT,
  priceAt,
  priceAtScaled,
  quoteAllocation,
  referralReward,
  scaledPriceToUsdc,
  stakingBonus,
} from '../netlify/functions/_shared/presale-core.mts';

const usdc = (n: number) => BigInt(n) * USDC_UNIT;
const rlya = (n: number) => BigInt(n) * RLYA_UNIT;

assert.equal(BASE_PRICE_MICRO_USDC, 3_000n);
// Published macro slope remains unchanged.
assert.equal(STEP_INCREMENT_MICRO_USDC, 50n);
assert.equal(STEP_SIZE_BASE, rlya(1_000_000));
// Live prelaunch pricing subdivides that slope into 10k slices at $0.0000005 each.
assert.equal(LIVE_PRICE_SCALE, 2n);
assert.equal(LIVE_STEP_INCREMENT_SCALED, 1n);
assert.equal(LIVE_STEP_SIZE_BASE, rlya(10_000));
assert.equal(priceAtScaled(0n), 6_000n);
assert.equal(priceAtScaled(rlya(10_000)), 6_001n);
assert.equal(priceAtScaled(rlya(100_000)), 6_010n);
assert.equal(scaledPriceToUsdc(priceAtScaled(rlya(100_000))), '0.0030050');
assert.equal(priceAtScaled(rlya(1_000_000)), 6_100n);

assert.equal(PRESALE_CAP_BASE, rlya(288_000_000));
assert.equal(STAKING_BONUS_RESERVE_BASE, rlya(14_400_000));
assert.equal(STAKING_BONUS_BPS, 500n);
assert.equal(STANDARD_RELEASE_OFFSET_SECONDS, -86_400);
assert.equal(STAKED_RELEASE_DAYS, 21);
assert.equal(stakingBonus(PRESALE_CAP_BASE), STAKING_BONUS_RESERVE_BASE);
assert.equal(stakingBonus(rlya(1_000_000)), rlya(50_000));

// The first million now traverses 100 live 10k price slices from $0.0030000
// through $0.0030495, preserving the $0.0030500 boundary at 1M.
const firstMillion = quoteAllocation(0n, 3_024_750_000n);
assert.equal(firstMillion.rlyaBase, rlya(1_000_000));
assert.equal(firstMillion.priceBeforeMicroUsdc, 3_000n);
assert.equal(firstMillion.priceAfterMicroUsdc, 3_050n);

const firstTwoMillion = quoteAllocation(0n, 6_099_500_000n);
assert.equal(firstTwoMillion.rlyaBase, rlya(2_000_000));
assert.equal(firstTwoMillion.priceAfterMicroUsdc, 3_100n);

const tenMillionPrice = priceAt(rlya(10_000_000));
assert.equal(tenMillionPrice, 3_500n);
assert.equal(priceAt(rlya(50_000_000)), 5_500n);
assert.equal(priceAt(rlya(100_000_000)), 8_000n);

const referred500 = referralReward(usdc(500));
assert.equal(referred500, usdc(5));
assert.equal(usdc(500) - referred500, usdc(495));

// Manual/off-site purchases advance the exact same live curve because they contribute to
// total presale progress before the next buyer quote is calculated.
const afterManualHundredThousand = priceAtScaled(rlya(100_000));
assert.equal(scaledPriceToUsdc(afterManualHundredThousand), '0.0030050');
const afterManualTwoMillion = priceAt(rlya(2_000_000));
assert.equal(afterManualTwoMillion, 3_100n);
const nextBuyer = quoteAllocation(rlya(2_000_000), 3_124_750_000n);
assert.equal(nextBuyer.rlyaBase, rlya(1_000_000));
assert.equal(nextBuyer.priceBeforeMicroUsdc, 3_100n);
assert.equal(nextBuyer.priceAfterMicroUsdc, 3_150n);

assert.throws(() => quoteAllocation(PRESALE_CAP_BASE, usdc(1)), /fully reserved/i);
assert.throws(() => quoteAllocation(PRESALE_CAP_BASE - 1n, usdc(1)), /exceeds the remaining presale allocation/i);

console.log('RALYA_PRELAUNCH_SELFTEST=PASS');
console.log('LIVE_PRICE_10K=PASS; +$0.0000005 each 10k while preserving +$0.000050 per 1M boundary slope');
console.log('MANUAL_AND_WEB_PRICE_PROGRESS=PASS');
console.log('288M base allocation + 14.4M fixed bonus reserve + 5% staking = verified');
console.log('standard release T-1 day; Buy + Stake unlock day 21');
