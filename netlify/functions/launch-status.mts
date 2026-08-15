import { getStore } from '@netlify/blobs';
import bs58 from 'bs58';
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const OWNER_WALLET = 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo';
const STORE_NAME = 'ralya-public-launch-status';
const CURRENT_KEY = 'current';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const STAGES = Object.freeze({
  prelaunch: {
    badge: 'PRE-LAUNCH PHASE',
    headline: 'Planned launch sequence in progress',
    detail: 'RALYA is progressing through its planned pre-launch milestones ahead of public launch.',
    rank: 0,
  },
  mainnet_preparing: {
    badge: 'MAINNET PREPARATION',
    headline: 'Mainnet launch preparation',
    detail: 'Final network deployment and verification work is in progress.',
    rank: 1,
  },
  mainnet_verified: {
    badge: 'MAINNET VERIFIED',
    headline: 'Mainnet infrastructure verified',
    detail: 'The production network deployment has completed its verification checkpoint.',
    rank: 2,
  },
  distribution_preparing: {
    badge: 'DISTRIBUTION PREPARATION',
    headline: 'Token distribution preparation',
    detail: 'Launch allocations and distribution infrastructure are being finalized.',
    rank: 3,
  },
  distribution_scheduled: {
    badge: 'DISTRIBUTION SCHEDULED',
    headline: 'Presale distribution scheduled',
    detail: 'Confirmed presale allocations are scheduled for wallet distribution before public launch.',
    rank: 4,
  },
  launch_approaching: {
    badge: 'LAUNCH APPROACHING',
    headline: 'Final launch sequencing underway',
    detail: 'RALYA is in its final pre-launch phase. Public launch timing will be announced separately.',
    rank: 5,
  },
});

const DEFAULT_STATUS = Object.freeze({
  stage: 'prelaunch',
  ...STAGES.prelaunch,
  note: '',
  updatedAt: null,
});

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

function ownerKey(wallet: string) {
  const raw = bs58.decode(wallet);
  if (raw.length !== 32) throw new Error('Invalid owner public key length.');
  // DER SubjectPublicKeyInfo prefix for an Ed25519 public key, followed by 32 raw key bytes.
  const der = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(raw),
  ]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function cleanNote(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 220);
}

export default async (req: Request) => {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (req.method === 'GET') {
    const current = await store.get(CURRENT_KEY, { type: 'json' });
    return json(current || DEFAULT_STATUS);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const wallet = String(body?.wallet || '').trim();
  const stage = String(body?.stage || '').trim();
  const timestamp = String(body?.timestamp || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const message = String(body?.message || '');
  const signatureB64 = String(body?.signature || '').trim();

  if (wallet !== OWNER_WALLET) return json({ error: 'Owner wallet required.' }, 403);
  if (!(stage in STAGES)) return json({ error: 'Unknown launch stage.' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) return json({ error: 'Invalid timestamp.' }, 400);
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) return json({ error: 'Invalid nonce.' }, 400);

  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > MAX_CLOCK_SKEW_MS) {
    return json({ error: 'Signed request expired. Sign again.' }, 400);
  }

  const expectedMessage = [
    'RALYA public launch-stage update',
    `Wallet: ${wallet}`,
    `Stage: ${stage}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');

  if (message !== expectedMessage) return json({ error: 'Signed message does not match request.' }, 400);

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureB64, 'base64');
  } catch {
    return json({ error: 'Invalid signature encoding.' }, 400);
  }
  if (signature.length !== 64) return json({ error: 'Invalid Ed25519 signature length.' }, 400);

  let verified = false;
  try {
    verified = verifySignature(null, Buffer.from(message, 'utf8'), ownerKey(wallet), signature);
  } catch {
    verified = false;
  }
  if (!verified) return json({ error: 'Owner signature verification failed.' }, 403);

  const definition = (STAGES as any)[stage];
  const previous: any = await store.get(CURRENT_KEY, { type: 'json' });
  const history = Array.isArray(previous?.history) ? previous.history.slice(-19) : [];
  if (previous?.stage) {
    history.push({ stage: previous.stage, updatedAt: previous.updatedAt || null });
  }

  const next = {
    stage,
    ...definition,
    note: cleanNote(body?.note),
    updatedAt: new Date().toISOString(),
    updatedBy: wallet,
    history,
  };

  await store.setJSON(CURRENT_KEY, next);
  return json({ ok: true, status: next });
};

export const config = {
  path: '/api/launch-status',
};
