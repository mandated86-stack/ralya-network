import {
  Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction,
} from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import {
  TOKEN_PROGRAM_ID, MINT_SIZE, ACCOUNT_SIZE, AuthorityType,
  getAssociatedTokenAddress, createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction, createMintToCheckedInstruction,
  createTransferCheckedInstruction, createSetAuthorityInstruction,
  createInitializeAccountInstruction,
} from 'https://esm.sh/@solana/spl-token@0.4.14?bundle';

const cfg = window.RALYA_CONFIG;
const $ = q => document.querySelector(q);
const enc = new TextEncoder();
const connection = new Connection(cfg.rpcEndpoint, 'confirmed');
const RLYA_UNIT = 1_000_000_000n;
const HARD_CAP = 839_000_000n * RLYA_UNIT;
const SALE_POOL = 288_000_000n * RLYA_UNIT;
const STAKING_BONUS_POOL = 14_400_000n * RLYA_UNIT;
const FOUNDER_POOL = 83_900_000n * RLYA_UNIT;
const POOLS = [
  ['provider_security_incentives', 145_096_154n * RLYA_UNIT],
  ['ecosystem_community', 116_076_923n * RLYA_UNIT],
  ['protocol_treasury', 87_057_692n * RLYA_UNIT],
  ['future_chain_security', 58_038_462n * RLYA_UNIT],
  ['liquidity', 46_430_769n * RLYA_UNIT],
];
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const PROGRESS_KEY = 'RALYA_MAINNET_PUBLIC_PROGRESS_V1';

let provider, wallet, programId, mintKeypair, mint, ownerRlyaAta, salePda, saleVaultPda, stakingBonusVaultPda, founderLockPda, founderVaultPda;
let launchPrepared = false;
let launchRecord = {
  project:'RALYA', symbol:'RLYA', network:'mainnet-beta', phase:'not-started',
  preparedAt:null, activatedAt:null, publicLaunchAt:null, pausedAfterActivation:false,
  transactions:{}, allocations:{}
};

function downloadFile(name,text,type='application/json'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function log(msg){ const el=$('#log'); el.textContent += `\n${new Date().toISOString()}  ${msg}`; el.scrollTop=el.scrollHeight; }
function setState(name,text,cls=''){ const el=document.querySelector(`[data-state="${name}"]`); if(!el)return; el.textContent=text; el.className=`state ${cls}`.trim(); }
function getProvider(){ if(window.phantom?.solana?.isPhantom)return window.phantom.solana; if(window.solflare?.isSolflare)return window.solflare; if(window.solana?.connect)return window.solana; return null; }
function pk(value,label){ try{return new PublicKey(String(value).trim())}catch{throw new Error(`${label} is not a valid Solana address.`)} }
async function discriminator(name){ const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`)); return new Uint8Array(h).slice(0,8); }
function savePublicProgress(){ try{ localStorage.setItem(PROGRESS_KEY,JSON.stringify(launchRecord)); }catch{} }

async function waitForSignature(signature,label){
  for(let i=0;i<90;i++){
    try{
      const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
      if(status?.err) throw new Error(`${label} failed: ${JSON.stringify(status.err)}`);
      if(status && (status.confirmationStatus==='confirmed'||status.confirmationStatus==='finalized')) return;
    }catch(err){ if(String(err?.message||err).includes(`${label} failed:`)) throw err; }
    await new Promise(r=>setTimeout(r,1500));
  }
  throw new Error(`${label} was broadcast but confirmation timed out. STOP and verify signature ${signature} before retrying.`);
}
async function sendTx(tx,extraSigners=[],label='transaction'){
  const latest=await connection.getLatestBlockhash('confirmed'); tx.feePayer=wallet; tx.recentBlockhash=latest.blockhash;
  if(extraSigners.length) tx.partialSign(...extraSigners);
  let sig;
  if(provider.signTransaction){ const signed=await provider.signTransaction(tx); sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4}); }
  else if(provider.signAndSendTransaction){ const res=await provider.signAndSendTransaction(tx); sig=res.signature||res; }
  else throw new Error('Connected wallet cannot sign Solana transactions.');
  if(!sig) throw new Error(`${label} did not return a transaction signature.`);
  log(`${label} broadcast: ${sig}`); await waitForSignature(sig,label); log(`${label} confirmed: ${sig}`); return sig;
}
async function connect(){
  provider=getProvider(); if(!provider) throw new Error('Install Phantom or Solflare first.');
  const res=await provider.connect(); wallet=new PublicKey(res?.publicKey||provider.publicKey);
  $('#connectOwner').textContent=`${wallet.toBase58().slice(0,8)}…${wallet.toBase58().slice(-6)}`;
  if(!$('#treasuryWallet').value) $('#treasuryWallet').value=wallet.toBase58();
  if(!$('#founderWallet').value) $('#founderWallet').value=wallet.toBase58();
  $('#preflight').disabled=false; log(`Owner wallet connected: ${wallet.toBase58()}`);
}
async function preflight(){
  if(!wallet) throw new Error('Connect owner wallet.');
  if(cfg.network!=='mainnet-beta') throw new Error('Owner launch console refuses any network except mainnet-beta.');
  if(cfg.presaleEnabled) throw new Error('Post-launch atomic sale master switch must remain OFF during Mainnet preparation.');
  programId=pk($('#programId').value,'Program ID');
  const treasury=pk($('#treasuryWallet').value,'Treasury wallet'); const founder=pk($('#founderWallet').value,'Founder wallet');
  const meta=$('#metadataUri').value.trim(); if(!/^https:\/\//i.test(meta)) throw new Error('Metadata URI must be HTTPS.');
  const programInfo=await connection.getAccountInfo(programId,'confirmed'); if(!programInfo?.executable) throw new Error('Program ID is not an executable Solana Mainnet program.');
  const metaResp=await fetch(meta,{cache:'no-store'}); if(!metaResp.ok) throw new Error(`Metadata URI is not publicly reachable (${metaResp.status}).`);
  const metadata=await metaResp.json(); if(metadata.name!=='RALYA'||metadata.symbol!=='RLYA') throw new Error('Metadata JSON must identify RALYA / RLYA.');
  const balance=await connection.getBalance(wallet,'confirmed'); if(balance<50_000_000) throw new Error('Owner wallet needs at least 0.05 SOL for account creation and transaction fees.');
  log(`Preflight OK. Executable Mainnet program found. Treasury ${treasury.toBase58()}; founder ${founder.toBase58()}. Public atomic sale switch is OFF.`); $('#launch').disabled=false;
}
async function createMintAndMetadata(){
  setState('mint','RUN','run'); mintKeypair=Keypair.generate(); mint=mintKeypair.publicKey;
  const rent=await connection.getMinimumBalanceForRentExemption(MINT_SIZE); ownerRlyaAta=await getAssociatedTokenAddress(mint,wallet);
  const tx=new Transaction().add(SystemProgram.createAccount({fromPubkey:wallet,newAccountPubkey:mint,space:MINT_SIZE,lamports:rent,programId:TOKEN_PROGRAM_ID}),createInitializeMint2Instruction(mint,9,wallet,null,TOKEN_PROGRAM_ID),createAssociatedTokenAccountInstruction(wallet,ownerRlyaAta,wallet,mint,TOKEN_PROGRAM_ID));
  launchRecord.transactions.createMint=await sendTx(tx,[mintKeypair],'Create RLYA mint'); launchRecord.rlyaMint=mint.toBase58(); launchRecord.ownerStagingTokenAccount=ownerRlyaAta.toBase58(); savePublicProgress();
  const [{createUmi},{walletAdapterIdentity},{mplTokenMetadata,createV1,TokenStandard},{publicKey,percentAmount},bs58mod]=await Promise.all([import('https://esm.sh/@metaplex-foundation/umi-bundle-defaults?bundle'),import('https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters?bundle'),import('https://esm.sh/@metaplex-foundation/mpl-token-metadata?bundle'),import('https://esm.sh/@metaplex-foundation/umi?bundle'),import('https://esm.sh/bs58?bundle')]);
  const walletAdapter={publicKey:wallet,signTransaction:(tx)=>provider.signTransaction(tx),signAllTransactions:provider.signAllTransactions?(txs)=>provider.signAllTransactions(txs):async(txs)=>{const out=[];for(const tx of txs)out.push(await provider.signTransaction(tx));return out;}};
  const umi=createUmi(cfg.rpcEndpoint).use(mplTokenMetadata()).use(walletAdapterIdentity(walletAdapter));
  const md=await createV1(umi,{mint:publicKey(mint.toBase58()),authority:umi.identity,payer:umi.identity,updateAuthority:umi.identity,name:'RALYA',symbol:'RLYA',uri:$('#metadataUri').value.trim(),sellerFeeBasisPoints:percentAmount(0),tokenStandard:TokenStandard.Fungible}).sendAndConfirm(umi);
  const bs58=bs58mod.default||bs58mod; launchRecord.transactions.createMetadata=bs58.encode(md.signature); savePublicProgress(); setState('mint','DONE','ok'); log(`RLYA mint created: ${mint.toBase58()}`);
}
async function mintSupply(){
  setState('supply','RUN','run'); launchRecord.transactions.mintHardCap=await sendTx(new Transaction().add(createMintToCheckedInstruction(mint,ownerRlyaAta,wallet,HARD_CAP,9,[],TOKEN_PROGRAM_ID)),[],'Mint fixed 839M supply');
  const info=await connection.getTokenSupply(mint,'confirmed'); if(BigInt(info.value.amount)!==HARD_CAP) throw new Error('Post-mint supply does not equal 839M.'); savePublicProgress(); setState('supply','DONE','ok');
}
async function initializeProgram(){
  setState('initialize','RUN','run'); const treasury=pk($('#treasuryWallet').value,'Treasury'); const founder=pk($('#founderWallet').value,'Founder');
  [salePda]=PublicKey.findProgramAddressSync([enc.encode('sale'),mint.toBytes()],programId); [saleVaultPda]=PublicKey.findProgramAddressSync([enc.encode('sale_vault'),mint.toBytes()],programId); [stakingBonusVaultPda]=PublicKey.findProgramAddressSync([enc.encode('staking_bonus_vault'),mint.toBytes()],programId); [founderLockPda]=PublicKey.findProgramAddressSync([enc.encode('founder_lock'),mint.toBytes()],programId); [founderVaultPda]=PublicKey.findProgramAddressSync([enc.encode('founder_vault'),mint.toBytes()],programId);
  const ix=new TransactionInstruction({programId,keys:[
    {pubkey:wallet,isSigner:true,isWritable:true},{pubkey:treasury,isSigner:false,isWritable:false},{pubkey:founder,isSigner:false,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:USDC_MINT,isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:true},{pubkey:saleVaultPda,isSigner:false,isWritable:true},{pubkey:stakingBonusVaultPda,isSigner:false,isWritable:true},{pubkey:founderLockPda,isSigner:false,isWritable:true},{pubkey:founderVaultPda,isSigner:false,isWritable:true},{pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}
  ],data:await discriminator('initialize')});
  launchRecord.transactions.initialize=await sendTx(new Transaction().add(ix),[],'Initialize RALYA sale');
  launchRecord.salePda=salePda.toBase58(); launchRecord.saleVault=saleVaultPda.toBase58(); launchRecord.stakingBonusVault=stakingBonusVaultPda.toBase58(); launchRecord.founderLock=founderLockPda.toBase58(); launchRecord.founderVault=founderVaultPda.toBase58(); savePublicProgress(); setState('initialize','DONE','ok');
}
async function createReserveAccount(name,amount,treasury){
  const kp=Keypair.generate(); const rent=await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
  const tx=new Transaction().add(SystemProgram.createAccount({fromPubkey:wallet,newAccountPubkey:kp.publicKey,space:ACCOUNT_SIZE,lamports:rent,programId:TOKEN_PROGRAM_ID}),createInitializeAccountInstruction(kp.publicKey,mint,treasury,TOKEN_PROGRAM_ID),createTransferCheckedInstruction(ownerRlyaAta,mint,kp.publicKey,wallet,amount,9,[],TOKEN_PROGRAM_ID));
  const sig=await sendTx(tx,[kp],`Fund ${name}`); launchRecord.allocations[name]={tokenAccount:kp.publicKey.toBase58(),amountBaseUnits:amount.toString(),transaction:sig}; savePublicProgress();
}
async function allocateAll(){
  setState('allocate','RUN','run'); const treasury=pk($('#treasuryWallet').value,'Treasury');
  launchRecord.transactions.fundLockedVaults=await sendTx(new Transaction().add(
    createTransferCheckedInstruction(ownerRlyaAta,mint,saleVaultPda,wallet,SALE_POOL,9,[],TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(ownerRlyaAta,mint,stakingBonusVaultPda,wallet,STAKING_BONUS_POOL,9,[],TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(ownerRlyaAta,mint,founderVaultPda,wallet,FOUNDER_POOL,9,[],TOKEN_PROGRAM_ID)
  ),[],'Fund 288M sale, 14.4M staking bonus and founder vaults');
  launchRecord.allocations.presale={tokenAccount:saleVaultPda.toBase58(),amountBaseUnits:SALE_POOL.toString()}; launchRecord.allocations.staking_bonus_reserve={tokenAccount:stakingBonusVaultPda.toBase58(),amountBaseUnits:STAKING_BONUS_POOL.toString()}; launchRecord.allocations.founder={tokenAccount:founderVaultPda.toBase58(),amountBaseUnits:FOUNDER_POOL.toString()}; savePublicProgress();
  for(const [name,amount] of POOLS) await createReserveAccount(name,amount,treasury);
  const ownerBalance=await connection.getTokenAccountBalance(ownerRlyaAta,'confirmed'); if(BigInt(ownerBalance.value.amount)!==0n) throw new Error(`Owner staging account should be empty after allocation, but holds ${ownerBalance.value.amount} base units.`); setState('allocate','DONE','ok');
}
async function revokeMint(){
  setState('revoke','RUN','run'); launchRecord.transactions.revokeMintAuthority=await sendTx(new Transaction().add(createSetAuthorityInstruction(mint,wallet,AuthorityType.MintTokens,null,[],TOKEN_PROGRAM_ID)),[],'Revoke RLYA mint authority');
  const mintInfo=await connection.getParsedAccountInfo(mint,'confirmed'); const parsed=mintInfo.value?.data?.parsed?.info; if(parsed?.mintAuthority!==null) throw new Error('Mint authority is still present after revoke transaction.'); if(parsed?.freezeAuthority!==null) throw new Error('Freeze authority is not null.'); savePublicProgress(); setState('revoke','DONE','ok');
}
function fillPublicRecord(){
  launchRecord.adminWallet=wallet.toBase58(); launchRecord.saleProgramId=programId.toBase58(); launchRecord.treasuryWallet=$('#treasuryWallet').value.trim(); launchRecord.founderWallet=$('#founderWallet').value.trim(); launchRecord.hardCap='839000000'; launchRecord.publicPresaleBase='288000000'; launchRecord.stakingBonusReserve='14400000'; launchRecord.stakingBonusPercent='5'; launchRecord.standardReleaseDays=21; launchRecord.stakedReleaseDays=36; launchRecord.decimals=9; launchRecord.usdcMint=USDC_MINT.toBase58(); savePublicProgress(); $('#recordSummary').textContent=`Mint ${launchRecord.rlyaMint} | Program ${launchRecord.saleProgramId} | Sale ${launchRecord.salePda}`; $('#downloadRecord').disabled=false; $('#downloadConfig').disabled=false;
}
async function prepareLaunch(){
  $('#launch').disabled=true; $('#preflight').disabled=true;
  try{ await preflight(); await createMintAndMetadata(); await mintSupply(); await initializeProgram(); await allocateAll(); await revokeMint(); launchPrepared=true; launchRecord.phase='prepared-not-active'; launchRecord.preparedAt=new Date().toISOString(); fillPublicRecord(); setState('activate','READY','run'); setState('record','READY','ok'); $('#activate').disabled=false; log('MAINNET PREPARATION COMPLETE. Exactly 839M exists; 288M sale, 14.4M staking bonus, founder and all other allocations are funded; mint/freeze authority are absent; sale remains DRAFT.'); }
  catch(err){ log(`STOPPED: ${err?.message||err}`); alert(`RALYA preparation stopped before continuing:\n\n${err?.message||err}`); $('#preflight').disabled=false; throw err; }
}
async function activateAndPause(){
  if(!launchPrepared||!mint||!salePda) throw new Error('Prepare and verify the RLYA launch first.');
  if(!confirm('Activate the production sale state and immediately finish PAUSED? This does NOT mark public launch and does NOT start buyer/founder release clocks.')) return;
  $('#activate').disabled=true; setState('activate','RUN','run');
  const activateIx=new TransactionInstruction({programId,keys:[{pubkey:wallet,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:true},{pubkey:saleVaultPda,isSigner:false,isWritable:false},{pubkey:stakingBonusVaultPda,isSigner:false,isWritable:false},{pubkey:founderLockPda,isSigner:false,isWritable:true},{pubkey:founderVaultPda,isSigner:false,isWritable:false}],data:await discriminator('activate')});
  launchRecord.transactions.activate=await sendTx(new Transaction().add(activateIx),[],'Activate RLYA sale'); savePublicProgress();
  const pauseIx=new TransactionInstruction({programId,keys:[{pubkey:wallet,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:true}],data:await discriminator('pause')});
  launchRecord.transactions.pauseAfterActivation=await sendTx(new Transaction().add(pauseIx),[],'Immediately pause RLYA sale'); launchRecord.phase='activated-paused'; launchRecord.activatedAt=new Date().toISOString(); launchRecord.pausedAfterActivation=true; fillPublicRecord(); setState('activate','PAUSED','ok'); setState('record','DONE','ok'); log('ACTIVATION CHECKPOINT COMPLETE. Sale is PAUSED. Public launch DAY 0, buyer release clocks and founder 365-day lock have NOT started; use the dedicated public-launch control only on the real token-launch day.');
}
function downloadRecord(){ downloadFile('RALYA_MAINNET_LAUNCH_RECORD.json',JSON.stringify(launchRecord,null,2)); }
function downloadConfig(){ const values={project:'RALYA',network:'mainnet-beta',launchPhase:launchRecord.phase,presaleEnabled:false,rlyaMint:launchRecord.rlyaMint||'',saleProgramId:launchRecord.saleProgramId||'',salePda:launchRecord.salePda||'',treasuryWallet:launchRecord.treasuryWallet||'',usdcMint:USDC_MINT.toBase58(),publicPresaleBase:288000000,stakingBonusReserve:14400000,stakingBonusBps:500,standardReleaseDays:21,stakedReleaseDays:36}; downloadFile('RALYA_MAINNET_SITE_VALUES.json',JSON.stringify(values,null,2)); log('Downloaded public website values only. The protected site-config.js master switch was NOT replaced.'); }

$('#connectOwner').addEventListener('click',()=>connect().catch(e=>alert(e.message)));
$('#preflight').addEventListener('click',()=>preflight().catch(e=>{log(`Preflight failed: ${e.message}`);alert(e.message)}));
$('#launch').addEventListener('click',()=>prepareLaunch().catch(()=>{}));
$('#activate').addEventListener('click',()=>activateAndPause().catch(e=>{log(`Activation failed: ${e.message}`);alert(e.message)}));
$('#downloadRecord').addEventListener('click',downloadRecord);
$('#downloadConfig').addEventListener('click',downloadConfig);
