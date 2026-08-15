import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  PRESALE_CAP_BASE, PRESALE_TREASURY_WALLET, RLYA_UNIT, STAKING_BONUS_RESERVE_BASE, USDC_MINT,
  assertWallet, cleanText, computeState, decimalToBase,
  getAllocationEvents, json, newId, priceAt, publicState, sha256Json, store,
  verifyOwnerAction, withMutationLock,
} from './_shared/presale-core.mts';

const STANDARD_POLICY = 'standard-tminus1';
const STAKED_POLICY = 'staked-plus21d';
const STANDARD_DISTRIBUTION = '1-day-before-public-launch';
const STAKED_DISTRIBUTION = '21-days-after-public-launch';

function serializeEvent(event: any) {
  const base = BigInt(event.rlyaBase || 0);
  const bonus = BigInt(event.stakingBonusBase || 0);
  return {
    id: event.id,
    kind: event.kind,
    wallet: event.wallet,
    rlyaBase: base.toString(),
    stakingBonusBase: bonus.toString(),
    expectedTotalRlyaBase: (base + bonus).toString(),
    stake: event.stake === true,
    deliveryPolicy: event.deliveryPolicy || (event.stake ? STAKED_POLICY : STANDARD_POLICY),
    distributionStatus: event.distributionStatus || (event.stake ? STAKED_DISTRIBUTION : STANDARD_DISTRIBUTION),
    grossUsdcBase: event.grossUsdcBase,
    referralUsdcBase: event.referralUsdcBase,
    referrer: event.referrer || null,
    curveStartBase: event.curveStartBase,
    curveEndBase: event.curveEndBase,
    priceBeforeMicroUsdc: event.priceBeforeMicroUsdc,
    priceAfterMicroUsdc: event.priceAfterMicroUsdc,
    createdAt: event.createdAt,
    confirmedAt: event.confirmedAt || null,
    signature: event.signature || null,
    paymentReference: event.paymentReference || null,
    note: event.note || null,
  };
}

function rpcEndpoint() {
  const endpoint = (globalThis as any).Netlify?.env?.get?.('RALYA_SOLANA_RPC');
  if (!endpoint) throw new Error('Dedicated Solana Mainnet RPC is not configured. Keep presale access CLOSED.');
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:') throw new Error('Dedicated Solana Mainnet RPC must use HTTPS.');
  return parsed.toString();
}

async function prelaunchOpeningPreflight() {
  const endpoint = rpcEndpoint();
  const connection = new Connection(endpoint, 'confirmed');
  const mint = new PublicKey(USDC_MINT);
  const treasury = new PublicKey(PRESALE_TREASURY_WALLET);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasury);

  let latestBlockhash: string;
  try {
    latestBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  } catch {
    throw new Error('Solana Mainnet RPC is not reachable. Keep allocation access CLOSED and retry the opening preflight.');
  }

  const info = await connection.getParsedAccountInfo(treasuryAta, 'confirmed');
  if (!info.value) {
    throw new Error('Pre-launch treasury USDC receiving account is not prepared. Use Prepare / verify USDC receiving account in the owner console before opening allocations.');
  }
  const parsed: any = (info.value.data as any)?.parsed?.info;
  if (parsed?.mint !== USDC_MINT || parsed?.owner !== PRESALE_TREASURY_WALLET) {
    throw new Error('Treasury USDC receiving account failed ownership/mint verification. Keep allocation access CLOSED.');
  }

  return {
    rpc: 'reachable',
    latestBlockhash,
    cluster: 'mainnet-beta',
    usdcMint: USDC_MINT,
    treasuryWallet: PRESALE_TREASURY_WALLET,
    treasuryUsdcAccount: treasuryAta.toBase58(),
    treasuryUsdcAccountReady: true,
  };
}

async function makeManifest(s: ReturnType<typeof store>) {
  const events = await getAllocationEvents(s);
  const grouped = new Map<string, any>();

  for (const event of events) {
    let row = grouped.get(event.wallet);
    if (!row) {
      row = {
        wallet: event.wallet,
        webRlyaBase: 0n,
        manualRlyaBase: 0n,
        stakingBonusRlyaBase: 0n,
        stake: null,
        grossUsdcBase: 0n,
        referralUsdcBase: 0n,
        referrer: null,
        sourceIds: [],
      };
      grouped.set(event.wallet, row);
    }

    const rlya = BigInt(event.rlyaBase || 0);
    if (event.kind === 'web') {
      row.webRlyaBase += rlya;
      const eventStake = event.stake === true;
      if (row.stake === null) row.stake = eventStake;
      else if (row.stake !== eventStake) throw new Error(`Wallet ${event.wallet} contains mixed staking policies. Stop manifest export and reconcile the wallet.`);
      row.stakingBonusRlyaBase += BigInt(event.stakingBonusBase || 0);
    } else {
      row.manualRlyaBase += rlya;
    }
    row.grossUsdcBase += BigInt(event.grossUsdcBase || 0);
    row.referralUsdcBase += BigInt(event.referralUsdcBase || 0);
    if (event.referrer) row.referrer = event.referrer;
    row.sourceIds.push(event.id);
  }

  const allocations = [...grouped.values()]
    .sort((a, b) => a.wallet.localeCompare(b.wallet))
    .map(row => ({
      wallet: row.wallet,
      webRlyaBase: row.webRlyaBase.toString(),
      manualRlyaBase: row.manualRlyaBase.toString(),
      stakingBonusRlyaBase: row.stakingBonusRlyaBase.toString(),
      stake: row.stake === true,
      webDeliveryPolicy: row.stake === true ? STAKED_POLICY : STANDARD_POLICY,
      webDistributionStatus: row.stake === true ? STAKED_DISTRIBUTION : STANDARD_DISTRIBUTION,
      manualDeliveryPolicy: STANDARD_POLICY,
      manualDistributionStatus: STANDARD_DISTRIBUTION,
      totalPurchasedRlyaBase: (row.webRlyaBase + row.manualRlyaBase).toString(),
      totalDeliveryRlyaBase: (row.webRlyaBase + row.manualRlyaBase + row.stakingBonusRlyaBase).toString(),
      grossUsdcBase: row.grossUsdcBase.toString(),
      referralUsdcBase: row.referralUsdcBase.toString(),
      referrer: row.referrer,
      sourceIds: row.sourceIds,
    }));

  const totals = allocations.reduce((acc, row) => {
    acc.webRlyaBase += BigInt(row.webRlyaBase);
    acc.manualRlyaBase += BigInt(row.manualRlyaBase);
    acc.stakingBonusRlyaBase += BigInt(row.stakingBonusRlyaBase);
    acc.totalPurchasedRlyaBase += BigInt(row.totalPurchasedRlyaBase);
    acc.totalDeliveryRlyaBase += BigInt(row.totalDeliveryRlyaBase);
    acc.grossUsdcBase += BigInt(row.grossUsdcBase);
    acc.referralUsdcBase += BigInt(row.referralUsdcBase);
    return acc;
  }, { webRlyaBase: 0n, manualRlyaBase: 0n, stakingBonusRlyaBase: 0n, totalPurchasedRlyaBase: 0n, totalDeliveryRlyaBase: 0n, grossUsdcBase: 0n, referralUsdcBase: 0n });

  if (totals.totalPurchasedRlyaBase > PRESALE_CAP_BASE) throw new Error('Manifest purchased allocation exceeds the 288M RLYA public cap.');
  if (totals.stakingBonusRlyaBase > STAKING_BONUS_RESERVE_BASE) throw new Error('Manifest staking bonuses exceed the fixed 14.4M RLYA reserve.');

  const manifest: any = {
    project: 'RALYA',
    symbol: 'RLYA',
    purpose: 'prelaunch-allocation-delivery',
    version: 3,
    generatedAt: new Date().toISOString(),
    deliveryPolicy: {
      standard: STANDARD_DISTRIBUTION,
      staked: STAKED_DISTRIBUTION,
      standardPolicyId: STANDARD_POLICY,
      stakedPolicyId: STAKED_POLICY,
      stakingBonusBps: 500,
    },
    allocations,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, (v as bigint).toString()])),
  };
  manifest.sha256 = sha256Json(manifest);
  return manifest;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const s = store();

  try {
    const auth = await verifyOwnerAction(s, body);
    const op = auth.operation;
    const payload: any = auth.payload || {};

    if (op === 'summary') {
      const state = await computeState(s, true);
      const recent = [...state.events]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 25)
        .map(serializeEvent);
      return json({ ok: true, state: { ...publicState(state), reservedBase: state.reservedBase.toString(), reservedStakingBonusBase: state.reservedStakingBonusBase.toString() }, recent });
    }

    if (op === 'preflight') {
      const readiness = await prelaunchOpeningPreflight();
      const state = await computeState(s, true);
      return json({ ok: true, readiness, state: { ...publicState(state), reservedBase: state.reservedBase.toString(), reservedStakingBonusBase: state.reservedStakingBonusBase.toString() } });
    }

    if (op === 'set_access') {
      const access = String(payload.access || '');
      if (!['closed', 'open', 'paused'].includes(access)) throw new Error('Unknown presale access state.');
      const readiness = access === 'open' ? await prelaunchOpeningPreflight() : null;
      const state = await withMutationLock(s, async () => {
        await s.setJSON('control', { access, updatedAt: new Date().toISOString(), updatedBy: auth.wallet });
        return computeState(s, true);
      });
      return json({ ok: true, readiness, state: { ...publicState(state), reservedBase: state.reservedBase.toString(), reservedStakingBonusBase: state.reservedStakingBonusBase.toString() } });
    }

    if (op === 'manual_allocate') {
      const buyer = assertWallet(payload.wallet, 'Investor wallet');
      const amount = decimalToBase(payload.rlyaAmount, 9, 'RLYA allocation');
      if (amount <= 0n) throw new Error('RLYA allocation must be positive.');
      const paymentReference = cleanText(payload.paymentReference, 120);
      const note = cleanText(payload.note, 220);

      const event = await withMutationLock(s, async () => {
        const state = await computeState(s, true);
        if (state.reservedBase > 0n) throw new Error('Wait for active buyer quotes to clear before recording a private allocation. Pause allocation access if you need a clean private-allocation checkpoint.');
        const start = state.totalAllocatedBase;
        const end = start + amount;
        if (end > PRESALE_CAP_BASE) throw new Error('Manual allocation would exceed the 288M RLYA public allocation cap or active reservations.');
        const id = newId('m');
        const row = {
          id,
          kind: 'manual',
          wallet: buyer,
          rlyaBase: amount.toString(),
          stakingBonusBase: '0',
          stake: false,
          deliveryPolicy: STANDARD_POLICY,
          distributionStatus: STANDARD_DISTRIBUTION,
          grossUsdcBase: '0',
          referralUsdcBase: '0',
          referrer: null,
          curveStartBase: start.toString(),
          curveEndBase: end.toString(),
          priceBeforeMicroUsdc: priceAt(start).toString(),
          priceAfterMicroUsdc: priceAt(end).toString(),
          createdAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          paymentReference,
          note,
          status: 'allocation-confirmed',
        };
        await s.setJSON(`manual/${id}`, row);
        return row;
      });
      return json({ ok: true, allocation: serializeEvent(event) });
    }

    if (op === 'lookup') {
      const wallet = assertWallet(payload.wallet, 'Buyer wallet');
      const events = (await getAllocationEvents(s))
        .filter(event => event.wallet === wallet)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const purchased = events.reduce((sum, event) => sum + BigInt(event.rlyaBase || 0), 0n);
      const bonus = events.reduce((sum, event) => sum + BigInt(event.stakingBonusBase || 0), 0n);
      return json({ ok: true, wallet, purchasedRlyaBase: purchased.toString(), stakingBonusRlyaBase: bonus.toString(), totalRlyaBase: (purchased + bonus).toString(), allocations: events.map(serializeEvent) });
    }

    if (op === 'manifest') {
      const state = await computeState(s, true);
      if (state.control.access !== 'closed') throw new Error('Close pre-launch allocation access before exporting the final delivery manifest.');
      if (state.reservedBase > 0n) throw new Error('Active buyer quote windows are still clearing. Export the final manifest after all reservations expire or confirm.');
      const manifest = await makeManifest(s);
      if (BigInt(manifest.totals.totalPurchasedRlyaBase) > PRESALE_CAP_BASE) throw new Error('Manifest exceeds the 288M public allocation cap.');
      if (BigInt(manifest.totals.stakingBonusRlyaBase) > STAKING_BONUS_RESERVE_BASE) throw new Error('Manifest exceeds the 14.4M staking bonus reserve.');
      return json({ ok: true, manifest });
    }

    throw new Error('Unknown owner presale operation.');
  } catch (err: any) {
    return json({ error: err?.message || 'Owner presale action failed.' }, 400);
  }
};

export const config = { path: '/api/presale/owner' };