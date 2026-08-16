import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg = window.RALYA_CONFIG;
const enc = new TextEncoder();
const connection = new Connection(cfg.rpcEndpoint, 'confirmed');
const RLYA_UNIT = 1_000_000_000n;
const PRESALE_CAP = 288_000_000n * RLYA_UNIT;
const STAKING_BONUS_RESERVE = 14_400_000n * RLYA_UNIT;
const STANDARD_RELEASE_OFFSET_SECONDS = -24 * 60 * 60;
const STAKED_RELEASE_SECONDS = 21 * 24 * 60 * 60;
const BATCH_SIZE = 4;
let provider = null;
let owner = null;
let manifest = null;
let running = false;

const $ = id => document.getElementById(id);
const shorten = value => { const s = String(value || ''); return s.length > 16 ? `${s.slice(0,7)}…${s.slice(-6)}` : s; };
const fmtRlya = base => `${(Number(BigInt(base || 0)) / 1e9).toLocaleString(undefined,{maximumFractionDigits:4})} RLYA`;
const fmtUsdc = base => `${(Number(BigInt(base || 0)) / 1e6).toLocaleString(undefined,{maximumFractionDigits:2})} USDC`;
function log(message){ const el=$('preDeliveryLog'); if(el) el.textContent=`${new Date().toLocaleTimeString()}  ${message}\n${el.textContent}`.slice(0,18000); }
function providerForBrowser(){ return window.RALYA_WALLET_PROVIDER || window.phantom?.solana || window.solflare || window.trustwallet?.solana || window.solana || null; }
function stableStringify(value){ if(value===null||typeof value!=='object')return JSON.stringify(value); if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`; return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`; }
async function sha256Text(text){ const digest=await crypto.subtle.digest('SHA-256',enc.encode(text)); return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
async function discriminator(name){ const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`)); return new Uint8Array(h).slice(0,8); }
function u64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigUint64(0,BigInt(n),true); return b; }
function i64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigInt64(0,BigInt(n),true); return b; }
async function dataU64(name,n){ const d=new Uint8Array(16); d.set(await discriminator(name),0); d.set(u64le(n),8); return d; }
async function dataI64(name,n){ const d=new Uint8Array(16); d.set(await discriminator(name),0); d.set(i64le(n),8); return d; }
async function dataThreeU64Bool(name,a,b,c,flag){ const d=new Uint8Array(33); d.set(await discriminator(name),0); d.set(u64le(a),8); d.set(u64le(b),16); d.set(u64le(c),24); d[32]=flag?1:0; return d; }
function hex32(hex){ if(!/^[a-f0-9]{64}$/i.test(String(hex||'')))throw new Error('Manifest SHA-256 is invalid.'); const out=new Uint8Array(32); for(let i=0;i<32;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16); return out; }
async function dataInitMetrics(m){ const d=new Uint8Array(80); d.set(await discriminator('initialize_prelaunch_metrics'),0); d.set(hex32(m.sha256),8); d.set(u64le(m.totals.webRlyaBase),40); d.set(u64le(m.totals.manualRlyaBase),48); d.set(u64le(m.totals.stakingBonusRlyaBase),56); d.set(u64le(m.totals.grossUsdcBase),64); d.set(u64le(m.totals.referralUsdcBase),72); return d; }
async function dataNoArgs(name){ return await discriminator(name); }

function configured(){ return Boolean(cfg.saleProgramId && cfg.rlyaMint && cfg.salePda); }
function addresses(){
  if(!configured()) throw new Error('Production Program ID, RLYA mint and sale PDA are not configured yet. Distribution stays unavailable before Mainnet launch preparation.');
  const program=new PublicKey(cfg.saleProgramId), mint=new PublicKey(cfg.rlyaMint), sale=new PublicKey(cfg.salePda);
  const [expectedSale]=PublicKey.findProgramAddressSync([enc.encode('sale'),mint.toBytes()],program);
  if(!expectedSale.equals(sale)) throw new Error('Configured sale PDA does not match the production Program ID/RLYA mint.');
  const [saleVault]=PublicKey.findProgramAddressSync([enc.encode('sale_vault'),mint.toBytes()],program);
  const [stakingBonusVault]=PublicKey.findProgramAddressSync([enc.encode('staking_bonus_vault'),mint.toBytes()],program);
  const [metrics]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_metrics'),mint.toBytes()],program);
  const [founderLock]=PublicKey.findProgramAddressSync([enc.encode('founder_lock'),mint.toBytes()],program);
  return {program,mint,sale,saleVault,stakingBonusVault,metrics,founderLock};
}
function decodeSale(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data); const v=new DataView(b.buffer,b.byteOffset,b.byteLength); let o=8;
  const admin=new PublicKey(b.slice(o,o+32));o+=32; const treasury=new PublicKey(b.slice(o,o+32));o+=32; const founder=new PublicKey(b.slice(o,o+32));o+=32; const mint=new PublicKey(b.slice(o,o+32));o+=32; const usdc=new PublicKey(b.slice(o,o+32));o+=32;
  const presaleCap=v.getBigUint64(o,true);o+=8; const basePrice=v.getBigUint64(o,true);o+=8; const stepSize=v.getBigUint64(o,true);o+=8; const stepIncrement=v.getBigUint64(o,true);o+=8; const referralBps=v.getBigUint64(o,true);o+=8; const totalSold=v.getBigUint64(o,true);o+=8; const manualSold=v.getBigUint64(o,true);o+=8; const totalUsdc=v.getBigUint64(o,true);o+=8; const totalReferral=v.getBigUint64(o,true);o+=8; const startedAt=v.getBigInt64(o,true);o+=8; const publicLaunchAt=v.getBigInt64(o,true);o+=8; const status=v.getUint8(o);
  return {admin,treasury,founder,mint,usdc,presaleCap,basePrice,stepSize,stepIncrement,referralBps,totalSold,manualSold,totalUsdc,totalReferral,startedAt,publicLaunchAt,status};
}
function decodeMetrics(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data); if(b.length<161)throw new Error('Pre-launch metrics account is too small for the T-1/T+21 schema.');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength); let o=8;
  const mint=new PublicKey(b.slice(o,o+32));o+=32; const manifestHash=[...b.slice(o,o+32)].map(x=>x.toString(16).padStart(2,'0')).join('');o+=32;
  const expectedWeb=v.getBigUint64(o,true);o+=8; const expectedManual=v.getBigUint64(o,true);o+=8; const expectedBonus=v.getBigUint64(o,true);o+=8; const expectedGross=v.getBigUint64(o,true);o+=8; const expectedReferral=v.getBigUint64(o,true);o+=8; const scheduledPublicLaunchAt=v.getBigInt64(o,true);o+=8;
  const webDelivered=v.getBigUint64(o,true);o+=8; const manualDelivered=v.getBigUint64(o,true);o+=8; const bonusDelivered=v.getBigUint64(o,true);o+=8; const grossImported=v.getBigUint64(o,true);o+=8; const referralImported=v.getBigUint64(o,true);o+=8;
  return {mint,manifestHash,expectedWeb,expectedManual,expectedBonus,expectedGross,expectedReferral,scheduledPublicLaunchAt,webDelivered,manualDelivered,bonusDelivered,grossImported,referralImported};
}
function manifestExpectations(){
  if(!manifest)throw new Error('Load the final manifest first.');
  return {hash:String(manifest.sha256).toLowerCase(),web:BigInt(manifest.totals.webRlyaBase||0),manual:BigInt(manifest.totals.manualRlyaBase||0),bonus:BigInt(manifest.totals.stakingBonusRlyaBase||0),gross:BigInt(manifest.totals.grossUsdcBase||0),referral:BigInt(manifest.totals.referralUsdcBase||0)};
}
function verifyMetricsCommitment(metrics,a){
  const e=manifestExpectations();
  if(!metrics||!metrics.mint.equals(a.mint)||metrics.manifestHash!==e.hash||metrics.expectedWeb!==e.web||metrics.expectedManual!==e.manual||metrics.expectedBonus!==e.bonus||metrics.expectedGross!==e.gross||metrics.expectedReferral!==e.referral) throw new Error('On-chain pre-launch metrics are committed to a different delivery manifest. STOP distribution.');
  return metrics;
}
async function readMetrics(a){ const info=await connection.getAccountInfo(a.metrics,'confirmed'); return info?decodeMetrics(info.data):null; }
async function connectOwner(){
  provider=providerForBrowser(); if(!provider?.connect) throw new Error('No Solana wallet detected.');
  const result=await provider.connect(); owner=new PublicKey(result?.publicKey||provider.publicKey);
  if(cfg.ownerWallet && owner.toBase58()!==cfg.ownerWallet) throw new Error('Connected wallet is not the configured RALYA owner wallet.');
  log(`Owner wallet connected: ${owner.toBase58()}`); return owner;
}
async function send(tx,label){
  if(!owner) await connectOwner(); const latest=await connection.getLatestBlockhash('confirmed'); tx.recentBlockhash=latest.blockhash; tx.feePayer=owner; let sig;
  if(provider.signAndSendTransaction){ const r=await provider.signAndSendTransaction(tx); sig=typeof r==='string'?r:r?.signature; }
  else { const signed=await provider.signTransaction(tx); sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4}); }
  if(!sig) throw new Error(`${label} returned no transaction signature.`);
  await connection.confirmTransaction({signature:sig,...latest},'confirmed'); log(`${label}: ${sig}`); return sig;
}
async function readSale(a){ const info=await connection.getAccountInfo(a.sale,'confirmed'); if(!info)throw new Error('Production sale account not found.'); return decodeSale(info.data); }
async function schedulePublicLaunch(){
  if(!manifest)throw new Error('Load the frozen final manifest first.');
  if(!owner)await connectOwner(); const a=addresses(); await ensureMetrics(a); const sale=await readSale(a); const metrics=await readMetrics(a);
  if(!sale.admin.equals(owner))throw new Error('Connected wallet is not the on-chain sale admin.');
  if(sale.status!==2)throw new Error('Sale must be PAUSED before scheduling public launch.');
  if(metrics?.scheduledPublicLaunchAt>0n){ log(`Public launch already scheduled: ${new Date(Number(metrics.scheduledPublicLaunchAt)*1000).toISOString()}.`); return; }
  const input=$('preScheduledLaunchAt'); const when=Date.parse(input?.value||'');
  if(!Number.isFinite(when))throw new Error('Choose the intended public launch date and time first.');
  const scheduled=Math.floor(when/1000); if(scheduled<Math.floor(Date.now()/1000)+24*60*60)throw new Error('Schedule public launch at least 24 hours ahead so Standard T-1 delivery is possible.');
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataI64('schedule_public_launch',scheduled),keys:[
    {pubkey:owner,isSigner:true,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:a.metrics,isSigner:false,isWritable:true}
  ]}));
  await send(tx,'Schedule public RLYA launch');
  const updated=await readMetrics(a); if(!updated||updated.scheduledPublicLaunchAt<=0n)throw new Error('Scheduled launch timestamp was not recorded.');
  log(`Public launch scheduled on-chain for ${new Date(Number(updated.scheduledPublicLaunchAt)*1000).toISOString()}. Standard buyers become eligible automatically at T-1.`);
}
async function markPublicLaunch(){
  if(!owner)await connectOwner(); const a=addresses(); const sale=await readSale(a); const metrics=await readMetrics(a);
  if(!sale.admin.equals(owner))throw new Error('Connected wallet is not the on-chain sale admin.');
  if(sale.publicLaunchAt>0n){ log(`Public launch was already marked at ${new Date(Number(sale.publicLaunchAt)*1000).toISOString()}.`); return; }
  if(!metrics||metrics.scheduledPublicLaunchAt<=0n)throw new Error('Schedule public launch before marking DAY 0.');
  if(BigInt(Math.floor(Date.now()/1000))<metrics.scheduledPublicLaunchAt)throw new Error('The scheduled public launch time has not arrived yet.');
  if(sale.status!==1&&sale.status!==2)throw new Error('Sale must be ACTIVE or PAUSED before marking public launch.');
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataNoArgs('mark_public_launch'),keys:[
    {pubkey:owner,isSigner:true,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.metrics,isSigner:false,isWritable:false},{pubkey:a.founderLock,isSigner:false,isWritable:true}
  ]}));
  await send(tx,'Mark public RLYA launch');
  const updated=await readSale(a); if(updated.publicLaunchAt<=0n)throw new Error('Public launch timestamp was not recorded.');
  log(`DAY 0 locked on-chain: ${new Date(Number(updated.publicLaunchAt)*1000).toISOString()}. Buy + Stake unlocks 21 days later. Founder one-year lock starts from this actual launch timestamp.`);
}
async function ensureMetrics(a){
  const existing=await readMetrics(a); if(existing){ verifyMetricsCommitment(existing,a); return existing; }
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataInitMetrics(manifest),keys:[
    {pubkey:owner,isSigner:true,isWritable:true},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ]}));
  await send(tx,'Commit final pre-launch manifest metrics');
  const created=await readMetrics(a); if(!created)throw new Error('Pre-launch metrics commitment was not created.'); verifyMetricsCommitment(created,a); log(`Final manifest commitment verified on-chain: ${manifest.sha256}`); return created;
}
async function referralInstruction(a,row){
  if(!row.referrer) return null;
  const buyer=new PublicKey(row.wallet), referrer=new PublicKey(row.referrer);
  const [buyerPda]=PublicKey.findProgramAddressSync([enc.encode('referral'),buyer.toBytes()],a.program);
  const existing=await connection.getAccountInfo(buyerPda,'confirmed');
  if(existing){
    if(existing.data.length<72) throw new Error(`Referral account for ${row.wallet} is incomplete.`);
    const recorded=new PublicKey(existing.data.slice(40,72));
    if(!recorded.equals(referrer)) throw new Error(`Referral mismatch for ${row.wallet}; stop distribution.`);
    return null;
  }
  const [referrerPda]=PublicKey.findProgramAddressSync([enc.encode('referral'),referrer.toBytes()],a.program);
  return new TransactionInstruction({programId:a.program,data:await dataNoArgs('import_prelaunch_referral'),keys:[
    {pubkey:owner,isSigner:true,isWritable:true},{pubkey:buyer,isSigner:false,isWritable:false},{pubkey:referrer,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:buyerPda,isSigner:false,isWritable:true},{pubkey:referrerPda,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ]});
}
function standardReleaseReady(metrics,nowSec){ return Boolean(metrics&&metrics.scheduledPublicLaunchAt>0n&&BigInt(nowSec)>=metrics.scheduledPublicLaunchAt+BigInt(STANDARD_RELEASE_OFFSET_SECONDS)); }
function rowReleaseReady(row,sale,metrics,nowSec){
  if(row.stake===true) return sale.publicLaunchAt>0n&&BigInt(nowSec)>=sale.publicLaunchAt+BigInt(STAKED_RELEASE_SECONDS);
  return standardReleaseReady(metrics,nowSec);
}
async function buildWalletTx(a,row,sale,metrics,nowSec){
  const recipient=new PublicKey(row.wallet), web=BigInt(row.webRlyaBase||0), manual=BigInt(row.manualRlyaBase||0);
  const recipientAta=await getAssociatedTokenAddress(a.mint,recipient); const tx=new Transaction(); let hasDelivery=false;
  const needsWeb=web>0n && rowReleaseReady(row,sale,metrics,nowSec);
  const manualReady=manual>0n && standardReleaseReady(metrics,nowSec);
  if(!needsWeb && !manualReady) return null;
  if(!await connection.getAccountInfo(recipientAta,'confirmed')) tx.add(createAssociatedTokenAccountInstruction(owner,recipientAta,recipient,a.mint));
  if(needsWeb){
    const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
    if(!await connection.getAccountInfo(receipt,'confirmed')){
      const referralIx=await referralInstruction(a,row); if(referralIx) tx.add(referralIx);
      tx.add(new TransactionInstruction({programId:a.program,data:await dataThreeU64Bool('deliver_prelaunch',web,BigInt(row.grossUsdcBase||0),BigInt(row.referralUsdcBase||0),row.stake===true),keys:[
        {pubkey:owner,isSigner:true,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:a.saleVault,isSigner:false,isWritable:true},{pubkey:a.stakingBonusVault,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:receipt,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
      ]})); hasDelivery=true;
    } else log(`Website allocation already delivered to ${shorten(row.wallet)}; receipt found.`);
  }
  if(manualReady){
    const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_manual_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
    if(!await connection.getAccountInfo(receipt,'confirmed')){
      tx.add(new TransactionInstruction({programId:a.program,data:await dataU64('deliver_prelaunch_manual',manual),keys:[
        {pubkey:owner,isSigner:true,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:a.saleVault,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:receipt,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
      ]})); hasDelivery=true;
    } else log(`Private/off-site allocation already delivered to ${shorten(row.wallet)}; receipt found.`);
  }
  return hasDelivery?tx:null;
}
async function verifyManifestFile(file){
  const parsed=JSON.parse(await file.text());
  if(parsed.project!=='RALYA'||parsed.symbol!=='RLYA'||parsed.purpose!=='prelaunch-allocation-delivery'||parsed.version!==4) throw new Error('Not a staking-aware RALYA pre-launch delivery manifest v4.');
  const supplied=String(parsed.sha256||''); const copy={...parsed}; delete copy.sha256; const actual=await sha256Text(stableStringify(copy));
  if(!/^[a-f0-9]{64}$/i.test(supplied)||actual!==supplied.toLowerCase()) throw new Error('Manifest SHA-256 does not match. Do not distribute.');
  const purchased=BigInt(parsed.totals?.totalPurchasedRlyaBase||0), bonus=BigInt(parsed.totals?.stakingBonusRlyaBase||0), delivery=BigInt(parsed.totals?.totalDeliveryRlyaBase||0);
  if(purchased<=0n||purchased>PRESALE_CAP) throw new Error('Manifest purchased base total is outside the fixed 288M presale allocation.');
  if(bonus<0n||bonus>STAKING_BONUS_RESERVE) throw new Error('Manifest staking bonus exceeds the fixed 14.4M reserve.');
  if(delivery!==purchased+bonus) throw new Error('Manifest total delivery does not reconcile base allocation plus staking bonus.');
  if(!Array.isArray(parsed.allocations)||!parsed.allocations.length) throw new Error('Manifest contains no allocations.');
  for(const row of parsed.allocations){
    new PublicKey(row.wallet); const web=BigInt(row.webRlyaBase||0), manual=BigInt(row.manualRlyaBase||0), rowBonus=BigInt(row.stakingBonusRlyaBase||0), totalPurchased=BigInt(row.totalPurchasedRlyaBase||0), totalDelivery=BigInt(row.totalDeliveryRlyaBase||0);
    if(web<0n||manual<0n||rowBonus<0n||web+manual!==totalPurchased||totalPurchased+rowBonus!==totalDelivery) throw new Error(`Manifest allocation mismatch for ${row.wallet}.`);
    const expectedBonus=row.stake===true?web*500n/10000n:0n; if(rowBonus!==expectedBonus)throw new Error(`Staking bonus is not exactly 5% for ${row.wallet}.`);
    const expectedPolicy=row.stake===true?'staked-plus21d':'standard-tminus1'; if(web>0n&&row.webDeliveryPolicy!==expectedPolicy)throw new Error(`Release policy mismatch for ${row.wallet}.`); if(row.claimRequired===true||row.automaticDelivery===false)throw new Error(`Automatic delivery policy mismatch for ${row.wallet}.`);
    if(BigInt(row.referralUsdcBase||0)>BigInt(row.grossUsdcBase||0)) throw new Error(`Referral accounting mismatch for ${row.wallet}.`); if(row.referrer)new PublicKey(row.referrer);
  }
  return parsed;
}
async function pendingManifestState(a,sale,metrics){
  let pendingBase=0n,pendingBonus=0n,completedParts=0,pendingParts=0,eligibleParts=0,deferredParts=0; const nowSec=Math.floor(Date.now()/1000);
  for(const row of manifest.allocations){
    const recipient=new PublicKey(row.wallet), web=BigInt(row.webRlyaBase||0), manual=BigInt(row.manualRlyaBase||0), bonus=BigInt(row.stakingBonusRlyaBase||0);
    if(web>0n){
      const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
      if(await connection.getAccountInfo(receipt,'confirmed'))completedParts+=1;else{pendingBase+=web;pendingBonus+=bonus;pendingParts+=1;if(rowReleaseReady(row,sale,metrics,nowSec))eligibleParts+=1;else deferredParts+=1;}
    }
    if(manual>0n){
      const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_manual_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
      if(await connection.getAccountInfo(receipt,'confirmed'))completedParts+=1;else{pendingBase+=manual;pendingParts+=1;if(standardReleaseReady(metrics,nowSec))eligibleParts+=1;else deferredParts+=1;}
    }
  }
  return {pendingBase,pendingBonus,completedParts,pendingParts,eligibleParts,deferredParts,nowSec};
}
async function preflight(){
  if(!manifest) throw new Error('Load the owner-exported delivery manifest first.');
  if(!owner) await connectOwner();
  const a=addresses(); const sale=await readSale(a);
  if(!sale.admin.equals(owner))throw new Error('Connected wallet is not the on-chain sale admin.');
  if(!sale.mint.equals(a.mint))throw new Error('Sale mint mismatch.');
  if(sale.status!==2)throw new Error('Sale must be PAUSED for pre-launch distribution.');
  if(sale.presaleCap!==PRESALE_CAP)throw new Error('On-chain presale cap does not equal 288M RLYA.');
  const metrics=await ensureMetrics(a);
  if(metrics.scheduledPublicLaunchAt<=0n)throw new Error('Public launch is not scheduled on-chain yet. Schedule it before T-1 distribution.');
  const pending=await pendingManifestState(a,sale,metrics);
  if(sale.totalSold+pending.pendingBase>PRESALE_CAP)throw new Error('Existing on-chain sold amount plus pending base deliveries would exceed the fixed 288M presale cap.');
  const baseVault=await connection.getTokenAccountBalance(a.saleVault,'confirmed');
  if(BigInt(baseVault.value.amount)<pending.pendingBase)throw new Error('Official 288M sale vault does not hold enough RLYA for the pending base allocations.');
  const bonusVault=await connection.getTokenAccountBalance(a.stakingBonusVault,'confirmed');
  if(BigInt(bonusVault.value.amount)<pending.pendingBonus)throw new Error('Official staking-bonus vault does not hold enough RLYA for the pending fixed 5% bonuses.');
  log(`Distribution preflight PASS · scheduled launch ${new Date(Number(metrics.scheduledPublicLaunchAt)*1000).toISOString()} · actual DAY 0 ${sale.publicLaunchAt>0n?new Date(Number(sale.publicLaunchAt)*1000).toISOString():'not marked yet'} · pending base ${fmtRlya(pending.pendingBase)} · pending bonus ${fmtRlya(pending.pendingBonus)} · eligible parts now ${pending.eligibleParts} · deferred by release lock ${pending.deferredParts} · completed receipt parts ${pending.completedParts}.`);
  return {a,sale,metrics,pending};
}
async function runDistribution(){
  if(running)return; running=true; try{
    const {a,sale,metrics,pending}=await preflight();
    if(pending.eligibleParts===0){ log('No allocation is eligible for delivery yet. Standard rows unlock automatically at T-1; Buy + Stake rows unlock 21 days after public launch.'); return; }
    const rows=manifest.allocations; let submitted=0,skipped=0,deferred=0; const nowSec=Math.floor(Date.now()/1000);
    for(let start=0;start<rows.length;start+=BATCH_SIZE){
      const batch=rows.slice(start,start+BATCH_SIZE); const txs=[]; const labels=[];
      for(const row of batch){
        const web=BigInt(row.webRlyaBase||0),manual=BigInt(row.manualRlyaBase||0); const webReady=web===0n||rowReleaseReady(row,sale,metrics,nowSec); const manualReady=manual===0n||(standardReleaseReady(metrics,nowSec));
        if(!webReady||!manualReady)deferred+=1;
        const tx=await buildWalletTx(a,row,sale,metrics,nowSec); if(tx){ const latest=await connection.getLatestBlockhash('confirmed'); tx.recentBlockhash=latest.blockhash; tx.feePayer=owner; tx.__ralyaBlockhash=latest; txs.push(tx); labels.push(row.wallet); } else skipped+=1;
      }
      if(!txs.length)continue;
      if(provider.signAllTransactions){
        const signed=await provider.signAllTransactions(txs);
        for(let i=0;i<signed.length;i++){ const sig=await connection.sendRawTransaction(signed[i].serialize(),{skipPreflight:false,maxRetries:4}); await connection.confirmTransaction({signature:sig,...txs[i].__ralyaBlockhash},'confirmed'); submitted+=1; log(`Delivered ${shorten(labels[i])}: ${sig}`); }
      }else{
        for(let i=0;i<txs.length;i++){ const signed=await provider.signTransaction(txs[i]); const sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4}); await connection.confirmTransaction({signature:sig,...txs[i].__ralyaBlockhash},'confirmed'); submitted+=1; log(`Delivered ${shorten(labels[i])}: ${sig}`); }
      }
    }
    const committed=verifyMetricsCommitment(await readMetrics(a),a); const e=manifestExpectations();
    const after=await pendingManifestState(a,await readSale(a),await readMetrics(a));
    if(after.pendingParts===0){
      if(committed.webDelivered!==e.web||committed.manualDelivered!==e.manual||committed.bonusDelivered!==e.bonus||committed.grossImported!==e.gross||committed.referralImported!==e.referral) throw new Error('All receipt PDAs exist but on-chain metrics do not exactly reconcile to the committed final manifest. STOP.');
      log(`RALYA presale distribution COMPLETE. Base + staking bonus + USDC/referral metrics exactly match the manifest. Submitted ${submitted}; skipped ${skipped}.`);
    }else{
      if(committed.webDelivered>e.web||committed.manualDelivered>e.manual||committed.bonusDelivered>e.bonus||committed.grossImported>e.gross||committed.referralImported>e.referral)throw new Error('Partial delivery counters exceed committed manifest totals. STOP.');
      log(`Partial distribution complete. Submitted ${submitted}; skipped ${skipped}; deferred ${deferred}. ${after.pendingParts} receipt parts remain for later release windows.`);
    }
  } finally { running=false; }
}
function install(){
  if(!location.pathname.includes('/owner/'))return; const shell=document.querySelector('.owner-shell'); if(!shell||$('prelaunchDeliveryControl'))return;
  const section=document.createElement('section'); section.className='owner-card'; section.id='prelaunchDeliveryControl'; section.innerHTML=`
    <h2>Public launch clock + presale distribution</h2><p>This production-only tool locks public launch DAY 0 on-chain, then safely delivers Standard presale allocations at T-1 and Buy + Stake allocations with their fixed 5% bonus at T+21. Deterministic receipt PDAs make reruns idempotent.</p>
    <div class="danger"><strong>Schedule the launch only after the date/time is final.</strong> Standard wallets become eligible at T-1. Mark DAY 0 at the actual public launch; that starts Buy + Stake T+21 and the founder 365-day lock.</div>
    <div class="owner-actions"><button class="btn btn-secondary" id="preDeliveryConnect">Connect owner</button></div><label>Final public launch date/time</label><input id="preScheduledLaunchAt" type="datetime-local"/><div class="owner-actions"><button class="btn btn-secondary" id="preSchedulePublicLaunch">Schedule launch on-chain</button><button class="btn btn-secondary" id="preMarkPublicLaunch">Mark public launch DAY 0</button></div>
    <label>Final delivery manifest v4</label><input id="preDeliveryFile" type="file" accept="application/json,.json"/>
    <div class="owner-actions"><button class="btn btn-secondary" id="preDeliveryPreflight" disabled>Verify manifest + release state</button><button class="btn btn-primary" id="preDeliveryRun" disabled>Distribute eligible allocations</button></div>
    <p class="record" id="preDeliverySummary">No manifest loaded.</p><pre class="launch-log" id="preDeliveryLog">Waiting for final staking-aware pre-launch delivery manifest.</pre>`;
  shell.appendChild(section);
  $('preDeliveryFile').onchange=async e=>{ try{ const file=e.target.files?.[0]; if(!file)return; manifest=await verifyManifestFile(file); $('preDeliverySummary').textContent=`Manifest verified · ${manifest.allocations.length} wallets · ${fmtRlya(manifest.totals.totalPurchasedRlyaBase)} purchased base · ${fmtRlya(manifest.totals.stakingBonusRlyaBase)} staking bonus · ${fmtUsdc(manifest.totals.grossUsdcBase)} verified website USDC · SHA-256 ${manifest.sha256}`; $('preDeliveryPreflight').disabled=false; log('Manifest v4 SHA-256 and staking totals verified.'); }catch(err){manifest=null;$('preDeliveryPreflight').disabled=true;$('preDeliveryRun').disabled=true;log(`ERROR: ${err.message}`);} };
  $('preDeliveryConnect').onclick=()=>connectOwner().catch(err=>log(`ERROR: ${err.message}`));
  $('preSchedulePublicLaunch').onclick=()=>{ if(!confirm('LOCK THIS PUBLIC LAUNCH DATE/TIME ON-CHAIN? Standard T-1 delivery will be calculated from it.'))return; schedulePublicLaunch().catch(err=>log(`ERROR: ${err.message}`)); };
  $('preMarkPublicLaunch').onclick=()=>{ if(!confirm('MARK PUBLIC RLYA LAUNCH DAY 0 ON-CHAIN NOW? This starts Buy + Stake T+21 and the founder 365-day lock.'))return; markPublicLaunch().catch(err=>log(`ERROR: ${err.message}`)); };
  $('preDeliveryPreflight').onclick=()=>preflight().then(({pending})=>$('preDeliveryRun').disabled=pending.eligibleParts===0).catch(err=>{ $('preDeliveryRun').disabled=true;log(`ERROR: ${err.message}`); });
  $('preDeliveryRun').onclick=()=>{ if(!confirm('Distribute only allocations whose on-chain release clock has matured? Receipt PDAs will skip anything already delivered.'))return; runDistribution().catch(err=>log(`ERROR: ${err.message}`)); };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
