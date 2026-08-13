#!/usr/bin/env bash
set -euo pipefail

# RALYA disposable Devnet deployment smoke test.
# This script never targets mainnet and never uses production keys or funds.
# Triggered after the clean stack-safe SBF build milestone.
DEVNET_URL="https://api.devnet.solana.com"

# Install the same public toolchain used by the compiler gate.
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm install 1.0.2
avm use 1.0.2

solana config set --url "$DEVNET_URL"
solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/ralya-devnet-payer.json
solana config set --keypair /tmp/ralya-devnet-payer.json
PAYER=$(solana address)
echo "Disposable Devnet payer: $PAYER"

# Devnet SOL has no monetary value. Public faucets can be rate-limited, so retry.
for attempt in 1 2 3 4; do
  solana airdrop 2 "$PAYER" --url "$DEVNET_URL" && break || true
  sleep 10
done
solana balance "$PAYER" --url "$DEVNET_URL"

# A disposable program key is generated inside this runner only.
solana-keygen new --no-bip39-passphrase --silent --force -o /tmp/rlya-devnet-program.json
PROGRAM_ID=$(solana-keygen pubkey /tmp/rlya-devnet-program.json)
echo "Disposable RLYA Devnet Program ID: $PROGRAM_ID"

# The production source keeps its placeholder until an owner-controlled key exists.
# For this disposable smoke run only, compile the bytecode with the temporary ID.
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
if [[ $build_status -ne 0 ]]; then
  exit "$build_status"
fi
if grep -Eq 'Stack offset of [0-9]+ exceeded max offset of 4096' /tmp/ralya-devnet-build.log; then
  echo '[ERROR] Solana stack-frame limit exceeded. Devnet deployment refused.' >&2
  exit 1
fi

PROGRAM_SO="target/deploy/rlya_sale.so"
test -f "$PROGRAM_SO"
echo "Program bytes: $(wc -c < "$PROGRAM_SO")"

solana program deploy "$PROGRAM_SO" \
  --program-id /tmp/rlya-devnet-program.json \
  --keypair /tmp/ralya-devnet-payer.json \
  --url "$DEVNET_URL"

solana program show "$PROGRAM_ID" --url "$DEVNET_URL"
echo "RLYA_DEVNET_PROGRAM_ID=$PROGRAM_ID"
echo "RLYA_DEVNET_EXPLORER=https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
