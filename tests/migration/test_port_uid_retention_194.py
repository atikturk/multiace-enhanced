"""Safe-source port tests. No real printer, database or RFID access."""
import importlib.util
from pathlib import Path
import unittest

SRC = Path(__file__).resolve().parents[2] / 'scripts/migration/port_uid_retention_multiace194.py'
spec = importlib.util.spec_from_file_location('uid_port', SRC)
port = importlib.util.module_from_spec(spec)
spec.loader.exec_module(port)

# Isolated minimal representative of upstream 1.94 method's release behavior.
# The CI workflow additionally compiles ported REAL upstream v1.94 ace_spool.py.
SAMPLE = '''import logging
class SpoolMixin:
    def _sku_codes(self, sku):
        return [v.lower() for v in str(sku or '').split(',') if v]

    def _spool_drop_if_unbound_sm(self, sid, why, force=False):
        sid = str(sid or '')
        sp = self._spools.get(sid)
        if not sp or not str(sp.get('spoolman_id') or '').strip():
            return False
        if any(str(v) == sid for v in self._spool_binding.values()):
            return False
        try:
            debt = float(sp.get('used_mm') or 0.) - float(sp.get('spoolman_synced_mm') or 0.)
        except (TypeError, ValueError):
            debt = 0.
        if debt > 0.5 and not force:
            return False
        self._spools.pop(sid, None)
        return True
'''


class PortTests(unittest.TestCase):
    def new(self, sku, *, bindings=None, debt=0):
        namespace = {}
        exec(port.patch(SAMPLE), namespace)
        inst = namespace['SpoolMixin']()
        inst._spools = {'83': {'spoolman_id': '27', 'sku': sku, 'used_mm': debt}}
        inst._spool_binding = bindings or {}
        return inst

    def test_hex_card_code_survives_unbind(self):
        obj = self.new('SM27,04F99239C32A81')
        self.assertFalse(obj._spool_drop_if_unbound_sm('83', 'removed'))
        self.assertIn('83', obj._spools)

    def test_plain_vendor_not_retained(self):
        obj = self.new('SM27,Filenta')
        self.assertTrue(obj._spool_drop_if_unbound_sm('83', 'removed'))
        self.assertNotIn('83', obj._spools)

    def test_force_clears_even_known_card(self):
        obj = self.new('SM27,04F99239C32A81')
        self.assertTrue(obj._spool_drop_if_unbound_sm('83', 'switch', force=True))

    def test_bound_spool_never_dropped(self):
        obj = self.new('SM27,04F99239C32A81', bindings={'0_0': '83'})
        self.assertFalse(obj._spool_drop_if_unbound_sm('83', 'remove'))

    def test_unsynced_consumption_held(self):
        obj = self.new('SM27', debt=100)
        self.assertFalse(obj._spool_drop_if_unbound_sm('83', 'remove'))

    def test_idempotent(self):
        once = port.patch(SAMPLE)
        self.assertEqual(once, port.patch(once))

    def test_unrecognized_upstream_refused(self):
        with self.assertRaisesRegex(ValueError, 'upstream spool function'):
            port.patch(SAMPLE.replace('self._spools.pop(sid, None)', 'self._spools.clear()'))


if __name__ == '__main__':
    unittest.main()
