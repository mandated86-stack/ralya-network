#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
[ -x node_modules/.bin/esbuild ] || { echo "Run npm install before build:web" >&2; exit 1; }

# Keep temporary entry files under the repo so esbuild resolves the pinned
# node_modules tree instead of searching from /tmp.
TMP="$(mktemp -d "$ROOT/.web-build.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

python3 - "$ROOT" "$TMP" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
tmp = Path(sys.argv[2])

replacements = {
    "https://esm.sh/@solana/web3.js@1.98.4?bundle": "@solana/web3.js",
    "https://esm.sh/@solana/spl-token@0.4.14?bundle": "@solana/spl-token",
    "https://esm.sh/@metaplex-foundation/umi-bundle-defaults?bundle": "@metaplex-foundation/umi-bundle-defaults",
    "https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters?bundle": "@metaplex-foundation/umi-signer-wallet-adapters",
    "https://esm.sh/@metaplex-foundation/mpl-token-metadata?bundle": "@metaplex-foundation/mpl-token-metadata",
    "https://esm.sh/@metaplex-foundation/umi?bundle": "@metaplex-foundation/umi",
    "https://esm.sh/bs58?bundle": "bs58",
}

entries = (
    "web/app.js",
    "web/prelaunch.js",
    "web/admin/admin.js",
    "web/owner/launch.js",
    "web/owner/atomic-launch.js",
    "web/owner/smoke.js",
)
for rel in entries:
    src = root / rel
    text = src.read_text(encoding="utf-8")
    for old, new in replacements.items():
        text = text.replace(old, new)
    if "https://esm.sh/" in text:
        raise SystemExit(f"Unpinned runtime esm.sh import remains in {rel}")
    out = tmp / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
PY

./node_modules/.bin/esbuild "$TMP/web/app.js" --bundle --format=esm --platform=browser --target=es2022 --minify --outfile="$TMP/app.bundle.js"
./node_modules/.bin/esbuild "$TMP/web/prelaunch.js" --bundle --format=esm --platform=browser --target=es2022 --minify --outfile="$TMP/prelaunch.bundle.js"
./node_modules/.bin/esbuild "$TMP/web/admin/admin.js" --bundle --format=esm --platform=browser --target=es2022 --minify --outfile="$TMP/admin.bundle.js"
./node_modules/.bin/esbuild "$TMP/web/owner/launch.js" --bundle --format=esm --platform=browser --target=es2022 --minify --splitting=false --outfile="$TMP/launch.bundle.js"
./node_modules/.bin/esbuild "$TMP/web/owner/atomic-launch.js" --bundle --format=esm --platform=browser --target=es2022 --minify --splitting=false --outfile="$TMP/atomic-launch.bundle.js"
./node_modules/.bin/esbuild "$TMP/web/owner/smoke.js" --bundle --format=esm --platform=browser --target=es2022 --minify --splitting=false --outfile="$TMP/smoke.bundle.js"

# Production publish tree keeps the existing HTML paths, but runtime blockchain
# dependencies are self-contained bundles rather than third-party CDN imports.
cp "$TMP/app.bundle.js" web/app.js
cp "$TMP/prelaunch.bundle.js" web/prelaunch.js
cp "$TMP/admin.bundle.js" web/admin/admin.js
cp "$TMP/launch.bundle.js" web/owner/launch.js
cp "$TMP/atomic-launch.bundle.js" web/owner/atomic-launch.js
cp "$TMP/smoke.bundle.js" web/owner/smoke.js

if grep -R -n "https://esm.sh" web/app.js web/prelaunch.js web/admin/admin.js web/owner/launch.js web/owner/atomic-launch.js web/owner/smoke.js; then
  echo "Production bundle still references esm.sh" >&2
  exit 1
fi

node --check web/app.js
node --check web/prelaunch.js
node --check web/admin/admin.js
node --check web/owner/launch.js
node --check web/owner/atomic-launch.js
node --check web/owner/smoke.js
node --check web/owner/status-control.js
node --check web/owner/presale-control.js
node --check web/launch-status.js
node --check web/site-config.js

echo "RALYA_PRODUCTION_WEB_BUNDLE=PASS"
