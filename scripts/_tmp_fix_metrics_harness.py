#!/usr/bin/env python3
from pathlib import Path

p = Path('scripts/local_validator_smoke.sh')
s = p.read_text()
old = "const metricExpectedWeb=mv.getBigUint64(mo,true);mo+=8,metricExpectedManual=mv.getBigUint64(mo,true);mo+=8,metricExpectedGross=mv.getBigUint64(mo,true);mo+=8,metricExpectedReferral=mv.getBigUint64(mo,true);mo+=8,metricWeb=mv.getBigUint64(mo,true);mo+=8,metricManual=mv.getBigUint64(mo,true);mo+=8,metricGross=mv.getBigUint64(mo,true);mo+=8,metricReferral=mv.getBigUint64(mo,true);"
new = """const metricExpectedWeb=mv.getBigUint64(mo,true);mo+=8;
const metricExpectedManual=mv.getBigUint64(mo,true);mo+=8;
const metricExpectedGross=mv.getBigUint64(mo,true);mo+=8;
const metricExpectedReferral=mv.getBigUint64(mo,true);mo+=8;
const metricWeb=mv.getBigUint64(mo,true);mo+=8;
const metricManual=mv.getBigUint64(mo,true);mo+=8;
const metricGross=mv.getBigUint64(mo,true);mo+=8;
const metricReferral=mv.getBigUint64(mo,true);"""
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('broken metric declaration line not found')
p.write_text(s)
print('RALYA_TEMP_METRICS_HARNESS_FIX=PASS')
