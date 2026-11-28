import importlib.util
from pathlib import Path
import unittest

SRC = Path(__file__).resolve().parents[2] / "scripts/migration/port_spoolman_frontend_194.py"
spec = importlib.util.spec_from_file_location("webfrontport", SRC)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FrontendPortTests(unittest.TestCase):
    def test_isolated_panel_and_grid(self):
        src = mod.PANEL + "\n" + mod.GRID
        got = mod.patch(src)
        self.assertEqual(got.count(mod.MARK), 2)
        self.assertIn("slot.spoolman.match_source === 'approved_binding'", got)

    def test_repeat_no_duplicate(self):
        once = mod.patch(mod.PANEL + "\n" + mod.GRID)
        self.assertEqual(mod.patch(once), once)

    def test_changed_grid_template_refused(self):
        with self.assertRaisesRegex(ValueError, "anchors changed"):
            mod.patch(mod.PANEL)

    def test_reject_partial_patch(self):
        with self.assertRaisesRegex(ValueError, "partial"):
            mod.patch(mod.PANEL + "\n" + mod.GRID + "\n" + mod.MARK)


if __name__ == "__main__":
    unittest.main()
