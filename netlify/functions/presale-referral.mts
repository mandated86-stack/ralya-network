import { createHash } from 'node:crypto';
import { assertWallet, json, store } from './_shared/presale-core.mts';

const CODE_RE = /^[A-F0-9]{10}$/;

function codeFor(wallet: string) {
  return createHash('sha256').update(`RALYA-REFERRAL-V1:${wallet}`).digest('hex').slice(0, 10).toUpperCase();
}

export default async (req: Request) => {
  try {
    const s = store();
    if (req.method === 'POST') {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const wallet = assertWallet(body?.wallet, 'Referral wallet');
      const code = codeFor(wallet);
      const record = { code, wallet, createdAt: new Date().toISOString() };
      await Promise.all([s.setJSON(`refcode/${code}`, record), s.setJSON(`refwallet/${wallet}`, record)]);
      return json({ ok: true, code });
    }
    if (req.method === 'GET') {
      const code = String(new URL(req.url).searchParams.get('code') || '').trim().toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'Invalid referral code.' }, 400);
      const record: any = await s.get(`refcode/${code}`, { type: 'json' });
      if (!record?.wallet) return json({ error: 'Referral code not found.' }, 404);
      return json({ ok: true, code, wallet: assertWallet(record.wallet, 'Referral wallet') });
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (err: any) {
    return json({ error: err?.message || 'Referral service unavailable.' }, 400);
  }
};

export const config = { path: '/api/presale/referral' };
