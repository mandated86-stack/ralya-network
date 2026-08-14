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
const USDC_MINT=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_UNIT=1_000_000n;
const RLYA_UNIT=1_000_000_000n;

function log(msg){const el=$('#smokeStatus');if(el)el.textContent=`${new Date().toISOString()}  ${msg}\n${el.textContent}`.slice(0,8000);}
function providerForBrowser(){return window.phantom?.solana?.isPhantom?window.phantom.solana:window.solflare?.isSolflare?window.solflare:window.solana?.connect?window.solana:null;}
function progress(){try{return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null')}catch{return null}}
function save(p){localStorage.setItem(PROGRESS_KEY,JSON.stringify(p));}
function pk(v,label){try{return new PublicKey(v)}catch{throw new Error(`${label} is invalid`)}}
function u64(bytes,o){return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getBigUint64(o,true)}
function min(a,b){return a<b?a:b}
function ceilDiv(n,d){return (n+d-1n)/d}
async function disc(name){const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`));return new Uint8Array(h).slice(0,8)}
async function dataU64s(name,...values){const d=await disc(name);const out=new Uint8Array(8+8*values.length);out.set(d);const v=new DataView(out.buffer);values.forEach((n,i)=>v.setBigUint64(8+i*8,BigInt(n),true));return out;}

function decodeSale(data){
  const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
  if(bytes.length<250)throw new Error('Sale account is incomplete');
  return {presaleCap:u64(bytes,168),base:u64(bytes,176),step:u64(bytes,184),inc:u64(bytes,192),referralBps:u64(bytes,200),sold:u64(bytes,208),manual:u64(bytes,216),raised:u64(bytes,224),refPaid:u64(bytes,232),status:bytes[248]};
}
function quote(usdc,state){
  let rem=usdc,progress=state.sold,out=0n,loops=0;
  while(rem>0n){
    if(progress>=state.presaleCap)throw new Error('Presale is sold out');
    if(++loops>256)throw new Error('Quote crossed too many steps');
    const idx=progress/state.step;
    const price=state.base+idx*state.inc;
    const boundary=min((idx+1n)*state.step,state.presaleCap);
    const available=boundary-progress;
    const cost=ceilDiv(available*price,RLYA_UNIT);
    if(rem>=cost){out+=available;progress+=available;rem-=cost;}
    else{const part=rem*RLYA_UNIT/price;if(part<=0n||part>available)throw new Error('Smoke purchase too small');out+=part;progress+=part;rem=0n;}
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
  throw new Error(`${label} confirmation timed out. STOP and verify ${sig} before retrying.`);
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
  return {ata,ix:info?null:createAssociatedTokenAccountInstruction(payer,ata,owner,mint)};
}

async function runSmoke(){
  const p=progress();
  if(!p||p.phase!=='activated-paused'||!p.pausedAfterActivation)throw new Error('Complete Mainnet preparation and Activate + immediately pause first.');
  if(p.smoke?.completed)throw new Error('Mainnet smoke test is already recorded as complete. Do not run it twice.');
  if(cfg.presaleEnabled)throw new Error('Public presale master switch must remain OFF during smoke verification.');

  const provider=providerForBrowser();if(!provider)throw new Error('Install/open Phantom or Solflare.');
  const res=await provider.connect();const admin=new PublicKey(res?.publicKey||provider.publicKey);
  if(admin.toBase58()!==p.adminWallet)throw new Error(`Connect the launch admin wallet ${p.adminWallet}.`);

  const programId=pk(p.saleProgramId,'Program ID');
  const mint=pk(p.rlyaMint,'RLYA mint');
  const sale=pk(p.salePda,'Sale PDA');
  const saleVault=pk(p.saleVault,'Sale vault');
  const treasury=pk(p.treasuryWallet,'Treasury');
  const before=await saleState(sale);
  if(before.status!==2)throw new Error(`Smoke requires PAUSED sale state (2), found ${before.status}.`);
  if(before.sold!==0n||before.raised!==0n||before.refPaid!==0n||before.manual!==0n)throw new Error('Smoke requires a clean zero-sale Mainnet state. Stop and investigate before continuing.');
  if(before.referralBps!==100n)throw new Error('On-chain referral rate is not 1%.');

  const adminUsdc=await getAssociatedTokenAddress(USDC_MINT,admin);
  const adminUsdcInfo=await connection.getAccountInfo(adminUsdc,'confirmed');
  if(!adminUsdcInfo)throw new Error('Admin wallet needs a Mainnet USDC token account containing at least 1 USDC for the smoke test.');
  const adminUsdcBalance=BigInt((await connection.getTokenAccountBalance(adminUsdc,'confirmed')).value.amount);
  if(adminUsdcBalance<USDC_UNIT)throw new Error('Admin wallet needs at least 1 USDC for the owner-funded Mainnet smoke test.');

  const buyer=Keypair.generate();
  const referrer=Keypair.generate();
  const buyerUsdc=await ensureAtaIx(admin,USDC_MINT,buyer.publicKey);
  const buyerRlya=await ensureAtaIx(admin,mint,buyer.publicKey);
  const referrerUsdc=await ensureAtaIx(admin,USDC_MINT,referrer.publicKey);
  const treasuryUsdc=await ensureAtaIx(admin,USDC_MINT,treasury,true);
  const treasuryRlya=await ensureAtaIx(admin,mint,treasury,true);

  const setup=new Transaction();
  for(const row of [buyerUsdc,buyerRlya,referrerUsdc,treasuryUsdc,treasuryRlya])if(row.ix)setup.add(row.ix);
  setup.add(SystemProgram.transfer({fromPubkey:admin,toPubkey:buyer.publicKey,lamports:5_000_000}));
  setup.add(createTransferCheckedInstruction(adminUsdc,USDC_MINT,buyerUsdc.ata,admin,USDC_UNIT,6));
  p.smoke={completed:false,ownerFunded:true,grossUsdcBaseUnits:'1000000',expectedReferralUsdcBaseUnits:'10000',buyer:buyer.publicKey.toBase58(),referrer:referrer.publicKey.toBase58(),transactions:{}};
  p.smoke.transactions.setup=await sendWithWallet(provider,admin,setup,[],'Prepare disposable smoke wallets');save(p);

  const resumeIx=new TransactionInstruction({programId,keys:[{pubkey:admin,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true}],data:await disc('resume')});
  let resumed=false;
  try{
    p.smoke.transactions.resume=await sendWithWallet(provider,admin,new Transaction().add(resumeIx),[],'Temporarily resume RLYA sale for smoke test');save(p);resumed=true;

    const buyerReferral=PublicKey.findProgramAddressSync([enc.encode('referral'),buyer.publicKey.toBytes()],programId)[0];
    const referrerReferral=PublicKey.findProgramAddressSync([enc.encode('referral'),referrer.publicKey.toBytes()],programId)[0];
    const minimumOut=quote(USDC_UNIT,before);
    const smokeTx=new Transaction();
    smokeTx.add(new TransactionInstruction({programId,data:await disc('register_referral'),keys:[
      {pubkey:buyer.publicKey,isSigner:true,isWritable:true},{pubkey:referrer.publicKey,isSigner:false,isWritable:false},{pubkey:buyerReferral,isSigner:false,isWritable:true},{pubkey:referrerReferral,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
    ]}));
    smokeTx.add(new TransactionInstruction({programId,data:await dataU64s('buy_with_referral',USDC_UNIT,minimumOut),keys:[
      {pubkey:buyer.publicKey,isSigner:true,isWritable:true},{pubkey:referrer.publicKey,isSigner:false,isWritable:false},{pubkey:buyerReferral,isSigner:false,isWritable:false},
      {pubkey:mint,isSigner:false,isWritable:false},{pubkey:USDC_MINT,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true},{pubkey:treasury,isSigner:false,isWritable:false},
      {pubkey:buyerUsdc.ata,isSigner:false,isWritable:true},{pubkey:treasuryUsdc.ata,isSigner:false,isWritable:true},{pubkey:referrerUsdc.ata,isSigner:false,isWritable:true},{pubkey:buyerRlya.ata,isSigner:false,isWritable:true},{pubkey:saleVault,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},
    ]}));
    p.smoke.transactions.referredPurchase=await sendWithWallet(provider,admin,smokeTx,[buyer],'1 USDC referred RLYA smoke purchase');save(p);
  } finally {
    if(resumed){
      try{
        const pauseIx=new TransactionInstruction({programId,keys:[{pubkey:admin,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true}],data:await disc('pause')});
        p.smoke.transactions.pause=await sendWithWallet(provider,admin,new Transaction().add(pauseIx),[],'Pause RLYA sale after smoke test');save(p);
      }catch(e){log(`CRITICAL: automatic pause failed: ${e.message}`);alert('CRITICAL: the smoke test could not automatically pause the sale. Open the owner admin panel and PAUSE it immediately.');throw e;}
    }
  }

  const after=await saleState(sale);
  const expectedOut=quote(USDC_UNIT,before);
  if(after.status!==2)throw new Error('Sale is not PAUSED after smoke test.');
  if(after.raised!==USDC_UNIT)throw new Error(`Smoke gross USDC mismatch: ${after.raised}`);
  if(after.refPaid!==10_000n)throw new Error(`Smoke referral USDC mismatch: ${after.refPaid}`);
  if(after.manual!==0n)throw new Error('Smoke unexpectedly changed manual distribution.');
  if(after.sold!==expectedOut)throw new Error(`Smoke RLYA sold mismatch: ${after.sold} != ${expectedOut}`);
  const buyerRlyaAmount=BigInt((await connection.getTokenAccountBalance(buyerRlya.ata,'confirmed')).value.amount);
  const referrerUsdcAmount=BigInt((await connection.getTokenAccountBalance(referrerUsdc.ata,'confirmed')).value.amount);
  if(buyerRlyaAmount!==expectedOut)throw new Error('Disposable buyer did not receive the exact quoted RLYA.');
  if(referrerUsdcAmount!==10_000n)throw new Error('Disposable referrer did not receive exactly 0.01 USDC.');
  log(`ON-CHAIN SMOKE VERIFIED: 1 USDC gross -> 0.01 USDC referrer + 0.99 USDC treasury; ${expectedOut} RLYA base units delivered.`);

  const sweep=new Transaction();
  sweep.add(createTransferCheckedInstruction(referrerUsdc.ata,USDC_MINT,treasuryUsdc.ata,referrer.publicKey,10_000n,6));
  sweep.add(createTransferCheckedInstruction(buyerRlya.ata,mint,treasuryRlya.ata,buyer.publicKey,buyerRlyaAmount,9));
  const buyerSol=await connection.getBalance(buyer.publicKey,'confirmed');
  if(buyerSol>0)sweep.add(SystemProgram.transfer({fromPubkey:buyer.publicKey,toPubkey:admin,lamports:buyerSol}));
  p.smoke.transactions.sweep=await sendWithWallet(provider,admin,sweep,[buyer,referrer],'Sweep disposable smoke assets to treasury');
  p.smoke.completed=true;p.smoke.completedAt=new Date().toISOString();p.smoke.rlyaDeliveredBaseUnits=expectedOut.toString();p.smoke.finalSaleStatus='PAUSED';save(p);

  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}));a.download='RALYA_MAINNET_LAUNCH_RECORD_AFTER_SMOKE.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  log('RALYA_MAINNET_SMOKE=PASS. Updated public launch record downloaded. Public presale master switch remains OFF.');
  $('#runSmoke').disabled=true;
}

function updateButton(){const p=progress();const b=$('#runSmoke');if(!b)return;b.disabled=!(p?.phase==='activated-paused'&&p?.pausedAfterActivation&&!p?.smoke?.completed);if(p?.smoke?.completed)log('Existing local record says Mainnet smoke already completed.');}
$('#runSmoke')?.addEventListener('click',()=>{if(!confirm('Run the owner-funded 1 USDC Mainnet referred-purchase smoke test? The sale will be resumed only for the test and paused again automatically.'))return;$('#runSmoke').disabled=true;runSmoke().catch(e=>{log(`ERROR: ${e.message}`);alert(e.message);updateButton();});});
updateButton();setInterval(updateButton,1500);
