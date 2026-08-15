#!/usr/bin/env python3
from pathlib import Path

path = Path('scripts/local_validator_smoke.sh')
text = path.read_text(encoding='utf-8')
if 'PRELAUNCH_RECONCILIATION PASS' in text:
    print('RALYA_LOCAL_PRELAUNCH_TEST_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

old = "const saleSeed=Buffer.from('sale'),saleVaultSeed=Buffer.from('sale_vault'),founderLockSeed=Buffer.from('founder_lock'),founderVaultSeed=Buffer.from('founder_vault'),referralSeed=Buffer.from('referral');"
new = "const saleSeed=Buffer.from('sale'),saleVaultSeed=Buffer.from('sale_vault'),founderLockSeed=Buffer.from('founder_lock'),founderVaultSeed=Buffer.from('founder_vault'),referralSeed=Buffer.from('referral'),preMetricsSeed=Buffer.from('prelaunch_metrics'),preDeliverySeed=Buffer.from('prelaunch_delivery'),preManualDeliverySeed=Buffer.from('prelaunch_manual_delivery');"
if old not in text:
    raise SystemExit('local harness seed marker not found')
text = text.replace(old,new,1)

marker = "s=await getState(sale);assert.equal(s.raised,600n*U);assert.equal(s.refPaid,5n*U);assert.equal(s.sold,q+q2+man);assert.equal(s.manual,man);assert(guardCount>=10);\nconsole.log(JSON.stringify({status:'PASS',programId:PROGRAM_ID.toBase58(),rlyaMint:rlya.toBase58(),usdcMint:usdc.toBase58(),sale:sale.toBase58(),totalSold:s.sold.toString(),grossUsdc:s.raised.toString(),referralUsdc:s.refPaid.toString(),priceMicroUsdc:price(s).toString(),guardCount}));\nconsole.log('RALYA_LOCAL_PROTOCOL_INTEGRATION=PASS');"
if marker not in text:
    raise SystemExit('local harness final marker not found')

replacement = r'''s=await getState(sale);assert.equal(s.raised,600n*U);assert.equal(s.refPaid,5n*U);assert.equal(s.sold,q+q2+man);assert.equal(s.manual,man);assert(guardCount>=10);
console.log('BASE_PROTOCOL_RECONCILIATION PASS');

// New 0.7 pre-launch reconciliation runs only while the production-style sale is PAUSED.
await send(ix('pause',[m(admin.publicKey,true),m(rlya),m(sale,false,true)]));
s=await getState(sale);assert.equal(s.status,2);
const preBuyer=Keypair.generate(),preReferrer=Keypair.generate(),prePrivate=Keypair.generate(),preExtra=Keypair.generate();
const preBuyerRlya=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,preBuyer.publicKey)).address;
const prePrivateRlya=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,prePrivate.publicKey)).address;
const preExtraRlya=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,preExtra.publicKey)).address;
const [preMetrics]=PublicKey.findProgramAddressSync([preMetricsSeed,rlya.toBuffer()],PROGRAM_ID);
const manifestHash=Buffer.alloc(32,0x5a),expectedWeb=1_000_000n*R,expectedManual=2_000_000n*R,expectedGross=3_000n*U,expectedReferral=30n*U;
const initMetricsData=Buffer.concat([disc('initialize_prelaunch_metrics'),manifestHash,u64(expectedWeb),u64(expectedManual),u64(expectedGross),u64(expectedReferral)]);
await send(new TransactionInstruction({programId:PROGRAM_ID,data:initMetricsData,keys:[m(admin.publicKey,true,true),m(rlya),m(sale),m(preMetrics,false,true),m(SystemProgram.programId)]}));
console.log('PRELAUNCH_MANIFEST_COMMITMENT PASS');

const [preBuyerReferral]=PublicKey.findProgramAddressSync([referralSeed,preBuyer.publicKey.toBuffer()],PROGRAM_ID);
const [preReferrerReferral]=PublicKey.findProgramAddressSync([referralSeed,preReferrer.publicKey.toBuffer()],PROGRAM_ID);
await send(new TransactionInstruction({programId:PROGRAM_ID,data:disc('import_prelaunch_referral'),keys:[m(admin.publicKey,true,true),m(preBuyer.publicKey),m(preReferrer.publicKey),m(rlya),m(sale),m(preBuyerReferral,false,true),m(preReferrerReferral),m(SystemProgram.programId)]}));
const importedReferralInfo=await c.getAccountInfo(preBuyerReferral);assert(importedReferralInfo&&importedReferralInfo.owner.equals(PROGRAM_ID));
console.log('PRELAUNCH_REFERRAL_IMPORT PASS');

const [preReceipt]=PublicKey.findProgramAddressSync([preDeliverySeed,rlya.toBuffer(),preBuyer.publicKey.toBuffer()],PROGRAM_ID);
const preWeb0=await amt(preBuyerRlya),beforePre=await getState(sale);
await send(new TransactionInstruction({programId:PROGRAM_ID,data:Buffer.concat([disc('deliver_prelaunch'),u64(expectedWeb),u64(expectedGross),u64(expectedReferral)]),keys:[m(admin.publicKey,true,true),m(preBuyer.publicKey),m(rlya),m(sale,false,true),m(preMetrics,false,true),m(sv,false,true),m(preBuyerRlya,false,true),m(preReceipt,false,true),m(TOKEN_PROGRAM_ID),m(SystemProgram.programId)]}));
s=await getState(sale);assert.equal(await amt(preBuyerRlya),preWeb0+expectedWeb);assert.equal(s.sold,beforePre.sold+expectedWeb);assert.equal(s.raised,beforePre.raised+expectedGross);assert.equal(s.refPaid,beforePre.refPaid+expectedReferral);assert.equal(s.manual,beforePre.manual);
await fail('duplicate website prelaunch delivery rejected',()=>send(new TransactionInstruction({programId:PROGRAM_ID,data:Buffer.concat([disc('deliver_prelaunch'),u64(expectedWeb),u64(expectedGross),u64(expectedReferral)]),keys:[m(admin.publicKey,true,true),m(preBuyer.publicKey),m(rlya),m(sale,false,true),m(preMetrics,false,true),m(sv,false,true),m(preBuyerRlya,false,true),m(preReceipt,false,true),m(TOKEN_PROGRAM_ID),m(SystemProgram.programId)]})));
console.log('PRELAUNCH_WEB_DELIVERY PASS');

const [preManualReceipt]=PublicKey.findProgramAddressSync([preManualDeliverySeed,rlya.toBuffer(),prePrivate.publicKey.toBuffer()],PROGRAM_ID);
const prePrivate0=await amt(prePrivateRlya),manualBefore=s.manual;
await send(new TransactionInstruction({programId:PROGRAM_ID,data:Buffer.concat([disc('deliver_prelaunch_manual'),u64(expectedManual)]),keys:[m(admin.publicKey,true,true),m(prePrivate.publicKey),m(rlya),m(sale,false,true),m(preMetrics,false,true),m(sv,false,true),m(prePrivateRlya,false,true),m(preManualReceipt,false,true),m(TOKEN_PROGRAM_ID),m(SystemProgram.programId)]}));
s=await getState(sale);assert.equal(await amt(prePrivateRlya),prePrivate0+expectedManual);assert.equal(s.manual,manualBefore+expectedManual);assert.equal(s.sold,beforePre.sold+expectedWeb+expectedManual);
await fail('duplicate private/off-site prelaunch delivery rejected',()=>send(new TransactionInstruction({programId:PROGRAM_ID,data:Buffer.concat([disc('deliver_prelaunch_manual'),u64(expectedManual)]),keys:[m(admin.publicKey,true,true),m(prePrivate.publicKey),m(rlya),m(sale,false,true),m(preMetrics,false,true),m(sv,false,true),m(prePrivateRlya,false,true),m(preManualReceipt,false,true),m(TOKEN_PROGRAM_ID),m(SystemProgram.programId)]})));
const [extraReceipt]=PublicKey.findProgramAddressSync([preManualDeliverySeed,rlya.toBuffer(),preExtra.publicKey.toBuffer()],PROGRAM_ID);
await fail('manifest commitment blocks excess private delivery',()=>send(new TransactionInstruction({programId:PROGRAM_ID,data:Buffer.concat([disc('deliver_prelaunch_manual'),u64(1n)]),keys:[m(admin.publicKey,true,true),m(preExtra.publicKey),m(rlya),m(sale,false,true),m(preMetrics,false,true),m(sv,false,true),m(preExtraRlya,false,true),m(extraReceipt,false,true),m(TOKEN_PROGRAM_ID),m(SystemProgram.programId)]})));
console.log('PRELAUNCH_MANUAL_DELIVERY PASS');

const metricsInfo=await c.getAccountInfo(preMetrics);assert(metricsInfo);const mb=Buffer.from(metricsInfo.data),mv=new DataView(mb.buffer,mb.byteOffset,mb.byteLength);let mo=72;
const metricExpectedWeb=mv.getBigUint64(mo,true);mo+=8,metricExpectedManual=mv.getBigUint64(mo,true);mo+=8,metricExpectedGross=mv.getBigUint64(mo,true);mo+=8,metricExpectedReferral=mv.getBigUint64(mo,true);mo+=8,metricWeb=mv.getBigUint64(mo,true);mo+=8,metricManual=mv.getBigUint64(mo,true);mo+=8,metricGross=mv.getBigUint64(mo,true);mo+=8,metricReferral=mv.getBigUint64(mo,true);
assert.equal(metricExpectedWeb,expectedWeb);assert.equal(metricExpectedManual,expectedManual);assert.equal(metricExpectedGross,expectedGross);assert.equal(metricExpectedReferral,expectedReferral);assert.equal(metricWeb,expectedWeb);assert.equal(metricManual,expectedManual);assert.equal(metricGross,expectedGross);assert.equal(metricReferral,expectedReferral);
assert.equal(Buffer.from(metricsInfo.data).subarray(40,72).toString('hex'),manifestHash.toString('hex'));
console.log('PRELAUNCH_RECONCILIATION PASS');

const mint=await getMint(c,rlya);assert.equal(mint.supply,HARD);assert.equal(mint.mintAuthority,null);assert.equal(mint.freezeAuthority,null);
s=await getState(sale);assert.equal(s.status,2);assert.equal(s.raised,3_600n*U);assert.equal(s.refPaid,35n*U);assert.equal(s.sold,q+q2+man+expectedWeb+expectedManual);assert.equal(s.manual,man+expectedManual);assert(guardCount>=13);
console.log(JSON.stringify({status:'PASS',programId:PROGRAM_ID.toBase58(),rlyaMint:rlya.toBase58(),usdcMint:usdc.toBase58(),sale:sale.toBase58(),prelaunchMetrics:preMetrics.toBase58(),totalSold:s.sold.toString(),grossUsdc:s.raised.toString(),referralUsdc:s.refPaid.toString(),priceMicroUsdc:price(s).toString(),guardCount}));
console.log('RALYA_LOCAL_PROTOCOL_INTEGRATION=PASS');
console.log('RALYA_LOCAL_PRELAUNCH_INTEGRATION=PASS');'''

text = text.replace(marker,replacement,1)
path.write_text(text,encoding='utf-8')
print('RALYA_LOCAL_PRELAUNCH_TEST_PATCH=APPLIED')
