#!/usr/bin/env python3
"""Build an OFFLINE candidate main.py from tagged upstream 1.94.

Never modifies source in-place and never deploys to a real printer.
The Enhanced preview module must be copied beside the candidate main.py.
"""
import argparse
import ast
from pathlib import Path

MARK = "# ENHANCED_194_APPROVED_SPOOL_CARDS_V2"
ANCHOR = '@app.get("/api/state")'
RETURN = "    return _parse_state(status)"


def patch(source: str) -> str:
    if MARK in source:
        if source.count(MARK) == 1:
            return source
        raise ValueError("multiple Enhanced patches detected")
    if source.count(ANCHOR) != 1:
        raise ValueError("unexpected upstream /api/state route")
    before, route = source.split(ANCHOR, 1)
    next_route = route.find("\n@app.")
    head = route if next_route == -1 else route[:next_route]
    tail = "" if next_route == -1 else route[next_route:]
    if head.count(RETURN) != 1:
        raise ValueError("unexpected upstream /api/state return; inspect manually")
    # Use upstream's _spoolman_collection cache/timeout/URL handling.
    # UI enhancement only; the spool DB and physical tags are unchanged.
    import_stmt = ('from enhanced_spool_preview import enrich_dashboard '
                   'as _enhanced_spool_cards')
    if import_stmt not in before:
        sentinel = "import preflight_core\n"
        if before.count(sentinel) != 1:
            raise ValueError("unexpected upstream import anchor")
        before = before.replace(sentinel, sentinel + import_stmt + "\n", 1)
    head = head.replace(
        RETURN,
        "    " + MARK + "\n"
        "    parsed = _parse_state(status)\n"
        "    return await _enhanced_spool_cards(parsed, _spoolman_collection)",
        1
    )
    candidate = before + ANCHOR + head + tail
    ast.parse(candidate)
    return candidate


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    src, out = args.source.resolve(strict=True), args.output.resolve()
    if src == out:
        p.error("source and output must differ")
    result = patch(src.read_text(encoding="utf-8"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(result, encoding="utf-8")
    print("Web V2 approved-card backend candidate:", out)
    print("NO UI installation, NO changes to the running printer")


if __name__ == "__main__":
    main()
