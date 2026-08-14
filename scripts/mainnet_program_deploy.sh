#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "${GITHUB_ACTIONS:-}" || -n "${CI:-}" ]]; then
  echo "REFUSING: production program keys must never be generated or used in CI." >&2
  exit 1
fi

for cmd in solana solana-keygen cargo python3; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

SOLANA_VERSION="$(solana --version | awk '{print $2}')"
if [[ "$SOLANA_VERSION" != "3.1.10" ]]; then
  echo "REFUSING: RALYA production build expects Solana CLI 3.1.10; found $SOLANA_VERSION." >&2
  echo "Install/use Solana 3.1.10, then run this script again." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "REFUSING: start from a clean git working tree before generating the production Program ID." >&2
  exit 1
fi

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

# Build the exact production-ID source with the pinned Solana toolchain.
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

solana config set --url mainnet-beta >/dev/null
RPC="$(solana config get | awk -F': ' '/RPC URL/{print $2}')"
[[ "$RPC" == *"mainnet"* ]] || { echo "REFUSING: Solana CLI is not pointed at Mainnet ($RPC)." >&2; exit 1; }

BALANCE="$(solana balance --lamports | awk '{print $1}')"
RENT_TEXT="$(solana rent "$BYTES")"

echo
echo "Compiled program bytes: $BYTES"
echo "Mainnet program rent estimate: $RENT_TEXT"
echo "Deployer balance (lamports): $BALANCE"
echo "Program ID to be deployed: $PROGRAM_ID"
echo
read -r -p "Type DEPLOY-RLYA-MAINNET to broadcast the real Mainnet deployment: " confirm
[[ "$confirm" == "DEPLOY-RLYA-MAINNET" ]] || { echo "Stopped before broadcasting."; exit 1; }

DEPLOY_OUTPUT="$(solana program deploy "$SO_FILE" --program-id "$PROGRAM_KEYPAIR" 2>&1 | tee /dev/stderr)"
echo "$DEPLOY_OUTPUT" | grep -F "$PROGRAM_ID" >/dev/null || {
  echo "Deployment output did not contain the expected Program ID. Verify manually before continuing." >&2
  exit 1
}

# Move upgrade power away from the transaction-paying deployer immediately.
solana program set-upgrade-authority "$PROGRAM_ID" --new-upgrade-authority "$UPGRADE_KEYPAIR"

INFO="$(solana program show "$PROGRAM_ID")"
echo "$INFO"
echo "$INFO" | grep -F "Program Id: $PROGRAM_ID" >/dev/null || { echo "Program verification failed." >&2; exit 1; }
echo "$INFO" | grep -F "Authority: $UPGRADE_AUTHORITY" >/dev/null || { echo "Upgrade-authority verification failed." >&2; exit 1; }

cat > "$ROOT/RALYA_MAINNET_PROGRAM_PUBLIC.txt" <<EOF
RALYA MAINNET PROGRAM DEPLOYMENT
Program ID: $PROGRAM_ID
Upgrade authority: $UPGRADE_AUTHORITY
Deployer public wallet: $DEPLOYER
Program bytes: $BYTES
Cluster: mainnet-beta
EOF

chmod 644 "$ROOT/RALYA_MAINNET_PROGRAM_PUBLIC.txt"

echo
echo "RALYA_MAINNET_PROGRAM_DEPLOYMENT=PASS"
echo "PUBLIC Program ID: $PROGRAM_ID"
echo "Next: commit only the patched PUBLIC Program ID/source plus RALYA_MAINNET_PROGRAM_PUBLIC.txt."
echo "Never commit $PROGRAM_KEYPAIR or $UPGRADE_KEYPAIR."
