import importlib.util
from pathlib import Path
import unittest

src = Path(__file__).resolve().parents[2] / 'scripts' / 'migration' / 'patch_ttc_paxx212.py'
spec = importlib.util.spec_from_file_location('ttc_migration', src)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TTCPortTests(unittest.TestCase):
    EXAMPLE = 'DRIP_SEGMENT_TIME = 0.050\nDRIP_TIME=0.100 # base\nx = 17\n'

    def test_expected_base_port(self):
        out, was = mod.patch(self.EXAMPLE)
        self.assertEqual(was, {'DRIP_SEGMENT_TIME': '0.050', 'DRIP_TIME': '0.100'})
        self.assertIn('DRIP_SEGMENT_TIME = 0.100', out)
        self.assertIn('DRIP_TIME=0.350 # base', out)
        self.assertIn('x = 17', out)

    def test_idempotent(self):
        one, _ = mod.patch(self.EXAMPLE)
        two, _ = mod.patch(one)
        self.assertEqual(one, two)

    def test_unexpected_upstream_refused(self):
        with self.assertRaisesRegex(ValueError, 'unexpected PAXX value'):
            mod.patch(self.EXAMPLE.replace('0.050', '0.075'))

    def test_missing_constant_refused(self):
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            mod.patch('DRIP_TIME=0.100\n')

    def test_duplicate_constant_refused(self):
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            mod.patch(self.EXAMPLE + 'DRIP_TIME=0.100\n')


if __name__ == '__main__':
    unittest.main()
