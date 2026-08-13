#!/usr/bin/env bash
set -euo pipefail

# RALYA local-validator deployment smoke test.
# No external cluster, no real SOL, no production keys.
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
  if solana cluster-version --url "$LOCAL_URL" >/dev/null 2>&1; then
    ready=1
    break
  fi
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

# Only this ephemeral checkout is synchronized to the disposable local Program ID.
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

# Keep raw deployment output private because failed deploys may print an
# intermediate recovery phrase. Report only sanitized errors.
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
echo "RLYA_LOCAL_PROGRAM_ID=$PROGRAM_ID"
