#!/usr/bin/env python3
from pathlib import Path

path = Path('web/owner/prelaunch-delivery.js')
text = path.read_text(encoding='utf-8')
start = text.find('async function preflight(){')
end = text.find('async function runDistribution(){')
if start < 0 or end < 0 or end <= start:
    raise SystemExit('delivery preflight markers not found')
if 'async function pendingManifestAmount' in text:
    print('RALYA_DELIVERY_PREFLIGHT_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)
replacement = r'''async function pendingManifestAmount(a){
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
'''
text = text[:start] + replacement + text[end:]
path.write_text(text, encoding='utf-8')
print('RALYA_DELIVERY_PREFLIGHT_PATCH=APPLIED')
