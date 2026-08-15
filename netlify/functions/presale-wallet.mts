import bs58 from 'bs58';
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const PRESALE_STORE = 'ralya-prelaunch-presale';
const RLYA_UNIT = 1_000_000_000n;
const VIEW_CLOCK_SKEW_MS = 5 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

function assertWallet(value: unknown, label = 'wallet') {
  const text = String(value || '').trim();
  try {
    const raw = bs58.decode(text);
    if (raw.length !== 32) throw new Error('length');
    return bs58.encode(raw);
  } catch {
    throw new Error(`${label} is not a valid Solana public address.`);
  }
}

function walletKey(wallet: string) {
  const raw = bs58.decode(wallet);
  if (raw.length !== 32) throw new Error('Invalid buyer public key length.');
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function viewMessage(wallet: string, timestamp: string, nonce: string) {
  return [
    'RALYA allocation view',
    `Wallet: ${wallet}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

function verifyView(body: any, wallet: string) {
  if (assertWallet(body?.wallet, 'Wallet') !== wallet) throw new Error('Signed wallet does not match the requested allocation.');
  const timestamp = String(body?.timestamp || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const message = String(body?.message || '');
  const signatureB64 = String(body?.signature || '').trim();
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('Invalid allocation-view nonce.');
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > VIEW_CLOCK_SKEW_MS) throw new Error('Allocation-view authorization expired. Sign again.');
  const expected = viewMessage(wallet, timestamp, nonce);
  if (message !== expected) throw new Error('Signed allocation-view message does not match this request.');
  let signature: Buffer;
  try { signature = Buffer.from(signatureB64, 'base64'); } catch { throw new Error('Invalid allocation-view signature encoding.'); }
  if (signature.length !== 64) throw new Error('Invalid allocation-view signature length.');
  if (!verifySignature(null, Buffer.from(message, 'utf8'), walletKey(wallet), signature)) throw new Error('Allocation-view wallet signature verification failed.');
}

async function readPrefix(store: any, prefix: string) {
  const listed = await store.list({ prefix });
  if (!listed?.blobs?.length) return [];
  const values = await Promise.all(listed.blobs.map(async (row: any) => {
    try { return await store.get(row.key, { type: 'json' }); }
    catch { return null; }
  }));
  return values.filter(Boolean);
}

export default async (req: Request, context: any) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let wallet: string;
  let body: any;
  try {
    wallet = assertWallet(context?.params?.wallet, 'Wallet');
    try { body = await req.json(); } catch { throw new Error('Invalid allocation-view authorization.'); }
    verifyView(body, wallet);
  } catch (err: any) {
    return json({ error: err?.message || 'Could not verify wallet authorization.' }, 400);
  }

  try {
    // Import Netlify Blobs only after the signed wallet request is validated. This keeps any
    // storage/runtime initialization problem inside the handler so the buyer receives a normal
    // JSON error instead of a platform-level 502 page.
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: PRESALE_STORE, consistency: 'strong' });
    const [web, manual, referral] = await Promise.all([
      readPrefix(store, 'purchase/'),
      readPrefix(store, 'manual/'),
      store.get(`referral/${wallet}`, { type: 'json' }).catch(() => null),
    ]);
    const events = [...web, ...manual];
    const mine = events.filter((event: any) => event?.wallet === wallet).sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));

    let purchasedRlya = 0n;
    let stakingBonus = 0n;
    let totalUsdc = 0n;
    let totalReferral = 0n;
    let hasStandard = false;
    let hasStaked = false;
    for (const event of mine as any[]) {
      purchasedRlya += BigInt(event.rlyaBase || 0);
      stakingBonus += BigInt(event.stakingBonusBase || 0);
      totalUsdc += BigInt(event.grossUsdcBase || 0);
      totalReferral += BigInt(event.referralUsdcBase || 0);
      if (event.stake) hasStaked = true; else hasStandard = true;
    }

    const expectedTotal = purchasedRlya + stakingBonus;
    const averagePriceMicroUsdc = purchasedRlya > 0n && totalUsdc > 0n ? totalUsdc * RLYA_UNIT / purchasedRlya : 0n;
    const distributionStatus = purchasedRlya <= 0n
      ? null
      : hasStaked && hasStandard
        ? 'mixed-tminus1-and-21d-after-public-launch'
        : hasStaked
          ? '21-days-after-public-launch'
          : '1-day-before-public-launch';

    return json({
      wallet,
      status: purchasedRlya > 0n ? 'allocation-confirmed' : 'no-allocation',
      distributionStatus,
      purchasedRlyaBase: purchasedRlya.toString(),
      stakingBonusRlyaBase: stakingBonus.toString(),
      totalRlyaBase: expectedTotal.toString(),
      expectedTotalRlyaBase: expectedTotal.toString(),
      totalUsdcPaidBase: totalUsdc.toString(),
      totalReferralUsdcBase: totalReferral.toString(),
      averagePriceMicroUsdc: averagePriceMicroUsdc.toString(),
      lockedReferrer: (referral as any)?.referrer || null,
      allocations: mine.map((event: any) => {
        const base = BigInt(event.rlyaBase || 0);
        const bonus = BigInt(event.stakingBonusBase || 0);
        return {
          id: event.kind === 'web' ? event.id : `private-${event.createdAt}`,
          kind: event.kind,
          rlyaBase: base.toString(),
          stakingBonusBase: bonus.toString(),
          expectedTotalRlyaBase: (base + bonus).toString(),
          stake: event.stake === true,
          deliveryPolicy: event.deliveryPolicy || (event.stake ? 'staked-plus21d' : 'standard-tminus1'),
          grossUsdcBase: event.grossUsdcBase,
          referralUsdcBase: event.referralUsdcBase,
          referrer: event.referrer,
          priceBeforeMicroUsdc: event.priceBeforeMicroUsdc,
          priceAfterMicroUsdc: event.priceAfterMicroUsdc,
          createdAt: event.createdAt,
          confirmedAt: event.confirmedAt || null,
          signature: event.kind === 'web' ? event.signature || null : null,
        };
      }),
    });
  } catch (err: any) {
    console.error('RALYA presale wallet allocation backend unavailable:', err?.message || err);
    return json({ error: 'Allocation service is temporarily reconnecting. Your wallet is connected; try the allocation check again shortly.' }, 503);
  }
};

export const config = { path: '/api/presale/wallet/:wallet' };
