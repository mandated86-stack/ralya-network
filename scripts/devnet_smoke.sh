#!/usr/bin/env bash
set -euo pipefail

# RALYA disposable Devnet deployment smoke test.
# This script never targets mainnet and never uses production keys or funds.
DEVNET_URL="https://api.devnet.solana.com"

curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm install 1.0.2
avm use 1.0.2

solana config set --url "$DEVNET_URL"
solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/ralya-devnet-payer.json
solana config set --keypair /tmp/ralya-devnet-payer.json
PAYER=$(solana address)
echo "RALYA_DEVNET_FAUCET_ADDRESS=$PAYER"

for attempt in 1 2 3 4; do
  solana airdrop 2 "$PAYER" --url "$DEVNET_URL" && break || true
  sleep 8
done

# GitHub-hosted runners share public IPs and can hit the faucet rate limit.
# Keep this disposable job alive for up to 12 minutes so the public address can
# be funded from the official web faucet without exposing any private key.
for check in $(seq 1 24); do
  BALANCE=$(solana balance "$PAYER" --url "$DEVNET_URL" | awk '{print $1}')
  echo "Devnet funding check $check/24: $BALANCE SOL"
  if python3 - "$BALANCE" <<'PY'
import sys
raise SystemExit(0 if float(sys.argv[1]) >= 3.0 else 1)
PY
  then
    break
  fi
  if [[ "$check" -lt 24 ]]; then sleep 30; fi
done

BALANCE=$(solana balance "$PAYER" --url "$DEVNET_URL" | awk '{print $1}')
if ! python3 - "$BALANCE" <<'PY'
import sys
raise SystemExit(0 if float(sys.argv[1]) >= 3.0 else 1)
PY
then
  echo '[INFO] No external Devnet funding arrived in the wait window. Falling back to a fresh local validator.'
  exec bash scripts/local_validator_smoke.sh
fi

solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/rlya-devnet-program.json
PROGRAM_ID=$(solana-keygen pubkey /tmp/rlya-devnet-program.json)
echo "Disposable RLYA Devnet Program ID: $PROGRAM_ID"

python3 - "$PROGRAM_ID" <<'PY'
from pathlib import Path
import re, sys
p = Path('programs/rlya_sale/src/lib.rs')
s = p.read_text()
program_id = sys.argv[1]
s, n = re.subn(r'declare_id!\("[^"]+"\);', f'declare_id!("{program_id}");', s, count=1)
if n != 1:
    raise SystemExit('Could not replace declare_id for disposable Devnet build')
p.write_text(s)
PY

set +e
cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml 2>&1 | tee /tmp/ralya-devnet-build.log
build_status=${PIPESTATUS[0]}
set -e
if [[ $build_status -ne 0 ]]; then exit "$build_status"; fi
if grep -Eq 'Stack offset of [0-9]+ exceeded max offset of 4096' /tmp/ralya-devnet-build.log; then
  echo '[ERROR] Solana stack-frame limit exceeded. Devnet deployment refused.' >&2
  exit 1
fi

PROGRAM_SO="target/deploy/rlya_sale.so"
test -f "$PROGRAM_SO"
echo "Program bytes: $(wc -c < "$PROGRAM_SO")"

# Failed deploys can print an intermediate recovery phrase. Keep raw deploy
# output private in the ephemeral runner and publish only sanitized status.
set +e
solana program deploy "$PROGRAM_SO" \
  --program-id /tmp/rlya-devnet-program.json \
  --keypair /tmp/ralya-devnet-payer.json \
  --url "$DEVNET_URL" > /tmp/ralya-devnet-deploy.log 2>&1
deploy_status=$?
set -e
if [[ $deploy_status -ne 0 ]]; then
  echo '[ERROR] Devnet deployment failed. Raw deploy output withheld.' >&2
  grep -E '^Error:|insufficient funds|rate limit|RPC' /tmp/ralya-devnet-deploy.log || true
  exit "$deploy_status"
fi

solana program show "$PROGRAM_ID" --url "$DEVNET_URL"
echo "RALYA_DEVNET_DEPLOYMENT=PASS"
echo "RLYA_DEVNET_PROGRAM_ID=$PROGRAM_ID"
echo "RLYA_DEVNET_EXPLORER=https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
