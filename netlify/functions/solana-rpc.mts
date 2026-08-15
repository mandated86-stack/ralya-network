const ALLOWED_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getHealth',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountsByOwner',
  'getTransaction',
  'getVersion',
  'sendTransaction',
  'simulateTransaction',
]);

const MAX_BODY_BYTES = 180_000;
const ALLOWED_ORIGINS = new Set(['https://ralyaai.com', 'https://www.ralyaai.com']);

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      ...headers,
    },
  });
}

function rpcEndpoint() {
  const endpoint = (globalThis as any).Netlify?.env?.get?.('RALYA_SOLANA_RPC');
  if (!endpoint) throw new Error('RALYA_SOLANA_RPC is not configured.');
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:') throw new Error('RALYA_SOLANA_RPC must use HTTPS.');
  return parsed.toString();
}

function requestOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const referer = req.headers.get('referer');
  if (!referer) return '';
  try { return new URL(referer).origin; } catch { return ''; }
}

function validateCall(call: any) {
  if (!call || typeof call !== 'object' || call.jsonrpc !== '2.0') throw new Error('Invalid JSON-RPC request.');
  const method = String(call.method || '');
  if (!ALLOWED_METHODS.has(method)) throw new Error(`RPC method is not allowed: ${method || '(missing)'}.`);
  if (method === 'getTokenAccountsByOwner') {
    const filter = call?.params?.[1];
    const mint = String(filter?.mint || '');
    if (mint && mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
      throw new Error('Only the configured Solana USDC mint may be queried through this public route.');
    }
  }
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const origin = requestOrigin(req);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin not allowed.' }, 403);

  const raw = await req.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: 'RPC request is empty or too large.' }, 413);

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }

  try {
    const calls = Array.isArray(payload) ? payload : [payload];
    if (!calls.length || calls.length > 20) throw new Error('RPC batch size is not allowed.');
    calls.forEach(validateCall);

    const upstream = await fetch(rpcEndpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    const body = await upstream.text();
    if (!upstream.ok) {
      console.error('RALYA Solana RPC upstream HTTP error', upstream.status, body.slice(0, 300));
      return json({ error: 'Solana RPC provider is temporarily unavailable.', upstreamStatus: upstream.status }, 502, {
        'x-ralya-rpc-ready': '0',
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
        'x-ralya-rpc-ready': '1',
      },
    });
  } catch (err: any) {
    console.error('RALYA Solana RPC proxy error', err?.message || err);
    return json({ error: err?.message || 'Solana RPC proxy failed.' }, 503, { 'x-ralya-rpc-ready': '0' });
  }
};

export const config = { path: '/api/solana/rpc' };
