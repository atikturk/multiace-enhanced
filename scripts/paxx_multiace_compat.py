#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAXX + MultiACE Compatibility Analyzer
Read-only migration preflight for MultiACE Enhanced -> PAXX 2.x + embedded MultiACE.

Purpose
-------
Analyze the COMBINED PAXX+MultiACE firmware tree/archive, not a PAXX-only image.
The tool never modifies the firmware, printer, archive, or reference trees.

Typical use
-----------
  python3 paxx_multiace_compat.py <candidate_dir_or_archive>
  python3 paxx_multiace_compat.py <candidate> --previous <older_combined_build>
  python3 paxx_multiace_compat.py <candidate> --enhanced <enhanced_reference>
  python3 paxx_multiace_compat.py <candidate> --previous <old> --enhanced <enhanced> --json report.json

Supported inputs
----------------
- extracted directory
- .zip
- .tar / .tar.gz / .tgz / .tar.xz / .txz

Classification policy
---------------------
UNCHANGED : candidate file is byte-identical to the selected comparison reference.
SAFE      : exact known Enhanced marker/validated behavior is already present.
REVIEW    : target exists and relevant anchors are present/changed; manual diff/rebase required.
BLOCKED   : critical target missing or a known forbidden safety condition is detected.

Important
---------
SAFE never means "install without physical validation". It only means the static
preflight found the exact known behavior/marker requested by this migration rule.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
import tarfile
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Iterable

VERSION = "2.1.0"

TEXT_EXTS = {
    ".py", ".cfg", ".conf", ".ini", ".json", ".js", ".html", ".css",
    ".sh", ".md", ".txt", ".yaml", ".yml", ".toml", ".service"
}
MAX_TEXT_BYTES = 4 * 1024 * 1024

PREFERRED = {
    "toolhead.py": [
        "klipper/klippy/toolhead.py",
    ],
    "ace.py": [
        "klipper/klippy/extras/ace.py",
    ],
    "ace_protocol_v1.py": [
        "klipper/klippy/extras/ace_protocol_v1.py",
    ],
    "ace_protocol_v2.py": [
        "klipper/klippy/extras/ace_protocol_v2.py",
    ],
    "ace_gen1_tunnel.py": [
        "klipper/klippy/extras/ace_gen1_tunnel.py",
    ],
    "filament_feed_ace.py": [
        "klipper/klippy/extras/filament_feed_ace.py",
    ],
    "filament_feed.py": [
        "klipper/klippy/extras/filament_feed.py",
    ],
    "filament_switch_sensor.py": [
        "klipper/klippy/extras/filament_switch_sensor.py",
    ],
    "print_task_config.py": [
        "klipper/klippy/extras/print_task_config.py",
    ],
    "ace.cfg": [
        "printer_data/config/extended/ace.cfg",
        "config/extended/ace.cfg",
    ],
    "S58multiace-mode": [
        "etc/init.d/S58multiace-mode",
        "S58multiace-mode",
    ],
    "main.py": [
        "multiace_web/backend/main.py",
        "web/backend/main.py",
    ],
    "preflight_core.py": [
        "multiace_web/backend/preflight_core.py",
        "web/backend/preflight_core.py",
    ],
    "app.js": [
        "multiace_web/frontend/app.js",
        "web/frontend/app.js",
    ],
    "index.html": [
        "multiace_web/frontend/index.html",
        "web/frontend/index.html",
    ],
    "style.css": [
        "multiace_web/frontend/style.css",
        "web/frontend/style.css",
    ],
    "tr.json": [
        "multiace_web/i18n/tr.json",
        "web/i18n/tr.json",
        "i18n/tr.json",
    ],
    "en.json": [
        "multiace_web/i18n/en.json",
        "web/i18n/en.json",
        "i18n/en.json",
    ],
}

BAD_PATH_HINTS = (
    "/backup", "/backups", "/patch_", "/patches", "/validated/", "/pending/",
    "/obsolete/", "/retired/", "/baseline/", "/old/", ".bak", ".before", ".after"
)

CRITICAL_KEYS = [
    "toolhead.py",
    "ace.py",
    "filament_switch_sensor.py",
    "print_task_config.py",
    "ace.cfg",
    "main.py",
]

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def norm_path(p: str) -> str:
    return p.replace("\\", "/").lstrip("./")

def is_text_path(path: str) -> bool:
    name = Path(path).name
    if name.startswith("S") and "multiace" in name.lower():
        return True
    return Path(path).suffix.lower() in TEXT_EXTS

class Source:
    def __init__(self, path: str):
        self.path = Path(path)
        self.kind = ""
        self._files: Dict[str, bytes] = {}
        if self.path.is_dir():
            self.kind = "directory"
            self._load_dir()
        elif self.path.is_file() and zipfile.is_zipfile(self.path):
            self.kind = "zip"
            self._load_zip()
        elif self.path.is_file() and tarfile.is_tarfile(self.path):
            self.kind = "tar"
            self._load_tar()
        else:
            raise SystemExit(f"Unsupported input or missing path: {self.path}")

    def _load_dir(self):
        base = self.path.resolve()
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            try:
                rel = norm_path(str(p.resolve().relative_to(base)))
                self._files[rel] = p.read_bytes()
            except Exception:
                continue

    def _load_zip(self):
        with zipfile.ZipFile(self.path, "r") as z:
            for i in z.infolist():
                if i.is_dir():
                    continue
                try:
                    self._files[norm_path(i.filename)] = z.read(i)
                except Exception:
                    continue

    def _load_tar(self):
        with tarfile.open(self.path, "r:*") as t:
            for m in t.getmembers():
                if not m.isfile():
                    continue
                f = t.extractfile(m)
                if f is None:
                    continue
                try:
                    self._files[norm_path(m.name)] = f.read()
                except Exception:
                    continue

    def files(self) -> Iterable[str]:
        return self._files.keys()

    def read(self, path: str) -> Optional[bytes]:
        return self._files.get(path)

    def text(self, path: str) -> str:
        data = self.read(path)
        if data is None:
            return ""
        if len(data) > MAX_TEXT_BYTES:
            return ""
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return ""

    def sha256(self, path: str) -> Optional[str]:
        data = self.read(path)
        return sha256_bytes(data) if data is not None else None

def path_score(path: str, key: str) -> int:
    p = "/" + norm_path(path).lower()
    score = 0
    for pref in PREFERRED.get(key, []):
        pref = pref.lower()
        if p.endswith("/" + pref) or p == "/" + pref:
            score += 1000
        elif pref in p:
            score += 500
    if Path(path).name == key:
        score += 100
    for bad in BAD_PATH_HINTS:
        if bad in p:
            score -= 300
    # Prefer shallower canonical-looking paths.
    score -= p.count("/")
    return score

def discover(src: Source, key: str) -> Optional[str]:
    cands = [p for p in src.files() if Path(p).name == key]
    if not cands:
        return None
    cands.sort(key=lambda p: path_score(p, key), reverse=True)
    return cands[0]

def discover_all(src: Source, basename: str) -> List[str]:
    cands = [p for p in src.files() if Path(p).name == basename]
    return sorted(cands, key=lambda p: path_score(p, basename), reverse=True)

@dataclass
class FileRow:
    key: str
    candidate_path: Optional[str]
    candidate_sha256: Optional[str]
    previous_path: Optional[str] = None
    previous_sha256: Optional[str] = None
    previous_relation: str = "N/A"
    enhanced_path: Optional[str] = None
    enhanced_sha256: Optional[str] = None
    enhanced_relation: str = "N/A"

@dataclass
class FeatureRow:
    name: str
    classification: str
    details: str
    evidence: List[str]

def rel(candidate_hash: Optional[str], ref_hash: Optional[str]) -> str:
    if candidate_hash is None:
        return "MISSING"
    if ref_hash is None:
        return "NO_REFERENCE"
    return "UNCHANGED" if candidate_hash == ref_hash else "CHANGED"

def rx(text: str, pattern: str, flags=re.I | re.M | re.S) -> bool:
    return re.search(pattern, text, flags) is not None

def homing_status_order(text: str) -> str:
    """
    Detect whether websocket print/status handling is processed before the
    homing traffic gate.

    FIXED:
        if method == "notify_status_update": ...
        ...
        if _homing_active():
            continue

    OLD:
        if _homing_active():
            continue
        ...
        if method == "notify_status_update": ...
    """
    notify_patterns = (
        'if method == "notify_status_update":',
        "if method == 'notify_status_update':",
    )
    notify_positions = [text.find(p) for p in notify_patterns if text.find(p) >= 0]
    if not notify_positions:
        return "UNKNOWN"

    npos = min(notify_positions)

    # Find nearest relevant homing gate before and after notify.
    before = text.rfind("if _homing_active():", 0, npos)
    after = text.find("if _homing_active():", npos)

    # A homing gate shortly AFTER notify means status handling is preserved
    # before nonessential homing-window traffic is dropped.
    if after >= 0 and (after - npos) <= 2000:
        return "FIXED"

    # A homing gate shortly BEFORE notify reproduces the old all-frame drop.
    if before >= 0 and (npos - before) <= 2000:
        return "OLD"

    return "UNKNOWN"

def contains_all(text: str, terms: List[str]) -> bool:
    tl = text.lower()
    return all(t.lower() in tl for t in terms)

def candidate_texts(src: Source, discovered: Dict[str, Optional[str]]) -> Dict[str, str]:
    out = {}
    for k, p in discovered.items():
        out[k] = src.text(p) if p else ""
    return out

def classify_features(src: Source, found: Dict[str, Optional[str]]) -> List[FeatureRow]:
    t = candidate_texts(src, found)
    rows: List[FeatureRow] = []

    # 1) TTC
    tool = t.get("toolhead.py", "")
    if not found.get("toolhead.py"):
        rows.append(FeatureRow("TTC timing 0.100/0.350", "BLOCKED",
                               "toolhead.py bulunamadı.", []))
    else:
        seg = rx(tool, r"DRIP_SEGMENT_TIME\s*=\s*0?\.100\b")
        drip = rx(tool, r"DRIP_TIME\s*=\s*0?\.350\b")
        if seg and drip:
            rows.append(FeatureRow("TTC timing 0.100/0.350", "SAFE",
                                   "Enhanced tarafından fiziksel doğrulanmış TTC değerleri zaten mevcut.",
                                   ["DRIP_SEGMENT_TIME=0.100", "DRIP_TIME=0.350"]))
        else:
            rows.append(FeatureRow("TTC timing 0.100/0.350", "REVIEW",
                                   "toolhead.py mevcut ancak iki doğrulanmış TTC değeri birlikte bulunmadı; hedefli rebase gerekli.",
                                   [f"segment={'yes' if seg else 'no'}", f"drip={'yes' if drip else 'no'}"]))

    # 2) AR logical candidate selection
    ptc = t.get("print_task_config.py", "")
    if not found.get("print_task_config.py"):
        rows.append(FeatureRow("Auto Replenish candidate selection", "BLOCKED",
                               "print_task_config.py bulunamadı.", []))
    else:
        preload = "PRELOAD_FINISH" in ptc
        replenish = "REPLENISH" in ptc.upper() or "replenish" in ptc.lower()
        if preload and replenish:
            rows.append(FeatureRow("Auto Replenish candidate selection", "REVIEW",
                                   "PRELOAD_FINISH ve replenish anchor'ları mevcut; semantik diff ile Enhanced davranışı karşılaştırılmalı.",
                                   ["PRELOAD_FINISH", "replenish"]))
        else:
            rows.append(FeatureRow("Auto Replenish candidate selection", "REVIEW",
                                   "Dosya mevcut fakat beklenen Enhanced anchor seti tam değil.",
                                   [f"PRELOAD_FINISH={'yes' if preload else 'no'}",
                                    f"replenish={'yes' if replenish else 'no'}"]))

    # 3) AR loader permission
    ff = t.get("filament_feed_ace.py", "") or t.get("filament_feed.py", "")
    ff_key = "filament_feed_ace.py" if t.get("filament_feed_ace.py", "") else "filament_feed.py"
    if not ff:
        rows.append(FeatureRow("Auto Replenish PRELOAD loader permission", "BLOCKED",
                               "filament_feed_ace.py / filament_feed.py bulunamadı.", []))
    else:
        anchors = {
            "PRELOAD_FINISH": "PRELOAD_FINISH" in ff,
            "REPLENISH": "REPLENISH" in ff.upper(),
            "PRINTING": "PRINTING" in ff.upper(),
        }
        if all(anchors.values()):
            rows.append(FeatureRow("Auto Replenish PRELOAD loader permission", "REVIEW",
                                   f"{ff_key} içinde gerekli yapısal anchor'lar var; PRINTING=1 bypass koşulları semantik olarak diff edilmeli.",
                                   list(anchors.keys())))
        else:
            rows.append(FeatureRow("Auto Replenish PRELOAD loader permission", "REVIEW",
                                   f"{ff_key} mevcut fakat Enhanced PRELOAD zinciri anchor'ları eksik/değişmiş.",
                                   [f"{k}={'yes' if v else 'no'}" for k, v in anchors.items()]))

    # 4) ace.cfg resume gate
    cfg = t.get("ace.cfg", "")
    if not found.get("ace.cfg"):
        rows.append(FeatureRow("INNER_RESUME replenish gate", "BLOCKED", "ace.cfg bulunamadı.", []))
    else:
        anchors = ["INNER_RESUME", "REPLENISH", "SM_PRINT_AUTO_FEED"]
        present = [a for a in anchors if a in cfg]
        if len(present) == len(anchors):
            rows.append(FeatureRow("INNER_RESUME replenish gate", "REVIEW",
                                   "Temel macro anchor'ları mevcut; filament_exist bypass ve REPLENISH propagation diff edilmeli.",
                                   present))
        else:
            rows.append(FeatureRow("INNER_RESUME replenish gate", "REVIEW",
                                   "ace.cfg mevcut fakat beklenen macro anchor seti değişmiş.",
                                   present))

    # 5) HEAD auto-adopt guard
    be = t.get("main.py", "")
    if not found.get("main.py"):
        rows.append(FeatureRow("HEAD auto-adopt source guard", "BLOCKED", "backend main.py bulunamadı.", []))
    elif "MULTIACE_HEAD_AUTO_ADOPT_SOURCE_GUARD_V1" in be:
        rows.append(FeatureRow("HEAD auto-adopt source guard", "SAFE",
                               "Exact Enhanced guard marker mevcut.",
                               ["MULTIACE_HEAD_AUTO_ADOPT_SOURCE_GUARD_V1"]))
    elif "head_tag_seen" in be:
        rows.append(FeatureRow("HEAD auto-adopt source guard", "REVIEW",
                               "head_tag_seen yolu mevcut fakat Enhanced guard marker yok; duplicate-binding davranışı karşılaştırılmalı.",
                               ["head_tag_seen"]))
    else:
        rows.append(FeatureRow("HEAD auto-adopt source guard", "REVIEW",
                               "Backend mimarisi değişmiş; eski anchor bulunamadı. Manuel semantik inceleme gerekli.",
                               []))

    # 6) Native stored G-code workflow
    if not found.get("main.py"):
        rows.append(FeatureRow("Native stored-G-code workflow", "BLOCKED", "backend main.py bulunamadı.", []))
    else:
        native_markers = [
            "MULTIACE_STORED_GCODE_PREFLIGHT_V1",
            "MULTIACE_NATIVE_PRINT_START_V1",
            "MULTIACE_NATIVE_PRINT_CONTROLS_V1",
        ]
        routes = [
            "/api/preflight/moonraker",
            "/api/print/start",
            "/api/print/pause",
            "/api/print/resume",
            "/api/print/cancel",
        ]
        marker_hits = [m for m in native_markers if m in be]
        route_hits = [r for r in routes if r in be]
        preflight = t.get("preflight_core.py", "")
        processed = ("allow_processed" in be) or ("allow_processed" in preflight) or \
                    ("MULTIACE_NATIVE_PROCESSED_PREFLIGHT_V1" in be) or \
                    ("MULTIACE_NATIVE_PROCESSED_PREFLIGHT_V1" in preflight)
        if len(route_hits) == len(routes) and processed:
            cls = "SAFE" if len(marker_hits) >= 2 else "REVIEW"
            rows.append(FeatureRow("Native stored-G-code workflow", cls,
                                   "Native route seti ve processed-file kabulü mevcut." +
                                   (" Exact Enhanced marker'lar bulundu." if cls == "SAFE" else " Eşdeğer upstream davranışı doğrulanmalı."),
                                   route_hits + (["allow_processed/equivalent"] if processed else [])))
        else:
            rows.append(FeatureRow("Native stored-Gcode workflow", "REVIEW",
                                   "Enhanced native print akışının tamamı bulunmadı; upstream preflight üzerine merge gerekip gerekmediği kontrol edilmeli.",
                                   route_hits + (["allow_processed/equivalent"] if processed else [])))

    # 7) Stale warning reconcile
    fe = "\n".join([t.get("app.js", ""), t.get("main.py", "")])
    if "MULTIACE_TRANSIENT_WARNING_PHYSICAL_STATE_V1" in fe:
        rows.append(FeatureRow("Transient warning physical-state reconcile", "SAFE",
                               "Exact Enhanced marker mevcut.",
                               ["MULTIACE_TRANSIENT_WARNING_PHYSICAL_STATE_V1"]))
    else:
        rows.append(FeatureRow("Transient warning physical-state reconcile", "REVIEW",
                               "Exact Enhanced marker yok; yeni upstream notification sistemiyle semantik karşılaştırma gerekli.",
                               []))

    # 8) Homing websocket state handling
    if not found.get("main.py"):
        rows.append(FeatureRow("Homing/status websocket handling", "BLOCKED", "backend main.py bulunamadı.", []))
    else:
        horder = homing_status_order(be)
        if horder == "FIXED":
            rows.append(FeatureRow("Homing/status websocket handling", "SAFE",
                                   "notify_status_update, homing traffic gate'ten önce işleniyor; Enhanced sıra mantığı mevcut.",
                                   ["notify_status_update BEFORE _homing_active gate"]))
        elif horder == "OLD":
            rows.append(FeatureRow("Homing/status websocket handling", "REVIEW",
                                   "Homing gate notify_status_update'dan önce; eski tüm-frame drop davranışı olabilir.",
                                   ["_homing_active gate BEFORE notify_status_update"]))
        elif "notify_status_update" in be:
            rows.append(FeatureRow("Homing/status websocket handling", "REVIEW",
                                   "notify_status_update mevcut fakat homing gate sırası otomatik doğrulanamadı.",
                                   ["notify_status_update"]))
        else:
            rows.append(FeatureRow("Homing/status websocket handling", "REVIEW",
                                   "Websocket/state mimarisi değişmiş; manuel inceleme gerekli.",
                                   []))

    # 9) State bridge
    state_terms = ["gcode_move", "heater_bed", "square_corner_velocity", "minimum_cruise_ratio"]
    hits = [x for x in state_terms if x in be]
    if len(hits) == len(state_terms):
        rows.append(FeatureRow("Klipper State Bridge", "REVIEW",
                               "State Bridge için temel native object/field anchor'ları mevcut; upstream eşdeğerliği API seviyesinde doğrulanmalı.",
                               hits))
    else:
        rows.append(FeatureRow("Klipper State Bridge", "REVIEW",
                               "State Bridge anchor seti eksik/değişmiş; 2.0'da ihtiyaç devam ediyor olabilir.",
                               hits))

    # 10) RFID acquisition/protocol layer
    ace = t.get("ace.py", "")
    tunnel_path = found.get("ace_gen1_tunnel.py")
    rfid_hits = []
    for term in ["ACE_TAG_READ", "card_uids", "rfid_test", "filament_identify"]:
        if term in ace or term in be:
            rfid_hits.append(term)
    if tunnel_path:
        rfid_hits.append("ace_gen1_tunnel.py")
    rows.append(FeatureRow("RFID acquisition/protocol layer", "REVIEW",
                           "Bu katmanda upstream kod temel alınmalı; Enhanced yalnız normalization/sync katmanını taşır.",
                           rfid_hits))

    # 11) Turkish i18n
    if found.get("tr.json"):
        rows.append(FeatureRow("Turkish i18n rebase", "REVIEW",
                               "tr.json mevcut; yeni upstream key setine karşı anahtar diff'i gerekli.",
                               [found["tr.json"]]))
    else:
        rows.append(FeatureRow("Turkish i18n rebase", "REVIEW",
                               "tr.json bulunamadı; yeni catalog yapısına göre yeniden oluşturma gerekebilir.",
                               []))

    # 12) Persistence / S58
    s58 = t.get("S58multiace-mode", "")
    if found.get("S58multiace-mode"):
        rows.append(FeatureRow("Persistence/S58 mode-switch", "REVIEW",
                               "S58multiace-mode bulundu; 2.0'ın kendi persistence akışıyla eski finalizer davranışı karşılaştırılmalı, kör kopya yapılmamalı.",
                               [found["S58multiace-mode"]]))
    else:
        rows.append(FeatureRow("Persistence/S58 mode-switch", "REVIEW",
                               "S58multiace-mode bulunamadı; 2.0 startup/persistence mimarisi değişmiş olabilir.",
                               []))

    # HOLD item: runout zero close
    if "MULTIACE_RUNOUT_ZERO_CLOSE_V1" in ace or "MULTIACE_RUNOUT_ZERO_CLOSE_V1" in be:
        rows.append(FeatureRow("Runout Zero-Close", "REVIEW",
                               "Marker mevcut. Bu özellik fiziksel <=5 g doğrulaması olmadan ilk 2.0 paketine taşınmamalı (HOLD).",
                               ["MULTIACE_RUNOUT_ZERO_CLOSE_V1"]))
    else:
        rows.append(FeatureRow("Runout Zero-Close", "REVIEW",
                               "Candidate içinde Enhanced Zero-Close marker yok; ilk 2.0 geçişinde HOLD olarak kalmalı.",
                               []))

    return rows

def safety_checks(src: Source, found: Dict[str, Optional[str]]) -> List[FeatureRow]:
    rows = []
    # Search only selected active-looking files to reduce false positives from docs/backups.
    texts = candidate_texts(src, found)
    merged = "\n".join(texts.values())

    if rx(merged, r"\bquad_replenish\s*[:=]\s*(?:true|1)\b"):
        rows.append(FeatureRow("SAFETY: quad_replenish", "BLOCKED",
                               "quad_replenish=true/1 bulundu. Enhanced policy: false kalmalı.",
                               []))
    else:
        rows.append(FeatureRow("SAFETY: quad_replenish", "SAFE",
                               "Seçilen aktif dosyalarda quad_replenish=true/1 bulunmadı.",
                               []))

    if rx(merged, r"\bKEEP_TARGET\s*[:=]\s*(?:1|true)\b"):
        rows.append(FeatureRow("SAFETY: KEEP_TARGET", "BLOCKED",
                               "KEEP_TARGET=1/true bulundu. Bu yaklaşım daha önce collision/air-print sınıfı hata oluşturdu.",
                               []))
    else:
        rows.append(FeatureRow("SAFETY: KEEP_TARGET", "SAFE",
                               "Seçilen aktif dosyalarda KEEP_TARGET=1/true bulunmadı.",
                               []))

    # RUNTIME=1 can appear in unrelated code, so only block when near replenish terms.
    runtime_bad = rx(merged, r"(?:REPLENISH|replenish).{0,250}\bRUNTIME\s*[:=]\s*1\b|\bRUNTIME\s*[:=]\s*1\b.{0,250}(?:REPLENISH|replenish)")
    if runtime_bad:
        rows.append(FeatureRow("SAFETY: first-chance RUNTIME=1", "BLOCKED",
                               "Replenish bağlamında RUNTIME=1 paterni bulundu; Enhanced policy bunu yasaklıyor.",
                               []))
    else:
        rows.append(FeatureRow("SAFETY: first-chance RUNTIME=1", "SAFE",
                               "Replenish bağlamında yasak first-chance RUNTIME=1 paterni bulunmadı.",
                               []))
    return rows

def infer_identity(src: Source) -> List[str]:
    hits = []
    patterns = [
        re.compile(r"\bMultiACE(?:\s+Enhanced)?\s*(?:version\s*[:=]?\s*)?v?1\.\d+(?:\.\d+)?(?:[a-z])?\b", re.I),
        re.compile(r"\bv?2\.0\.0(?:[-+._][A-Za-z0-9.-]+)?\b", re.I),
        re.compile(r"\bPAXX(?:\s+firmware)?\s*(?:version\s*[:=]?\s*)?(?:2\.0\.0|1\.6\.0)[A-Za-z0-9+._-]*\b", re.I),
    ]
    seen = set()
    # First prioritize small metadata/docs/version files.
    paths = sorted(src.files(), key=lambda p: (
        0 if any(x in Path(p).name.lower() for x in ("version", "release", "readme", "manifest")) else 1,
        len(p)
    ))
    for p in paths[:1500]:
        low = p.lower()
        if "/frontend/" in low and Path(p).suffix.lower() in (".css", ".js", ".html"):
            continue
        data = src.read(p)
        if data is None or len(data) > 1024 * 1024 or not is_text_path(p):
            continue
        text = src.text(p)
        for pat in patterns:
            for m in pat.finditer(text):
                s = " ".join(m.group(0).split())
                key = s.lower()
                if key not in seen:
                    seen.add(key)
                    hits.append(f"{p}: {s}")
                    if len(hits) >= 12:
                        return hits
    return hits

def build_file_rows(candidate: Source, previous: Optional[Source], enhanced: Optional[Source]) -> Tuple[List[FileRow], Dict[str, Optional[str]]]:
    found = {k: discover(candidate, k) for k in PREFERRED}
    prev_found = {k: discover(previous, k) for k in PREFERRED} if previous else {}
    enh_found = {k: discover(enhanced, k) for k in PREFERRED} if enhanced else {}

    rows = []
    for key in PREFERRED:
        cp = found.get(key)
        ch = candidate.sha256(cp) if cp else None

        pp = prev_found.get(key) if previous else None
        ph = previous.sha256(pp) if previous and pp else None

        ep = enh_found.get(key) if enhanced else None
        eh = enhanced.sha256(ep) if enhanced and ep else None

        rows.append(FileRow(
            key=key,
            candidate_path=cp,
            candidate_sha256=ch,
            previous_path=pp,
            previous_sha256=ph,
            previous_relation=rel(ch, ph) if previous else "N/A",
            enhanced_path=ep,
            enhanced_sha256=eh,
            enhanced_relation=rel(ch, eh) if enhanced else "N/A",
        ))
    return rows, found

def overall(features: List[FeatureRow], files: List[FileRow]) -> str:
    if any(r.classification == "BLOCKED" for r in features):
        return "BLOCKED"

    by_key = {r.key: r for r in files}

    # Individually mandatory core targets.
    if any(
        by_key.get(k) is None or by_key[k].candidate_path is None
        for k in CRITICAL_KEYS
    ):
        return "BLOCKED"

    # Loader architecture differs between PAXX/MultiACE generations.
    # At least one active loader source is required; filament_feed_ace.py
    # is NOT mandatory when a valid filament_feed.py exists.
    loader_present = any(
        by_key.get(k) is not None and by_key[k].candidate_path is not None
        for k in ("filament_feed_ace.py", "filament_feed.py")
    )
    if not loader_present:
        return "BLOCKED"

    if any(r.classification == "REVIEW" for r in features):
        return "REVIEW"
    return "SAFE"


@dataclass
class MigrationDecision:
    feature: str
    decision: str
    rationale: str
    evidence: List[str]

def verify_sha256_manifest(src: Source) -> Tuple[str, List[str]]:
    """
    Verify SHA256SUMS when the input is an extracted directory containing one.
    Archives are intentionally reported as NOT_CHECKED because the manifest may
    live at an arbitrary nested root.
    """
    if src.kind != "directory":
        return "NOT_CHECKED", ["archive input"]

    manifest = None
    for p in src.files():
        if norm_path(p) == "SHA256SUMS":
            manifest = p
            break
    if not manifest:
        return "NOT_PRESENT", []

    body = src.text(manifest)
    bad = []
    checked = 0
    for raw in body.splitlines():
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        m = re.match(r"^([0-9a-fA-F]{64})\s+\*?(.+)$", raw)
        if not m:
            bad.append(f"unparsed: {raw[:80]}")
            continue
        expected, relp = m.group(1).lower(), norm_path(m.group(2))
        if relp.startswith("./"):
            relp = relp[2:]
        data = src.read(relp)
        if data is None:
            bad.append(f"missing: {relp}")
            continue
        checked += 1
        actual = sha256_bytes(data)
        if actual != expected:
            bad.append(f"hash mismatch: {relp}")

    if bad:
        return "FAILED", bad[:20]
    return "VERIFIED", [f"{checked} entries"]

def hash_relation_for_key(file_rows: List[FileRow], key: str) -> str:
    for r in file_rows:
        if r.key == key:
            return r.enhanced_relation
    return "N/A"

def migration_decisions(src: Source, found: Dict[str, Optional[str]],
                        file_rows: List[FileRow]) -> List[MigrationDecision]:
    t = candidate_texts(src, found)
    rows: List[MigrationDecision] = []

    def same(key: str) -> bool:
        return hash_relation_for_key(file_rows, key) == "UNCHANGED"

    # TTC
    tool = t.get("toolhead.py", "")
    if not found.get("toolhead.py"):
        rows.append(MigrationDecision("TTC timing", "BLOCKED",
            "toolhead.py yok; TTC davranışı değerlendirilemiyor.", []))
    elif rx(tool, r"DRIP_SEGMENT_TIME\s*=\s*0?\.100\b") and rx(tool, r"DRIP_TIME\s*=\s*0?\.350\b"):
        rows.append(MigrationDecision("TTC timing", "DROP",
            "Candidate zaten doğrulanmış 0.100/0.350 TTC değerlerini içeriyor; Enhanced patch taşınmamalı.",
            ["DRIP_SEGMENT_TIME=0.100", "DRIP_TIME=0.350"]))
    else:
        rows.append(MigrationDecision("TTC timing", "REBASE",
            "Candidate toolhead.py mevcut ancak doğrulanmış TTC değerleri yok; küçük hedefli rebase adayı.",
            []))

    # AR logical selection
    ptc = t.get("print_task_config.py", "")
    if not found.get("print_task_config.py"):
        rows.append(MigrationDecision("Auto Replenish candidate selection", "BLOCKED",
            "print_task_config.py yok.", []))
    elif same("print_task_config.py"):
        rows.append(MigrationDecision("Auto Replenish candidate selection", "DROP",
            "Candidate dosyası Enhanced Golden Reference ile byte-identical.", ["hash=UNCHANGED"]))
    elif "PRELOAD_FINISH" in ptc and ("replenish" in ptc.lower()):
        rows.append(MigrationDecision("Auto Replenish candidate selection", "VERIFY",
            "Candidate aynı kavramsal anchor'ları içeriyor fakat byte-identical değil; PRELOAD hedef seçimi ve material+color eşleşmesi semantik doğrulanmalı.",
            ["PRELOAD_FINISH", "replenish"]))
    else:
        rows.append(MigrationDecision("Auto Replenish candidate selection", "REBASE",
            "Enhanced PRELOAD candidate davranışı görünmüyor; hedefli rebase gerekli.",
            []))

    # AR loader source selection
    ff_key = None
    if found.get("filament_feed_ace.py"):
        ff_key = "filament_feed_ace.py"
    elif found.get("filament_feed.py"):
        ff_key = "filament_feed.py"
    ff = t.get(ff_key, "") if ff_key else ""
    if not ff_key:
        rows.append(MigrationDecision("Auto Replenish loader permission", "BLOCKED",
            "Ne filament_feed_ace.py ne filament_feed.py bulundu.", []))
    elif same(ff_key):
        rows.append(MigrationDecision("Auto Replenish loader permission", "DROP",
            f"{ff_key} Enhanced Golden Reference ile byte-identical.", ["hash=UNCHANGED"]))
    elif all(x in ff.upper() for x in ("PRELOAD_FINISH", "REPLENISH", "PRINTING")):
        rows.append(MigrationDecision("Auto Replenish loader permission", "VERIFY",
            f"{ff_key} gerekli anchor'ları içeriyor; PRINTING=1 bypass'ın yalnız REPLENISH+multi+PRELOAD_FINISH için geçerli olduğu doğrulanmalı.",
            ["PRELOAD_FINISH", "REPLENISH", "PRINTING"]))
    else:
        rows.append(MigrationDecision("Auto Replenish loader permission", "REBASE",
            f"{ff_key} mevcut ancak doğrulanmış replenish loader semantiği görünmüyor.",
            []))

    # INNER_RESUME
    cfg = t.get("ace.cfg", "")
    if not found.get("ace.cfg"):
        rows.append(MigrationDecision("INNER_RESUME replenish gate", "BLOCKED",
            "ace.cfg yok.", []))
    elif same("ace.cfg"):
        rows.append(MigrationDecision("INNER_RESUME replenish gate", "DROP",
            "ace.cfg Enhanced Golden Reference ile byte-identical.", ["hash=UNCHANGED"]))
    elif all(x in cfg for x in ("INNER_RESUME", "REPLENISH", "SM_PRINT_AUTO_FEED")):
        rows.append(MigrationDecision("INNER_RESUME replenish gate", "VERIFY",
            "Yeni ace.cfg gerekli anchor'ları içeriyor; filament_exist bypass ve REPLENISH propagation semantik olarak doğrulanmalı.",
            ["INNER_RESUME", "REPLENISH", "SM_PRINT_AUTO_FEED"]))
    else:
        rows.append(MigrationDecision("INNER_RESUME replenish gate", "REBASE",
            "Doğrulanmış replenish gate semantiği görünmüyor; hedefli macro rebase gerekli.",
            []))

    # HEAD source guard
    be = t.get("main.py", "")
    if not found.get("main.py"):
        rows.append(MigrationDecision("HEAD auto-adopt source guard", "BLOCKED", "main.py yok.", []))
    elif "MULTIACE_HEAD_AUTO_ADOPT_SOURCE_GUARD_V1" in be:
        rows.append(MigrationDecision("HEAD auto-adopt source guard", "DROP",
            "Exact Enhanced guard marker candidate içinde zaten var.", ["MULTIACE_HEAD_AUTO_ADOPT_SOURCE_GUARD_V1"]))
    elif "head_tag_seen" in be:
        rows.append(MigrationDecision("HEAD auto-adopt source guard", "REBASE",
            "Eski head_tag_seen yolu var fakat Enhanced source guard yok; duplicate ACE-slot + HEAD binding koruması yeniden eklenmeli.",
            ["head_tag_seen"]))
    else:
        rows.append(MigrationDecision("HEAD auto-adopt source guard", "VERIFY",
            "Backend mimarisi değişmiş; upstream eşdeğer koruma olup olmadığı manuel semantik inceleme ister.",
            []))

    # Native print workflow
    routes = ["/api/preflight/moonraker", "/api/print/start", "/api/print/pause",
              "/api/print/resume", "/api/print/cancel"]
    pf = t.get("preflight_core.py", "")
    route_hits = [r for r in routes if r in be]
    processed = ("allow_processed" in be) or ("allow_processed" in pf) or \
                ("MULTIACE_NATIVE_PROCESSED_PREFLIGHT_V1" in be) or \
                ("MULTIACE_NATIVE_PROCESSED_PREFLIGHT_V1" in pf)
    if len(route_hits) == len(routes) and processed:
        rows.append(MigrationDecision("Native stored-G-code workflow", "DROP",
            "Candidate gerekli native route seti ve processed-file kabulünü zaten içeriyor.",
            route_hits + ["processed-file acceptance"]))
    elif found.get("main.py") and found.get("preflight_core.py"):
        rows.append(MigrationDecision("Native stored-G-code workflow", "MERGE",
            "Yeni upstream preflight mimarisi korunmalı; yalnız eksik Enhanced native route/processed davranışları merge edilmeli.",
            route_hits))
    else:
        rows.append(MigrationDecision("Native stored-G-code workflow", "BLOCKED",
            "Backend/preflight çekirdeği eksik; güvenli merge planı çıkarılamıyor.",
            []))

    # Transient warning
    fe = be + "\n" + t.get("app.js", "")
    if "MULTIACE_TRANSIENT_WARNING_PHYSICAL_STATE_V1" in fe:
        rows.append(MigrationDecision("Transient warning reconcile", "DROP",
            "Exact Enhanced physical-state marker zaten mevcut.",
            ["MULTIACE_TRANSIENT_WARNING_PHYSICAL_STATE_V1"]))
    elif found.get("main.py") and found.get("app.js"):
        rows.append(MigrationDecision("Transient warning reconcile", "REBASE",
            "Yeni notification sistemi korunarak yalnız fiziksel-state truth katmanı küçük rebase ile eklenmeli.",
            []))
    else:
        rows.append(MigrationDecision("Transient warning reconcile", "VERIFY",
            "Frontend/backend yapısı değişmiş; yeni upstream davranışı incelenmeli.",
            []))

    # Homing websocket
    horder = homing_status_order(be)
    if horder == "FIXED":
        if same("main.py"):
            rows.append(MigrationDecision("Homing/status websocket", "DROP",
                "Candidate backend Golden Reference ile byte-identical ve notify_status_update homing gate'ten önce işleniyor.",
                ["hash=UNCHANGED", "notify_status_update BEFORE _homing_active gate"]))
        else:
            rows.append(MigrationDecision("Homing/status websocket", "VERIFY",
                "Candidate, notify_status_update'ı homing gate'ten önce işliyor; Enhanced sıra mantığı mevcut görünüyor, runtime doğrulama gerekli.",
                ["notify_status_update BEFORE _homing_active gate"]))
    elif horder == "OLD":
        rows.append(MigrationDecision("Homing/status websocket", "REBASE",
            "Homing gate notify_status_update'dan önce; Enhanced print-state handling küçük rebase adayı.",
            ["_homing_active gate BEFORE notify_status_update"]))
    else:
        rows.append(MigrationDecision("Homing/status websocket", "VERIFY",
            "Websocket/state akış sırası otomatik doğrulanamadı; manuel semantik inceleme gerekli.",
            []))

    # State Bridge
    state_terms = ["gcode_move", "heater_bed", "square_corner_velocity", "minimum_cruise_ratio"]
    state_hits = [x for x in state_terms if x in be]
    if same("main.py"):
        rows.append(MigrationDecision("Klipper State Bridge", "DROP",
            "Backend Golden Reference ile byte-identical; State Bridge zaten mevcut.",
            ["hash=UNCHANGED"]))
    elif len(state_hits) == len(state_terms):
        rows.append(MigrationDecision("Klipper State Bridge", "VERIFY",
            "Gerekli native Klipper object/field anchor'ları mevcut; /api/state ve gerçek T0/T1 geçişi runtime doğrulanmalı.",
            state_hits))
    else:
        rows.append(MigrationDecision("Klipper State Bridge", "REBASE",
            "Golden State Bridge'in temel field/object seti candidate içinde eksik görünüyor.",
            state_hits))

    # RFID architecture
    tunnel = found.get("ace_gen1_tunnel.py")
    rfid_evidence = []
    for term in ("card_uids", "ACE_TAG_READ", "filament_identify", "rfid_test"):
        if term in be or term in t.get("ace.py", ""):
            rfid_evidence.append(term)
    if tunnel:
        rfid_evidence.append("ace_gen1_tunnel.py")
    rows.append(MigrationDecision("RFID acquisition + normalization", "MERGE",
        "Physical acquisition/protocol katmanında candidate/upstream temel alınmalı; Golden Enhanced normalization ve U1/Orca/Web sync davranışları yalnız eksikse merge edilmeli.",
        rfid_evidence))

    # Turkish i18n
    if not found.get("tr.json"):
        rows.append(MigrationDecision("Turkish i18n", "REBASE",
            "Candidate tr.json yok; yeni upstream key yapısına göre Türkçe katalog yeniden oluşturulmalı.",
            []))
    elif same("tr.json"):
        rows.append(MigrationDecision("Turkish i18n", "DROP",
            "Candidate tr.json Golden Reference ile byte-identical.", ["hash=UNCHANGED"]))
    else:
        rows.append(MigrationDecision("Turkish i18n", "MERGE",
            "Yeni upstream katalog/key seti korunarak Enhanced Türkçe karşılıklar merge edilmeli.",
            [found["tr.json"]]))

    # Persistence
    if found.get("S58multiace-mode"):
        if same("S58multiace-mode"):
            rows.append(MigrationDecision("Persistence / S58", "DROP",
                "S58 Golden Reference ile byte-identical.", ["hash=UNCHANGED"]))
        else:
            rows.append(MigrationDecision("Persistence / S58", "VERIFY",
                "2.0 startup/persistence davranışı değişmiş olabilir; eski finalizer körlemesine taşınmamalı.",
                [found["S58multiace-mode"]]))
    else:
        rows.append(MigrationDecision("Persistence / S58", "VERIFY",
            "S58multiace-mode bulunamadı; yeni persistence mimarisi incelenmeli.",
            []))

    # Runout zero-close is intentionally HOLD regardless of presence.
    zero_present = ("MULTIACE_RUNOUT_ZERO_CLOSE_V1" in be) or \
                   ("MULTIACE_RUNOUT_ZERO_CLOSE_V1" in t.get("ace.py", ""))
    rows.append(MigrationDecision("Runout Zero-Close", "HOLD",
        "İlk PAXX 2.0 geçişine taşınmayacak; gerçek <=5 g fiziksel runout doğrulaması tamamlanmadan release kapsamına alınmamalı.",
        ["marker present" if zero_present else "marker absent"]))

    return rows

def migration_result(decisions: List[MigrationDecision]) -> str:
    if any(d.decision == "BLOCKED" for d in decisions):
        return "BLOCKED"
    if any(d.decision in ("REBASE", "MERGE", "VERIFY") for d in decisions):
        return "REVIEW"
    return "READY"

def print_migration_plan(decisions: List[MigrationDecision]):
    print("=== MIGRATION DECISION ENGINE ===")
    rank = {"BLOCKED": 0, "REBASE": 1, "MERGE": 2, "VERIFY": 3, "HOLD": 4, "DROP": 5}
    for d in sorted(decisions, key=lambda x: (rank.get(x.decision, 9), x.feature)):
        print(f"[{d.decision:9}] {d.feature}")
        print(f"             {d.rationale}")
        if d.evidence:
            print("             evidence: " + ", ".join(d.evidence[:8]))
    print()
    print("=== MIGRATION RESULT ===")
    print(migration_result(decisions))
    print()

def print_report(candidate: Source, previous: Optional[Source], enhanced: Optional[Source],
                 file_rows: List[FileRow], features: List[FeatureRow], identities: List[str],
                 manifest_status: str, manifest_notes: List[str],
                 decisions: List[MigrationDecision]):
    print("=" * 78)
    print(f"PAXX + MultiACE COMPATIBILITY ANALYZER v{VERSION}")
    print("=" * 78)
    print(f"CANDIDATE : {candidate.path} [{candidate.kind}]")
    if previous:
        print(f"PREVIOUS  : {previous.path} [{previous.kind}]")
    if enhanced:
        print(f"ENHANCED  : {enhanced.path} [{enhanced.kind}]")
    print(f"FILES     : {len(list(candidate.files()))}")
    print(f"MANIFEST  : {manifest_status}" + (f" ({'; '.join(manifest_notes)})" if manifest_notes else ""))
    print()

    print("=== IDENTITY HINTS ===")
    if identities:
        for x in identities:
            print("  " + x)
    else:
        print("  no obvious PAXX/MultiACE version strings found")
    print()

    print("=== CRITICAL FILE MAP ===")
    for r in file_rows:
        mark = "OK" if r.candidate_path else "MISSING"
        extra = []
        if previous:
            extra.append(f"prev={r.previous_relation}")
        if enhanced:
            extra.append(f"enh={r.enhanced_relation}")
        suffix = (" | " + ", ".join(extra)) if extra else ""
        print(f"{mark:7} {r.key:28} -> {r.candidate_path or '-'}{suffix}")
    print()

    print("=== MIGRATION FEATURES ===")
    order = {"BLOCKED": 0, "REVIEW": 1, "SAFE": 2, "UNCHANGED": 3}
    for r in sorted(features, key=lambda x: (order.get(x.classification, 9), x.name)):
        print(f"[{r.classification:9}] {r.name}")
        print(f"             {r.details}")
        if r.evidence:
            print("             evidence: " + ", ".join(r.evidence[:8]))
    print()

    print_migration_plan(decisions)

    result = overall(features, file_rows)
    print("=== STATIC RESULT ===")
    print(result)
    if result == "BLOCKED":
        print("Do not auto-apply Enhanced patches. Resolve BLOCKED items first.")
    elif result == "REVIEW":
        print("Static structure is analyzable, but manual semantic diff/rebase is still required.")
    else:
        print("No static blocker found. Physical/runtime validation is still mandatory.")
    print("=" * 78)

def main():
    ap = argparse.ArgumentParser(
        description="Read-only compatibility analyzer for combined PAXX + embedded MultiACE firmware."
    )
    ap.add_argument("candidate", help="Combined PAXX+MultiACE extracted directory or archive")
    ap.add_argument("--previous", help="Previously analyzed combined PAXX+MultiACE directory/archive")
    ap.add_argument("--enhanced", help="MultiACE Enhanced reference directory/archive")
    ap.add_argument("--json", dest="json_path", help="Write machine-readable JSON report")
    args = ap.parse_args()

    candidate = Source(args.candidate)
    previous = Source(args.previous) if args.previous else None
    enhanced = Source(args.enhanced) if args.enhanced else None

    file_rows, found = build_file_rows(candidate, previous, enhanced)
    features = classify_features(candidate, found)
    features.extend(safety_checks(candidate, found))
    identities = infer_identity(candidate)
    manifest_status, manifest_notes = verify_sha256_manifest(candidate)
    decisions = migration_decisions(candidate, found, file_rows)

    print_report(candidate, previous, enhanced, file_rows, features, identities,
                 manifest_status, manifest_notes, decisions)

    if args.json_path:
        report = {
            "tool": "PAXX+MultiACE Compatibility Analyzer",
            "version": VERSION,
            "candidate": str(candidate.path),
            "candidate_kind": candidate.kind,
            "previous": str(previous.path) if previous else None,
            "enhanced": str(enhanced.path) if enhanced else None,
            "identity_hints": identities,
            "manifest_status": manifest_status,
            "manifest_notes": manifest_notes,
            "files": [asdict(x) for x in file_rows],
            "features": [asdict(x) for x in features],
            "migration_decisions": [asdict(x) for x in decisions],
            "migration_result": migration_result(decisions),
            "static_result": overall(features, file_rows),
        }
        Path(args.json_path).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"JSON report: {args.json_path}")

if __name__ == "__main__":
    main()
