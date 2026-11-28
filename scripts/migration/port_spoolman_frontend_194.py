#!/usr/bin/env python3
"""Guarded Web V2 two-line cards on the NEW multiACE v1.94 Vue templates.

Writes an isolated candidate index.html, never overwrites upstream files.
"""
import argparse
from pathlib import Path

MARK = "ENHANCED_194_BOUND_SPOOL_SECOND_LINE_V2"
PANEL = '<span class="panel-card-sub" v-if="subText(slot.subtype)">{{ subText(slot.subtype) }}</span>'
GRID = '<em class="muted">{{ (slot.material && subText(slot.subtype)) || \u0027 \u0027 }}</em>'
PANEL_ADDED = '''\n              <!-- ENHANCED_194_BOUND_SPOOL_SECOND_LINE_V2: explicit binding only -->\n              <span v-if="slot.spoolman && slot.spoolman.match_source === 'approved_binding'"\n                    class="panel-card-sub muted">{{ 'Spoolman #' + slot.spoolman.spool_id + ' · ' + slot.spoolman.vendor + ' ' + slot.spoolman.name }}</span>'''
GRID_ADDED = '''\n                   <!-- ENHANCED_194_BOUND_SPOOL_SECOND_LINE_V2: no row for unknown RFID -->\n                   <em v-if="slot.spoolman && slot.spoolman.match_source === 'approved_binding'"\n                       class="muted enhanced-spool-second-line">{{ 'Spoolman #' + slot.spoolman.spool_id + ' · ' + slot.spoolman.vendor + ' ' + slot.spoolman.name }}</em>'''


def patch(source: str) -> str:
    if MARK in source:
        if source.count(MARK) == 2:
            return source
        raise ValueError("partial/duplicate card template patch")
    if source.count(PANEL) != 1 or source.count(GRID) != 1:
        raise ValueError("upstream 1.94 card template anchors changed; manually review")
    return source.replace(PANEL, PANEL + PANEL_ADDED, 1).replace(GRID, GRID + GRID_ADDED, 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    src = args.source.resolve(strict=True)
    out = args.output.resolve()
    if src == out:
        ap.error("never change upstream source in place")
    result = patch(src.read_text(encoding="utf-8"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(result, encoding="utf-8")
    print("MultiACE 1.94 Web V2 candidate two-line cards:", out)
    print("NOT FOR INSTALL — old per-branch frontend build is untouched")


if __name__ == "__main__":
    main()
