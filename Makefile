.PHONY: test audit audit-prelaunch stress web-check verify serve

test:
	PYTHONPATH=. python3 -m unittest discover -s tests -v

audit:
	python3 scripts/audit_source.py

audit-prelaunch:
	python3 scripts/audit_prelaunch.py

stress:
	PYTHONPATH=. python3 scripts/stress_live_sale.py --operations 50000

web-check:
	node --check web/app.js
	node --check web/prelaunch.js
	node --check web/admin/admin.js
	node --check web/owner/launch.js
	node --check web/owner/atomic-launch.js
	node --check web/owner/smoke.js
	node --check web/owner/prelaunch-delivery.js
	node --check web/launch-status.js
	node --check web/owner/status-control.js
	node --check web/owner/presale-control.js
	node --check web/site-config.js

verify: test stress audit audit-prelaunch web-check

serve:
	python3 -m http.server 8080 -d web
