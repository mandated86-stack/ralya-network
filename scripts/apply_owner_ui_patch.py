#!/usr/bin/env python3
from pathlib import Path

path = Path('web/owner/presale-control.js')
text = path.read_text(encoding='utf-8')
if 'Atomic 1-USDC smoke is intentionally deferred' in text:
    print('RALYA_OWNER_UI_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

text = text.replace('class="owner-grid" style="grid-template-columns:repeat(4,1fr);margin:14px 0"', 'class="owner-grid" style="margin:14px 0"', 1)
text = text.replace('This does not let you type a replacement public price. The RLYA amount is added to the same 100.68M pool and immediately advances the same fixed price curve.', 'This does not let you type a replacement public price. The RLYA amount is added to the same 100.68M pool and immediately advances the same fixed price curve. If a buyer has a live locked quote, wait for that quote window to confirm or clear before recording the private allocation.', 1)
text = text.replace('Download delivery manifest</button>', 'Download final delivery manifest</button>', 1)

marker = "  if (!location.pathname.includes('/owner/')) return;\n"
insert = marker + "  if (cfg.presaleMode === 'prelaunch-allocation') {\n    const smokeButton = document.getElementById('runSmoke');\n    const smokeCard = smokeButton?.closest('.owner-card');\n    if (smokeCard) {\n      smokeCard.hidden = true;\n      smokeCard.dataset.rlyaDeferred = 'prelaunch-allocation';\n    }\n    console.info('Atomic 1-USDC smoke is intentionally deferred during pre-launch allocation mode so it cannot consume buyer presale inventory or move the buyer curve.');\n  }\n"
if marker not in text:
    raise SystemExit('owner install marker not found')
text = text.replace(marker, insert, 1)
path.write_text(text, encoding='utf-8')
print('RALYA_OWNER_UI_PATCH=APPLIED')
