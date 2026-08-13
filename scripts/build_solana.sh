#!/usr/bin/env bash
set -euo pipefail
# Pinned public compiler gate for RALYA 0.5.0.
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
rustc --version
solana --version
anchor --version
anchor --version | grep -F '1.0.2'
solana --version | grep -F '3.1.10'
cargo build-sbf --manifest-path programs/rlya_sale/Cargo.toml
