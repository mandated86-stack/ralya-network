#!/usr/bin/env python3
from pathlib import Path

changed = []
for path in Path('web').rglob('*'):
    if not path.is_file() or path.suffix.lower() not in {'.html', '.js'}:
        continue
    text = path.read_text(encoding='utf-8', errors='ignore')
    new = text.replace('RALYA_Whitepaper_v1.1.pdf', 'RALYA_Whitepaper_v1.2.html')
    new = new.replace("whitepaperPdf: 'RALYA_Whitepaper_v1.2.html'", "whitepaperUrl: 'RALYA_Whitepaper_v1.2.html'")
    if new != text:
        path.write_text(new, encoding='utf-8')
        changed.append(str(path))
print('RALYA_WHITEPAPER_LINK_PATCH=PASS')
for item in changed:
    print(item)
