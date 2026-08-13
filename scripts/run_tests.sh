#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH=.
python3 -m unittest discover -s tests -v
python3 scripts/stress_live_sale.py --operations 50000
python3 scripts/audit_source.py
node --check web/app.js
node --check web/admin/admin.js
node --check web/owner/launch.js
