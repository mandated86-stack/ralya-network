#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[[ -n "${GITHUB_ACTIONS:-}" ]] || { echo "REFUSING: this helper is only for the isolated phone-first GitHub runner." >&2; exit 1; }
OWNER_FILE="$ROOT/mainnet/OWNER_WALLET.txt"
[[ -f "$OWNER_FILE" ]] || { echo "Missing mainnet/OWNER_WALLET.txt" >&2; exit 1; }
OWNER="$(tr -d '[:space:]' < "$OWNER_FILE")"
[[ "$OWNER" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]] || { echo "Invalid Solana owner public key." >&2; exit 1; }

export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

install_tools() {
  curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
  sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
  avm install 1.0.2
  avm use 1.0.2
  solana --version | grep -F '3.1.10'
  anchor --version | grep -F '1.0.2'
}

prepare() {
  install_tools
  python3 scripts/audit_source.py
  umask 077
  solana-keygen new --no-bip39-passphrase --force -o /tmp/rlya-mainnet-program.json >/dev/null
  solana-keygen new --no-bip39-passphrase --force -o /tmp/rlya-mainnet-payer.json >/dev/null
  PROGRAM_ID="$(solana-keygen pubkey /tmp/rlya-mainnet-program.json)"
  PAYER="$(solana-keygen pubkey /tmp/rlya-mainnet-payer.json)"
  python3 scripts/set_program_id.py "$PROGRAM_ID"
  set +e
  cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml 2>&1 | tee /tmp/rlya-mainnet-phone-build.log
  status=${PIPESTATUS[0]}
  set -e
  [[ $status -eq 0 ]] || exit "$status"
  ! grep -Eq 'Stack offset of [0-9]+ exceeded max offset of 4096' /tmp/rlya-mainnet-phone-build.log
  SO="$ROOT/target/deploy/rlya_sale.so"
  [[ -s "$SO" ]]
  BYTES="$(wc -c < "$SO" | tr -d ' ')"
  SHA="$(sha256sum "$SO" | awk '{print $1}')"
  solana config set --url mainnet-beta --keypair /tmp/rlya-mainnet-payer.json >/dev/null
  RENT_TEXT="$(solana rent "$BYTES")"
  RENT_SOL="$(printf '%s\n' "$RENT_TEXT" | awk '/SOL/{for(i=1;i<=NF;i++) if($i=="SOL") print $(i-1)}' | tail -1)"
  TARGET_SOL="$(python3 - "$RENT_SOL" <<'PY'
import sys
print(f"{float(sys.argv[1])+0.10:.9f}")
PY
)"
  cat > /tmp/rlya-mainnet-funding.txt <<EOF
RALYA MAINNET PHONE DEPLOYMENT FUNDING
Owner / final upgrade authority: $OWNER
Temporary deployment payer: $PAYER
Permanent Program ID being built: $PROGRAM_ID
Program bytes: $BYTES
SBF SHA-256: $SHA
Program rent estimate SOL: $RENT_SOL
Recommended temporary payer funding SOL: $TARGET_SOL
Cluster: mainnet-beta
EOF
  chmod 644 /tmp/rlya-mainnet-funding.txt
  printf '%s\n' "$PROGRAM_ID" > /tmp/rlya-mainnet-program-id.txt
  printf '%s\n' "$PAYER" > /tmp/rlya-mainnet-payer-address.txt
  printf '%s\n' "$TARGET_SOL" > /tmp/rlya-mainnet-target-sol.txt
  echo "RALYA_MAINNET_PHONE_PREPARE=PASS"
  cat /tmp/rlya-mainnet-funding.txt
}

wait_deploy() {
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
  PROGRAM_ID="$(cat /tmp/rlya-mainnet-program-id.txt)"
  PAYER="$(cat /tmp/rlya-mainnet-payer-address.txt)"
  TARGET_SOL="$(cat /tmp/rlya-mainnet-target-sol.txt)"
  SO="$ROOT/target/deploy/rlya_sale.so"
  LOCAL_SHA="$(sha256sum "$SO" | awk '{print $1}')"
  solana config set --url mainnet-beta --keypair /tmp/rlya-mainnet-payer.json >/dev/null

  target_lamports="$(python3 - "$TARGET_SOL" <<'PY'
import sys
print(int(float(sys.argv[1])*1_000_000_000))
PY
)"
  echo "Waiting for at least $TARGET_SOL SOL at $PAYER"
  funded=0
  for i in $(seq 1 720); do
    bal="$(solana balance "$PAYER" --lamports 2>/dev/null | awk '{print $1}' || echo 0)"
    bal="${bal:-0}"
    if [[ "$bal" =~ ^[0-9]+$ ]] && (( bal >= target_lamports )); then funded=1; echo "Funding detected: $bal lamports"; break; fi
    sleep 10
  done
  if [[ $funded -ne 1 ]]; then
    echo "Funding target not reached. Attempting to sweep any received SOL back to owner."
    solana transfer "$OWNER" ALL --allow-unfunded-recipient --keypair /tmp/rlya-mainnet-payer.json >/dev/null 2>&1 || true
    exit 1
  fi

  deploy_ok=0
  for attempt in 1 2 3; do
    echo "Mainnet deploy attempt $attempt/3"
    if solana program deploy "$SO" --program-id /tmp/rlya-mainnet-program.json --keypair /tmp/rlya-mainnet-payer.json; then deploy_ok=1; break; fi
    sleep $((attempt*5))
  done
  [[ $deploy_ok -eq 1 ]] || { echo "Deployment failed after retries; attempting refund sweep."; solana transfer "$OWNER" ALL --allow-unfunded-recipient --keypair /tmp/rlya-mainnet-payer.json >/dev/null 2>&1 || true; exit 1; }

  INFO="$(solana program show "$PROGRAM_ID")"
  printf '%s\n' "$INFO"
  printf '%s\n' "$INFO" | grep -F "Program Id: $PROGRAM_ID" >/dev/null
  printf '%s\n' "$INFO" | grep -F "Authority: $PAYER" >/dev/null

  DUMP=/tmp/rlya-mainnet-onchain.so
  visible=0
  for i in $(seq 1 12); do
    if solana program dump "$PROGRAM_ID" "$DUMP" >/dev/null 2>&1 && [[ -s "$DUMP" ]]; then visible=1; break; fi
    sleep 3
  done
  [[ $visible -eq 1 ]]
  cmp -s "$SO" "$DUMP" || { echo "CRITICAL: deployed executable byte mismatch." >&2; exit 1; }
  ONCHAIN_SHA="$(sha256sum "$DUMP" | awk '{print $1}')"
  [[ "$LOCAL_SHA" == "$ONCHAIN_SHA" ]]
  echo "MAINNET_EXECUTABLE_BYTE_MATCH=PASS $LOCAL_SHA"

  solana program set-upgrade-authority "$PROGRAM_ID" --new-upgrade-authority "$OWNER" --keypair /tmp/rlya-mainnet-payer.json
  INFO2="$(solana program show "$PROGRAM_ID")"
  printf '%s\n' "$INFO2"
  printf '%s\n' "$INFO2" | grep -F "Authority: $OWNER" >/dev/null

  SLOT="$(printf '%s\n' "$INFO2" | awk -F': ' '/Last Deployed In Slot/{print $2}')"
  BEFORE_SWEEP="$(solana balance "$PAYER" --lamports | awk '{print $1}')"
  solana transfer "$OWNER" ALL --allow-unfunded-recipient --keypair /tmp/rlya-mainnet-payer.json >/dev/null || true
  AFTER_SWEEP="$(solana balance "$PAYER" --lamports 2>/dev/null | awk '{print $1}' || echo 0)"

  cat > /tmp/RALYA_MAINNET_PROGRAM_PUBLIC.txt <<EOF
RALYA MAINNET PROGRAM DEPLOYMENT
Program ID: $PROGRAM_ID
Upgrade authority: $OWNER
Temporary deployment payer: $PAYER
Payer balance before final sweep (lamports): $BEFORE_SWEEP
Payer balance after final sweep (lamports): $AFTER_SWEEP
Program bytes: $(wc -c < "$SO" | tr -d ' ')
Executable SHA-256: $LOCAL_SHA
On-chain executable SHA-256: $ONCHAIN_SHA
Exact downloaded byte match: PASS
Last deployed slot: $SLOT
Cluster: mainnet-beta
Source commit before ephemeral Program-ID patch: ${GITHUB_SHA:-unknown}
EOF
  chmod 644 /tmp/RALYA_MAINNET_PROGRAM_PUBLIC.txt
  echo "RALYA_MAINNET_PROGRAM_DEPLOYMENT=PASS"
  cat /tmp/RALYA_MAINNET_PROGRAM_PUBLIC.txt
}

case "${1:-}" in
  prepare) prepare ;;
  wait-deploy) wait_deploy ;;
  *) echo "usage: $0 prepare|wait-deploy" >&2; exit 2 ;;
esac
