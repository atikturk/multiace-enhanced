#!/usr/bin/env python3
"""Prepare an isolated toolhead.py candidate with the Enhanced TTC settings.

Never edits the PAXX source file in place. This script is an offline porting aid,
not a tested printer firmware patch or an installation command.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

EXPECTED_BASE = {'DRIP_SEGMENT_TIME': 0.050, 'DRIP_TIME': 0.100}
ENHANCED = {'DRIP_SEGMENT_TIME': '0.100', 'DRIP_TIME': '0.350'}


def patch(source: str):
    result = source
    previous = {}
    for name, target in ENHANCED.items():
        pattern = re.compile(
            r'(?m)^(?P<lead>[ \t]*' + re.escape(name)
            + r'[ \t]*=[ \t]*)(?P<value>\d+(?:\.\d+)?)'
            + r'(?P<tail>[ \t]*(?:\#[^\n]*)?)$'
        )
        matches = list(pattern.finditer(result))
        if len(matches) != 1:
            raise ValueError(f'{name}: exactly one numeric assignment required; got {len(matches)}')
        found = float(matches[0].group('value'))
        if not (abs(found - EXPECTED_BASE[name]) < 1e-9
                or abs(found - float(target)) < 1e-9):
            raise ValueError(f'{name}: unexpected PAXX value {found}; manually review before porting')
        previous[name] = matches[0].group('value')
        result = pattern.sub(lambda m: m.group('lead') + target + m.group('tail'), result, count=1)
    compile(result, '<patched_toolhead.py>', 'exec')
    return result, previous


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    src = args.source.resolve(strict=True)
    dst = args.output.resolve()
    if src == dst:
        p.error('source and output cannot be the same: do not modify live code')
    text = src.read_text(encoding='utf-8')
    rewritten, old = patch(text)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(rewritten, encoding='utf-8')
    h = lambda value: hashlib.sha256(value.encode('utf-8')).hexdigest()
    print(json.dumps({'source': str(src), 'output': str(dst),
                      'baseline': old, 'enhanced': ENHANCED,
                      'source_sha256': h(text), 'candidate_sha256': h(rewritten),
                      'changed': rewritten != text, 'ready_for_flash': False}, indent=2))


if __name__ == '__main__':
    main()
