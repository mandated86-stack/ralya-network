import {
  Connection, PublicKey, Transaction, TransactionInstruction,
} from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';

const cfg=window.RALYA_CONFIG;
const enc=new TextEncoder();
const PROGRESS_KEY='RALYA_MAINNET_PUBLIC_PROGRESS_V1';
const connection=new Connection(cfg.rpcEndpoint,'confirmed');

function getProgress(){try{return JSON.parse(localStorage.getItem(PROGRESS_KEY)||'null')}catch{return null}}
function saveProgress(p){localStorage.setItem(PROGRESS_KEY,JSON.stringify(p));}
function providerForBrowser(){if(window.phantom?.solana?.isPhantom)return window.phantom.solana;if(window.solflare?.isSolflare)return window.solflare;if(window.solana?.connect)return window.solana;return null;}
function pk(v,label){try{return new PublicKey(v)}catch{throw new Error(`${label} is invalid`)}}
async function disc(name){const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`));return new Uint8Array(h).slice(0,8)}
function i64(data,o){return new DataView(data.buffer,data.byteOffset,data.byteLength).getBigInt64(o,true)}

function log(msg){const el=document.getElementById('log');if(!el)return;el.textContent+=`\n${new Date().toISOString()}  ${msg}`;el.scrollTop=el.scrollHeight;}
function setState(name,text,cls=''){const el=document.querySelector(`[data-state="${name}"]`);if(!el)return;el.textContent=text;el.className=`state ${cls}`.trim();}
function download(name,obj){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

async function waitSig(sig,label){
  for(let i=0;i<90;i++){
    const s=(await connection.getSignatureStatuses([sig],{searchTransactionHistory:true})).value[0];
    if(s?.err)throw new Error(`${label} failed: ${JSON.stringify(s.err)}`);
    if(s&&(s.confirmationStatus==='confirmed'||s.confirmationStatus==='finalized'))return;
    await new Promise(r=>setTimeout(r,1500));
  }
  throw new Error(`${label} was broadcast but confirmation timed out. Do not retry until the sale state is checked. Signature: ${sig}`);
}
async function send(provider,wallet,tx,label){
  const latest=await connection.getLatestBlockhash('confirmed');
  tx.feePayer=wallet;tx.recentBlockhash=latest.blockhash;
  let sig;
  if(provider.signTransaction){const signed=await provider.signTransaction(tx);sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4});}
  else if(provider.signAndSendTransaction){const r=await provider.signAndSendTransaction(tx);sig=r.signature||r;}
  else throw new Error('Connected wallet cannot sign Solana transactions.');
  if(!sig)throw new Error(`${label} returned no signature`);
  log(`${label} broadcast: ${sig}`);await waitSig(sig,label);log(`${label} confirmed: ${sig}`);return sig;
}

async function verifyPausedPrelaunchState(p){
  const sale=pk(p.salePda,'Sale PDA');
  const founderLock=pk(p.founderLock,'Founder lock');
  const saleInfo=await connection.getAccountInfo(sale,'confirmed');
  const lockInfo=await connection.getAccountInfo(founderLock,'confirmed');
  if(!saleInfo||saleInfo.data.length<258)throw new Error('Sale state is unavailable after atomic activation.');
  if(!lockInfo||lockInfo.data.length<90)throw new Error('Founder lock state is unavailable after atomic activation.');
  const saleBytes=new Uint8Array(saleInfo.data),lockBytes=new Uint8Array(lockInfo.data);
  const status=saleBytes[256];
  const startedAt=i64(saleBytes,240);
  const publicLaunchAt=i64(saleBytes,248);
  const founderUnlockAt=i64(lockBytes,80);
  const released=Boolean(lockBytes[88]);
  if(status!==2)throw new Error(`Atomic activation did not finish PAUSED; on-chain status=${status}`);
  if(startedAt<=0n)throw new Error('Production sale activation timestamp was not set.');
  if(publicLaunchAt!==0n)throw new Error('Public launch clock was unexpectedly started during activation. STOP.');
  if(founderUnlockAt!==0n)throw new Error('Founder 365-day clock was unexpectedly started before public launch. STOP.');
  if(released)throw new Error('Founder lock unexpectedly reports released=true.');
  return {startedAt:startedAt.toString(),publicLaunchAt:'0',founderUnlockAt:'0'};
}

async function atomicActivateAndPause(){
  const p=getProgress();
  if(!p||p.phase!=='prepared-not-active')throw new Error('Prepare and verify RLYA Mainnet first.');
  if(cfg.presaleEnabled)throw new Error('Post-launch atomic sale master switch must remain OFF during activation.');
  const provider=providerForBrowser();if(!provider)throw new Error('Install/open Phantom or Solflare.');
  const res=await provider.connect();const wallet=new PublicKey(res?.publicKey||provider.publicKey);
  if(wallet.toBase58()!==p.adminWallet)throw new Error(`Connect the launch admin wallet ${p.adminWallet}.`);

  const programId=pk(p.saleProgramId,'Program ID');
  const mint=pk(p.rlyaMint,'RLYA mint');
  const sale=pk(p.salePda,'Sale PDA');
  const saleVault=pk(p.saleVault,'Sale vault');
  const stakingBonusVault=pk(p.stakingBonusVault,'Staking bonus vault');
  const founderLock=pk(p.founderLock,'Founder lock');
  const founderVault=pk(p.founderVault,'Founder vault');

  const activateIx=new TransactionInstruction({programId,keys:[
    {pubkey:wallet,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true},
    {pubkey:saleVault,isSigner:false,isWritable:false},{pubkey:stakingBonusVault,isSigner:false,isWritable:false},{pubkey:founderLock,isSigner:false,isWritable:true},{pubkey:founderVault,isSigner:false,isWritable:false},
  ],data:await disc('activate')});
  const pauseIx=new TransactionInstruction({programId,keys:[
    {pubkey:wallet,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:sale,isSigner:false,isWritable:true},
  ],data:await disc('pause')});

  setState('activate','RUN','run');
  const sig=await send(provider,wallet,new Transaction().add(activateIx,pauseIx),'Atomic activate + pause');
  const verified=await verifyPausedPrelaunchState(p);
  p.transactions=p.transactions||{};
  p.transactions.activateAndPauseAtomic=sig;
  p.transactions.activate=sig;
  p.transactions.pauseAfterActivation=sig;
  p.phase='activated-paused';p.activatedAt=new Date().toISOString();p.pausedAfterActivation=true;
  p.productionActivatedAt=verified.startedAt;
  p.publicLaunchAt=null;
  p.founderLockStartedAt=null;
  p.founderUnlockAt=null;
  saveProgress(p);
  setState('activate','PAUSED','ok');setState('record','DONE','ok');
  const summary=document.getElementById('recordSummary');if(summary)summary.textContent=`Mint ${p.rlyaMint} | Program ${p.saleProgramId} | Sale ${p.salePda}`;
  log('ATOMIC ACTIVATION PASS. Production sale state finished PAUSED in the same transaction. Public launch DAY 0 is still unset, so the 21-day/36-day buyer release clocks and founder 365-day lock have NOT started.');
  download('RALYA_MAINNET_LAUNCH_RECORD.json',p);
}

// Capture the activation click before the older bubble handler in launch.js.
document.addEventListener('click',(event)=>{
  const target=event.target;
  if(!(target instanceof Element)||!target.closest('#activate'))return;
  const p=getProgress();
  if(!p||p.phase!=='prepared-not-active')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!confirm('Prepare the production sale state and finish PAUSED atomically? This does NOT mark public launch or start buyer/founder clocks.'))return;
  const button=document.getElementById('activate');if(button)button.disabled=true;
  atomicActivateAndPause().catch(err=>{log(`ATOMIC ACTIVATION ERROR: ${err.message}`);alert(err.message);if(button)button.disabled=false;});
},true);

// After atomic activation, export the local public truth rather than the stale
// in-memory pre-activation object held by the preparation module.
document.addEventListener('click',(event)=>{
  const target=event.target;if(!(target instanceof Element))return;
  if(target.closest('#downloadRecord')){
    const p=getProgress();if(!p||p.phase!=='activated-paused')return;
    event.preventDefault();event.stopImmediatePropagation();download('RALYA_MAINNET_LAUNCH_RECORD.json',p);
  }
  if(target.closest('#downloadConfig')){
    const p=getProgress();if(!p||p.phase!=='activated-paused')return;
    event.preventDefault();event.stopImmediatePropagation();
    download('RALYA_MAINNET_SITE_VALUES.json',{project:'RALYA',network:'mainnet-beta',launchPhase:p.phase,presaleEnabled:false,rlyaMint:p.rlyaMint,saleProgramId:p.saleProgramId,salePda:p.salePda,treasuryWallet:p.treasuryWallet,usdcMint:p.usdcMint,publicPresaleBase:288000000,stakingBonusReserve:14400000,stakingBonusBps:500,standardReleaseDays:21,stakedReleaseDays:36});
  }
},true);
