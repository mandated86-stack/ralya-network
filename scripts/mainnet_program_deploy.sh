#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "${GITHUB_ACTIONS:-}" || -n "${CI:-}" ]]; then
  echo "REFUSING: production program keys must never be generated or used in CI." >&2
  exit 1
fi

for cmd in solana solana-keygen cargo python3 sha256sum cmp; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

SOLANA_VERSION="$(solana --version | awk '{print $2}')"
if [[ "$SOLANA_VERSION" != "3.1.10" ]]; then
  echo "REFUSING: RALYA production build expects Solana CLI 3.1.10; found $SOLANA_VERSION." >&2
  echo "Install/use Solana 3.1.10, then run this script again." >&2
  exit 1
fi

# A normal GitHub Download ZIP is supported. If this is a real git checkout we
# additionally require a clean tree and record its exact commit.
if command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "REFUSING: start from a clean git working tree before generating the production Program ID." >&2
    exit 1
  fi
  BASE_COMMIT="$(git rev-parse HEAD)"
else
  BASE_COMMIT="github-download-zip-main"
  echo "No .git directory detected. Running in GitHub Download ZIP mode."
fi

python3 scripts/audit_source.py || {
  echo "RALYA source/security audit failed. Refusing Mainnet deployment." >&2
  exit 1
}

PATCH_APPLIED=0
KEEP_PATCH=0
DUMP_FILE=""
LIB_PATH="$ROOT/programs/rlya_sale/src/lib.rs"
ANCHOR_PATH="$ROOT/Anchor.toml"
LIB_BACKUP="$(mktemp)"
ANCHOR_BACKUP="$(mktemp)"
cp "$LIB_PATH" "$LIB_BACKUP"
cp "$ANCHOR_PATH" "$ANCHOR_BACKUP"
cleanup() {
  if [[ -n "$DUMP_FILE" ]]; then rm -f "$DUMP_FILE" 2>/dev/null || true; fi
  if [[ "$PATCH_APPLIED" -eq 1 && "$KEEP_PATCH" -eq 0 ]]; then
    cp "$LIB_BACKUP" "$LIB_PATH" 2>/dev/null || true
    cp "$ANCHOR_BACKUP" "$ANCHOR_PATH" 2>/dev/null || true
    echo "Restored the source files to their clean pre-deployment Program ID state. Production keys remain safely local for a retry."
  fi
  rm -f "$LIB_BACKUP" "$ANCHOR_BACKUP" 2>/dev/null || true
}
trap cleanup EXIT

umask 077
SECRETS_DIR="${RALYA_MAINNET_SECRETS_DIR:-$HOME/.config/solana/ralya-mainnet}"
PROGRAM_KEYPAIR="$SECRETS_DIR/rlya-program-keypair.json"
UPGRADE_KEYPAIR="$SECRETS_DIR/rlya-upgrade-authority.json"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

if [[ ! -f "$PROGRAM_KEYPAIR" ]]; then
  echo "Generating permanent RALYA Program ID locally. This key never leaves this computer."
  solana-keygen new --no-bip39-passphrase --force -o "$PROGRAM_KEYPAIR" >/dev/null
fi
if [[ ! -f "$UPGRADE_KEYPAIR" ]]; then
  echo "Generating dedicated RALYA upgrade authority locally."
  solana-keygen new --no-bip39-passphrase --force -o "$UPGRADE_KEYPAIR" >/dev/null
fi
chmod 600 "$PROGRAM_KEYPAIR" "$UPGRADE_KEYPAIR"

PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
UPGRADE_AUTHORITY="$(solana-keygen pubkey "$UPGRADE_KEYPAIR")"
DEPLOYER="$(solana address)"

echo
echo "RALYA MAINNET OWNER CHECKPOINT"
echo "Deployer wallet:        $DEPLOYER"
echo "Permanent Program ID:   $PROGRAM_ID"
echo "Upgrade authority:      $UPGRADE_AUTHORITY"
echo "Private key directory:  $SECRETS_DIR"
echo

echo "IMPORTANT: back up both JSON key files offline. Never upload them to GitHub, cloud storage, chat, or email."
read -r -p "After making an offline backup, type BACKUP-CONFIRMED: " backup
[[ "$backup" == "BACKUP-CONFIRMED" ]] || { echo "Stopped before Mainnet deployment."; exit 1; }

python3 scripts/set_program_id.py "$PROGRAM_ID"
PATCH_APPLIED=1

set +e
cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml 2>&1 | tee /tmp/ralya-mainnet-build.log
BUILD_STATUS=${PIPESTATUS[0]}
set -e
[[ $BUILD_STATUS -eq 0 ]] || exit "$BUILD_STATUS"
if grep -Eq 'Stack offset of [0-9]+ exceeded max offset of 4096' /tmp/ralya-mainnet-build.log; then
  echo "REFUSING: Solana stack-frame limit exceeded." >&2
  exit 1
fi

SO_FILE="$ROOT/target/deploy/rlya_sale.so"
[[ -s "$SO_FILE" ]] || { echo "Missing compiled program: $SO_FILE" >&2; exit 1; }
BYTES="$(wc -c < "$SO_FILE" | tr -d ' ')"
LOCAL_SHA256="$(sha256sum "$SO_FILE" | awk '{print $1}')"

solana config set --url mainnet-beta >/dev/null
RPC="$(solana config get | awk -F': ' '/RPC URL/{print $2}')"
[[ "$RPC" == *"mainnet"* ]] || { echo "REFUSING: Solana CLI is not pointed at Mainnet ($RPC)." >&2; exit 1; }

BALANCE="$(solana balance --lamports | awk '{print $1}')"
RENT_TEXT="$(solana rent "$BYTES")"

echo
echo "Compiled program bytes: $BYTES"
echo "Compiled SHA-256: $LOCAL_SHA256"
echo "Mainnet program rent estimate: $RENT_TEXT"
echo "Deployer balance (lamports): $BALANCE"
echo "Program ID to be deployed: $PROGRAM_ID"
echo "If the wallet is not sufficiently funded, answer anything except DEPLOY-RLYA-MAINNET. The source files will restore automatically and the same permanent local keys can be reused after funding."
echo
read -r -p "Type DEPLOY-RLYA-MAINNET to broadcast the real Mainnet deployment: " confirm
[[ "$confirm" == "DEPLOY-RLYA-MAINNET" ]] || { echo "Stopped before broadcasting."; exit 1; }

DEPLOY_OUTPUT="$(solana program deploy "$SO_FILE" --program-id "$PROGRAM_KEYPAIR" 2>&1 | tee /dev/stderr)"
echo "$DEPLOY_OUTPUT" | grep -F "$PROGRAM_ID" >/dev/null || {
  echo "Deployment output did not contain the expected Program ID. Verify manually before continuing." >&2
  exit 1
}

INFO="$(solana program show "$PROGRAM_ID")"
echo "$INFO"
echo "$INFO" | grep -F "Program Id: $PROGRAM_ID" >/dev/null || { echo "Program verification failed." >&2; exit 1; }

DUMP_FILE="$(mktemp)"
DUMP_OK=0
for attempt in 1 2 3 4 5; do
  if solana program dump "$PROGRAM_ID" "$DUMP_FILE" >/dev/null 2>&1 && [[ -s "$DUMP_FILE" ]]; then
    DUMP_OK=1
    break
  fi
  echo "Waiting for deployed program visibility before byte verification ($attempt/5)..."
  sleep 2
done
[[ $DUMP_OK -eq 1 ]] || { echo "Could not download the deployed Mainnet executable for verification." >&2; exit 1; }
ONCHAIN_SHA256="$(sha256sum "$DUMP_FILE" | awk '{print $1}')"
ONCHAIN_BYTES="$(wc -c < "$DUMP_FILE" | tr -d ' ')"
if ! cmp -s "$SO_FILE" "$DUMP_FILE"; then
  echo "CRITICAL: Mainnet executable does not match the locally built RALYA program." >&2
  echo "Local:   $BYTES bytes $LOCAL_SHA256" >&2
  echo "Onchain: $ONCHAIN_BYTES bytes $ONCHAIN_SHA256" >&2
  exit 1
fi
[[ "$LOCAL_SHA256" == "$ONCHAIN_SHA256" ]] || { echo "CRITICAL: executable SHA-256 mismatch." >&2; exit 1; }
echo "MAINNET_EXECUTABLE_BYTE_MATCH=PASS $LOCAL_SHA256"

solana program set-upgrade-authority "$PROGRAM_ID" --new-upgrade-authority "$UPGRADE_KEYPAIR"
INFO="$(solana program show "$PROGRAM_ID")"
echo "$INFO"
echo "$INFO" | grep -F "Authority: $UPGRADE_AUTHORITY" >/dev/null || { echo "Upgrade-authority verification failed." >&2; exit 1; }

KEEP_PATCH=1

cat > "$ROOT/RALYA_MAINNET_PROGRAM_PUBLIC.txt" <<EOF
RALYA MAINNET PROGRAM DEPLOYMENT
Program ID: $PROGRAM_ID
Upgrade authority: $UPGRADE_AUTHORITY
Deployer public wallet: $DEPLOYER
Source baseline: $BASE_COMMIT
Program bytes: $BYTES
Executable SHA-256: $LOCAL_SHA256
On-chain executable SHA-256: $ONCHAIN_SHA256
Exact downloaded byte match: PASS
Cluster: mainnet-beta
EOF
chmod 644 "$ROOT/RALYA_MAINNET_PROGRAM_PUBLIC.txt"

echo
echo "RALYA_MAINNET_PROGRAM_DEPLOYMENT=PASS"
echo "PUBLIC Program ID: $PROGRAM_ID"
echo "PUBLIC executable SHA-256: $LOCAL_SHA256"
echo "Return only RALYA_MAINNET_PROGRAM_PUBLIC.txt to ChatGPT."
echo "Never send $PROGRAM_KEYPAIR or $UPGRADE_KEYPAIR."
