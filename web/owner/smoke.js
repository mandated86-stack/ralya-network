import {
  Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction,
} from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg=window.RALYA_CONFIG;
const $=q=>document.querySelector(q);
const enc=new TextEncoder();
const connection=new Connection(cfg.rpcEndpoint,'confirmed');
const PROGRESS_KEY='RALYA_MAINNET_PUBLIC_PROGRESS_V1';
const RECOVERY_KEY='RALYA_MAINNET_SMOKE_DISPOSABLE_RECOVERY_V1';
const USDC_MINT=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_UNIT=1_000_000n;
const RLYA_UNIT=1_000_000_000n;
const REFERRAL_ACCOUNT_SPACE=89;

function log(msg){const el=$('#smokeStatus');if(el)el.textContent=`${new Date().toISOString()}  ${msg}\n${el.textContent}`.slice(0,10000);}
function providerForBrowser(){return window.phantom?.solana?.isPhantom?window.phantom.solana:window.solflare?.isSolflare?window.solflare:window.solana?.connect?window.solana:null;}
function progress(){try{return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null')}catch{return null}}
function save(p){localStorage.setItem(PROGRESS_KEY,JSON.stringify(p));}
function pk(v,label){try{return new PublicKey(v)}catch{throw new Error(`${label} is invalid`)}}
function u64(bytes,o){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getBigUint64(o,true)}
function min(a,b){return a<b?a:b}
function ceilDiv(n,d){return (n+d-1n)/d}
async function disc(name){const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`));return new Uint8Array(h).slice(0,8)}
async function dataU64s(name,...values){const d=await disc(name);const out=new Uint8Array(8+8*values.length);out.set(d);const v=new DataView(out.buffer);values.forEach((n,i)=>v.setBigUint64(8+i*8,BigInt(n),true));return out;}
function downloadRecord(p){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));a.download='RALYA_MAINNET_LAUNCH_RECORD_AFTER_SMOKE.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

function decodeSale(data){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  if(bytes.length<274)throw new Error('Sale account is incomplete');
  return {presaleCap:u64(bytes,168),base:u64(bytes,176),step:u64(bytes,184),inc:u64(bytes,192),referralBps:u64(bytes,200),sold:u64(bytes,208),manual:u64(bytes,216),raised:u64(bytes,224),refPaid:u64(bytes,232),status:bytes[248]};
}
function quote(usdc,state){
  let rem=usdc,curveProgress=state.sold,out=0n,loops=0;
  while(rem>0n){
    if(curveProgress>=state.presaleCap)throw new Error('Presale is sold out');
    if(++loops>256)throw new Error('Quote crossed too many price steps');
    const idx=curveProgress/state.step;
    const price=state.base+idx*state.inc;
    const boundary=min((idx+1n)*state.step,state.presaleCap);
    const available=boundary-curveProgress;
    const cost=ceilDiv(available*price,RLYA_UNIT);
    if(rem>=cost){out+=available;curveProgress+=available;rem-=cost;}
    else{const part=rem*RLYA_UNIT/price;if(part<=0n||part>available)throw new Error('Smoke purchase too small');out+=part;curveProgress+=part;rem=0n;}
  }
  return out;
}
async function saleState(sale){const a=await connection.getAccountInfo(sale,'confirmed');if(!a)throw new Error('Sale account not found');return decodeSale(a.data)}

async function waitSig(sig,label){
  for(let i=0;i<90;i++){
    try{
      const s=(await connection.getSignatureStatuses([sig],{searchTransactionHistory:true})).value[0];
      if(s?.err)throw new Error(`${label} failed: ${JSON.stringify(s.err)}`);
      if(s&&(s.confirmationStatus==='confirmed'||s.confirmationStatus==='finalized'))return;
    }catch(e){if(String(e?.message||e).includes(`${label} failed:`))throw e;}
    await new Promise(r=>setTimeout(r,1500));
  }
  throw new Error(`${label} was broadcast but confirmation timed out. The console will inspect the atomic on-chain result before doing anything else. Signature: ${sig}`);
}
async function sendWithWallet(provider,wallet,tx,extra=[],label='transaction'){
  const latest=await connection.getLatestBlockhash('confirmed');tx.feePayer=wallet;tx.recentBlockhash=latest.blockhash;if(extra.length)tx.partialSign(...extra);
  let sig;
  if(provider.signTransaction){const signed=await provider.signTransaction(tx);sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4});}
  else if(provider.signAndSendTransaction){const r=await provider.signAndSendTransaction(tx);sig=r.signature||r;}
  else throw new Error('Wallet cannot sign transactions');
  if(!sig)throw new Error(`${label} returned no signature`);log(`${label} broadcast: ${sig}`);await waitSig(sig,label);log(`${label} confirmed: ${sig}`);return sig;
}

async function ensureAtaIx(payer,mint,owner,allowOffCurve=false){
  const ata=await getAssociatedTokenAddress(mint,owner,allowOffCurve);
  const info=await connection.getAccountInfo(ata,'confirmed');
  return {ata,ix:info?null:createAssociatedTokenAccountInstruction(payer,ata,owner,mint),exists:Boolean(info)};
}
async function tokenAmount(ata){const info=await connection.getAccountInfo(ata,'confirmed');if(!info)return 0n;return BigInt((await connection.getTokenAccountBalance(ata,'confirmed')).value.amount);}
function storeRecovery(buyer,referrer){localStorage.setItem(RECOVERY_KEY,JSON.stringify({buyer:Array.from(buyer.secretKey),referrer:Array.from(referrer.secretKey)}));}
function loadRecovery(){try{const raw=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');if(!raw?.buyer||!raw?.referrer)return null;return{buyer:Keypair.fromSecretKey(Uint8Array.from(raw.buyer)),referrer:Keypair.fromSecretKey(Uint8Array.from(raw.referrer))};}catch{return null}}
function clearRecovery(){localStorage.removeItem(RECOVERY_KEY);}

async function sweepDisposable(provider,admin,p,buyer,referrer,{successful}){
  const mint=pk(p.rlyaMint,'RLYA mint');
  const treasury=pk(p.treasuryWallet,'Treasury');
  const adminUsdc=await getAssociatedTokenAddress(USDC_MINT,admin);
  const buyerUsdc=await getAssociatedTokenAddress(USDC_MINT,buyer.publicKey);
  const buyerRlya=await getAssociatedTokenAddress(mint,buyer.publicKey);
  const referrerUsdc=await getAssociatedTokenAddress(USDC_MINT,referrer.publicKey);
  const treasuryUsdc=await getAssociatedTokenAddress(USDC_MINT,treasury,true);
  const treasuryRlya=await getAssociatedTokenAddress(mint,treasury,true);
  const buyerUsdcAmount=await tokenAmount(buyerUsdc);
  const buyerRlyaAmount=await tokenAmount(buyerRlya);
  const referrerUsdcAmount=await tokenAmount(referrerUsdc);
  const buyerSol=await connection.getBalance(buyer.publicKey,'confirmed');
  const tx=new Transaction();
  if(buyerUsdcAmount>0n)tx.add(createTransferCheckedInstruction(buyerUsdc,USDC_MINT,successful?treasuryUsdc:adminUsdc,buyer.publicKey,buyerUsdcAmount,6));
  if(referrerUsdcAmount>0n)tx.add(createTransferCheckedInstruction(referrerUsdc,USDC_MINT,treasuryUsdc,referrer.publicKey,referrerUsdcAmount,6));
  if(buyerRlyaAmount>0n)tx.add(createTransferCheckedInstruction(buyerRlya,mint,treasuryRlya,buyer.publicKey,buyerRlyaAmount,9));
  if(buyerSol>0)tx.add(SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:admin,lamports:buyerSol}));
  if(tx.instructions.length){p.smoke.transactions.sweep=await sendWithWallet(provider,admin,tx,[buyer,referrer],successful?'Sweep successful smoke assets to treasury':'Recover unused smoke funding');save(p);}
  return{buyerUsdcAmount,buyerRlyaAmount,referrerUsdcAmount,treasuryUsdc:treasuryUsdc.toBase58(),treasuryRlya:treasuryRlya.toBase58()};
}

async function finishSuccessfulSmoke(provider,admin,p,buyer,referrer,state){
  const expectedOut=BigInt(p.smoke.expectedRlyaBaseUnits);
  if(state.status!==2)throw new Error(`Atomic smoke did not finish PAUSED; status=${state.status}`);
  if(state.raised!==USDC_UNIT||state.refPaid!==10_000n||state.manual!==0n||state.sold!==expectedOut)throw new Error('On-chain state does not match the single expected owner-funded 1 USDC smoke purchase.');
  const mint=pk(p.rlyaMint,'RLYA mint');
  const buyerRlya=await getAssociatedTokenAddress(mint,buyer.publicKey);
  const referrerUsdc=await getAssociatedTokenAddress(USDC_MINT,referrer.publicKey);
  const buyerRlyaAmount=await tokenAmount(buyerRlya),referrerUsdcAmount=await tokenAmount(referrerUsdc);
  if(buyerRlyaAmount!==expectedOut)throw new Error(`Disposable buyer RLYA mismatch: ${buyerRlyaAmount} != ${expectedOut}`);
  if(referrerUsdcAmount!==10_000n)throw new Error(`Disposable referrer USDC mismatch: ${referrerUsdcAmount} != 10000`);
  log(`ATOMIC ON-CHAIN SMOKE VERIFIED: 1 USDC gross -> 0.01 USDC referrer + 0.99 USDC treasury; ${expectedOut} RLYA base units delivered; final sale state PAUSED.`);
  const swept=await sweepDisposable(provider,admin,p,buyer,referrer,{successful:true});
  p.smoke.completed=true;p.smoke.completedAt=new Date().toISOString();p.smoke.rlyaDeliveredBaseUnits=expectedOut.toString();p.smoke.finalSaleStatus='PAUSED';p.smoke.treasuryUsdcAta=swept.treasuryUsdc;p.smoke.treasuryRlyaAta=swept.treasuryRlya;save(p);clearRecovery();downloadRecord(p);
  log('RALYA_MAINNET_SMOKE=PASS. Public presale master switch remains OFF.');
  $('#runSmoke').disabled=true;
}

async function inspectAndRecover(provider,admin,p,buyer,referrer){
  const sale=pk(p.salePda,'Sale PDA');
  const observed=await saleState(sale);
  const expectedOut=BigInt(p.smoke.expectedRlyaBaseUnits);
  if(observed.status!==2)throw new Error(`Unexpected post-smoke sale status ${observed.status}. Atomic smoke is designed to commit only PAUSED; stop and investigate.`);
  if(observed.raised===USDC_UNIT&&observed.refPaid===10_000n&&observed.sold===expectedOut&&observed.manual===0n){await finishSuccessfulSmoke(provider,admin,p,buyer,referrer,observed);return;}
  if(observed.raised===0n&&observed.refPaid===0n&&observed.sold===0n&&observed.manual===0n){
    await sweepDisposable(provider,admin,p,buyer,referrer,{successful:false});
    const attempt={...p.smoke,recoveredAt:new Date().toISOString(),result:'ATOMIC_PURCHASE_NOT_COMMITTED'};p.smokeAttempts=[...(p.smokeAttempts||[]),attempt];delete p.smoke;save(p);clearRecovery();
    log('Atomic smoke did not commit, so Solana rolled back resume/referral/buy/pause together. Setup funding was recovered; one clean retry is allowed.');updateButton();return;
  }
  throw new Error(`Unexpected smoke accounting: raised=${observed.raised}, sold=${observed.sold}, referral=${observed.refPaid}, manual=${observed.manual}. Do not retry.`);
}

async function recoverInterrupted(provider,admin,p){
  const recovery=loadRecovery();
  if(!recovery)throw new Error('An incomplete smoke record exists but its disposable local recovery keys are unavailable. Do NOT rerun; inspect the public sale state first.');
  if(recovery.buyer.publicKey.toBase58()!==p.smoke.buyer||recovery.referrer.publicKey.toBase58()!==p.smoke.referrer)throw new Error('Disposable smoke recovery keys do not match the public record.');
  log('Recovering interrupted atomic smoke by inspecting on-chain state first. No second purchase will be created.');
  await inspectAndRecover(provider,admin,p,recovery.buyer,recovery.referrer);
}

async function runSmoke(){
  const p=progress();
  if(!p||p.phase!=='activated-paused'||!p.pausedAfterActivation)throw new Error('Complete Mainnet preparation and atomic activate + pause first.');
  if(p.smoke?.completed)throw new Error('Mainnet smoke test is already recorded as complete. Do not run it twice.');
  if(cfg.presaleEnabled)throw new Error('Public presale master switch must remain OFF during smoke verification.');
  const provider=providerForBrowser();if(!provider)throw new Error('Install/open Phantom or Solflare.');
  const res=await provider.connect();const admin=new PublicKey(res?.publicKey||provider.publicKey);
  if(admin.toBase58()!==p.adminWallet)throw new Error(`Connect the launch admin wallet ${p.adminWallet}.`);
  if(p.smoke&&!p.smoke.completed){await recoverInterrupted(provider,admin,p);return;}

  const programId=pk(p.saleProgramId,'Program ID'),mint=pk(p.rlyaMint,'RLYA mint'),sale=pk(p.salePda,'Sale PDA'),saleVault=pk(p.saleVault,'Sale vault'),treasury=pk(p.treasuryWallet,'Treasury');
  const before=await saleState(sale);
  if(before.status!==2)throw new Error(`Smoke requires PAUSED sale state (2), found ${before.status}.`);
  if(before.sold!==0n||before.raised!==0n||before.refPaid!==0n||before.manual!==0n)throw new Error('Smoke requires a clean zero-sale Mainnet state. Stop and investigate before continuing.');
  if(before.referralBps!==100n)throw new Error('On-chain referral rate is not 1%.');
  const expectedOut=quote(USDC_UNIT,before);

  const adminUsdc=await getAssociatedTokenAddress(USDC_MINT,admin);
  if(!await connection.getAccountInfo(adminUsdc,'confirmed'))throw new Error('Admin wallet needs a Mainnet USDC token account containing at least 1 USDC for the smoke test.');
  if(BigInt((await connection.getTokenAccountBalance(adminUsdc,'confirmed')).value.amount)<USDC_UNIT)throw new Error('Admin wallet needs at least 1 USDC for the owner-funded Mainnet smoke test.');

  const buyer=Keypair.generate(),referrer=Keypair.generate();storeRecovery(buyer,referrer);
  const buyerUsdc=await ensureAtaIx(admin,USDC_MINT,buyer.publicKey),buyerRlya=await ensureAtaIx(admin,mint,buyer.publicKey),referrerUsdc=await ensureAtaIx(admin,USDC_MINT,referrer.publicKey),treasuryUsdc=await ensureAtaIx(admin,USDC_MINT,treasury,true),treasuryRlya=await ensureAtaIx(admin,mint,treasury,true);
  if(treasuryRlya.exists&&await tokenAmount(treasuryRlya.ata)!==0n){clearRecovery();throw new Error('Treasury RLYA ATA already contains tokens. Stop so owner-funded smoke reconciliation can remain exact.');}
  const referralRent=await connection.getMinimumBalanceForRentExemption(REFERRAL_ACCOUNT_SPACE);

  p.smoke={completed:false,ownerFunded:true,atomic:true,grossUsdcBaseUnits:'1000000',expectedReferralUsdcBaseUnits:'10000',expectedRlyaBaseUnits:expectedOut.toString(),buyer:buyer.publicKey.toBase58(),referrer:referrer.publicKey.toBase58(),treasuryUsdcAta:treasuryUsdc.ata.toBase58(),treasuryRlyaAta:treasuryRlya.ata.toBase58(),transactions:{}};save(p);

  const setup=new Transaction();
  for(const row of [buyerUsdc,buyerRlya,referrerUsdc,treasuryUsdc,treasuryRlya])if(row.ix)setup.add(row.ix);
  setup.add(SystemProgram.transfer({fromPubkey:admin,toPubkey:buyer.publicKey,lamports:referralRent+20_000}));
  setup.add(createTransferCheckedInstruction(adminUsdc,USDC_MINT,buyerUsdc.ata,admin,USDC_UNIT,6));
  try{p.smoke.transactions.setup=await sendWithWallet(provider,admin,setup,[],'Prepare disposable smoke wallets');save(p);}catch(e){log(`Smoke setup interrupted: ${e.message}`);await recoverInterrupted(provider,admin,p);return;}

  const buyerReferral=PublicKey.findProgramAddressSync([enc.encode('referral'),buyer.publicKey.toBytes()],programId)[0];
  const referrerReferral=PublicKey.findProgramAddressSync([enc.encode('referral'),referrer.publicKey.toBytes()],programId)[0];
  const resumeIx=new TransactionInstruction({programId,keys:[{pubkey:admin,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true}],data:await disc('resume')});
  const registerIx=new TransactionInstruction({programId,data:await disc('register_referral'),keys:[{pubkey:buyer.publicKey,isSigner:true,isWritable:true},{pubkey:referrer.publicKey,isSigner:false,isWritable:false},{pubkey:buyerReferral,isSigner:false,isWritable:true},{pubkey:referrerReferral,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}]});
  const buyIx=new TransactionInstruction({programId,data:await dataU64s('buy_with_referral',USDC_UNIT,expectedOut),keys:[
    {pubkey:buyer.publicKey,isSigner:true,isWritable:true},{pubkey:referrer.publicKey,isSigner:false,isWritable:false},{pubkey:buyerReferral,isSigner:false,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:USDC_MINT,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true},{pubkey:treasury,isSigner:false,isWritable:false},{pubkey:buyerUsdc.ata,isSigner:false,isWritable:true},{pubkey:treasuryUsdc.ata,isSigner:false,isWritable:true},{pubkey:referrerUsdc.ata,isSigner:false,isWritable:true},{pubkey:buyerRlya.ata,isSigner:false,isWritable:true},{pubkey:saleVault,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
  ]});
  const pauseIx=new TransactionInstruction({programId,keys:[{pubkey:admin,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true}],data:await disc('pause')});
  const atomicTx=new Transaction().add(resumeIx,registerIx,buyIx,pauseIx);
  try{p.smoke.transactions.atomicResumeReferralBuyPause=await sendWithWallet(provider,admin,atomicTx,[buyer],'Atomic resume + referral + 1 USDC buy + pause');save(p);}catch(e){log(`Atomic smoke confirmation interrupted: ${e.message}`);}
  await inspectAndRecover(provider,admin,p,buyer,referrer);
}

function updateButton(){const p=progress(),b=$('#runSmoke');if(!b)return;if(p?.smoke?.completed){b.disabled=true;b.textContent='Mainnet smoke verified';return;}const eligible=p?.phase==='activated-paused'&&p?.pausedAfterActivation;b.disabled=!eligible;b.textContent=p?.smoke&&!p.smoke.completed?'Recover interrupted atomic smoke':'Run 1 USDC Mainnet smoke test';}
$('#runSmoke')?.addEventListener('click',()=>{const p=progress(),recovering=p?.smoke&&!p.smoke.completed;const text=recovering?'Recover the interrupted atomic Mainnet smoke attempt without creating a second purchase?':'Run the owner-funded 1 USDC atomic Mainnet referred-purchase smoke test? Resume, referral, purchase and pause will commit together or all roll back.';if(!confirm(text))return;$('#runSmoke').disabled=true;runSmoke().catch(e=>{log(`ERROR: ${e.message}`);alert(e.message);updateButton();});});
updateButton();setInterval(updateButton,1500);
