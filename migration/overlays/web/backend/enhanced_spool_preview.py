"""Enhanced 1.94 read-only Spoolman dashboard card preview.

NO local row imports, inventory auto-adoption, DB writes, RFID changes,
or consumption booking. A card is enriched only from its EXPLICIT,
currently active ACE slot -> local row -> Spoolman spool ID binding.
"""
from __future__ import annotations

import math


def _valid_weight(value):
    try:
        value = float(value)
        return value if math.isfinite(value) and value >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def enrich_from_collection(state: dict, rows: list) -> dict:
    """Mutate a freshly parsed /api/state payload. No inferred matching."""
    if not isinstance(state, dict) or state.get("spool_mode") != "spoolman":
        return state
    binding = state.get("spool_binding")
    table = state.get("spools")
    if not isinstance(binding, dict) or not isinstance(table, dict):
        return state
    if not isinstance(rows, list):
        return state
    index = {str(s["id"]): s for s in rows
             if isinstance(s, dict) and s.get("id") is not None
             and not s.get("archived")}
    for unit in state.get("aces") or []:
        if not isinstance(unit, dict):
            continue
        ai = unit.get("idx")
        for slot in unit.get("slots") or []:
            if not isinstance(slot, dict):
                continue
            # Remove any stale preview: never leave an old roll's info on
            # an empty/changed/unknown RFID slot.
            slot.pop("spoolman", None)
            if slot.get("state") != "ready":
                continue
            sid = binding.get(f"{ai}_{slot.get('idx')}")
            local = table.get(str(sid)) if sid is not None else None
            if not isinstance(local, dict):
                continue
            smid = str(local.get("spoolman_id") or "").strip()
            if not smid:
                continue
            spool = index.get(smid)
            if not spool:
                continue
            filament = spool.get("filament") or {}
            if not isinstance(filament, dict):
                continue
            remaining = _valid_weight(spool.get("remaining_weight"))
            if remaining is None:
                continue
            vendor_obj = filament.get("vendor") or {}
            vendor = (vendor_obj.get("name", "") if isinstance(vendor_obj, dict)
                      else str(vendor_obj))
            initial = _valid_weight(spool.get("initial_weight"))
            if initial is None:
                initial = _valid_weight(filament.get("weight"))
            color = str(filament.get("color_hex") or "").lstrip("#")[:6]
            slot["spoolman"] = {
                "spool_id": spool["id"],
                "name": str(filament.get("name") or ""),
                "vendor": str(vendor),
                "material": str(filament.get("material") or ""),
                "color": ("#" + color if len(color) == 6 else ""),
                "remaining_weight": remaining,
                "initial_weight": initial,
                "match_source": "approved_binding",
                "inferred": False,
                "read_only": True,
            }
    return state


async def enrich_dashboard(state: dict, collection_fetcher) -> dict:
    """Use existing upstream cached Spoolman collection; fail open for UI."""
    if not isinstance(state, dict) or state.get("spool_mode") != "spoolman":
        return state
    if not state.get("spool_binding") or not state.get("spoolman_url"):
        # Still clear potential stale entries if malformed states reuse slots.
        return enrich_from_collection(state, [])
    try:
        rows = await collection_fetcher(str(state["spoolman_url"]))
    except Exception:
        rows = []
    return enrich_from_collection(state, rows)
