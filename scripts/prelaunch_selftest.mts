import assert from 'node:assert/strict';
import {
  BASE_PRICE_MICRO_USDC,
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
  quoteAllocation,
  referralReward,
  stakingBonus,
} from '../netlify/functions/_shared/presale-core.mts';

const usdc = (n: number) => BigInt(n) * USDC_UNIT;
const rlya = (n: number) => BigInt(n) * RLYA_UNIT;

assert.equal(BASE_PRICE_MICRO_USDC, 3_000n);
assert.equal(STEP_INCREMENT_MICRO_USDC, 50n);
assert.equal(STEP_SIZE_BASE, rlya(1_000_000));
assert.equal(PRESALE_CAP_BASE, rlya(288_000_000));
assert.equal(STAKING_BONUS_RESERVE_BASE, rlya(14_400_000));
assert.equal(STAKING_BONUS_BPS, 500n);
assert.equal(STANDARD_RELEASE_OFFSET_SECONDS, -86_400);
assert.equal(STAKED_RELEASE_DAYS, 21);
assert.equal(stakingBonus(PRESALE_CAP_BASE), STAKING_BONUS_RESERVE_BASE);
assert.equal(stakingBonus(rlya(1_000_000)), rlya(50_000));

const firstMillion = quoteAllocation(0n, usdc(3_000));
assert.equal(firstMillion.rlyaBase, rlya(1_000_000));
assert.equal(firstMillion.priceBeforeMicroUsdc, 3_000n);
assert.equal(firstMillion.priceAfterMicroUsdc, 3_050n);

const firstTwoMillion = quoteAllocation(0n, usdc(6_050));
assert.equal(firstTwoMillion.rlyaBase, rlya(2_000_000));
assert.equal(firstTwoMillion.priceAfterMicroUsdc, 3_100n);

const tenMillionPrice = priceAt(rlya(10_000_000));
assert.equal(tenMillionPrice, 3_500n);
assert.equal(priceAt(rlya(50_000_000)), 5_500n);
assert.equal(priceAt(rlya(100_000_000)), 8_000n);

const referred500 = referralReward(usdc(500));
assert.equal(referred500, usdc(5));
assert.equal(usdc(500) - referred500, usdc(495));

const afterManualTwoMillion = priceAt(rlya(2_000_000));
assert.equal(afterManualTwoMillion, 3_100n);
const nextBuyer = quoteAllocation(rlya(2_000_000), usdc(3_100));
assert.equal(nextBuyer.rlyaBase, rlya(1_000_000));
assert.equal(nextBuyer.priceBeforeMicroUsdc, 3_100n);
assert.equal(nextBuyer.priceAfterMicroUsdc, 3_150n);

assert.throws(() => quoteAllocation(PRESALE_CAP_BASE, usdc(1)), /fully reserved/i);
assert.throws(() => quoteAllocation(PRESALE_CAP_BASE - 1n, usdc(1)), /exceeds the remaining presale allocation/i);

console.log('RALYA_PRELAUNCH_SELFTEST=PASS');
console.log('288M base allocation + 14.4M fixed bonus reserve + 5% staking = verified');
console.log('standard release T-1 day; Buy + Stake unlock day 21');
