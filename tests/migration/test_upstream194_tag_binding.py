"""Integration checks against REAL upstream decay71/multiACE v1.94 SpoolMixin.

Runs in GitHub Actions after upstream tag checkout. Pure in-memory state;
never uses a printer, Spoolman API, or user spool IDs/UIDs.
"""
import importlib.util
from pathlib import Path
import sys
import types
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "upstream-v194/multiace/klipper/extras/ace_spool.py"


@unittest.skipUnless(SOURCE.exists(), "Needs upstream-v194 checkout (CI)")
class Upstream194TagBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # ace_spool has one relative import for GATE_AVAILABLE; supply an
        # isolated stub solely so the mixin class can be evaluated.
        pkg_name = "_isolated_194_extras"
        pkg = types.ModuleType(pkg_name)
        pkg.__path__ = [str(SOURCE.parent)]
        sys.modules[pkg_name] = pkg
        proto = types.ModuleType(pkg_name + ".ace_protocol")
        proto.GATE_AVAILABLE = 0
        sys.modules[pkg_name + ".ace_protocol"] = proto
        spec = importlib.util.spec_from_file_location(pkg_name + ".ace_spool", SOURCE)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        cls.mixin = module.SpoolMixin

    def fake(self, bindings=None, duplicates=False):
        # Synthetic RFID keys model the 4-card situation without publishing
        # any real RFID identifiers or Spoolman user's inventory.
        skus = [
            "SM100,04ABCDEF123456",
            "SM101,1D123456789ABC",
            "SM102,04DEADBEEF1234",
            "SM103,04FEDCBA654321",
        ]
        class Unit(self.mixin):
            def __init__(self, skus, bindings):
                self._spools = {
                    str(100+i): {"spoolman_id": str(100+i), "sku": sku,
                                 "vendor": "Example", "label": f"roll {i}"}
                    for i, sku in enumerate(skus)
                }
                self._spool_binding = dict(bindings or {})
                self._spool_conflict_said = {}
                self._spool_miss_logged = {}
                self._v1_tag_seen = {}
                self._physical = {i: {"rfid": 2, "sku": skus[i].split(",")[1],
                                      "status": "ready"} for i in range(4)}
                self.spool_mode = "spoolman"
                self.spoolman_url = ""
                self.events = []

            def _cap(self, idx, cap):
                return cap == "tag_identity_in_status"

            def _is_empty_status(self, status):
                return str(status).lower() in ("empty", "offline")

            def _slot_is_occupied(self, a, s):
                return self._physical.get(s, {}).get("status") == "ready"

            def _slot_read_sku(self, a, s):
                return self._v1_tag_seen.get(a, {}).get(s, "")

            def _slot_read_uid(self, a, s):
                return ""

            def _save_spool_db(self, backup=False):
                self.events.append(("saved", dict(self._spool_binding)))

            def _spool_label(self, sp):
                return sp.get("label", "")

            @staticmethod
            def _spool_key(a, s):
                return f"{a}_{s}"

            @staticmethod
            def _disp(i):
                return i + 1

            @staticmethod
            def _raw(i):
                return i

            def log_always(self, message):
                self.events.append(("log", message))

            def log_warn(self, message):
                self.events.append(("warning", message))

            def _t(self, message, **args):
                return message

        obj = Unit(skus, bindings)
        if duplicates:
            obj._spools["999"] = dict(obj._spools["100"], spoolman_id="999")
        return obj

    def test_four_known_skus_auto_bind_from_status(self):
        unit = self.fake()
        unit._v1_tag_bind_from_status(0, {"slots": list(unit._physical.values())})
        self.assertEqual(unit._spool_binding,
                         {"0_0":"100", "0_1":"101", "0_2":"102", "0_3":"103"})

    def test_existing_four_bindings_survive_restart_frame(self):
        expected = {"0_0":"100", "0_1":"101", "0_2":"102", "0_3":"103"}
        unit = self.fake(expected)
        unit._v1_tag_bind_from_status(0, {"slots": list(unit._physical.values())})
        self.assertEqual(unit._spool_binding, expected)

    def test_unknown_rfid_never_auto_adopts(self):
        unit = self.fake()
        unit._physical[0] = {"rfid":2,"sku":"04A0B0C0D0E0F0","status":"ready"}
        unit._v1_tag_bind_from_status(0, {"slots": list(unit._physical.values())})
        self.assertNotIn("0_0", unit._spool_binding)
        self.assertEqual(len(unit._spools), 4)

    def test_unknown_different_code_unbinds_previous_roll(self):
        unit = self.fake({"0_0": "100"})
        unit._physical[0] = {"rfid":2,"sku":"04A0B0C0D0E0F0","status":"ready"}
        unit._v1_tag_bind_from_status(0, {"slots": list(unit._physical.values())})
        self.assertNotIn("0_0", unit._spool_binding)

    def test_duplicate_card_identifier_does_not_guess(self):
        unit = self.fake(duplicates=True)
        unit._v1_tag_bind_from_status(0, {"slots": list(unit._physical.values())})
        self.assertNotIn("0_0", unit._spool_binding)


if __name__ == "__main__":
    unittest.main()
