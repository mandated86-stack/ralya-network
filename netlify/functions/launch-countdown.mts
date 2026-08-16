import { getDeployStore, getStore } from '@netlify/blobs';
import bs58 from 'bs58';
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const OWNER_WALLET = 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo';
const STORE_NAME = 'ralya-launch-countdown';
const CURRENT_KEY = 'current';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TARGET_AT = '2026-10-15T13:22:00.000Z';

function deployContext() {
  const n = (globalThis as any).Netlify;
  return String(n?.context?.deploy?.context || n?.env?.get?.('CONTEXT') || process.env.CONTEXT || '').toLowerCase();
}

function storeFor(req: Request) {
  const contextIsProduction = deployContext() === 'production';
  const host = new URL(req.url).hostname.toLowerCase();
  const isNetlifyBranchDeploy = host.endsWith('.netlify.app') && host.includes('--');
  const explicitlyNonProduction = Boolean(deployContext()) && !contextIsProduction;
  return (isNetlifyBranchDeploy || explicitlyNonProduction)
    ? getDeployStore({ name: STORE_NAME })
    : getStore(STORE_NAME, { consistency: 'strong' });
}

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

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function ownerKey(wallet: string) {
  const raw = bs58.decode(wallet);
  if (raw.length !== 32) throw new Error('Invalid owner public key length.');
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}

function normalizeTargetAt(raw: unknown) {
  const value = String(raw || '').trim();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Enter a valid launch date and time.');
  const now = Date.now();
  if (parsed < now + 60 * 60 * 1000) throw new Error('Launch target must be at least 1 hour in the future.');
  if (parsed > now + 730 * DAY_MS) throw new Error('Launch target cannot be more than 2 years away.');
  return new Date(parsed).toISOString();
}

async function verifyOwner(body: any, operation: string, payload: any, s: any) {
  const wallet = String(body?.wallet || '').trim();
  const timestamp = String(body?.timestamp || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const message = String(body?.message || '');
  const signatureB64 = String(body?.signature || '').trim();
  if (wallet !== OWNER_WALLET) throw new Error('Owner wallet required.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) throw new Error('Invalid timestamp.');
  if (!/^[a-f0-9]{32,64}$/i.test(nonce)) throw new Error('Invalid nonce.');
  const parsedTime = Date.parse(timestamp);
  if (!Number.isFinite(parsedTime) || Math.abs(Date.now() - parsedTime) > MAX_CLOCK_SKEW_MS) throw new Error('Signed request expired. Sign again.');
  const expected = [
    'RALYA launch countdown update',
    `Wallet: ${wallet}`,
    `Operation: ${operation}`,
    `Payload: ${stableStringify(payload || {})}`,
    `Timestamp: ${timestamp}`,
    `Nonce: ${nonce}`,
  ].join('\n');
  if (message !== expected) throw new Error('Signed message does not match request.');
  const signature = Buffer.from(signatureB64, 'base64');
  if (signature.length !== 64) throw new Error('Invalid Ed25519 signature length.');
  if (!verifySignature(null, Buffer.from(message, 'utf8'), ownerKey(wallet), signature)) throw new Error('Owner signature verification failed.');
  const nonceKey = `auth/${nonce}`;
  if (await s.get(nonceKey)) throw new Error('Signed request has already been used.');
  await s.setJSON(nonceKey, { usedAt: new Date().toISOString() });
  return wallet;
}

async function currentState(s: any) {
  const stored: any = await s.get(CURRENT_KEY, { type: 'json' });
  const targetAt = stored?.targetAt && Number.isFinite(Date.parse(stored.targetAt)) ? stored.targetAt : DEFAULT_TARGET_AT;
  return {
    targetAt,
    updatedAt: stored?.updatedAt || null,
    updatedBy: stored?.updatedBy || null,
  };
}

export default async (req: Request) => {
  const s = storeFor(req);
  if (req.method === 'GET') {
    const current = await currentState(s);
    return json({ ...current, defaultTargetAt: DEFAULT_TARGET_AT });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const operation = String(body?.operation || '').trim();
  if (!['set', 'extend', 'reset60'].includes(operation)) return json({ error: 'Unknown countdown operation.' }, 400);

  try {
    let payload: any = {};
    if (operation === 'set') payload = { targetAt: normalizeTargetAt(body?.payload?.targetAt) };
    if (operation === 'extend') {
      const days = Number(body?.payload?.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Extension must be between 1 and 365 whole days.');
      payload = { days };
    }
    const wallet = await verifyOwner(body, operation, payload, s);
    const before = await currentState(s);
    let targetAt: string;
    if (operation === 'set') targetAt = payload.targetAt;
    else if (operation === 'reset60') targetAt = new Date(Date.now() + 60 * DAY_MS).toISOString();
    else {
      const base = Math.max(Date.now(), Date.parse(before.targetAt));
      targetAt = new Date(base + payload.days * DAY_MS).toISOString();
    }
    targetAt = normalizeTargetAt(targetAt);
    const next = { targetAt, updatedAt: new Date().toISOString(), updatedBy: wallet };
    await s.setJSON(CURRENT_KEY, next);
    return json({ ok: true, ...next, defaultTargetAt: DEFAULT_TARGET_AT });
  } catch (error: any) {
    const message = String(error?.message || error || 'Countdown update failed.');
    const status = /owner|signature/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
};

export const config = { path: '/api/launch-countdown' };
