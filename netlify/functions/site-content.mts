import { getDeployStore, getStore } from '@netlify/blobs';
import bs58 from 'bs58';
import { createPublicKey, verify as verifySignature } from 'node:crypto';

const OWNER_WALLET = 'BwurjZzEeGTVRtxshTXbxvbZjDszGdaTKXno6vqUWVFo';
const STORE_NAME = 'ralya-site-copy';
const CURRENT_KEY = 'current';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const FIELDS = Object.freeze({
  'hero.lead': 420,
  'purpose.heading': 120,
  'purpose.body': 420,
  'rlya.heading': 120,
  'rlya.body': 420,
  'presale.heading': 140,
  'presale.body': 500,
  'build.heading': 120,
  'build.body': 420,
  'opensource.heading': 120,
  'opensource.body': 420,
  'engineering.heading': 120,
});

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
    : getStore({ name: STORE_NAME, consistency: 'strong' });
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

function normalizeOverrides(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Overrides must be an object.');
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const max = (FIELDS as Record<string, number>)[key];
    if (!max) throw new Error(`Field is not live-editable: ${key}`);
    if (typeof raw !== 'string') throw new Error(`Field must be plain text: ${key}`);
    const value = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!value) throw new Error(`Live override cannot be empty: ${key}`);
    if (value.length > max) throw new Error(`${key} exceeds ${max} characters.`);
    out[key] = value;
  }
  return out;
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
    'RALYA live site-copy update',
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

export default async (req: Request) => {
  const s = storeFor(req);
  if (req.method === 'GET') {
    const current: any = await s.get(CURRENT_KEY, { type: 'json' });
    return json({
      overrides: current?.overrides && typeof current.overrides === 'object' ? current.overrides : {},
      updatedAt: current?.updatedAt || null,
      updatedBy: current?.updatedBy || null,
      editableKeys: Object.keys(FIELDS),
    });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const operation = String(body?.operation || '').trim();
  if (!['save', 'reset'].includes(operation)) return json({ error: 'Unknown site-copy operation.' }, 400);

  try {
    const payload = operation === 'save' ? { overrides: normalizeOverrides(body?.payload?.overrides || {}) } : {};
    const wallet = await verifyOwner(body, operation, payload, s);
    const next = {
      overrides: operation === 'reset' ? {} : payload.overrides,
      updatedAt: new Date().toISOString(),
      updatedBy: wallet,
    };
    await s.setJSON(CURRENT_KEY, next);
    return json({ ok: true, ...next });
  } catch (error: any) {
    const message = String(error?.message || error || 'Site-copy update failed.');
    const status = /owner|signature/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
};

export const config = { path: '/api/site-content' };
