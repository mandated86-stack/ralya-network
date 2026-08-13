import { Connection, PublicKey, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg = window.RALYA_CONFIG;
const $ = q => document.querySelector(q);
const enc = new TextEncoder();
const connection = new Connection(cfg.rpcEndpoint, 'confirmed');
const RLYA_UNIT = 1_000_000_000n;
let provider, wallet, sale, salePda, saleVaultPda, founderLockPda, founderVaultPda, adminOnChain, treasuryOnChain, founderOnChain, founderLock;

const log = msg => { $('#ownerStatus').textContent = `${new Date().toLocaleTimeString()}  ${msg}\n${$('#ownerStatus').textContent}`.slice(0, 5000); };
const shorten = s => s && s.length > 15 ? `${s.slice(0,6)}…${s.slice(-6)}` : s;
const priceText = micro => `$${(Number(micro)/1_000_000).toFixed(6)}`;
const tokenText = base => `${(Number(base)/1e9).toLocaleString(undefined,{maximumFractionDigits:3})} RLYA`;

function providerForBrowser(){ return window.phantom?.solana || window.solflare || window.solana || null; }
function configured(){ return Boolean(cfg.rlyaMint && cfg.saleProgramId && cfg.treasuryWallet); }
function u64(view,o){return view.getBigUint64(o,true);}
function decode(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data); const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  adminOnChain=new PublicKey(b.slice(8,40)); treasuryOnChain=new PublicKey(b.slice(40,72)); founderOnChain=new PublicKey(b.slice(72,104)); let o=8+32*5;
  const presaleCap=u64(v,o);o+=8;const basePrice=u64(v,o);o+=8;const stepSize=u64(v,o);o+=8;const stepIncrement=u64(v,o);o+=8;const referralBps=u64(v,o);o+=8;
  const totalSold=u64(v,o);o+=8;const manualSold=u64(v,o);o+=8;const totalUsdc=u64(v,o);o+=8;const totalReferralUsdc=u64(v,o);o+=8;const started=v.getBigInt64(o,true);o+=8;const status=v.getUint8(o);
  return {presaleCap,basePrice,stepSize,stepIncrement,referralBps,totalSold,manualSold,totalUsdc,totalReferralUsdc,started,status};
}
function decodeFounderLock(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data); const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(b.length<90) throw new Error('Founder lock account is incomplete.');
  const founder=new PublicKey(b.slice(8,40)); const amount=u64(v,72); const unlockAt=v.getBigInt64(80,true); const released=Boolean(v.getUint8(88));
  return {founder,amount,unlockAt,released};
}
function currentPrice(s){return s.basePrice+(s.totalSold/s.stepSize)*s.stepIncrement;}
async function disc(name){const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`));return new Uint8Array(h).slice(0,8);}
async function dataU64(name,n){const d=new Uint8Array(16);d.set(await disc(name));new DataView(d.buffer).setBigUint64(8,n,true);return d;}
async function dataNoArgs(name){return await disc(name);}
function parseToken(s){
  const raw=String(s||'').trim(); if(!/^\d+(\.\d+)?$/.test(raw))throw new Error('Enter a valid RLYA amount.');
  const [w,f='']=raw.split('.'); if(f.length>9)throw new Error('RLYA supports 9 decimals.'); return BigInt(w)*RLYA_UNIT+BigInt((f+'000000000').slice(0,9));
}
async function refresh(){
  if(!configured()){log('Mainnet addresses are not filled in site-config.js yet.');return;}
  const program=new PublicKey(cfg.saleProgramId), mint=new PublicKey(cfg.rlyaMint);
  [salePda]=PublicKey.findProgramAddressSync([enc.encode('sale'),mint.toBytes()],program);
  [saleVaultPda]=PublicKey.findProgramAddressSync([enc.encode('sale_vault'),mint.toBytes()],program);
  [founderLockPda]=PublicKey.findProgramAddressSync([enc.encode('founder_lock'),mint.toBytes()],program);
  [founderVaultPda]=PublicKey.findProgramAddressSync([enc.encode('founder_vault'),mint.toBytes()],program);
  const [info,lockInfo]=await Promise.all([connection.getAccountInfo(salePda,'confirmed'),connection.getAccountInfo(founderLockPda,'confirmed')]); if(!info)throw new Error('Sale state account not found.');
  sale=decode(info.data); founderLock=lockInfo?decodeFounderLock(lockInfo.data):null; $('#ownerPrice').textContent=priceText(currentPrice(sale)); $('#ownerSold').textContent=tokenText(sale.totalSold); $('#ownerManual').textContent=tokenText(sale.manualSold); if($('#ownerReferral')) $('#ownerReferral').textContent=`${(Number(sale.totalReferralUsdc)/1e6).toLocaleString(undefined,{maximumFractionDigits:2})} USDC`;
  const authorized=wallet&&adminOnChain.equals(wallet); ['manualSale','pauseSale','resumeSale','closeSale'].forEach(id=>$("#"+id).disabled=!authorized);
  $('#withdrawUnsold').disabled=!(authorized&&sale.status===3);
  const founderAuthorized=wallet&&founderOnChain.equals(wallet); const now=BigInt(Math.floor(Date.now()/1000)); const founderReady=founderLock&&founderAuthorized&&!founderLock.released&&founderLock.unlockAt>0n&&now>=founderLock.unlockAt; $('#releaseFounder').disabled=!founderReady;
  if(founderLock){const unlock=founderLock.unlockAt>0n?new Date(Number(founderLock.unlockAt)*1000).toLocaleString():'starts when sale activates'; $('#founderLockStatus').textContent=founderLock.released?'Founder allocation: released on-chain.':`Founder allocation lock: ${unlock}. ${founderAuthorized?'Connected wallet matches founder.':'Connect the published founder wallet to release after unlock.'}`;}
  log(`Sale state refreshed. On-chain admin: ${adminOnChain.toBase58()} · state=${sale.status}`);
}
async function connect(){
  provider=providerForBrowser(); if(!provider?.connect)throw new Error('No Solana wallet detected.'); const r=await provider.connect(); wallet=new PublicKey(r?.publicKey||provider.publicKey); $('#ownerWallet').textContent=shorten(wallet.toBase58()); await refresh(); const isAdmin=adminOnChain?.equals(wallet); const isFounder=founderOnChain?.equals(wallet); if(!isAdmin&&!isFounder)throw new Error('Connected wallet is neither the on-chain sale admin nor the published founder wallet.'); log(`Authorized as ${isAdmin&&isFounder?'admin + founder':isAdmin?'admin':'founder'}.`);
}
async function send(tx){
  const latest=await connection.getLatestBlockhash('confirmed');tx.recentBlockhash=latest.blockhash;tx.feePayer=wallet;let sig;
  if(provider.signAndSendTransaction){const r=await provider.signAndSendTransaction(tx);sig=typeof r==='string'?r:r?.signature;}else{const signed=await provider.signTransaction(tx);sig=await connection.sendRawTransaction(signed.serialize());}
  if(!sig)throw new Error('Wallet returned no transaction signature.');await connection.confirmTransaction({signature:sig,...latest},'confirmed');log(`Confirmed ${sig}`);return sig;
}
async function manualSale(){
  if(!wallet||!adminOnChain?.equals(wallet))throw new Error('Connect the authorized owner wallet.'); const recipient=new PublicKey($('#manualRecipient').value.trim()); const amount=parseToken($('#manualAmount').value); if(amount<=0n)throw new Error('Amount must be positive.');
  const program=new PublicKey(cfg.saleProgramId), mint=new PublicKey(cfg.rlyaMint); const recipientAta=await getAssociatedTokenAddress(mint,recipient); const tx=new Transaction();
  if(!await connection.getAccountInfo(recipientAta))tx.add(createAssociatedTokenAccountInstruction(wallet,recipientAta,recipient,mint));
  tx.add(new TransactionInstruction({programId:program,data:await dataU64('manual_sale',amount),keys:[
    {pubkey:wallet,isSigner:true,isWritable:false},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:true},{pubkey:saleVaultPda,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false}
  ]}));
  await send(tx); log(`Off-site sale delivered: ${tokenText(amount)} to ${recipient.toBase58()}. Price curve advanced.`); await refresh();
}
async function withdrawUnsold(){
  if(!wallet||!adminOnChain?.equals(wallet))throw new Error('Connect the authorized admin wallet.'); if(sale?.status!==3)throw new Error('Sale must be closed first.');
  const program=new PublicKey(cfg.saleProgramId), mint=new PublicKey(cfg.rlyaMint); const treasuryRlyaAta=await getAssociatedTokenAddress(mint,treasuryOnChain); const tx=new Transaction();
  if(!await connection.getAccountInfo(treasuryRlyaAta))tx.add(createAssociatedTokenAccountInstruction(wallet,treasuryRlyaAta,treasuryOnChain,mint));
  tx.add(new TransactionInstruction({programId:program,data:await dataNoArgs('withdraw_unsold'),keys:[
    {pubkey:wallet,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:false},{pubkey:treasuryOnChain,isSigner:false,isWritable:false},{pubkey:saleVaultPda,isSigner:false,isWritable:true},{pubkey:treasuryRlyaAta,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false}
  ]})); await send(tx); log('Unsold public-sale RLYA moved to the published treasury.'); await refresh();
}
async function releaseFounder(){
  if(!wallet||!founderOnChain?.equals(wallet))throw new Error('Connect the published founder wallet.'); if(!founderLock)throw new Error('Founder lock account unavailable.');
  const program=new PublicKey(cfg.saleProgramId), mint=new PublicKey(cfg.rlyaMint); const founderAta=await getAssociatedTokenAddress(mint,wallet); const tx=new Transaction();
  if(!await connection.getAccountInfo(founderAta))tx.add(createAssociatedTokenAccountInstruction(wallet,founderAta,wallet,mint));
  tx.add(new TransactionInstruction({programId:program,data:await dataNoArgs('release_founder'),keys:[
    {pubkey:wallet,isSigner:true,isWritable:true},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:founderLockPda,isSigner:false,isWritable:true},{pubkey:founderVaultPda,isSigner:false,isWritable:true},{pubkey:founderAta,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false}
  ]})); await send(tx); log('Founder allocation released after the on-chain lock expired.'); await refresh();
}
async function adminStateIx(name){
  if(!wallet||!adminOnChain?.equals(wallet))throw new Error('Connect the authorized owner wallet.'); const tx=new Transaction().add(new TransactionInstruction({programId:new PublicKey(cfg.saleProgramId),data:await dataNoArgs(name),keys:[{pubkey:wallet,isSigner:true,isWritable:false},{pubkey:new PublicKey(cfg.rlyaMint),isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:true}]})); await send(tx); await refresh();
}
$('#connectOwner').onclick=()=>connect().catch(e=>log(`ERROR: ${e.message}`));
$('#manualSale').onclick=()=>manualSale().catch(e=>log(`ERROR: ${e.message}`));
$('#pauseSale').onclick=()=>adminStateIx('pause').catch(e=>log(`ERROR: ${e.message}`));
$('#resumeSale').onclick=()=>adminStateIx('resume').catch(e=>log(`ERROR: ${e.message}`));
$('#closeSale').onclick=()=>{if(confirm('Close the RLYA presale? New purchases will stop.'))adminStateIx('close_sale').catch(e=>log(`ERROR: ${e.message}`));};
$('#withdrawUnsold').onclick=()=>{if(confirm('Move all remaining unsold public-sale RLYA to the published treasury?'))withdrawUnsold().catch(e=>log(`ERROR: ${e.message}`));};
$('#releaseFounder').onclick=()=>releaseFounder().catch(e=>log(`ERROR: ${e.message}`));
refresh().catch(e=>log(`ERROR: ${e.message}`));
