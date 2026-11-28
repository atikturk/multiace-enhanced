#!/usr/bin/env python3
"""Offline-only, guarded port of Enhanced's remembered-card retention to 1.94.

Takes an upstream multiace/klipper/extras/ace_spool.py file; writes a *new*
modified copy. It does not install or flash firmware.
"""
import argparse
from pathlib import Path

MARK = '# ENHANCED_194_REMEMBERED_CARD_UID_RETENTION'
FUNC = '    def _spool_drop_if_unbound_sm(self, sid, why, force=False):'
POP = '        self._spools.pop(sid, None)'

HELPER = '''    def _spool_has_remembered_uid(self, spool):
        """An approved spool with a learned hex card code stays in the table.

        This does not adopt new spools and does not auto-bind by colour/vendor.
        The force= world switch still clears records normally.
        """
        if not spool:
            return False
        for code in self._sku_codes(spool.get('sku')):
            canon = code.replace(':', '').replace(' ', '').upper()
            if (len(canon) in (8, 14, 20)
                    and all(c in '0123456789ABCDEF' for c in canon)):
                return True
        return False

'''

GUARD = '''        # ENHANCED_194_REMEMBERED_CARD_UID_RETENTION
        # Keep a previously approved card identity across physical removal.
        # Unknown tags still cannot adopt Spoolman spools; force keeps its
        # original meaning when changing spool worlds.
        if not force and self._spool_has_remembered_uid(sp):
            logging.info('[multiACE] [spool] SM%s #%s retained unbound '
                         '(remembered card identity, %s)' %
                         (sp.get('spoolman_id'), sid, why))
            return False
'''


def patch(source: str) -> str:
    if MARK in source:
        if source.count(MARK) == 1 and source.count('def _spool_has_remembered_uid') == 1:
            return source
        raise ValueError('partial or duplicate Enhanced UID patch detected')
    if source.count('class SpoolMixin:') != 1:
        raise ValueError('expected exactly one multiACE 1.94 SpoolMixin class')
    if source.count(FUNC) != 1:
        raise ValueError('upstream spool function or drop site changed; review manually')
    pos = source.index(FUNC)
    end = source.find('\n    def ', pos + len(FUNC))
    if end < 0:
        end = len(source)
    body = source[pos:end]
    # Upstream 1.94 has OTHER self._spools.pop() calls in unrelated commands.
    # Restrict the edit to the exact function instead of touching those.
    if body.count(POP) != 1:
        raise ValueError('upstream spool function or drop site changed; review manually')
    source = source[:pos] + HELPER + body.replace(POP, GUARD + POP, 1) + source[end:]
    compile(source, '<enhanced_194_ace_spool.py>', 'exec')
    return source


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source', required=True, type=Path)
    ap.add_argument('--output', required=True, type=Path)
    args = ap.parse_args()
    src = args.source.resolve(strict=True)
    output = args.output.resolve()
    if src == output:
        ap.error('must not overwrite the upstream source')
    changed = patch(src.read_text(encoding='utf-8'))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(changed, encoding='utf-8')
    print('Enhanced UID retention: candidate written to', output)
    print('NOT FOR INSTALL — test integration before building firmware')


if __name__ == '__main__':
    main()
