import { computeState, json, publicState, store } from './_shared/presale-core.mts';

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  try {
    const state = await computeState(store(), false);
    return json(publicState(state));
  } catch (err: any) {
    return json({ error: err?.message || 'Could not load presale state.' }, 500);
  }
};

export const config = { path: '/api/presale/state' };
