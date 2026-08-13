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
const SALE_POOL = 100_680_000n * RLYA_UNIT;
const FOUNDER_POOL = 83_900_000n * RLYA_UNIT;
const POOLS = [
  ['provider_security_incentives', 209_750_000n * RLYA_UNIT],
  ['ecosystem_community', 167_800_000n * RLYA_UNIT],
  ['protocol_treasury', 125_850_000n * RLYA_UNIT],
  ['future_chain_security', 83_900_000n * RLYA_UNIT],
  ['liquidity', 67_120_000n * RLYA_UNIT],
];
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

let provider, wallet, programId, mintKeypair, mint, ownerRlyaAta, salePda, saleVaultPda, founderLockPda, founderVaultPda;
let launchRecord = { project:'RALYA', symbol:'RLYA', network:'mainnet-beta', createdAt:null, transactions:{}, allocations:{} };

function downloadFile(name,text,type='application/json'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

function log(msg){ const el=$('#log'); el.textContent += `\n${new Date().toISOString()}  ${msg}`; el.scrollTop=el.scrollHeight; }
function setState(name, text, cls=''){ const el=document.querySelector(`[data-state="${name}"]`); el.textContent=text; el.className=`state ${cls}`.trim(); }
function getProvider(){ if(window.phantom?.solana?.isPhantom)return window.phantom.solana; if(window.solflare?.isSolflare)return window.solflare; if(window.solana?.connect)return window.solana; return null; }
function pk(value,label){ try{return new PublicKey(String(value).trim())}catch{throw new Error(`${label} is not a valid Solana address.`)} }
function u64le(n){ const b=new Uint8Array(8); new DataView(b.buffer).setBigUint64(0,BigInt(n),true); return b; }
async function discriminator(name){ const h=await crypto.subtle.digest('SHA-256',enc.encode(`global:${name}`)); return new Uint8Array(h).slice(0,8); }
async function dataWithU64(name,...values){ const d=await discriminator(name); const out=new Uint8Array(8+8*values.length); out.set(d); values.forEach((v,i)=>out.set(u64le(v),8+i*8)); return out; }

async function sendTx(tx, extraSigners=[], label='transaction'){
  const latest=await connection.getLatestBlockhash('confirmed');
  tx.feePayer=wallet; tx.recentBlockhash=latest.blockhash;
  if(extraSigners.length) tx.partialSign(...extraSigners);
  let sig;
  if(provider.signTransaction){
    const signed=await provider.signTransaction(tx);
    sig=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:4});
  }else if(provider.signAndSendTransaction){
    const res=await provider.signAndSendTransaction(tx); sig=res.signature || res;
  }else throw new Error('Connected wallet cannot sign Solana transactions.');
  const conf=await connection.confirmTransaction({signature:sig,...latest},'confirmed');
  if(conf.value.err) throw new Error(`${label} failed: ${JSON.stringify(conf.value.err)}`);
  log(`${label} confirmed: ${sig}`);
  return sig;
}

async function connect(){
  provider=getProvider(); if(!provider) throw new Error('Install Phantom or Solflare first.');
  const res=await provider.connect(); wallet=new PublicKey(res?.publicKey || provider.publicKey);
  $('#connectOwner').textContent=`${wallet.toBase58().slice(0,8)}…${wallet.toBase58().slice(-6)}`;
  if(!$('#treasuryWallet').value) $('#treasuryWallet').value=wallet.toBase58();
  if(!$('#founderWallet').value) $('#founderWallet').value=wallet.toBase58();
  $('#preflight').disabled=false; log(`Owner wallet connected: ${wallet.toBase58()}`);
}

async function preflight(){
  if(!wallet) throw new Error('Connect owner wallet.');
  programId=pk($('#programId').value,'Program ID');
  const treasury=pk($('#treasuryWallet').value,'Treasury wallet');
  const founder=pk($('#founderWallet').value,'Founder wallet');
  const meta=$('#metadataUri').value.trim(); if(!/^https:\/\//i.test(meta)) throw new Error('Metadata URI must be HTTPS.');
  const programInfo=await connection.getAccountInfo(programId,'confirmed');
  if(!programInfo?.executable) throw new Error('Program ID is not an executable Solana mainnet program.');
  const metaResp=await fetch(meta,{cache:'no-store'}); if(!metaResp.ok) throw new Error(`Metadata URI is not publicly reachable (${metaResp.status}).`);
  const metadata=await metaResp.json(); if(metadata.name!=='RALYA' || metadata.symbol!=='RLYA') throw new Error('Metadata JSON must identify RALYA / RLYA.');
  const balance=await connection.getBalance(wallet,'confirmed');
  if(balance < 50_000_000) throw new Error('Owner wallet needs more SOL for account creation and transaction fees.');
  log(`Preflight OK. Executable program found. Treasury ${treasury.toBase58()}; founder ${founder.toBase58()}.`);
  $('#launch').disabled=false;
}

async function createMintAndMetadata(){
  setState('mint','RUN','run');
  mintKeypair=Keypair.generate(); mint=mintKeypair.publicKey;
  const rent=await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  ownerRlyaAta=await getAssociatedTokenAddress(mint,wallet);
  const tx=new Transaction().add(
    SystemProgram.createAccount({fromPubkey:wallet,newAccountPubkey:mint,space:MINT_SIZE,lamports:rent,programId:TOKEN_PROGRAM_ID}),
    createInitializeMint2Instruction(mint,9,wallet,null,TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountInstruction(wallet,ownerRlyaAta,wallet,mint,TOKEN_PROGRAM_ID),
  );
  launchRecord.transactions.createMint=await sendTx(tx,[mintKeypair],'Create RLYA mint');

  // Metadata is created before mint authority removal. Wallet-adapter identity means the browser wallet signs it.
  const [{createUmi},{walletAdapterIdentity},{mplTokenMetadata,createV1,TokenStandard},{publicKey,percentAmount},bs58mod] = await Promise.all([
    import('https://esm.sh/@metaplex-foundation/umi-bundle-defaults?bundle'),
    import('https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters?bundle'),
    import('https://esm.sh/@metaplex-foundation/mpl-token-metadata?bundle'),
    import('https://esm.sh/@metaplex-foundation/umi?bundle'),
    import('https://esm.sh/bs58?bundle'),
  ]);
  const walletAdapter={publicKey:wallet,signTransaction:(tx)=>provider.signTransaction(tx),signAllTransactions:provider.signAllTransactions?(txs)=>provider.signAllTransactions(txs):async(txs)=>{const out=[];for(const tx of txs)out.push(await provider.signTransaction(tx));return out;}};
  const umi=createUmi(cfg.rpcEndpoint).use(mplTokenMetadata()).use(walletAdapterIdentity(walletAdapter));
  const md=await createV1(umi,{mint:publicKey(mint.toBase58()),authority:umi.identity,payer:umi.identity,updateAuthority:umi.identity,name:'RALYA',symbol:'RLYA',uri:$('#metadataUri').value.trim(),sellerFeeBasisPoints:percentAmount(0),tokenStandard:TokenStandard.Fungible}).sendAndConfirm(umi);
  const bs58=bs58mod.default || bs58mod;
  launchRecord.transactions.createMetadata=bs58.encode(md.signature);
  launchRecord.rlyaMint=mint.toBase58();
  setState('mint','DONE','ok'); log(`RLYA mint: ${mint.toBase58()}`);
}

async function mintSupply(){
  setState('supply','RUN','run');
  const tx=new Transaction().add(createMintToCheckedInstruction(mint,ownerRlyaAta,wallet,HARD_CAP,9,[],TOKEN_PROGRAM_ID));
  launchRecord.transactions.mintHardCap=await sendTx(tx,[],'Mint fixed 839M supply');
  const info=await connection.getTokenSupply(mint,'confirmed');
  if(BigInt(info.value.amount)!==HARD_CAP) throw new Error('Post-mint supply does not equal 839M.');
  setState('supply','DONE','ok');
}

async function initializeProgram(){
  setState('initialize','RUN','run');
  const treasury=pk($('#treasuryWallet').value,'Treasury'); const founder=pk($('#founderWallet').value,'Founder');
  [salePda]=PublicKey.findProgramAddressSync([enc.encode('sale'),mint.toBytes()],programId);
  [saleVaultPda]=PublicKey.findProgramAddressSync([enc.encode('sale_vault'),mint.toBytes()],programId);
  [founderLockPda]=PublicKey.findProgramAddressSync([enc.encode('founder_lock'),mint.toBytes()],programId);
  [founderVaultPda]=PublicKey.findProgramAddressSync([enc.encode('founder_vault'),mint.toBytes()],programId);
  const ix=new TransactionInstruction({programId,keys:[
    {pubkey:wallet,isSigner:true,isWritable:true},{pubkey:treasury,isSigner:false,isWritable:false},{pubkey:founder,isSigner:false,isWritable:false},
    {pubkey:mint,isSigner:false,isWritable:false},{pubkey:USDC_MINT,isSigner:false,isWritable:false},
    {pubkey:salePda,isSigner:false,isWritable:true},{pubkey:saleVaultPda,isSigner:false,isWritable:true},{pubkey:founderLockPda,isSigner:false,isWritable:true},{pubkey:founderVaultPda,isSigner:false,isWritable:true},
    {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false},
  ],data:await discriminator('initialize')});
  launchRecord.transactions.initialize=await sendTx(new Transaction().add(ix),[],'Initialize RALYA sale');
  launchRecord.salePda=salePda.toBase58(); launchRecord.saleVault=saleVaultPda.toBase58(); launchRecord.founderVault=founderVaultPda.toBase58();
  setState('initialize','DONE','ok');
}

async function createReserveAccount(name,amount,treasury){
  const kp=Keypair.generate(); const rent=await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
  const tx=new Transaction().add(
    SystemProgram.createAccount({fromPubkey:wallet,newAccountPubkey:kp.publicKey,space:ACCOUNT_SIZE,lamports:rent,programId:TOKEN_PROGRAM_ID}),
    createInitializeAccountInstruction(kp.publicKey,mint,treasury,TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(ownerRlyaAta,mint,kp.publicKey,wallet,amount,9,[],TOKEN_PROGRAM_ID),
  );
  const sig=await sendTx(tx,[kp],`Fund ${name}`);
  launchRecord.allocations[name]={tokenAccount:kp.publicKey.toBase58(),amountBaseUnits:amount.toString(),transaction:sig};
}

async function allocateAll(){
  setState('allocate','RUN','run'); const treasury=pk($('#treasuryWallet').value,'Treasury');
  launchRecord.transactions.fundLockedVaults=await sendTx(new Transaction().add(
    createTransferCheckedInstruction(ownerRlyaAta,mint,saleVaultPda,wallet,SALE_POOL,9,[],TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(ownerRlyaAta,mint,founderVaultPda,wallet,FOUNDER_POOL,9,[],TOKEN_PROGRAM_ID),
  ),[],'Fund public-sale and founder vaults');
  launchRecord.allocations.presale={tokenAccount:saleVaultPda.toBase58(),amountBaseUnits:SALE_POOL.toString()};
  launchRecord.allocations.founder={tokenAccount:founderVaultPda.toBase58(),amountBaseUnits:FOUNDER_POOL.toString()};
  for(const [name,amount] of POOLS) await createReserveAccount(name,amount,treasury);
  const ownerBalance=await connection.getTokenAccountBalance(ownerRlyaAta,'confirmed');
  if(BigInt(ownerBalance.value.amount)!==0n) throw new Error(`Owner staging account should be empty after allocation, but holds ${ownerBalance.value.amount} base units.`);
  setState('allocate','DONE','ok');
}

async function revokeMint(){
  setState('revoke','RUN','run');
  const tx=new Transaction().add(createSetAuthorityInstruction(mint,wallet,AuthorityType.MintTokens,null,[],TOKEN_PROGRAM_ID));
  launchRecord.transactions.revokeMintAuthority=await sendTx(tx,[],'Revoke RLYA mint authority');
  const mintInfo=await connection.getParsedAccountInfo(mint,'confirmed');
  const parsed=mintInfo.value?.data?.parsed?.info;
  if(parsed?.mintAuthority!==null) throw new Error('Mint authority is still present after revoke transaction.');
  if(parsed?.freezeAuthority!==null) throw new Error('Freeze authority is not null.');
  setState('revoke','DONE','ok');
}

async function activateSale(){
  setState('activate','RUN','run');
  const ix=new TransactionInstruction({programId,keys:[
    {pubkey:wallet,isSigner:true,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:salePda,isSigner:false,isWritable:true},
    {pubkey:saleVaultPda,isSigner:false,isWritable:false},{pubkey:founderLockPda,isSigner:false,isWritable:true},{pubkey:founderVaultPda,isSigner:false,isWritable:false},
  ],data:await discriminator('activate')});
  launchRecord.transactions.activate=await sendTx(new Transaction().add(ix),[],'Activate RLYA public sale');
  launchRecord.createdAt=new Date().toISOString(); launchRecord.saleProgramId=programId.toBase58(); launchRecord.treasuryWallet=$('#treasuryWallet').value.trim(); launchRecord.founderWallet=$('#founderWallet').value.trim();
  launchRecord.hardCap='839000000'; launchRecord.decimals=9; launchRecord.usdcMint=USDC_MINT.toBase58();
  setState('activate','DONE','ok'); setState('record','READY','ok');
  $('#downloadRecord').disabled=false; $('#downloadConfig').disabled=false;
  $('#recordSummary').textContent=`Mint ${launchRecord.rlyaMint} | Program ${launchRecord.saleProgramId} | Sale ${launchRecord.salePda}`;
}

async function launch(){
  $('#launch').disabled=true; $('#preflight').disabled=true;
  try{
    await preflight(); await createMintAndMetadata(); await mintSupply(); await initializeProgram(); await allocateAll(); await revokeMint(); await activateSale();
    setState('record','DONE','ok'); log('RLYA launch sequence completed. Download and publish the launch record before promoting the sale.');
  }catch(err){ log(`STOPPED: ${err?.message||err}`); alert(`RALYA launch stopped before continuing:\n\n${err?.message||err}`); $('#preflight').disabled=false; throw err; }
}

function downloadRecord(){ downloadFile('RALYA_MAINNET_LAUNCH_RECORD.json',JSON.stringify(launchRecord,null,2)); }
function downloadConfig(){
  const out={...cfg,rlyaMint:launchRecord.rlyaMint,saleProgramId:launchRecord.saleProgramId,treasuryWallet:launchRecord.treasuryWallet,projectUrl:'https://ralya-network.netlify.app',metadataUri:'https://ralya-network.netlify.app/token-metadata.json'};
  downloadFile('site-config.js',`window.RALYA_CONFIG = ${JSON.stringify(out,null,2)};\n`,'text/javascript');
}

function generateProgramKeypair(){
  const kp=Keypair.generate();
  const secret=JSON.stringify(Array.from(kp.secretKey));
  downloadFile('rlya_sale-keypair.json',secret);
  $('#programId').value=kp.publicKey.toBase58();
  log(`Final program address generated locally: ${kp.publicKey.toBase58()}. Keep rlya_sale-keypair.json private and backed up. Share only the public address.`);
}

$('#generateProgramKey').addEventListener('click',generateProgramKeypair);
$('#connectOwner').addEventListener('click',()=>connect().catch(e=>alert(e.message)));
$('#preflight').addEventListener('click',()=>preflight().catch(e=>{log(`Preflight failed: ${e.message}`);alert(e.message)}));
$('#launch').addEventListener('click',()=>launch().catch(()=>{}));
$('#downloadRecord').addEventListener('click',downloadRecord); $('#downloadConfig').addEventListener('click',downloadConfig);
