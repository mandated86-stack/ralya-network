import { Connection } from '@solana/web3.js';
import {
  PRESALE_TREASURY_WALLET, USDC_MINT, computeState, json, store, withMutationLock,
} from './_shared/presale-core.mts';

const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

function rpcEndpoint() {
  return (globalThis as any).Netlify?.env?.get?.('RALYA_SOLANA_RPC') || 'https://api.mainnet-beta.solana.com';
}

function signerSet(tx: any) {
  const out = new Set<string>();
  for (const row of tx?.transaction?.message?.accountKeys || []) {
    if (row?.signer) out.add(String(row?.pubkey?.toBase58?.() || row?.pubkey || ''));
  }
  return out;
}

function tokenOwnerBalances(rows: any[] | null | undefined, mint: string) {
  const out = new Map<string, bigint>();
  for (const row of rows || []) {
    if (row?.mint !== mint || !row?.owner) continue;
    const owner = String(row.owner);
    const amount = BigInt(row?.uiTokenAmount?.amount || '0');
    out.set(owner, (out.get(owner) || 0n) + amount);
  }
  return out;
}

function deltaFor(owner: string, pre: Map<string, bigint>, post: Map<string, bigint>) {
  return (post.get(owner) || 0n) - (pre.get(owner) || 0n);
}

function hasExpectedMemo(tx: any, memo: string) {
  const instructions = tx?.transaction?.message?.instructions || [];
  for (const ix of instructions) {
    const programId = String(ix?.programId?.toBase58?.() || ix?.programId || '');
    const text = JSON.stringify(ix);
    if ((programId === MEMO_PROGRAM || ix?.program === 'spl-memo') && text.includes(memo)) return true;
  }
  return false;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const quoteId = String(body?.quoteId || '').trim();
  const signature = String(body?.signature || '').trim();
  if (!/^q_[a-f0-9]{32}$/i.test(quoteId)) return json({ error: 'Invalid quote ID.' }, 400);
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) return json({ error: 'Invalid Solana transaction signature.' }, 400);

  try {
    const s = store();
    const receipt = await withMutationLock(s, async () => {
      const existing: any = await s.get(`purchase/${signature}`, { type: 'json' });
      if (existing) return existing;

      const quote: any = await s.get(`quote/${quoteId}`, { type: 'json' });
      if (!quote) throw new Error('Presale quote was not found.');
      if (quote.status === 'confirmed' && quote.signature) {
        const previous: any = await s.get(`purchase/${quote.signature}`, { type: 'json' });
        if (previous) return previous;
      }
      if (quote.status !== 'active') throw new Error('This quote is no longer active.');
      if (Date.now() > Number(quote.expiresAtMs || 0) + 120_000) throw new Error('Quote expired before confirmation. Request a new quote.');

      const connection = new Connection(rpcEndpoint(), 'confirmed');
      const tx = await connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) throw new Error('Transaction is not confirmed on Solana yet.');
      if (tx.meta?.err) throw new Error('The Solana transaction failed and cannot create an allocation.');
      if (!signerSet(tx).has(quote.buyer)) throw new Error('Buyer wallet did not sign this transaction.');
      if (!hasExpectedMemo(tx, quote.memo)) throw new Error('Transaction is not linked to this RALYA quote.');

      const blockMs = Number(tx.blockTime || 0) * 1000;
      if (!blockMs || blockMs < Number(quote.createdAtMs) - 30_000 || blockMs > Number(quote.expiresAtMs) + 90_000) {
        throw new Error('Transaction was not executed inside the quote window.');
      }

      const pre = tokenOwnerBalances(tx.meta?.preTokenBalances, USDC_MINT);
      const post = tokenOwnerBalances(tx.meta?.postTokenBalances, USDC_MINT);
      const gross = BigInt(quote.grossUsdcBase);
      const treasuryAmount = BigInt(quote.treasuryUsdcBase);
      const referralAmount = BigInt(quote.referralUsdcBase);
      if (deltaFor(quote.buyer, pre, post) !== -gross) throw new Error('USDC debit does not match the quoted purchase amount.');

      const expectedCredits = new Map<string, bigint>();
      expectedCredits.set(PRESALE_TREASURY_WALLET, treasuryAmount);
      if (quote.referrer) expectedCredits.set(quote.referrer, (expectedCredits.get(quote.referrer) || 0n) + referralAmount);
      for (const [owner, expected] of expectedCredits) {
        if (deltaFor(owner, pre, post) !== expected) throw new Error(`USDC credit to ${owner} does not match the locked quote.`);
      }

      if (quote.referrer) {
        const attribution: any = await s.get(`referral/${quote.buyer}`, { type: 'json' });
        if (attribution?.referrer && attribution.referrer !== quote.referrer) throw new Error('Buyer referral attribution changed before confirmation.');
        const reverse: any = await s.get(`referral/${quote.referrer}`, { type: 'json' });
        if (reverse?.referrer === quote.buyer) throw new Error('Direct two-wallet referral loops are not allowed.');
        if (!attribution) {
          await s.setJSON(`referral/${quote.buyer}`, {
            buyer: quote.buyer,
            referrer: quote.referrer,
            lockedAt: new Date().toISOString(),
            sourceSignature: signature,
          });
        }
      }

      const event = {
        id: signature,
        kind: 'web',
        wallet: quote.buyer,
        rlyaBase: quote.rlyaBase,
        grossUsdcBase: quote.grossUsdcBase,
        referralUsdcBase: quote.referralUsdcBase,
        referrer: quote.referrer || null,
        curveStartBase: quote.curveStartBase,
        curveEndBase: quote.curveEndBase,
        priceBeforeMicroUsdc: quote.priceBeforeMicroUsdc,
        priceAfterMicroUsdc: quote.priceAfterMicroUsdc,
        createdAt: quote.createdAt,
        confirmedAt: new Date().toISOString(),
        signature,
        quoteId,
        status: 'allocation-confirmed',
        distributionStatus: 'scheduled-before-public-launch',
      };
      await s.setJSON(`purchase/${signature}`, event);
      await s.setJSON(`quote/${quoteId}`, { ...quote, status: 'confirmed', signature, confirmedAt: event.confirmedAt });

      const finalState = await computeState(s, false);
      if (finalState.totalAllocatedBase > BigInt(finalState.remainingBase) + finalState.totalAllocatedBase) throw new Error('Presale reconciliation failed.');
      return event;
    });

    return json({ ok: true, receipt });
  } catch (err: any) {
    return json({ error: err?.message || 'Could not confirm presale allocation.' }, 400);
  }
};

export const config = { path: '/api/presale/confirm' };
