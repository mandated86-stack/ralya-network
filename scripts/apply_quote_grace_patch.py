#!/usr/bin/env python3
from pathlib import Path

path = Path('netlify/functions/_shared/presale-core.mts')
text = path.read_text(encoding='utf-8')

if 'QUOTE_CONFIRMATION_GRACE_MS' in text:
    print('RALYA_QUOTE_GRACE_PATCH=ALREADY_APPLIED')
    raise SystemExit(0)

text = text.replace(
    'export const QUOTE_TTL_MS = 5 * 60 * 1000;\n',
    'export const QUOTE_TTL_MS = 5 * 60 * 1000;\nexport const QUOTE_CONFIRMATION_GRACE_MS = 2 * 60 * 1000;\n',
    1,
)
text = text.replace(
    "return quotes.filter(q => q?.status === 'active' && Number(q?.expiresAtMs || 0) > now);",
    "return quotes.filter(q => q?.status === 'active' && Number(q?.expiresAtMs || 0) + QUOTE_CONFIRMATION_GRACE_MS > now);",
    1,
)
path.write_text(text, encoding='utf-8')
print('RALYA_QUOTE_GRACE_PATCH=APPLIED')
