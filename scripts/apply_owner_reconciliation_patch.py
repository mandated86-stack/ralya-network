#!/usr/bin/env python3
from pathlib import Path

path = Path('netlify/functions/presale-owner.mts')
text = path.read_text(encoding='utf-8')
if 'Wait for active buyer quotes to clear before recording a private allocation.' in text:
    print('RALYA_OWNER_RECONCILIATION_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

old = '''        const state = await computeState(s, true);\n        const start = state.effectiveProgressBase;\n        const end = start + amount;\n'''
new = '''        const state = await computeState(s, true);\n        if (state.reservedBase > 0n) throw new Error('Wait for active buyer quotes to clear before recording a private allocation. Pause allocation access if you need a clean private-allocation checkpoint.');\n        const start = state.totalAllocatedBase;\n        const end = start + amount;\n'''
if old not in text:
    raise SystemExit('manual allocation state marker not found')
text = text.replace(old, new, 1)

old = '''    if (op === 'manifest') {\n      const manifest = await makeManifest(s);\n'''
new = '''    if (op === 'manifest') {\n      const state = await computeState(s, true);\n      if (state.control.access !== 'closed') throw new Error('Close pre-launch allocation access before exporting the final delivery manifest.');\n      if (state.reservedBase > 0n) throw new Error('Active buyer quote windows are still clearing. Export the final manifest after all reservations expire or confirm.');\n      const manifest = await makeManifest(s);\n'''
if old not in text:
    raise SystemExit('manifest marker not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('RALYA_OWNER_RECONCILIATION_PATCH=APPLIED')
