#!/usr/bin/env python3
from pathlib import Path

path = Path('web/owner/prelaunch-delivery.js')
text = path.read_text(encoding='utf-8')
if 'manifest commitment verified on-chain' in text:
    print('RALYA_MANIFEST_DELIVERY_TOOL_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

needle = "async function dataThreeU64(name,a,b,c){ const d=new Uint8Array(32); d.set(await discriminator(name),0); d.set(u64le(a),8); d.set(u64le(b),16); d.set(u64le(c),24); return d; }\n"
insert = needle + "function hex32(hex){ if(!/^[a-f0-9]{64}$/i.test(String(hex||'')))throw new Error('Manifest SHA-256 is invalid.'); const out=new Uint8Array(32); for(let i=0;i<32;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16); return out; }\nasync function dataInitMetrics(m){ const d=new Uint8Array(72); d.set(await discriminator('initialize_prelaunch_metrics'),0); d.set(hex32(m.sha256),8); d.set(u64le(m.totals.webRlyaBase),40); d.set(u64le(m.totals.manualRlyaBase),48); d.set(u64le(m.totals.grossUsdcBase),56); d.set(u64le(m.totals.referralUsdcBase),64); return d; }\n"
if needle not in text: raise SystemExit('dataThreeU64 marker not found')
text = text.replace(needle, insert, 1)

needle = "function decodeSale(data){\n"
idx = text.index(needle)
# Insert decoder after decodeSale's closing function, immediately before connectOwner.
connect = text.index('async function connectOwner(){', idx)
decoder = r'''function decodeMetrics(data){
  const b=data instanceof Uint8Array?data:new Uint8Array(data); if(b.length<137)throw new Error('Pre-launch metrics account is too small.');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength); let o=8;
  const mint=new PublicKey(b.slice(o,o+32));o+=32; const manifestHash=[...b.slice(o,o+32)].map(x=>x.toString(16).padStart(2,'0')).join('');o+=32;
  const expectedWeb=v.getBigUint64(o,true);o+=8; const expectedManual=v.getBigUint64(o,true);o+=8; const expectedGross=v.getBigUint64(o,true);o+=8; const expectedReferral=v.getBigUint64(o,true);o+=8;
  const webDelivered=v.getBigUint64(o,true);o+=8; const manualDelivered=v.getBigUint64(o,true);o+=8; const grossImported=v.getBigUint64(o,true);o+=8; const referralImported=v.getBigUint64(o,true);o+=8;
  return {mint,manifestHash,expectedWeb,expectedManual,expectedGross,expectedReferral,webDelivered,manualDelivered,grossImported,referralImported};
}
function manifestExpectations(){
  if(!manifest)throw new Error('Load the final manifest first.');
  return {hash:String(manifest.sha256).toLowerCase(),web:BigInt(manifest.totals.webRlyaBase||0),manual:BigInt(manifest.totals.manualRlyaBase||0),gross:BigInt(manifest.totals.grossUsdcBase||0),referral:BigInt(manifest.totals.referralUsdcBase||0)};
}
function verifyMetricsCommitment(metrics,a){
  const e=manifestExpectations();
  if(!metrics.mint.equals(a.mint)||metrics.manifestHash!==e.hash||metrics.expectedWeb!==e.web||metrics.expectedManual!==e.manual||metrics.expectedGross!==e.gross||metrics.expectedReferral!==e.referral) throw new Error('On-chain pre-launch metrics are committed to a different delivery manifest. STOP distribution.');
  return metrics;
}
async function readMetrics(a){ const info=await connection.getAccountInfo(a.metrics,'confirmed'); return info?decodeMetrics(info.data):null; }
'''
text = text[:connect] + decoder + text[connect:]

old = '''async function ensureMetrics(a){
  if(await connection.getAccountInfo(a.metrics,'confirmed')) return;
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataNoArgs('initialize_prelaunch_metrics'),keys:[
    {pubkey:owner,isSigner:true,isWritable:true},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ]}));
  await send(tx,'Initialize pre-launch metrics');
}
'''
new = '''async function ensureMetrics(a){
  const existing=await readMetrics(a); if(existing){ verifyMetricsCommitment(existing,a); return existing; }
  const tx=new Transaction().add(new TransactionInstruction({programId:a.program,data:await dataInitMetrics(manifest),keys:[
    {pubkey:owner,isSigner:true,isWritable:true},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:false},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ]}));
  await send(tx,'Commit final pre-launch manifest metrics');
  const created=await readMetrics(a); if(!created)throw new Error('Pre-launch metrics commitment was not created.'); verifyMetricsCommitment(created,a); log(`Final manifest commitment verified on-chain: ${manifest.sha256}`); return created;
}
'''
if old not in text: raise SystemExit('ensureMetrics marker not found')
text = text.replace(old,new,1)

old = "{pubkey:owner,isSigner:true,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.saleVault,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:receipt,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}"
new = "{pubkey:owner,isSigner:true,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:false},{pubkey:a.mint,isSigner:false,isWritable:false},{pubkey:a.sale,isSigner:false,isWritable:true},{pubkey:a.metrics,isSigner:false,isWritable:true},{pubkey:a.saleVault,isSigner:false,isWritable:true},{pubkey:recipientAta,isSigner:false,isWritable:true},{pubkey:receipt,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}"
# Occurs only in deliver_prelaunch_manual; web path already contains metrics.
if old not in text: raise SystemExit('manual delivery account list marker not found')
text = text.replace(old,new,1)

needle = "    log(`RALYA pre-launch distribution complete. Submitted ${submitted}; already-complete wallets skipped ${skipped}. Re-run preflight to independently re-check receipt PDAs.`);\n"
replacement = '''    const committed=verifyMetricsCommitment(await readMetrics(a),a); const e=manifestExpectations();
    if(committed.webDelivered!==e.web||committed.manualDelivered!==e.manual||committed.grossImported!==e.gross||committed.referralImported!==e.referral) throw new Error('Distribution transactions finished but on-chain pre-launch metrics do not exactly reconcile to the committed manifest totals.');
    log(`RALYA pre-launch distribution complete. Submitted ${submitted}; already-complete wallets skipped ${skipped}. Final manifest commitment verified on-chain.`);
'''
if needle not in text: raise SystemExit('distribution completion marker not found')
text = text.replace(needle,replacement,1)

path.write_text(text,encoding='utf-8')
print('RALYA_MANIFEST_DELIVERY_TOOL_PATCH=APPLIED')
