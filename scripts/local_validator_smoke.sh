#!/usr/bin/env bash
set -euo pipefail

# RALYA local-validator integration test.
# SAFETY: localhost only; no external cluster, no real SOL, no production keys.
LOCAL_URL="http://127.0.0.1:8899"

curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm install 1.0.2
avm use 1.0.2

rm -rf /tmp/ralya-test-ledger
solana-test-validator --reset --quiet --ledger /tmp/ralya-test-ledger > /tmp/ralya-validator.log 2>&1 &
VALIDATOR_PID=$!
trap 'kill "$VALIDATOR_PID" 2>/dev/null || true' EXIT

ready=0
for attempt in $(seq 1 40); do
  if solana cluster-version --url "$LOCAL_URL" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo '[ERROR] Local Solana validator did not become ready.' >&2
  tail -n 40 /tmp/ralya-validator.log >&2 || true
  exit 1
fi

solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/ralya-local-payer.json
PAYER=$(solana-keygen pubkey /tmp/ralya-local-payer.json)
solana airdrop 100 "$PAYER" --url "$LOCAL_URL" >/dev/null
BALANCE=$(solana balance "$PAYER" --url "$LOCAL_URL")
echo "Local payer: $PAYER"
echo "Local balance: $BALANCE"

solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/rlya-local-program.json
PROGRAM_ID=$(solana-keygen pubkey /tmp/rlya-local-program.json)
echo "Local RLYA Program ID: $PROGRAM_ID"

python3 - "$PROGRAM_ID" <<'PY'
from pathlib import Path
import re, sys
p = Path('programs/rlya_sale/src/lib.rs')
s = p.read_text()
s, n = re.subn(r'declare_id!\("[^"]+"\);', f'declare_id!("{sys.argv[1]}");', s, count=1)
if n != 1:
    raise SystemExit('Could not replace declare_id for local validator build')
p.write_text(s)
PY

set +e
cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml 2>&1 | tee /tmp/ralya-local-build.log
build_status=${PIPESTATUS[0]}
set -e
if [[ $build_status -ne 0 ]]; then exit "$build_status"; fi
if grep -Eq 'Stack offset of [0-9]+ exceeded max offset of 4096' /tmp/ralya-local-build.log; then
  echo '[ERROR] Solana stack-frame limit exceeded. Local deployment refused.' >&2
  exit 1
fi

PROGRAM_SO="target/deploy/rlya_sale.so"
test -f "$PROGRAM_SO"
PROGRAM_BYTES=$(wc -c < "$PROGRAM_SO")
echo "Program bytes: $PROGRAM_BYTES"

set +e
solana program deploy "$PROGRAM_SO" \
  --program-id /tmp/rlya-local-program.json \
  --keypair /tmp/ralya-local-payer.json \
  --url "$LOCAL_URL" > /tmp/ralya-local-deploy.log 2>&1
deploy_status=$?
set -e
if [[ $deploy_status -ne 0 ]]; then
  echo '[ERROR] Local validator deployment failed; raw deployment output withheld.' >&2
  grep -E '^Error:|insufficient funds|RPC' /tmp/ralya-local-deploy.log || true
  exit "$deploy_status"
fi

SHOW=$(solana program show "$PROGRAM_ID" --url "$LOCAL_URL")
echo "$SHOW"
echo "$SHOW" | grep -F "$PROGRAM_ID" >/dev/null

echo "RALYA_LOCAL_VALIDATOR_DEPLOYMENT=PASS"

# Install test-only JS clients into the ephemeral runner. Nothing is committed.
npm install --no-save --no-package-lock --silent @solana/web3.js@1.98.4 @solana/spl-token@0.4.14

cat > /tmp/ralya_local_integration.mjs <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction,sendAndConfirmTransaction,LAMPORTS_PER_SOL} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,AuthorityType,createMint,getAccount,getMint,getOrCreateAssociatedTokenAccount,mintTo,setAuthority,transferChecked} from '@solana/spl-token';

const RPC='http://127.0.0.1:8899';
if(!RPC.includes('127.0.0.1')) throw new Error('Integration harness refuses non-local RPC');
const PROGRAM_ID=new PublicKey(process.env.RALYA_PROGRAM_ID);
const admin=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/tmp/ralya-local-payer.json','utf8'))));
const c=new Connection(RPC,'confirmed');
const R=1_000_000_000n,U=1_000_000n;
const HARD=839_000_000n*R, PRESALE=100_680_000n*R, FOUNDER=83_900_000n*R;
const saleSeed=Buffer.from('sale'), saleVaultSeed=Buffer.from('sale_vault'), founderLockSeed=Buffer.from('founder_lock'), founderVaultSeed=Buffer.from('founder_vault'), referralSeed=Buffer.from('referral');
const u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b};
const disc=n=>crypto.createHash('sha256').update(`global:${n}`).digest().subarray(0,8);
const m=(p,s=false,w=false)=>({pubkey:p,isSigner:s,isWritable:w});
const ix=(name,keys,...args)=>new TransactionInstruction({programId:PROGRAM_ID,keys,data:Buffer.concat([disc(name),...args.map(u64)])});
async function send(i,extra=[]){return sendAndConfirmTransaction(c,new Transaction().add(i),[admin,...extra.filter(x=>!x.publicKey.equals(admin.publicKey))],{commitment:'confirmed'})}
async function fail(label,fn){try{await fn()}catch{console.log(`GUARD PASS: ${label}`);return}throw new Error(`expected failure: ${label}`)}
async function amt(a){return (await getAccount(c,a)).amount}
function state(buf){const b=Buffer.from(buf),r=o=>b.readBigUInt64LE(o);return{presale:r(168),base:r(176),step:r(184),inc:r(192),bps:r(200),sold:r(208),manual:r(216),raised:r(224),refPaid:r(232),status:b.readUInt8(248)}}
async function getState(s){const a=await c.getAccountInfo(s);assert(a);return state(a.data)}
function price(s){return s.base+(s.sold/s.step)*s.inc}
function ceil(n,d){return(n+d-1n)/d}
function quote(s,usdc){let rem=BigInt(usdc),p=s.sold,out=0n;while(rem>0n){const idx=p/s.step,pr=s.base+idx*s.inc,next=((idx+1n)*s.step<s.presale?(idx+1n)*s.step:s.presale),avail=next-p,cost=ceil(avail*pr,R);if(rem>=cost){out+=avail;p+=avail;rem-=cost}else{const part=rem*R/pr;assert(part>0n);out+=part;p+=part;rem=0n}}return out}

const treasury=Keypair.generate(), founder=Keypair.generate(), buyer=Keypair.generate(), buyer2=Keypair.generate(), referrer=Keypair.generate(), manual=Keypair.generate();
const fundTx=new Transaction();for(const k of [treasury,founder,buyer,buyer2,referrer,manual])fundTx.add(SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:k.publicKey,lamports:3*LAMPORTS_PER_SOL}));
await sendAndConfirmTransaction(c,fundTx,[admin]);
const rlya=await createMint(c,admin,admin.publicKey,null,9), usdc=await createMint(c,admin,admin.publicKey,null,6);
const ar=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,admin.publicKey)).address;
const br=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,buyer.publicKey)).address;
const b2r=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,buyer2.publicKey)).address;
const mr=(await getOrCreateAssociatedTokenAccount(c,admin,rlya,manual.publicKey)).address;
const bu=(await getOrCreateAssociatedTokenAccount(c,admin,usdc,buyer.publicKey)).address;
const b2u=(await getOrCreateAssociatedTokenAccount(c,admin,usdc,buyer2.publicKey)).address;
const tu=(await getOrCreateAssociatedTokenAccount(c,admin,usdc,treasury.publicKey)).address;
const ru=(await getOrCreateAssociatedTokenAccount(c,admin,usdc,referrer.publicKey)).address;
await mintTo(c,admin,rlya,ar,admin,HARD);await mintTo(c,admin,usdc,bu,admin,10_000n*U);await mintTo(c,admin,usdc,b2u,admin,10_000n*U);
const [sale]=PublicKey.findProgramAddressSync([saleSeed,rlya.toBuffer()],PROGRAM_ID),[sv]=PublicKey.findProgramAddressSync([saleVaultSeed,rlya.toBuffer()],PROGRAM_ID),[fl]=PublicKey.findProgramAddressSync([founderLockSeed,rlya.toBuffer()],PROGRAM_ID),[fv]=PublicKey.findProgramAddressSync([founderVaultSeed,rlya.toBuffer()],PROGRAM_ID);
await send(ix('initialize',[m(admin.publicKey,true,true),m(treasury.publicKey),m(founder.publicKey),m(rlya),m(usdc),m(sale,false,true),m(sv,false,true),m(fl,false,true),m(fv,false,true),m(TOKEN_PROGRAM_ID),m(SystemProgram.programId)]));
console.log('INITIALIZE PASS');
const activate=()=>ix('activate',[m(admin.publicKey,true),m(rlya),m(sale,false,true),m(sv),m(fl,false,true),m(fv)]);
await fail('mint authority blocks activation',()=>send(activate()));
await setAuthority(c,admin,rlya,admin,AuthorityType.MintTokens,null);
await fail('unfunded vaults block activation',()=>send(activate()));
await transferChecked(c,admin,ar,rlya,sv,admin,PRESALE,9);await transferChecked(c,admin,ar,rlya,fv,admin,FOUNDER,9);await send(activate());
let s=await getState(sale);assert.equal(s.status,1);console.log('ACTIVATE PASS');
const [bref]=PublicKey.findProgramAddressSync([referralSeed,buyer.publicKey.toBuffer()],PROGRAM_ID);const d=100n*U,q=quote(s,d),bu0=await amt(bu),br0=await amt(br),tu0=await amt(tu);
await send(ix('buy',[m(buyer.publicKey,true,true),m(bref),m(rlya),m(usdc),m(sale,false,true),m(treasury.publicKey),m(bu,false,true),m(tu,false,true),m(br,false,true),m(sv,false,true),m(TOKEN_PROGRAM_ID)],d,q),[buyer]);
assert.equal(await amt(bu),bu0-d);assert.equal(await amt(tu),tu0+d);assert.equal(await amt(br),br0+q);console.log('DIRECT_BUY PASS');
const [a2]=PublicKey.findProgramAddressSync([referralSeed,buyer2.publicKey.toBuffer()],PROGRAM_ID),[arref]=PublicKey.findProgramAddressSync([referralSeed,referrer.publicKey.toBuffer()],PROGRAM_ID);
await send(ix('register_referral',[m(buyer2.publicKey,true,true),m(referrer.publicKey),m(a2,false,true),m(arref),m(SystemProgram.programId)]),[buyer2]);
s=await getState(sale);const gross=500n*U,q2=quote(s,gross),b2u0=await amt(b2u),b2r0=await amt(b2r),tu1=await amt(tu),ru0=await amt(ru);
await send(ix('buy_with_referral',[m(buyer2.publicKey,true,true),m(referrer.publicKey),m(a2),m(rlya),m(usdc),m(sale,false,true),m(treasury.publicKey),m(b2u,false,true),m(tu,false,true),m(ru,false,true),m(b2r,false,true),m(sv,false,true),m(TOKEN_PROGRAM_ID)],gross,q2),[buyer2]);
assert.equal(await amt(b2u),b2u0-gross);assert.equal(await amt(ru),ru0+5n*U);assert.equal(await amt(tu),tu1+495n*U);assert.equal(await amt(b2r),b2r0+q2);console.log('REFERRAL_BUY PASS: 500 -> 5 referrer + 495 treasury');
s=await getState(sale);const p0=price(s),man=2_000_000n*R,mr0=await amt(mr);await send(ix('manual_sale',[m(admin.publicKey,true),m(manual.publicKey),m(rlya),m(sale,false,true),m(sv,false,true),m(mr,false,true),m(TOKEN_PROGRAM_ID)],man));s=await getState(sale);assert.equal(await amt(mr),mr0+man);assert.equal(s.manual,man);assert(price(s)>p0);console.log(`MANUAL_SALE PASS; price ${p0}->${price(s)} micro-USDC`);
const mint=await getMint(c,rlya);assert.equal(mint.supply,HARD);assert.equal(mint.mintAuthority,null);assert.equal(mint.freezeAuthority,null);assert.equal(s.raised,600n*U);assert.equal(s.refPaid,5n*U);assert.equal(s.sold,q+q2+man);
console.log(JSON.stringify({status:'PASS',programId:PROGRAM_ID.toBase58(),rlyaMint:rlya.toBase58(),usdcMint:usdc.toBase58(),sale:sale.toBase58(),totalSold:s.sold.toString(),grossUsdc:s.raised.toString(),referralUsdc:s.refPaid.toString(),priceMicroUsdc:price(s).toString()}));
console.log('RALYA_LOCAL_PROTOCOL_INTEGRATION=PASS');
JS

RALYA_PROGRAM_ID="$PROGRAM_ID" node /tmp/ralya_local_integration.mjs

echo "RLYA_LOCAL_PROGRAM_ID=$PROGRAM_ID"
