#!/usr/bin/env bash
set -euo pipefail
# Dedicated public compiler gate for RALYA 0.6.0 Mainnet preparation.
# Anchor 1.0.x recommends Solana 3.1.10. The quick installer supplies the
# supporting toolchain, then the exact Agave/Solana release is pinned below.
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm install 1.0.2
avm use 1.0.2
rustc --version
solana --version
anchor --version
solana --version | grep -F '3.1.10'
anchor --version | grep -F '1.0.2'
# The owner deployment scripts rely on the documented CLI config keypair path;
# fail CI if the pinned CLI ever stops accepting this option.
solana config set --help | grep -F -- '--keypair'
set +e
cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml 2>&1 | tee /tmp/ralya-sbf-build.log
build_status=${PIPESTATUS[0]}
set -e
if [[ $build_status -ne 0 ]]; then
  exit "$build_status"
fi
if grep -Eq 'Stack offset of [0-9]+ exceeded max offset of 4096' /tmp/ralya-sbf-build.log; then
  echo '[ERROR] Solana stack-frame limit exceeded. Refusing a green build.' >&2
  exit 1
fi
