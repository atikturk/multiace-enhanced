#!/usr/bin/env python3
"""Offline sanity checks for the exported snapshot; never imports project modules."""
from pathlib import Path
import subprocess, json, hashlib, sys
root=Path(__file__).resolve().parents[1]
errors=[]
for f in sorted(root.rglob('*')):
    if not f.is_file():
        continue
    try:
        if f.suffix=='.py': compile(f.read_bytes(),str(f),'exec')
        elif f.suffix=='.json': json.loads(f.read_text(encoding='utf-8'))
        elif f.suffix=='.sh' or f.name in {'S57multiace-tools','S58multiace-mode','S98multiace-web'}:
            p=subprocess.run(['sh','-n',str(f)],capture_output=True,text=True)
            if p.returncode: errors.append(f'{f.relative_to(root)}: {p.stderr.strip()}')
    except Exception as exc: errors.append(f'{f.relative_to(root)}: {exc}')
manifest=root/'docs'/'SOURCE_SHA256.txt'
for line in manifest.read_text().splitlines():
    if not line or line.startswith('#'): continue
    sha,rel,_orig=line.split('  ',2)
    f=root/rel
    if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=sha:
        errors.append(f'integrity mismatch: {rel}')
if errors:
    for e in errors: print('FAIL',e)
    sys.exit(1)
print('PASS: syntax and source SHA256 checks')
