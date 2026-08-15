#!/usr/bin/env python3
from pathlib import Path

build = Path('docs/BUILD_STATUS.md')
text = build.read_text(encoding='utf-8')
text = text.replace('- owner-funded 1 USDC atomic Mainnet smoke tool\n', '- legacy owner-funded 1 USDC atomic Mainnet smoke tool retained for later atomic-sale diagnostics; it is not part of the delayed-allocation pre-launch sequence because it would consume presale inventory\n')
text = text.replace('8. complete owner-funded Mainnet smoke verification;\n9. close pre-launch allocations and export the final hashed delivery manifest;\n10. distribute confirmed pre-launch allocations from the official sale vault using idempotent receipt PDAs;\n11. independently verify production supply, allocations, metrics and transaction evidence;\n12. update public production addresses;\n13. announce/publicly launch only when the owner chooses;\n14. later switch from pre-launch allocation mode to the already-built atomic USDC → RLYA settlement mode.\n', '8. independently verify the clean PAUSED production state without consuming presale inventory;\n9. close pre-launch allocations, let in-flight quote windows clear and export the final hashed delivery manifest;\n10. commit the manifest hash and expected totals in the on-chain pre-launch metrics PDA;\n11. distribute confirmed pre-launch allocations from the official sale vault using idempotent receipt PDAs;\n12. verify the on-chain metrics exactly match the committed manifest and verify production supply/allocation evidence;\n13. update public production addresses;\n14. announce/publicly launch only when the owner chooses;\n15. later switch from pre-launch allocation mode to the already-built atomic USDC → RLYA settlement mode.\n')
build.write_text(text, encoding='utf-8')

owner = Path('docs/OWNER_GUIDE.md')
text = owner.read_text(encoding='utf-8')
start = text.find('## Stage 8 — Mainnet smoke verification')
end = text.find('## Stage 9 — final pre-launch RLYA distribution', start)
if start < 0 or end < 0:
    raise SystemExit('owner guide smoke section not found')
replacement = '''## Stage 8 — verify the clean PAUSED production state\n\nFor the delayed-allocation pre-launch model, do **not** run the legacy 1-USDC atomic smoke purchase before buyer distribution. That transaction would consume part of the same 100.68M presale inventory and move the buyer price curve.\n\nInstead, require the clean production verification path:\n\n- exact downloaded Mainnet executable byte/SHA equality;\n- exact 839M production supply;\n- mint authority removed;\n- freeze authority absent;\n- all seven allocation buckets reconciled;\n- founder lock active;\n- sale state PAUSED;\n- production Program ID / mint / PDA / treasury identities verified;\n- `scripts/verify_mainnet_public.mjs` passes in its clean pre-smoke state.\n\nThe old 1-USDC smoke tool remains available only for a later atomic-sale diagnostic when using it cannot steal inventory from pre-launch buyer allocations or silently move their curve. It is hidden in the owner console while `presaleMode` is `prelaunch-allocation`.\n\n'''
text = text[:start] + replacement + text[end:]
text = text.replace('4. run the distribution preflight.\n', '4. run the distribution preflight, which creates or verifies the on-chain commitment to the final manifest hash and expected totals.\n')
text = text.replace('- existing on-chain delivery receipt PDAs.\n', '- existing on-chain delivery receipt PDAs;\n- on-chain pre-launch metrics commitment matches the final manifest SHA-256 and expected totals.\n')
owner.write_text(text, encoding='utf-8')
print('RALYA_SMOKE_DOCS_PATCH=PASS')
