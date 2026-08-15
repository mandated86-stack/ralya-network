#!/usr/bin/env python3
from pathlib import Path

site=Path('web/site-config.js')
s=site.read_text(encoding='utf-8')
if "data-rlya-owner-treasury" not in s:
    old="""      loadScript('/owner/presale-control.js', 'data-rlya-owner-presale');
      loadScript('/owner/prelaunch-delivery.js', 'data-rlya-owner-delivery');
"""
    new="""      loadScript('/owner/presale-control.js', 'data-rlya-owner-presale');
      loadScript('/owner/treasury-prep.js', 'data-rlya-owner-treasury');
      loadScript('/owner/prelaunch-delivery.js', 'data-rlya-owner-delivery');
"""
    if old not in s: raise SystemExit('site-config owner loader marker missing')
    s=s.replace(old,new,1);site.write_text(s,encoding='utf-8')

build=Path('scripts/build_web_prod.sh')
s=build.read_text(encoding='utf-8')
if 'treasury-prep.bundle.js' not in s:
    s=s.replace('    "web/owner/prelaunch-delivery.js",\n', '    "web/owner/prelaunch-delivery.js",\n    "web/owner/treasury-prep.js",\n',1)
    marker='./node_modules/.bin/esbuild "$TMP/web/owner/prelaunch-delivery.js" --bundle --format=esm --platform=browser --target=es2022 --minify --splitting=false --outfile="$TMP/prelaunch-delivery.bundle.js"\n'
    if marker not in s: raise SystemExit('build esbuild marker missing')
    s=s.replace(marker,marker+'./node_modules/.bin/esbuild "$TMP/web/owner/treasury-prep.js" --bundle --format=esm --platform=browser --target=es2022 --minify --splitting=false --outfile="$TMP/treasury-prep.bundle.js"\n',1)
    marker='cp "$TMP/prelaunch-delivery.bundle.js" web/owner/prelaunch-delivery.js\n'
    s=s.replace(marker,marker+'cp "$TMP/treasury-prep.bundle.js" web/owner/treasury-prep.js\n',1)
    s=s.replace('web/owner/prelaunch-delivery.js)\n', 'web/owner/prelaunch-delivery.js web/owner/treasury-prep.js)\n',1)
    build.write_text(s,encoding='utf-8')

make=Path('Makefile')
s=make.read_text(encoding='utf-8')
if 'web/owner/treasury-prep.js' not in s:
    s=s.replace('\tnode --check web/owner/prelaunch-delivery.js\n','\tnode --check web/owner/prelaunch-delivery.js\n\tnode --check web/owner/treasury-prep.js\n',1)
    make.write_text(s,encoding='utf-8')
print('RALYA_TREASURY_WIRING_PATCH=PASS')
