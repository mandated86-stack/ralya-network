#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def rw(path):
    p=ROOT/path
    return p,p.read_text(encoding='utf-8')

def once(text, old, new, label):
    n=text.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 match, found {n}')
    return text.replace(old,new,1)

# Featured connector catalogs can contain entries that are not actually available.
# Only render a CONNECT row when the connector reports ready; otherwise mobile gets
# the explicit OPEN APP fallback instead of the old UNAVAILABLE/freeze experience.
p,text=rw('web/presale-next.js')
text=once(text,
    "const connectors = (state.connectors || []).filter(row => row && row.name && !isMwaConnector(row));",
    "const connectors = (state.connectors || []).filter(row => row && row.name && !isMwaConnector(row) && row.ready !== false);",
    'ready connector filter')
text=once(text,
    "  // The official MWA package registers its Wallet Standard entry from the user's click.\n  // Give that registration event a moment to reach ConnectorKit before rendering choices.\n  if (android) await sleep(120);\n  renderWalletList(modal);",
    "  // Render immediately. Branded mobile fallbacks no longer wait on generic MWA registration.\n  renderWalletList(modal);",
    'remove MWA chooser delay')
p.write_text(text,encoding='utf-8')

# Manual/private allocations live in the same immutable ledger model as website buys.
p,text=rw('netlify/functions/presale-owner.mts')
text=once(text,
    "    note: event.note || null,\n  };",
    "    note: event.note || null,\n    ledgerVersion: event.ledgerVersion || null,\n    ledgerRecordSha256: event.ledgerRecordSha256 || null,\n    deliveryStatus: event.deliveryStatus || 'pending',\n    automaticDelivery: event.automaticDelivery !== false,\n    claimRequired: event.claimRequired === true,\n  };",
    'owner serialized ledger fields')
text=once(text,
    "          status: 'allocation-confirmed',\n        };\n        await s.setJSON(`manual/${id}`, row);\n        return row;",
    "          status: 'allocation-confirmed',\n          ledgerVersion: 4,\n          deliveryStatus: 'pending',\n          automaticDelivery: true,\n          claimRequired: false,\n        };\n        const eventRow = { ...row, ledgerRecordSha256: sha256Json(row) };\n        await s.setJSON(`manual/${id}`, eventRow);\n        await s.setJSON(`wallet-purchase/${buyer}/${id}`, eventRow);\n        return eventRow;",
    'manual ledger hash and wallet index')
p.write_text(text,encoding='utf-8')

# Make confetti colors deterministic-valid CSS rather than relying on percentage math.
p,text=rw('web/purchase-celebration.js')
text=once(text,
    "      bit.style.setProperty('--r', `${Math.round(Math.random() * 320 - 160)}deg`);",
    "      bit.style.setProperty('--r', `${Math.round(Math.random() * 320 - 160)}deg`);\n      bit.style.setProperty('--h', String(155 + Math.round(Math.random() * 55)));",
    'confetti hue variable')
p.write_text(text,encoding='utf-8')
p,text=rw('web/purchase-celebration.css')
text=text.replace("background:hsl(calc(160 + var(--x) * .4),75%,66%)","background:hsl(var(--h),75%,66%)")
p.write_text(text,encoding='utf-8')

# Strengthen release audit with the exact mobile regression we just fixed.
p,text=rw('scripts/audit_checkout_release.py')
anchor="check('ledgerRecordSha256' in confirm and 'wallet-purchase/' in confirm, 'confirmed purchase ledger lacks hash/index hardening')"
extra="\ncheck('row.ready !== false' in read('web/presale-next.js') and 'data-mobile-open' in read('web/presale-next.js'), 'mobile chooser can still render unavailable catalog wallets instead of OPEN APP fallback')\ncheck('ledgerRecordSha256: sha256Json(row)' in owner and 'wallet-purchase/${buyer}/${id}' in owner, 'manual/private allocation ledger is not v4-hardened')"
text=once(text,anchor,anchor+extra,'audit wallet/manual ledger followup')
p.write_text(text,encoding='utf-8')

print('RALYA_PRESALE_V4_FOLLOWUP=APPLIED')
