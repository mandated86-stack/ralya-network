import { store } from './_shared/presale-core.mts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const QUOTE_CONFIRMATION_GRACE_MS = 2 * 60 * 1000;

async function cleanupPrefix(s: ReturnType<typeof store>, prefix: string, shouldDelete: (value: any) => boolean) {
  const listed = await s.list({ prefix });
  let deleted = 0;
  for (const row of listed.blobs || []) {
    const value: any = await s.get(row.key, { type: 'json' });
    if (value && shouldDelete(value)) {
      await s.delete(row.key);
      deleted += 1;
    }
  }
  return deleted;
}

export default async () => {
  const s = store();
  const now = Date.now();
  const deletedQuotes = await cleanupPrefix(s, 'quote/', value => {
    const created = Number(value.createdAtMs || Date.parse(value.createdAt || '') || 0);
    const expired = Number(value.expiresAtMs || 0) + QUOTE_CONFIRMATION_GRACE_MS < now;
    return (value.status !== 'active' || expired) && created > 0 && created + 6 * HOUR < now;
  });
  const deletedQuoteAuth = await cleanupPrefix(s, 'quote-auth/', value => {
    const used = Date.parse(value.usedAt || '');
    return Number.isFinite(used) && used + DAY < now;
  });
  const deletedOwnerAuth = await cleanupPrefix(s, 'auth/', value => {
    const used = Date.parse(value.usedAt || '');
    return Number.isFinite(used) && used + 7 * DAY < now;
  });
  const deletedRates = await cleanupPrefix(s, 'rate/', value => Number(value.windowStartMs || 0) + HOUR < now);
  const lock: any = await s.get('lock/mutation', { type: 'json' });
  if (lock?.expiresAtMs && Number(lock.expiresAtMs) + HOUR < now) await s.delete('lock/mutation');
  console.log(JSON.stringify({ deletedQuotes, deletedQuoteAuth, deletedOwnerAuth, deletedRates }));
  return new Response('RALYA_PRESALE_CLEANUP=PASS');
};

export const config = { schedule: '@daily' };
