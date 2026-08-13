#!/usr/bin/env bash
set -euo pipefail

# RALYA disposable public Devnet deployment smoke test.
# SAFETY: Devnet only; disposable keys; no production keys or real SOL.
DEVNET_URL="https://api.devnet.solana.com"
MODE="${1:-deploy}"

setup_toolchain() {
  if ! command -v solana >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
  fi
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
  if ! command -v avm >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
  fi
  avm install 1.0.2 >/dev/null
  avm use 1.0.2 >/dev/null
  if ! solana --version | grep -Fq '3.1.10'; then
    sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)" >/dev/null
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
  fi
  solana --version | grep -F '3.1.10'
  anchor --version | grep -F '1.0.2'
}

if [[ "$MODE" == "prepare" ]]; then
  setup_toolchain
  solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/ralya-devnet-payer.json
  solana config set --url "$DEVNET_URL" --keypair /tmp/ralya-devnet-payer.json >/dev/null
  PAYER=$(solana address)
  printf '%s\n' "$PAYER" > /tmp/ralya-devnet-address.txt
  echo "RALYA_DEVNET_TEST_PAYER=$PAYER"
  echo "::notice title=RALYA Devnet test funding address::$PAYER"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '### RALYA Devnet test funding address\n`%s`\n\nThis is a disposable public Devnet address only. No production key or real funds are involved.\n' "$PAYER" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

setup_toolchain
if [[ ! -f /tmp/ralya-devnet-payer.json ]]; then
  echo '[ERROR] Disposable Devnet payer was not prepared in this runner.' >&2
  exit 1
fi
solana config set --url "$DEVNET_URL" --keypair /tmp/ralya-devnet-payer.json >/dev/null
PAYER=$(solana address)
echo "Waiting Devnet payer: $PAYER"

for attempt in 1 2; do
  solana airdrop 2 "$PAYER" --url "$DEVNET_URL" && break || true
  sleep 5
done

funded=0
for attempt in $(seq 1 120); do
  BALANCE=$(solana balance "$PAYER" --url "$DEVNET_URL" | awk '{print $1}')
  echo "Devnet funding check $attempt/120: $BALANCE SOL"
  if python3 - "$BALANCE" <<'PY'
import sys
raise SystemExit(0 if float(sys.argv[1]) >= 3.5 else 1)
PY
  then
    funded=1
    break
  fi
  sleep 15
done
if [[ "$funded" -ne 1 ]]; then
  echo '[ERROR] Devnet test address was not funded to at least 3.5 SOL before the wait window expired.' >&2
  exit 1
fi

echo "Devnet deployment balance: $BALANCE SOL"
solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/rlya-devnet-program.json
PROGRAM_ID=$(solana-keygen pubkey /tmp/rlya-devnet-program.json)
echo "Disposable RLYA Devnet Program ID: $PROGRAM_ID"

python3 - "$PROGRAM_ID" <<'PY'
from pathlib import Path
import re, sys
p = Path('programs/rlya_sale/src/lib.rs')
s = p.read_text()
s, n = re.subn(r'declare_id!\("[^"]+"\);', f'declare_id!("{sys.argv[1]}");', s, count=1)
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
