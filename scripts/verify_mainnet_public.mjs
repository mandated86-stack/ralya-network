#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getMint, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC = process.env.RALYA_MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const recordPath = process.argv[2] || 'RALYA_MAINNET_LAUNCH_RECORD.json';
if (!fs.existsSync(recordPath)) throw new Error(`Launch record not found: ${recordPath}`);
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));

const HARD = 839_000_000n * 1_000_000_000n;
const PRESALE = 100_680_000n * 1_000_000_000n;
const FOUNDER = 83_900_000n * 1_000_000_000n;
const SALE_SPACE = 274;
const FOUNDER_LOCK_SPACE = 106;
const EXPECTED_RESERVES = new Map([
  ['provider_security_incentives', 209_750_000n * 1_000_000_000n],
  ['ecosystem_community', 167_800_000n * 1_000_000_000n],
  ['protocol_treasury', 125_850_000n * 1_000_000_000n],
  ['future_chain_security', 83_900_000n * 1_000_000_000n],
  ['liquidity', 67_120_000n * 1_000_000_000n],
]);
const MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const conn = new Connection(RPC, 'finalized');

function pk(value, label) {
  if (!value) throw new Error(`${label} missing from launch record`);
  try { return new PublicKey(value); } catch { throw new Error(`${label} is not a valid Solana public key`); }
}
function u64(data, offset) { return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true); }
function i64(data, offset) { return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(offset, true); }
function keyAt(data, offset) { return new PublicKey(data.slice(offset, offset + 32)); }
function eqKey(a, b, label) { assert(a.equals(b), `${label}: ${a.toBase58()} != ${b.toBase58()}`); }

const programId = pk(record.saleProgramId, 'saleProgramId');
const mintPk = pk(record.rlyaMint, 'rlyaMint');
const treasury = pk(record.treasuryWallet, 'treasuryWallet');
const founder = pk(record.founderWallet, 'founderWallet');
const admin = pk(record.adminWallet || record.ownerWallet || record.treasuryWallet, 'adminWallet');
const smokeComplete = Boolean(record.smoke?.completed);
const expectedSmokeSold = smokeComplete ? BigInt(record.smoke.rlyaDeliveredBaseUnits || '0') : 0n;
const expectedRaised = smokeComplete ? 1_000_000n : 0n;
const expectedReferralPaid = smokeComplete ? 10_000n : 0n;

if (smokeComplete) {
  assert(record.smoke.ownerFunded === true, 'Smoke record must disclose that the 1 USDC test was owner-funded');
  assert.equal(BigInt(record.smoke.grossUsdcBaseUnits), 1_000_000n, 'Smoke gross USDC must be exactly 1 USDC');
  assert.equal(BigInt(record.smoke.expectedReferralUsdcBaseUnits), 10_000n, 'Smoke referral amount must be exactly 0.01 USDC');
  assert(expectedSmokeSold > 0n, 'Smoke record is missing delivered RLYA amount');
  assert.equal(record.smoke.finalSaleStatus, 'PAUSED', 'Smoke record must finish PAUSED');
}

const [derivedSale] = PublicKey.findProgramAddressSync([Buffer.from('sale'), mintPk.toBuffer()], programId);
const [derivedSaleVault] = PublicKey.findProgramAddressSync([Buffer.from('sale_vault'), mintPk.toBuffer()], programId);
const [derivedFounderLock] = PublicKey.findProgramAddressSync([Buffer.from('founder_lock'), mintPk.toBuffer()], programId);
const [derivedFounderVault] = PublicKey.findProgramAddressSync([Buffer.from('founder_vault'), mintPk.toBuffer()], programId);

if (record.salePda) eqKey(pk(record.salePda, 'salePda'), derivedSale, 'sale PDA mismatch');
if (record.saleVault) eqKey(pk(record.saleVault, 'saleVault'), derivedSaleVault, 'sale vault mismatch');
if (record.founderLock) eqKey(pk(record.founderLock, 'founderLock'), derivedFounderLock, 'founder lock mismatch');
if (record.founderVault) eqKey(pk(record.founderVault, 'founderVault'), derivedFounderVault, 'founder vault mismatch');

const programInfo = await conn.getAccountInfo(programId, 'finalized');
assert(programInfo?.executable, 'Mainnet Program ID is not executable');
console.log(`PROGRAM_EXECUTABLE=PASS ${programId.toBase58()}`);

const mint = await getMint(conn, mintPk, 'finalized', TOKEN_PROGRAM_ID);
assert.equal(mint.decimals, 9, 'RLYA decimals mismatch');
assert.equal(mint.supply, HARD, 'RLYA supply is not exactly 839M');
assert.equal(mint.mintAuthority, null, 'RLYA mint authority is still present');
assert.equal(mint.freezeAuthority, null, 'RLYA freeze authority is present');
console.log('RLYA_MINT_INVARIANTS=PASS supply=839000000 decimals=9 mintAuthority=null freezeAuthority=null');

const saleInfo = await conn.getAccountInfo(derivedSale, 'finalized');
assert(saleInfo && saleInfo.owner.equals(programId), 'Sale PDA missing or owned by wrong program');
assert.equal(saleInfo.data.length, SALE_SPACE, `Sale account must be exactly ${SALE_SPACE} bytes`);
const sd = new Uint8Array(saleInfo.data);
eqKey(keyAt(sd, 8), admin, 'sale admin mismatch');
eqKey(keyAt(sd, 40), treasury, 'sale treasury mismatch');
eqKey(keyAt(sd, 72), founder, 'sale founder mismatch');
eqKey(keyAt(sd, 104), mintPk, 'sale RLYA mint mismatch');
eqKey(keyAt(sd, 136), MAINNET_USDC, 'sale USDC mint mismatch');
assert.equal(u64(sd, 168), PRESALE, 'presale cap mismatch');
assert.equal(u64(sd, 176), 3_000n, 'base price mismatch');
assert.equal(u64(sd, 184), 1_000_000n * 1_000_000_000n, 'price step size mismatch');
assert.equal(u64(sd, 192), 50n, 'price step increment mismatch');
assert.equal(u64(sd, 200), 100n, 'referral rate mismatch');
const totalSold = u64(sd, 208);
const manualSold = u64(sd, 216);
const raised = u64(sd, 224);
const referralPaid = u64(sd, 232);
const startedAt = i64(sd, 240);
const saleStatus = sd[248];
assert([0, 2].includes(saleStatus), `Expected DRAFT(0) or PAUSED(2) during verification, found status ${saleStatus}`);
assert.equal(totalSold, expectedSmokeSold, 'RLYA sold does not match expected launch/smoke state');
assert.equal(manualSold, 0n, 'Manual/off-site distribution must still be zero at launch verification');
assert.equal(raised, expectedRaised, 'Gross USDC does not match expected launch/smoke state');
assert.equal(referralPaid, expectedReferralPaid, 'Referral USDC does not match expected launch/smoke state');
if (saleStatus === 0) {
  assert(!smokeComplete, 'A completed smoke test cannot leave the sale in DRAFT');
  assert.equal(startedAt, 0n, 'Draft sale unexpectedly has a start timestamp');
}
if (saleStatus === 2) assert(startedAt > 0n, 'Paused post-activation sale must have a start timestamp');
if (smokeComplete) assert.equal(saleStatus, 2, 'Completed smoke test must finish with sale PAUSED');
console.log(`SALE_STATE=PASS status=${saleStatus === 0 ? 'DRAFT' : 'PAUSED'} totalSold=${totalSold} grossUsdc=${raised} referralUsdc=${referralPaid} manualSold=0`);

const saleVault = await getAccount(conn, derivedSaleVault, 'finalized', TOKEN_PROGRAM_ID);
eqKey(saleVault.mint, mintPk, 'sale vault mint mismatch');
eqKey(saleVault.owner, derivedSale, 'sale vault authority mismatch');
assert.equal(saleVault.amount, PRESALE - expectedSmokeSold, 'sale vault amount does not reconcile with sold RLYA');

const founderVault = await getAccount(conn, derivedFounderVault, 'finalized', TOKEN_PROGRAM_ID);
eqKey(founderVault.mint, mintPk, 'founder vault mint mismatch');
eqKey(founderVault.owner, derivedFounderLock, 'founder vault authority mismatch');
assert.equal(founderVault.amount, FOUNDER, 'founder vault amount mismatch');

const lockInfo = await conn.getAccountInfo(derivedFounderLock, 'finalized');
assert(lockInfo && lockInfo.owner.equals(programId), 'Founder lock missing or owned by wrong program');
assert.equal(lockInfo.data.length, FOUNDER_LOCK_SPACE, `Founder lock account must be exactly ${FOUNDER_LOCK_SPACE} bytes`);
const fd = new Uint8Array(lockInfo.data);
eqKey(keyAt(fd, 8), founder, 'founder lock beneficiary mismatch');
eqKey(keyAt(fd, 40), mintPk, 'founder lock mint mismatch');
assert.equal(u64(fd, 72), FOUNDER, 'founder locked amount mismatch');
const unlockAt = i64(fd, 80);
const released = Boolean(fd[88]);
assert.equal(released, false, 'Founder allocation is already marked released');
if (saleStatus === 0) assert.equal(unlockAt, 0n, 'Draft founder lock should not have started');
if (saleStatus === 2) {
  assert(unlockAt > startedAt, 'Founder unlock must be after sale start');
  assert.equal(unlockAt - startedAt, 365n * 24n * 60n * 60n, 'Founder lock is not exactly 365 days');
}
console.log(`FOUNDER_LOCK=PASS amount=83900000 released=false unlockAt=${unlockAt}`);

let allocationSum = saleVault.amount + founderVault.amount;
for (const [name, expected] of EXPECTED_RESERVES) {
  const row = record.allocations?.[name];
  assert(row?.tokenAccount, `Missing ${name} allocation account in launch record`);
  assert.equal(BigInt(row.amountBaseUnits), expected, `${name} recorded amount mismatch`);
  const token = await getAccount(conn, pk(row.tokenAccount, `${name} token account`), 'finalized', TOKEN_PROGRAM_ID);
  eqKey(token.mint, mintPk, `${name} mint mismatch`);
  eqKey(token.owner, treasury, `${name} owner must be treasury`);
  assert.equal(token.amount, expected, `${name} on-chain balance mismatch`);
  allocationSum += token.amount;
  console.log(`ALLOCATION=PASS ${name} ${expected}`);
}

let treasurySmokeRlya = 0n;
if (smokeComplete) {
  const treasuryRlyaAta = pk(record.smoke.treasuryRlyaAta, 'smoke treasury RLYA ATA');
  const token = await getAccount(conn, treasuryRlyaAta, 'finalized', TOKEN_PROGRAM_ID);
  eqKey(token.mint, mintPk, 'smoke treasury RLYA mint mismatch');
  eqKey(token.owner, treasury, 'smoke treasury RLYA owner mismatch');
  assert.equal(token.amount, expectedSmokeSold, 'Treasury does not hold exactly the swept owner-funded smoke RLYA');
  treasurySmokeRlya = token.amount;
  allocationSum += token.amount;
  console.log(`OWNER_FUNDED_SMOKE_RLYA=PASS amountBaseUnits=${token.amount}`);
}
assert.equal(allocationSum, HARD, 'On-chain RLYA balances do not reconcile to the fixed 839M supply');
console.log(`ALLOCATION_RECONCILIATION=PASS total=839000000 RLYA smokeTreasuryBaseUnits=${treasurySmokeRlya}`);

const result = {
  status: 'PASS',
  network: 'mainnet-beta',
  programId: programId.toBase58(),
  rlyaMint: mintPk.toBase58(),
  salePda: derivedSale.toBase58(),
  saleVault: derivedSaleVault.toBase58(),
  founderLock: derivedFounderLock.toBase58(),
  founderVault: derivedFounderVault.toBase58(),
  treasury: treasury.toBase58(),
  founder: founder.toBase58(),
  saleStatus: saleStatus === 0 ? 'DRAFT' : 'PAUSED',
  totalSoldBaseUnits: totalSold.toString(),
  grossUsdcBaseUnits: raised.toString(),
  referralUsdcBaseUnits: referralPaid.toString(),
  founderUnlockAt: unlockAt.toString(),
  ownerFundedSmokeVerified: smokeComplete,
};
console.log(JSON.stringify(result));
console.log('RALYA_MAINNET_PUBLIC_VERIFICATION=PASS');
