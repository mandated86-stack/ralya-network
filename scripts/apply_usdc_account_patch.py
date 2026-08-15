#!/usr/bin/env python3
from pathlib import Path

path=Path('web/prelaunch.js')
text=path.read_text(encoding='utf-8')
if 'activateReferralReceiving' in text and 'Treasury USDC receiving account is not ready' in text:
    print('RALYA_USDC_ACCOUNT_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

old="""async function ensureAta(tx, payer, owner, mint) {
  const ata = await getAssociatedTokenAddress(mint, owner); if (!await connection.getAccountInfo(ata, 'confirmed')) tx.add(createAssociatedTokenAccountInstruction(payer, ata, owner, mint)); return ata;
}
"""
new="""async function requiredAta(owner,mint,label){
  const ata=await getAssociatedTokenAddress(mint,owner);
  if(!await connection.getAccountInfo(ata,'confirmed'))throw new Error(`${label} USDC receiving account is not ready. No funds were moved. Please try again after it is prepared.`);
  return ata;
}
async function activateReferralReceiving(){
  if(!wallet||!provider)await connectWallet();
  const mint=new PublicKey(cfg.usdcMint),ata=await getAssociatedTokenAddress(mint,wallet);
  if(await connection.getAccountInfo(ata,'confirmed'))return ata;
  const tx=new Transaction().add(createAssociatedTokenAccountInstruction(wallet,ata,wallet,mint));
  toast('Activate your USDC receiving account once to use referral links.');
  await sendTransaction(tx);
  if(!await connection.getAccountInfo(ata,'confirmed'))throw new Error('USDC referral receiving account was not created.');
  toast('Referral USDC receiving account activated.');
  return ata;
}
"""
if old not in text: raise SystemExit('ensureAta marker not found')
text=text.replace(old,new,1)

old="""  const signedRequest = await signedQuoteBody(usdcAmount);
  const quoteResult = await fetchJson('/api/presale/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signedRequest) });
  const quote = quoteResult.quote;
  $('#quoteValue').textContent = `${formatBase(quote.rlyaBase, 9, 4)} RLYA`;
  $('#averagePrice').textContent = `Locked allocation · quote valid until ${new Date(quote.expiresAt).toLocaleTimeString()}`;

  const mint = new PublicKey(quote.usdcMint), treasury = new PublicKey(quote.treasuryWallet);
  const buyerUsdcAta = await getAssociatedTokenAddress(mint, wallet);
  if (!await connection.getAccountInfo(buyerUsdcAta, 'confirmed')) throw new Error('Your wallet has no USDC token account on Solana.');
  const tx = new Transaction(); const treasuryAta = await ensureAta(tx, wallet, treasury, mint); const treasuryAmount = BigInt(quote.treasuryUsdcBase);
  if (treasuryAmount > 0n) tx.add(createTransferCheckedInstruction(buyerUsdcAta, mint, treasuryAta, wallet, treasuryAmount, 6));
  if (quote.referrer) {
    const referrer = new PublicKey(quote.referrer); const referrerAta = await ensureAta(tx, wallet, referrer, mint); const referralAmount = BigInt(quote.referralUsdcBase);
    if (referralAmount > 0n) tx.add(createTransferCheckedInstruction(buyerUsdcAta, mint, referrerAta, wallet, referralAmount, 6));
  }
"""
new="""  const mint=new PublicKey(cfg.usdcMint),configuredTreasury=new PublicKey(cfg.prelaunchTreasuryWallet);
  const buyerUsdcAta=await getAssociatedTokenAddress(mint,wallet);
  if(!await connection.getAccountInfo(buyerUsdcAta,'confirmed'))throw new Error('Your wallet has no USDC token account on Solana.');
  const treasuryAta=await requiredAta(configuredTreasury,mint,'Treasury');
  let expectedReferrerAta=null;
  if(referralWallet)expectedReferrerAta=await requiredAta(referralWallet,mint,'Referrer');

  const signedRequest = await signedQuoteBody(usdcAmount);
  const quoteResult = await fetchJson('/api/presale/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signedRequest) });
  const quote = quoteResult.quote;
  $('#quoteValue').textContent = `${formatBase(quote.rlyaBase, 9, 4)} RLYA`;
  $('#averagePrice').textContent = `Locked allocation · quote valid until ${new Date(quote.expiresAt).toLocaleTimeString()}`;
  if(quote.usdcMint!==cfg.usdcMint||quote.treasuryWallet!==configuredTreasury.toBase58())throw new Error('Server quote payment addresses do not match the reviewed website configuration.');
  if((quote.referrer||null)!==(referralWallet?.toBase58()||null))throw new Error('Server referral attribution differs from the wallet checkout state. Refresh and retry.');
  const tx = new Transaction(); const treasuryAmount = BigInt(quote.treasuryUsdcBase);
  if (treasuryAmount > 0n) tx.add(createTransferCheckedInstruction(buyerUsdcAta, mint, treasuryAta, wallet, treasuryAmount, 6));
  if (quote.referrer) {
    const referralAmount = BigInt(quote.referralUsdcBase);
    if(!expectedReferrerAta)throw new Error('Referrer USDC receiving account was not verified.');
    if (referralAmount > 0n) tx.add(createTransferCheckedInstruction(buyerUsdcAta, mint, expectedReferrerAta, wallet, referralAmount, 6));
  }
"""
if old not in text: raise SystemExit('secure allocation payment marker not found')
text=text.replace(old,new,1)

old="""$('#copyReferralLink')?.addEventListener('click', async () => { if (!wallet) return connectWallet(); await navigator.clipboard.writeText(referralLinkFor(wallet.toBase58())); toast('Referral link copied.'); });
"""
new="""$('#copyReferralLink')?.addEventListener('click', async () => {
  try{
    if(!wallet)await connectWallet();
    await activateReferralReceiving();
    await navigator.clipboard.writeText(referralLinkFor(wallet.toBase58()));
    toast('Referral link copied. Your wallet is ready to receive referral USDC.');
  }catch(err){toast(err.message||'Could not activate referral receiving account.');}
});
"""
if old not in text: raise SystemExit('copy referral handler marker not found')
text=text.replace(old,new,1)

path.write_text(text,encoding='utf-8')
print('RALYA_USDC_ACCOUNT_PATCH=APPLIED')
