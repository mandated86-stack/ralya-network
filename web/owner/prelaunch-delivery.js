import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg = window.RALYA_CONFIG;
const enc = new TextEncoder();
const connection = new Connection(cfg.rpcEndpoint, 'confirmed');
const RLYA_UNIT = 1_000_000_000n;
const PRESALE_CAP = 100_680_000n * RLYA_UNIT;
const BATCH_SIZE = 4;
let provider = null;
let owner = null;
let manifest = null;
let running = false;

const $ = id => document.getElementById(id);
const shorten = value => { const s = String(value || ''); return s.length > 16 ? `${s.slice(0,7)}…${s.slice(-6)}` : s; };
const fmtRlya = base => `${(Number(BigInt(base || 0)) / 1e9).toLocaleString(undefined,{maximumFractionDigits:4})} RLYA`;
const fmtUsdc = base => `${(Number(BigInt(base || 0)) / 1e6).toLocaleString(undefined,{maximumFractionDigits:2})} USDC`;
function log(message){ const el=$('preDeliveryLog'); if(el) el.textContent=`${new Date().toLocaleTimeString()}  ${message}\n${el.textContent}`.slice(0,14000); }
function providerForBrowser(){ return window.phantom?.solana || window.solflare || window.solana || null; }
function stableStringify(value){ if(value===null||typeof value!=='object')return JSON.stringify(value); if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`; return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`; }
async function sha256Text(text){ const digest=await crypto.subtle.digest('SHA-256',enc.encode(text)); return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
async function discriminator(name){ const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`)); return new Uint8Array(h).slice(0,8); }
function u64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigUint64(0,BigInt(n),true); return b; }
async function dataU64(name,n){ const d=new Uint8Array(16); d.set(await discriminator(name),0); d.set(u64le(n),8); return d; }
async function dataThreeU64(name,a,b,c){ const d=new Uint8Array(32); d.set(await discriminator(name),0); d.set(u64le(a),8); d.set(u64le(b),16); d.set(u64le(c),24); return d; }
async function dataNoArgs(name){ return await discriminator(name); }

function configured(){ return Boolean(cfg.saleProgramId && cfg.rlyaMint && cfg.salePda); }
function addresses(){
  if(!configured()) throw new Error('Production Program ID, RLYA mint and sale PDA are not configured yet. Distribution stays unavailable before Mainnet launch preparation.');
  const program=new PublicKey(cfg.saleProgramId), mint=new PublicKey(cfg.rlyaMint), sale=new PublicKey(cfg.salePda);
  const [expectedSale]=PublicKey.findProgramAddressSync([enc.encode('sale'),mint.toBytes()],program);
  if(!expectedSale.equals(sale)) throw new Error('Configured sale PDA does not match the production Program ID/RLYA mint.');
  const [saleVault]=PublicKey.findProgramAddressSync([enc.encode('sale_vault'),mint.toBytes()],program);
  const [metrics]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_metrics'),mint.toBytes()],program);
  return {program,mint,sale,saleVault,metrics};
}
function decodeSale(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data); const v=new DataView(b.buffer,b.byteOffset,b.byteLength); let o=8;
  const admin=new PublicKey(b.slice(o,o+32)); o+=32; const treasury=new PublicKey(b.slice(o,o+32)); o+=32; const founder=new PublicKey(b.slice(o,o+32)); o+=32; const mint=new PublicKey(b.slice(o,o+32)); o+=32; const usdc=new PublicKey(b.slice(o,o+32)); o+=32;
  const presaleCap=v.getBigUint64(o,true);o+=8;const basePrice=v.getBigUint64(o,true);o+=8;const stepSize=v.getBigUint64(o,true);o+=8;const stepIncrement=v.getBigUint64(o,true);o+=8;const referralBps=v.getBigUint64(o,true);o+=8;const totalSold=v.getBigUint64(o,true);o+=8;const manualSold=v.getBigUint64(o,true);o+=8;const totalUsdc=v.getBigUint64(o,true);o+=8;const totalReferral=v.getBigUint64(o,true);o+=8;const startedAt=v.getBigInt64(o,true);o+=8;const status=v.getUint8(o);
  return {admin,treasury,founder,mint,usdc,presaleCap,basePrice,stepSize,stepIncrement,referralBps,totalSold,manualSold,totalUsdc,totalReferral,startedAt,status};
}
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
async function ensureMetrics(a){
  if(await connection.getAccountInfo(a.metrics,'confirmed')) return;
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataNoArgs('initialize_prelaunch_metrics'),keys:[
    {pubkey:owner,isSigner:true,isWritable:true},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ]}));
  await send(tx,'Initialize pre-launch metrics');
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
async function buildWalletTx(a,row){
  const recipient=new PublicKey(row.wallet), web=BigInt(row.webRlyaBase||0), manual=BigInt(row.manualRlyaBase||0);
  const recipientAta=await getAssociatedTokenAddress(a.mint,recipient); const tx=new Transaction();
  if(!await connection.getAccountInfo(recipientAta,'confirmed')) tx.add(createAssociatedTokenAccountInstruction(owner,recipientAta,recipient,a.mint));
  if(web>0n){
    const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
    if(!await connection.getAccountInfo(receipt,'confirmed')){
      const referralIx=await referralInstruction(a,row); if(referralIx) tx.add(referralIx);
      tx.add(new TransactionInstruction({programId:a.program,data:await dataThreeU64('deliver_prelaunch',web,BigInt(row.grossUsdcBase||0),BigInt(row.referralUsdcBase||0)),keys:[
        {pubkey:owner,isSigner:true,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:a.saleVault,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:receipt,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
      ]}));
    } else log(`Web allocation already delivered to ${shorten(row.wallet)}; receipt found.`);
  }
  if(manual>0n){
    const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_manual_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
    if(!await connection.getAccountInfo(receipt,'confirmed')){
      tx.add(new TransactionInstruction({programId:a.program,data:await dataU64('deliver_prelaunch_manual',manual),keys:[
        {pubkey:owner,isSigner:true,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.saleVault,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:receipt,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
      ]}));
    } else log(`Private/off-site allocation already delivered to ${shorten(row.wallet)}; receipt found.`);
  }
  return tx.instructions.length?tx:null;
}
async function verifyManifestFile(file){
  const parsed=JSON.parse(await file.text());
  if(parsed.project!=='RALYA'||parsed.symbol!=='RLYA'||parsed.purpose!=='prelaunch-allocation-delivery'||parsed.version!==1) throw new Error('Not a RALYA pre-launch delivery manifest.');
  const supplied=String(parsed.sha256||''); const copy={...parsed}; delete copy.sha256; const actual=await sha256Text(stableStringify(copy));
  if(!/^[a-f0-9]{64}$/i.test(supplied)||actual!==supplied.toLowerCase()) throw new Error('Manifest SHA-256 does not match. Do not distribute.');
  const total=BigInt(parsed.totals?.totalRlyaBase||0); if(total<=0n||total>PRESALE_CAP) throw new Error('Manifest total is outside the fixed presale allocation.');
  if(!Array.isArray(parsed.allocations)||!parsed.allocations.length) throw new Error('Manifest contains no allocations.');
  for(const row of parsed.allocations){ new PublicKey(row.wallet); const web=BigInt(row.webRlyaBase||0), manual=BigInt(row.manualRlyaBase||0), totalRow=BigInt(row.totalRlyaBase||0); if(web<0n||manual<0n||web+manual!==totalRow) throw new Error(`Manifest allocation mismatch for ${row.wallet}.`); if(BigInt(row.referralUsdcBase||0)>BigInt(row.grossUsdcBase||0)) throw new Error(`Referral accounting mismatch for ${row.wallet}.`); if(row.referrer)new PublicKey(row.referrer); }
  return parsed;
}
async function pendingManifestAmount(a){
  let pending=0n, completedParts=0, pendingParts=0;
  for(const row of manifest.allocations){
    const recipient=new PublicKey(row.wallet), web=BigInt(row.webRlyaBase||0), manual=BigInt(row.manualRlyaBase||0);
    if(web>0n){
      const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
      if(await connection.getAccountInfo(receipt,'confirmed'))completedParts+=1;else{pending+=web;pendingParts+=1;}
    }
    if(manual>0n){
      const [receipt]=PublicKey.findProgramAddressSync([enc.encode('prelaunch_manual_delivery'),a.mint.toBytes(),recipient.toBytes()],a.program);
      if(await connection.getAccountInfo(receipt,'confirmed'))completedParts+=1;else{pending+=manual;pendingParts+=1;}
    }
  }
  return {pending,completedParts,pendingParts};
}
async function preflight(){
  if(!manifest) throw new Error('Load the owner-exported delivery manifest first.');
  if(!owner) await connectOwner();
  const a=addresses();
  const info=await connection.getAccountInfo(a.sale,'confirmed');
  if(!info)throw new Error('Production sale account not found.');
  const sale=decodeSale(info.data);
  if(!sale.admin.equals(owner))throw new Error('Connected wallet is not the on-chain sale admin.');
  if(!sale.mint.equals(a.mint))throw new Error('Sale mint mismatch.');
  if(sale.status!==2)throw new Error('Sale must be PAUSED for pre-launch distribution.');
  if(sale.presaleCap!==PRESALE_CAP)throw new Error('On-chain presale cap does not equal 100.68M RLYA.');
  await ensureMetrics(a);
  const pendingInfo=await pendingManifestAmount(a);
  if(sale.totalSold+pendingInfo.pending>PRESALE_CAP)throw new Error('Existing on-chain sold amount plus still-pending manifest deliveries would exceed the fixed presale cap.');
  const vault=await connection.getTokenAccountBalance(a.saleVault,'confirmed');
  if(BigInt(vault.value.amount)<pendingInfo.pending)throw new Error('Official sale vault does not hold enough RLYA for the still-pending manifest deliveries.');
  log(`Distribution preflight PASS · ${manifest.allocations.length} wallets · pending ${fmtRlya(pendingInfo.pending)} · completed receipt parts ${pendingInfo.completedParts} · prior on-chain sold ${fmtRlya(sale.totalSold)}.`);
  return a;
}
async function runDistribution(){
  if(running)return; running=true; try{
    const a=await preflight(); const rows=manifest.allocations; let submitted=0, skipped=0;
    for(let start=0;start<rows.length;start+=BATCH_SIZE){
      const batch=rows.slice(start,start+BATCH_SIZE); const txs=[]; const labels=[];
      for(const row of batch){ const tx=await buildWalletTx(a,row); if(tx){ const latest=await connection.getLatestBlockhash('confirmed'); tx.recentBlockhash=latest.blockhash; tx.feePayer=owner; tx.__ralyaBlockhash=latest; txs.push(tx); labels.push(row.wallet); } else skipped+=1; }
      if(!txs.length)continue;
      if(provider.signAllTransactions){
        const signed=await provider.signAllTransactions(txs);
        for(let i=0;i<signed.length;i++){ const sig=await connection.sendRawTransaction(signed[i].serialize(),{skipPreflight:false,maxRetries:4}); await connection.confirmTransaction({signature:sig,...txs[i].__ralyaBlockhash},'confirmed'); submitted+=1; log(`Delivered ${shorten(labels[i])}: ${sig}`); }
      }else{
        for(let i=0;i<txs.length;i++){ const signed=await provider.signTransaction(txs[i]); const sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4}); await connection.confirmTransaction({signature:sig,...txs[i].__ralyaBlockhash},'confirmed'); submitted+=1; log(`Delivered ${shorten(labels[i])}: ${sig}`); }
      }
    }
    log(`RALYA pre-launch distribution complete. Submitted ${submitted}; already-complete wallets skipped ${skipped}. Re-run preflight to independently re-check receipt PDAs.`);
  } finally { running=false; }
}
function install(){
  if(!location.pathname.includes('/owner/'))return; const shell=document.querySelector('.owner-shell'); if(!shell||$('prelaunchDeliveryControl'))return;
  const section=document.createElement('section'); section.className='owner-card'; section.id='prelaunchDeliveryControl'; section.innerHTML=`
    <h2>Pre-launch RLYA distribution</h2><p>Distribution-day tool only. It remains unavailable until the production Program ID, RLYA mint and sale PDA are configured. Every wallet delivery creates an on-chain receipt PDA, so reruns skip completed allocations instead of sending twice.</p>
    <div class="danger"><strong>Required state: PAUSED.</strong> Close pre-launch allocation access before exporting the final manifest. This tool does not open public trading or resume the sale.</div>
    <label>Final delivery manifest</label><input id="preDeliveryFile" type="file" accept="application/json,.json"/>
    <div class="owner-actions"><button class="btn btn-secondary" id="preDeliveryConnect">Connect owner</button><button class="btn btn-secondary" id="preDeliveryPreflight" disabled>Verify manifest + Mainnet state</button><button class="btn btn-primary" id="preDeliveryRun" disabled>Distribute confirmed allocations</button></div>
    <p class="record" id="preDeliverySummary">No manifest loaded.</p><pre class="launch-log" id="preDeliveryLog">Waiting for final pre-launch delivery manifest.</pre>`;
  shell.appendChild(section);
  $('preDeliveryFile').onchange=async e=>{ try{ const file=e.target.files?.[0]; if(!file)return; manifest=await verifyManifestFile(file); $('preDeliverySummary').textContent=`Manifest verified · ${manifest.allocations.length} wallets · ${fmtRlya(manifest.totals.totalRlyaBase)} · ${fmtUsdc(manifest.totals.grossUsdcBase)} verified website USDC · SHA-256 ${manifest.sha256}`; $('preDeliveryPreflight').disabled=false; log('Manifest SHA-256 verified.'); }catch(err){manifest=null;$('preDeliveryPreflight').disabled=true;$('preDeliveryRun').disabled=true;log(`ERROR: ${err.message}`);} };
  $('preDeliveryConnect').onclick=()=>connectOwner().catch(err=>log(`ERROR: ${err.message}`));
  $('preDeliveryPreflight').onclick=()=>preflight().then(()=>$('preDeliveryRun').disabled=false).catch(err=>{ $('preDeliveryRun').disabled=true;log(`ERROR: ${err.message}`); });
  $('preDeliveryRun').onclick=()=>{ if(!confirm('Distribute the verified pre-launch allocations from the official RLYA sale vault now? Already-created on-chain receipt PDAs will be skipped.'))return; runDistribution().catch(err=>log(`ERROR: ${err.message}`)); };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
