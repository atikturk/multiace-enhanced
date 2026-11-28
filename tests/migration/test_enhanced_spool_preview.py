import importlib.util
from pathlib import Path
import unittest
import asyncio

MODULE = Path(__file__).resolve().parents[2] / "migration/overlays/web/backend/enhanced_spool_preview.py"
spec = importlib.util.spec_from_file_location("enhanced_spool_preview", MODULE)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class ApprovedCardPreviewTests(unittest.TestCase):
    def setUp(self):
        self.state = {
            "spool_mode": "spoolman", "spoolman_url": "http://spoolman:7912",
            "spool_binding": {"0_0": "83", "0_1": "84", "0_2": "85", "0_3": "86"},
            "spools": {str(83+i): {"spoolman_id": str(101+i)} for i in range(4)},
            "aces": [{"idx": 0, "slots": [{"idx": i, "state": "ready", "rfid": 2}
                                          for i in range(4)]}],
        }
        self.rows = [
            {"id": 101+i, "remaining_weight": 400-i*10, "initial_weight": 1000,
             "filament": {"name": "Colour " + str(i), "vendor": {"name": "Demo"},
                          "material": "PLA", "color_hex": "000000"}}
            for i in range(4)
        ]

    def cards(self):
        return self.state["aces"][0]["slots"]

    def test_four_approved_spools(self):
        preview.enrich_from_collection(self.state, self.rows)
        self.assertEqual([slot["spoolman"]["spool_id"] for slot in self.cards()],
                         [101, 102, 103, 104])

    def test_unknown_unbound_has_no_second_line(self):
        del self.state["spool_binding"]["0_1"]
        preview.enrich_from_collection(self.state, self.rows)
        self.assertNotIn("spoolman", self.cards()[1])

    def test_no_vendor_or_colour_guess(self):
        self.state["spools"]["84"]["spoolman_id"] = "555"
        preview.enrich_from_collection(self.state, self.rows)
        self.assertNotIn("spoolman", self.cards()[1])

    def test_empty_slot_clears_stale_preview(self):
        self.cards()[1]["spoolman"] = {"spool_id": 102}
        self.cards()[1]["state"] = "empty"
        preview.enrich_from_collection(self.state, self.rows)
        self.assertNotIn("spoolman", self.cards()[1])

    def test_archived_spool_hidden(self):
        self.rows[0]["archived"] = True
        preview.enrich_from_collection(self.state, self.rows)
        self.assertNotIn("spoolman", self.cards()[0])

    def test_invalid_weight_rejected(self):
        self.rows[0]["remaining_weight"] = float("nan")
        preview.enrich_from_collection(self.state, self.rows)
        self.assertNotIn("spoolman", self.cards()[0])

    def test_spoollink_is_not_double_counted(self):
        self.state["spool_mode"] = "spoollink"
        preview.enrich_from_collection(self.state, self.rows)
        self.assertFalse(any("spoolman" in x for x in self.cards()))

    def test_does_not_change_binding_or_local_table(self):
        before = {k: dict(v) for k, v in self.state["spools"].items()}
        original_binding = dict(self.state["spool_binding"])
        preview.enrich_from_collection(self.state, self.rows)
        self.assertEqual(self.state["spools"], before)
        self.assertEqual(self.state["spool_binding"], original_binding)

    def test_async_fetcher_used_once(self):
        calls = []
        async def fetch(base):
            calls.append(base)
            return self.rows
        asyncio.run(preview.enrich_dashboard(self.state, fetch))
        self.assertEqual(calls, ["http://spoolman:7912"])

    def test_connection_failure_leaves_no_preview(self):
        async def fetch(base):
            raise RuntimeError("offline")
        asyncio.run(preview.enrich_dashboard(self.state, fetch))
        self.assertFalse(any("spoolman" in x for x in self.cards()))


if __name__ == "__main__":
    unittest.main()
