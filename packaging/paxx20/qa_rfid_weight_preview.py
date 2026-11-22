#!/usr/bin/env python3
"""Offline behavioral QA: read-only ACE RFID gram preview with AUTO disabled.

Execute the exact last dashboard decorator from packaged backend under mocked
telemetry/Spoolman reads; never connect to a real printer or mutate records.
"""
import ast
import asyncio
import copy
import math
import sys
from pathlib import Path


def check(path):
    tree = ast.parse(Path(path).read_text(encoding="utf-8"))
    candidates = [
        node for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name == "_enhanced_dashboard_telemetry"
    ]
    assert candidates, "Enhanced dashboard bridge missing"
    bridge = candidates[-1]

    # Ensure AUTO is never referenced as a gate inside the preview bridge.
    assert not any(
        isinstance(node, ast.Constant) and node.value == "spoolman_auto"
        for node in ast.walk(bridge)
    ), "AUTO disabled still gates read-only RFID preview"

    entries = [
        (34, "PLA", "Filamix", "10E63A", 1000.0),
        (29, "PETG", "Creality", "000000", 526.0688063128523),
        (35, "PLA", "Fibromast", "127EEE", 1000.0),
        (36, "PLA", "Fibromast", "CD0F88", 1000.0),
    ]
    def make_row(info):
        sid, material, vendor, color, weight = info
        return {
            "id": sid, "archived": False, "remaining_weight": weight,
            "initial_weight": 1000,
            "filament": {
                "name": material, "material": material, "color_hex": color,
                "weight": 1000, "vendor": {"name": vendor},
            }
        }

    rows = [make_row(i) for i in entries]
    slots = [
        {
            "idx": i, "state": "ready", "rfid": 2, "source": "rfid",
            "material": mat, "brand": vendor, "color": "#" + color,
            "sku": "",
        }
        for i, (_, mat, vendor, color, _) in enumerate(entries)
    ]
    # Unregistered tag remains unbound and retains its intentionally
    # empty brand; never invent a Spoolman name for an unmatched RFID card.
    slots.append({
        "idx": 4, "state": "ready", "rfid": 2, "source": "rfid",
        "material": "PETG|Siyah", "brand": "", "color": "#ABCDEF",
        "sku": "",
    })
    state = {
        "spool_mode": "spoolman", "spoolman_auto": False,
        "spoolman_url": "http://127.0.0.1:7912", "spool_binding": {},
        "aces": [{"idx": 0, "slots": slots}],
    }

    async def passthrough(data):
        return data

    async def get_rows():
        return rows

    scope = {
        "_enhanced_telemetry_before_spool_preview": passthrough,
        "_enhanced_spool_preview_rows": get_rows,
        "math": math,
    }
    program = ast.Module(body=[bridge], type_ignores=[])
    exec(compile(ast.fix_missing_locations(program), str(path), "exec"), scope)
    calculate = scope["_enhanced_dashboard_telemetry"]

    async def verify():
        snapshot = copy.deepcopy(rows)
        result = await calculate(copy.deepcopy(state))
        assert result["spoolman_auto"] is False
        assert len(result["aces"][0]["slots"]) == 5
        for idx, (sid, _, _, _, weight) in enumerate(entries):
            item = result["aces"][0]["slots"][idx]["spoolman"]
            assert item["spool_id"] == sid, (idx, item)
            assert abs(item["remaining_weight"] - weight) < 0.01, (idx, item)
            assert item["read_only"] and item["inferred"], item
        unregistered = result["aces"][0]["slots"][4]
        assert "spoolman" not in unregistered
        assert unregistered["brand"] == ""
        assert abs(result["spoolman_inventory"]["remaining_weight"] -
                   sum(e[-1] for e in entries)) < 0.1
        assert rows == snapshot, "Spoolman rows mutated by read-only preview"

        # An ambiguous material/vendor/color identity must not infer a
        # physical spool ID, even with an otherwise-ready RFID card.
        rows.append(make_row((99, "PLA", "Filamix", "10E63A", 800.0)))
        ambiguous = await calculate(copy.deepcopy(state))
        assert "spoolman" not in ambiguous["aces"][0]["slots"][0]
        assert ambiguous["aces"][0]["slots"][1]["spoolman"]["spool_id"] == 29
        rows.pop()

        # Explicit bindings bypass preview, avoiding UI overrides.
        bound = copy.deepcopy(state)
        bound["spool_binding"] = {"already_bound": 34}
        result_bound = await calculate(bound)
        assert all("spoolman" not in s for s in result_bound["aces"][0]["slots"])
        assert result_bound["spoolman_auto"] is False

    asyncio.run(verify())
    print("QA: AUTO=0 RFID weights, unique matches, unmatched tags, "
          "ambiguous records and explicit bindings passed")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: qa_rfid_weight_preview.py <packaged-main.py>")
    check(sys.argv[1])
