#!/usr/bin/env bash
set -euo pipefail
# Dedicated public compiler gate for RALYA 0.5.0.
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
avm install 1.0.2
avm use 1.0.2
rustc --version
solana --version
anchor --version
anchor --version | grep -F '1.0.2'
cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml
