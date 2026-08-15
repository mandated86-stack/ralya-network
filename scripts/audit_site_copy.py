#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []

def check(cond, message):
    if not cond:
        errors.append(message)

def text(path):
    return (ROOT / path).read_text(encoding='utf-8', errors='ignore')

copy = json.loads(text('web/site-copy.json'))
client = text('web/site-content.js')
owner = text('web/owner/site-copy-control.js')
function = text('netlify/functions/site-content.mts')
config = text('web/site-config.js')
package = text('package.json')

allowed = {
    'hero.lead', 'purpose.heading', 'purpose.body', 'rlya.heading', 'rlya.body',
    'presale.heading', 'presale.body', 'build.heading', 'build.body',
    'opensource.heading', 'opensource.body', 'engineering.heading'
}
check(set(copy) == allowed, 'site-copy.json keys differ from the approved live-copy allowlist')
check(all(isinstance(v, str) and v.strip() for v in copy.values()), 'site-copy defaults must all be non-empty plain strings')
for forbidden in ('price', 'cap', 'referralbps', 'wallet', 'treasury', 'mint', 'programid', 'presaleenabled', 'access'):
    check(not any(forbidden in key.lower() for key in copy), f'financial/security setting leaked into live-copy keys: {forbidden}')

check("textContent = value.trim()" in client, 'public live-copy client does not apply text with textContent')
check('innerHTML' not in client, 'public live-copy client contains innerHTML')
check("'/api/site-content'" in client and "'/site-copy.json'" in client, 'public live-copy merge path missing')
check('RALYA_SITE_COPY' in client, 'public live-copy refresh hook missing')

check('OWNER_WALLET' in function and 'verifySignature' in function, 'live-copy write endpoint lacks owner signature verification')
check('Field is not live-editable' in function, 'live-copy server allowlist rejection missing')
check("['save', 'reset']" in function, 'live-copy server supports unexpected write operations')
check("'cache-control': 'no-store, max-age=0'" in function, 'live-copy API is cacheable')
check('getDeployStore' in function and "deployContext() === 'production'" in function, 'preview deployments can write production live-copy storage')
check("replace(/[\\u0000-\\u001f\\u007f]/g" in function, 'live-copy server control-character sanitizer missing')

check('Live website copy editor' in owner, 'owner live-copy editor UI missing')
check('RALYA live site-copy update' in owner, 'owner live-copy signing message missing')
check('Sign + publish live text' in owner and 'Reset all live overrides' in owner, 'owner live-copy publish/reset controls missing')
check("loadScript('/site-content.js'" in config, 'public live-copy loader not wired')
check("loadScript('/owner/site-copy-control.js'" in config, 'owner live-copy editor not wired')
check('netlify/functions/site-content.mts' in package, 'site-content function missing from compile gate')

if errors:
    print('SITE COPY AUDIT FAILED')
    for error in errors:
        print('-', error)
    raise SystemExit(1)

print('RALYA_SITE_COPY_AUDIT=PASS')
print('approved plain-text fields only; financial/protocol settings are not live-editable')
print('owner-signed live overrides + version-controlled defaults are wired')
