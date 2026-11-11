const { createApp, ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } = Vue;
const API = "/multiace/api";
const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://")
             + location.host + "/multiace/ws";
const SCREEN = "/screen";
createApp({
  setup() {
    const _validTabs = new Set(["dashboard", "files", "machine", "config"]);
    const _storedTab = localStorage.getItem("multiace.tab");
    const _isPluginTab = (s) => typeof s === "string" && s.startsWith("plugin:");
    const sidebarOpen = ref(false);
    const tab = ref(
      (_validTabs.has(_storedTab) || _isPluginTab(_storedTab))
        ? _storedTab
        : "dashboard"
    );
    watch(tab, (v) => localStorage.setItem("multiace.tab", v));
    const plugins = reactive({items: [], loaded: false});
    async function refreshPlugins() {
      try {
        const r = await fetch(`${API}/integrations`);
        if (!r.ok) return;
        const j = await r.json();
        plugins.items = j.plugins || [];
      } catch (_) {
      } finally {
        plugins.loaded = true;
        if (_isPluginTab(tab.value)) {
          const pname = tab.value.slice("plugin:".length);
          if (!plugins.items.find(p => p.name === pname)) {
            tab.value = "dashboard";
          }
        }
      }
    }
    function pluginIframeSrc(p) {
      const u = (p && p.ui_url) || "/";
      return `/plugin/${p.name}${u.startsWith("/") ? u : "/" + u}`;
    }
    const language = ref(localStorage.getItem("multiace.lang") || "en");
    const languages = ref([{code: "en", name: "English"}]);
    const catalog = reactive({});
    const indexBase = ref(0);
    function t(key, params) {
      const parts = key.split('.');
      let v = catalog;
      for (const p of parts) {
        if (v == null) return key;
        v = v[p];
      }
      if (typeof v !== "string") return key;
      if (!params) return v;
      return v.replace(/\{(\w+)\}/g, (_, k) => params[k] != null ? params[k] : `{${k}}`);
    }
    function dispIdx(n) {
      if (n == null) return "–";
      return Number(n) + indexBase.value;
    }
    // Subtype label for display: hide the implicit defaults (empty / Basic /
    // generic) so only a meaningful subtype (Matte, Silk, HF, ...) shows.
    function subText(sku) {
      const s = (sku || "").trim();
      if (!s || ["basic", "generic"].includes(s.toLowerCase())) return "";
      return colorNameLabel(s);
    }
    // Provenance badge label for an identity source (spec §4 / D3):
    // rfid = read from tag, override = user-set, derived = from print job.
    // Empty/raw slots have no badge.
    function sourceLabel(src) {
      if (src === "rfid") return t("ui.common.source_rfid");
      if (src === "override") return t("ui.common.source_override");
      if (src === "derived") return t("ui.common.source_derived");
      return "";
    }

    function channelStateLabel(state) {
      const raw = String(state || "").trim();
      if (!raw) return "";
      const key = "ui.channel_state." + raw;
      const translated = t(key);
      return translated === key ? raw : translated;
    }
    async function loadCatalog(lang) {
      try {
        const r = await fetch(`${API}/i18n/${lang}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        for (const k of Object.keys(catalog)) delete catalog[k];
        Object.assign(catalog, data);
        document.documentElement.lang = lang;

      } catch (e) {
        console.warn("i18n load failed", e);
      }
    }
    async function loadLanguageList() {
      try {
        const r = await fetch(`${API}/i18n`);
        if (!r.ok) return;
        const j = await r.json();
        if (Array.isArray(j.languages) && j.languages.length) {
          languages.value = j.languages;
        }
      } catch (_) {}
    }
    async function setLanguage(lang) {
      language.value = lang;
      localStorage.setItem("multiace.lang", lang);
      await loadCatalog(lang);
      // Drive the Klipper-side _t() catalog too (pause/error messages) and
      // persist as ace__language, so display popup + Fluidd follow the UI
      // language. Live reload - no Klipper restart needed.
      try {
        await fetch(`${API}/macro`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({name: "MULTIACE_SET_LANGUAGE", args: {LANG: lang}}),
        });
      } catch (_) {}
    }
    const version = ref("");
    const printerName = ref("");
    const printerFw = ref("");
    const conn = ref({state: "init", text: "", i18n_key: "ui.header.connecting"});
    const connClass = computed(() => ({
      ok:   conn.value.state === "ok",
      warn: conn.value.state === "warn",
      err:  conn.value.state === "err",
    }));
    const connText = computed(() => conn.value.i18n_key ? t(conn.value.i18n_key) : conn.value.text);
    const screenAvailable = ref(false);
    const state = reactive({
      ace_status: null, ace_temp: null,
      temperatures: [],
      fans: [],
      homed_axes: "",
      max_velocity: 0,
      max_accel: 0,
      square_corner_velocity: 0,
      minimum_cruise_ratio: 0,
      speed_factor: 1,
      flow_factor: 1,
      z_offset: 0,
      active_extruder: "",
      active_tool: 0,
      can_extrude: false,
      printer_state: null,
      print_status: {
        state: "standby",
        filename: "",
        progress: 0,
        progress_percent: 0,
        print_duration: 0,
        total_duration: 0,
        remaining_time: null,
        estimated_total: null,
        estimated_finish: null,
        filament_used: 0,
        current_layer: null,
        total_layer: null,
        message: null,
        is_active: false,
      },
      active_device: null, device_count: 0,
      mode: "normal",
      ace_head: 3,
      ace_heads: [],
      head_feeder: {},
      head_ace: {},
      dryer: null,
      swap_in_progress: false,
      aces: [], toolheads: [], wiring: [],
      save_variables: {},
      bg_swap: {available: false, enabled_heads: [], busy: [], version: null},
    });
    const loadError = ref("");
    const notifications = ref([]);

    // Automatic M24 strict-preflight request waiting for user decision.
    const pendingFilamentSelection = ref(null);
    const pendingSelectionChoices = reactive({});
    let pendingSelectionLoading = false;

    async function loadPendingFilamentSelection(requestId) {
      if (pendingSelectionLoading) return;
      pendingSelectionLoading = true;
      try {
        const r = await fetch(`${API}/preflight/pending-selection`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const j = await r.json();
        const rows = (j && j.pending) || [];

        let found = null;
        if (requestId) {
          found = rows.find(
            x => String(x.request_id || "") === String(requestId)
          ) || null;
        } else {
          found = rows.find(
            x => x && !x.selected && !x.cancelled
          ) || null;
        }

        pendingFilamentSelection.value = found;
        for (const k of Object.keys(pendingSelectionChoices)) {
          delete pendingSelectionChoices[k];
        }
      } catch (e) {
        console.error("pending preflight selection load failed", e);
      } finally {
        pendingSelectionLoading = false;
      }
    }

    function choosePendingFilament(item, option) {
      if (!item || !option) return;
      pendingSelectionChoices[String(item.t)] = {
        ace: Number(option.ace),
        slot: Number(option.slot),
      };
    }

    function pendingFilamentChoiceKey(item) {
      const c = item && pendingSelectionChoices[String(item.t)];
      return c ? `${c.ace}-${c.slot}` : "";
    }

    function pendingFilamentAllSelected() {
      const req = pendingFilamentSelection.value;
      const items = (req && req.items) || [];
      return items.length > 0 &&
        items.every(item => pendingSelectionChoices[String(item.t)]);
    }

    async function submitPendingFilamentSelection() {
      const req = pendingFilamentSelection.value;
      if (!req || !req.request_id || !pendingFilamentAllSelected()) return;

      const remap = {};

      for (const item of (req.items || [])) {
        const c = pendingSelectionChoices[String(item.t)];
        const syntheticT = Number(c.ace) * 4 + Number(c.slot);
        remap[String(item.t)] = syntheticT;
      }

      try {
        const r = await fetch(
          `${API}/preflight/pending-selection/${encodeURIComponent(req.request_id)}/select`,
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({remap}),
          }
        );

        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j.detail || `${r.status} ${r.statusText}`);
        }

        pendingFilamentSelection.value = null;
        for (const k of Object.keys(pendingSelectionChoices)) {
          delete pendingSelectionChoices[k];
        }
        setMacroLog(t("ui.controls.preflight_selection_ok"));
      } catch (e) {
        setMacroLog(t("ui.controls.preflight_selection_failed", {error: e.message || e}));
      }
    }

    async function cancelPendingFilamentSelection() {
      const req = pendingFilamentSelection.value;
      if (!req || !req.request_id) return;

      try {
        const r = await fetch(
          `${API}/preflight/pending-selection/${encodeURIComponent(req.request_id)}`,
          {method: "DELETE"}
        );

        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j.detail || `${r.status} ${r.statusText}`);
        }

        pendingFilamentSelection.value = null;
        setMacroLog(t("ui.controls.preflight_cancelled"));
      } catch (e) {
        setMacroLog(t("ui.controls.preflight_cancel_failed", {error: e.message || e}));
      }
    }

    const _notifIds = new Set();

    function _notifText(n) {
      return String((n && (n.msg || n.raw)) || "").trim();
    }

    function _notifShouldHide(n) {
      const text = _notifText(n);

      // High-frequency feed-assist diagnostics belong in logs/debug,
      // not in the persistent red user notification strip.
      if (text.includes("FA start_feed_assist FAILED")) return true;

      // Routine unload verification warning: keep it in Klipper console/log,
      // but do not occupy the persistent red notification strip.
      if (
        text.includes("Boşaltma sonrasında Kafa") && text.includes("filament hâlâ algılanıyor")
      ) return true;
      if (
        text.includes("Filament still detected in head") && text.includes("after unload")
      ) return true;
      if (
        text.includes("Filament nach Unload weiterhin in Head")
      ) return true;
      if (
        text.includes("卸料后喷头") && text.includes("仍检测到耗材")
      ) return true;

      return false;
    }

    function _addNotif(n) {
      if (!n || n.id == null) return;
      if (_notifShouldHide(n)) return;

      const text = _notifText(n);

      // Do not stack the same user-facing error repeatedly.
      // Keep one row and refresh its latest metadata instead.
      if (text) {
        const existing = notifications.value.find(
          x => _notifText(x) === text
        );

        if (existing) {
          existing.ts = n.ts ?? existing.ts;
          existing.level = n.level ?? existing.level;
          existing.raw = n.raw ?? existing.raw;
          _notifIds.add(n.id);
          return;
        }
      }

      if (_notifIds.has(n.id)) return;

      _notifIds.add(n.id);
      notifications.value.push(n);

      if (notifications.value.length > 20) {
        const dropped = notifications.value.splice(
          0,
          notifications.value.length - 20
        );
        for (const d of dropped) _notifIds.delete(d.id);
      }
    }
    function onGcodeError(m) {
      _addNotif({id: m.id, ts: m.ts, msg: m.msg, raw: m.raw, level: m.level || 'error'});

      const text = String(m.msg || m.raw || "");
      if (text.includes("PREFLIGHT_SELECTION_REQUIRED")) {
        const mm = text.match(/request_id=([A-Za-z0-9_-]+)/);
        loadPendingFilamentSelection(mm ? mm[1] : null);
      }
    }
    async function loadNotifications() {
      try {
        const r = await fetch(`${API}/notifications`);
        if (!r.ok) return;
        const j = await r.json();
        for (const n of (j.notifications || [])) {
          _addNotif(n);

          const text = String(n.msg || n.raw || "");
          if (text.includes("PREFLIGHT_SELECTION_REQUIRED")) {
            const mm = text.match(/request_id=([A-Za-z0-9_-]+)/);
            loadPendingFilamentSelection(mm ? mm[1] : null);
          }
        }

        // Also recover a waiting request after browser refresh/reopen.
        if (!pendingFilamentSelection.value) {
          loadPendingFilamentSelection(null);
        }
      } catch (_) {}
    }
    async function dismissNotification(id) {
      const idx = notifications.value.findIndex(n => n.id === id);
      if (idx >= 0) {
        notifications.value.splice(idx, 1);
        _notifIds.delete(id);
      }
      try { await fetch(`${API}/notifications/${id}`, {method: "DELETE"}); } catch (_) {}
    }
    async function dismissAllNotifications() {
      const ids = notifications.value.map(n => n.id);
      notifications.value = [];
      for (const id of ids) _notifIds.delete(id);
      try { await fetch(`${API}/notifications`, {method: "DELETE"}); } catch (_) {}
    }
    function _unloadGateEmptyHeadIndex(n) {
      const text = _notifText(n);
      if (!text) return null;

      const isGateEmpty =
        (
          text.includes("Baskı kafasında hâlâ filament") &&
          text.includes("BOŞ bildiriyor")
        ) ||
        text.includes("reports EMPTY while the toolhead still holds filament") ||
        text.includes("meldet LEER, obwohl der Toolhead noch Filament hält");

      if (!isGateEmpty) return null;

      const m = text.match(/^(?:Kafa|Head|Kopf)\s+(\d+)\s*:/i);
      if (!m) return null;

      const shownHead = Number(m[1]);
      if (!Number.isFinite(shownHead) || shownHead < 1) return null;

      // UI/Klipper messages are 1-based; dashboard state idx is 0-based.
      return shownHead - 1;
    }

    // MULTIACE_TRANSIENT_WARNING_PHYSICAL_STATE_V1
    function _physicalHeadFilament(th) {
      if (!th || typeof th !== "object") return null;

      // Primary truth source: physical toolhead/extruder filament sensor.
      // Do NOT use filament_detected here: in some ACE states that value may
      // describe the upstream/gate path rather than resolved toolhead occupancy.
      if (th.filament_at_extruder === true || th.filament_at_extruder === 1) {
        return true;
      }
      if (th.filament_at_extruder === false || th.filament_at_extruder === 0) {
        return false;
      }

      // Compatibility fallback only when filament_at_extruder is unavailable.
      if (th.filament_in_toolhead === true || th.filament_in_toolhead === 1) {
        return true;
      }
      if (th.filament_in_toolhead === false || th.filament_in_toolhead === 0) {
        return false;
      }

      return null;
    }

    function _loadJamHeadIndex(n) {
      const text = _notifText(n);
      if (!text) return null;

      let m = null;

      // English historical/current form:
      // [multiACE] Load jam on Head 1 ...
      m = text.match(/Load jam on Head\s+(\d+)/i);
      if (m) {
        const shownHead = Number(m[1]);
        return Number.isFinite(shownHead) && shownHead >= 1
          ? shownHead - 1
          : null;
      }

      // Turkish form:
      // [multiACE] Kafa 1 ... yüklenirken filament sıkıştı ...
      if (
        text.includes("yüklenirken filament sıkıştı") ||
        text.includes("yükleme sırasında filament sıkıştı")
      ) {
        m = text.match(/Kafa\s+(\d+)/i);
        if (m) {
          const shownHead = Number(m[1]);
          return Number.isFinite(shownHead) && shownHead >= 1
            ? shownHead - 1
            : null;
        }
      }

      return null;
    }

    function _loadReallyFinished(th) {
      if (!th) return false;

      const channelState = String(th.channel_state || "").toLowerCase();
      const actionState = String(th.channel_action_state || "").toLowerCase();
      const channelError = String(th.channel_error || "").toLowerCase();

      const finished =
        channelState === "load_finish" ||
        actionState === "load_finish";

      const noRecordedFailure =
        th.load_failed !== true &&
        th.load_failed !== 1 &&
        (channelError === "" || channelError === "ok" || channelError === "none");

      return (
        finished &&
        noRecordedFailure &&
        _physicalHeadFilament(th) === true
      );
    }

    function _reconcileTransientNotifications(s) {
      const heads = Array.isArray(s && s.toolheads) ? s.toolheads : [];
      if (!heads.length || !notifications.value.length) return;

      for (const n of [...notifications.value]) {

        // 1) unload/gate mismatch:
        // Once the PHYSICAL toolhead sensor is definitely empty, the warning
        // describes an old state and may be dismissed.
        const unloadHeadIdx = _unloadGateEmptyHeadIndex(n);
        if (unloadHeadIdx != null) {
          const th = heads.find(x => Number(x.idx) === unloadHeadIdx);
          if (th && _physicalHeadFilament(th) === false) {
            dismissNotification(n.id);
          }
          continue;
        }

        // 2) Load Jam:
        // Never clear merely because a gate changed. Clear only after a real
        // successful load_finish AND the physical toolhead sensor sees filament.
        const jamHeadIdx = _loadJamHeadIndex(n);
        if (jamHeadIdx != null) {
          const th = heads.find(x => Number(x.idx) === jamHeadIdx);
          if (th && _loadReallyFinished(th)) {
            dismissNotification(n.id);
          }
        }
      }
    }

    function applyState(s) {
      if (!s) return;
      _reconcileTransientNotifications(s);
      // Klippy is down (firmware_restart / reboot in progress, Moonraker up).
      // Show a "please restart printer" hint instead of the raw 503, and keep
      // the last good dashboard visible. Recovers on the next state once
      // Klipper is back. Reuses loadError (no extra UI); cleared below when a
      // real state arrives so the hint never sticks.
      if (s.klippy === 'disconnected') {
        loadError.value = t('ui.common.please_restart');
        // A restart is in progress -> the pending config/mode change is being
        // applied; drop the persistent "restart needed" banner.
        rebootNeeded.value = false;
        return;
      }
      if (loadError.value === t('ui.common.please_restart')) loadError.value = "";
      state.ace_status    = s.ace_status ?? null;
      state.ace_temp      = s.ace_temp ?? null;
      state.temperatures  = Array.isArray(s.temperatures) ? s.temperatures : [];
      state.fans          = Array.isArray(s.fans) ? s.fans : [];
      state.homed_axes    = String(s.homed_axes || "");
      state.max_velocity  = Number(s.max_velocity ?? 0);
      state.max_accel     = Number(s.max_accel ?? 0);
      state.square_corner_velocity = Number(s.square_corner_velocity ?? 0);
      state.minimum_cruise_ratio = Number(s.minimum_cruise_ratio ?? 0);
      state.speed_factor  = Number(s.speed_factor ?? 1);
      state.flow_factor   = Number(s.flow_factor ?? 1);
      state.z_offset      = Number(s.z_offset ?? 0);
      state.active_extruder = String(s.active_extruder || "");
      state.active_tool = Number(s.active_tool ?? 0);
      state.can_extrude = !!s.can_extrude;
      state.printer_state = s.printer_state ?? null;
      state.print_status = (
        s.print_status &&
        typeof s.print_status === "object"
      )
        ? {
            state: s.print_status.state || "standby",
            filename: s.print_status.filename || "",
            progress: Number(s.print_status.progress) || 0,
            progress_percent: Number(s.print_status.progress_percent) || 0,
            print_duration: Number(s.print_status.print_duration) || 0,
            total_duration: Number(s.print_status.total_duration) || 0,
            remaining_time:
              s.print_status.remaining_time == null
                ? null
                : Number(s.print_status.remaining_time),
            estimated_total:
              s.print_status.estimated_total == null
                ? null
                : Number(s.print_status.estimated_total),
            estimated_finish:
              s.print_status.estimated_finish == null
                ? null
                : Number(s.print_status.estimated_finish),
            filament_used: Number(s.print_status.filament_used) || 0,
            current_layer:
              s.print_status.current_layer == null
                ? null
                : Number(s.print_status.current_layer),
            total_layer:
              s.print_status.total_layer == null
                ? null
                : Number(s.print_status.total_layer),
            message: s.print_status.message || null,
            is_active: !!s.print_status.is_active,
          }
        : {
            state: state.printer_state || "standby",
            filename: "",
            progress: 0,
            progress_percent: 0,
            print_duration: 0,
            total_duration: 0,
            remaining_time: null,
            estimated_total: null,
            estimated_finish: null,
            filament_used: 0,
            current_layer: null,
            total_layer: null,
            message: null,
            is_active: false,
          };
      state.active_device   = s.active_device ?? null;
      state.active_extruder = s.active_extruder ?? "";
      state.active_toolhead = s.active_toolhead ?? null;
      state.device_count    = s.device_count ?? 0;
      state.mode          = s.mode || "normal";
      state.ace_head      = (typeof s.ace_head === "number") ? s.ace_head : 3;
      state.ace_heads     = Array.isArray(s.ace_heads) ? s.ace_heads : [];
      state.head_feeder   = (s.head_feeder && typeof s.head_feeder === "object") ? s.head_feeder : {};
      state.head_ace      = (s.head_ace && typeof s.head_ace === "object") ? s.head_ace : {};
      state.dryer         = s.dryer ?? null;
      state.swap_in_progress = !!s.swap_in_progress;
      state.aces          = Array.isArray(s.aces) ? s.aces : [];
      state.toolheads     = Array.isArray(s.toolheads) ? s.toolheads : [];
      state.wiring        = Array.isArray(s.wiring) ? s.wiring : [];
      state.save_variables = s.save_variables || {};
      state.bg_swap       = (s.bg_swap && typeof s.bg_swap === "object")
        ? s.bg_swap
        : {available: false, enabled_heads: [], busy: [], version: null};
      if (typeof s.display_index_base === "number") {
        indexBase.value = s.display_index_base;
      }
      for (const a of state.aces) {
        if (!dryerCfg[a.idx]) dryerCfg[a.idx] = {temp: 50, duration: 240};
      }
    }
    const gcodeFiles = ref([]);
    const gcodeFilesLoading = ref(false);
    const gcodeFilesError = ref("");

    function formatFileSize(bytes) {
      const n = Number(bytes);
      if (!Number.isFinite(n) || n < 0) return "–";
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatFileDate(ts) {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return "–";
      try {
        return new Date(n * 1000).toLocaleString();
      } catch (_) {
        return "–";
      }
    }

    async function loadGcodeFiles() {
      gcodeFilesLoading.value = true;
      gcodeFilesError.value = "";
      try {
        const r = await fetch(`${API}/files`);
        if (!r.ok) {
          let msg = `HTTP ${r.status}`;
          try {
            const j = await r.json();
            if (j.detail) msg = j.detail;
          } catch (_) {}
          throw new Error(msg);
        }

        const j = await r.json();
        gcodeFiles.value = Array.isArray(j.files) ? j.files : [];
      } catch (e) {
        gcodeFilesError.value = e && e.message ? e.message : String(e);
      } finally {
        gcodeFilesLoading.value = false;
      }
    }

    async function loadPreflightHistory() {
      preflight.history = [];
      preflight.historyLoading = true;
      try {
        const hr = await fetch(`${API}/analytics/reports?limit=200`);
        if (!hr.ok) return;
        const hj = await hr.json();
        const name = preflight.report && preflight.report.filename;
        preflight.history = ((hj && hj.reports) || []).filter(
          x => x && x.filename === name
        );
      } catch (_) {
        preflight.history = [];
      } finally {
        preflight.historyLoading = false;
      }
    }

    async function printStoredGcode(file) {
      if (!file || !file.name || preflight.busy || preflight.sending) return;

      preflight.open = true;
      preflight.busy = true;
      preflight.sending = "";
      preflight.report = null;
      preflight.error = "";
      preflight.progress = null;
      preflight.local = false;

      try {
        const r = await fetch(
          `${API}/preflight/moonraker?filename=${encodeURIComponent(file.name)}`
        );

        if (!r.ok) {
          let msg = `${r.status} ${r.statusText}`;
          try {
            const j = await r.json();
            if (j.detail) msg = j.detail;
          } catch (_) {}
          throw new Error(msg);
        }

        preflight.report = await r.json();
        await loadPreflightHistory();

        preflight.slicerOverrides = {};
        preflight.slicerSwaps = null;
        preflight.slicerDirty = false;
        preflight.headOverrides = {};
        preflight.headSwaps = null;
        preflight.headDirty = false;

      } catch (e) {
        preflight.error = e.message || String(e);
      } finally {
        preflight.busy = false;
      }
    }

    async function reloadState() {
      try {
        const r = await fetch(`${API}/state`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        loadError.value = j.error || "";
        applyState(j);
      } catch (e) {
        loadError.value = String(e);
      }
    }
    const macroLog = ref("");
    let _macroLogTimer = null;
    function setMacroLog(msg) {
      macroLog.value = msg || "";
      if (_macroLogTimer) { clearTimeout(_macroLogTimer); _macroLogTimer = null; }
      if (msg) {
        _macroLogTimer = setTimeout(() => {
          macroLog.value = "";
          _macroLogTimer = null;
        }, 5000);
      }
    }
    const dryerCfg = reactive({});
    const cmdQueue = ref([]);
    const visibleQueue = computed(() => cmdQueue.value.filter(it => !it.silent));
    const cmdPaused = ref(false);
    let cmdQueueRunning = false;
    function _newId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function _argsKey(args) {
      const a = args || {};
      return Object.keys(a).sort().map(k => `${k}=${a[k]}`).join('|');
    }
    function enqueue(name, args, opts) {
      return new Promise((resolve) => {
        const key = _argsKey(args);
        const dup = cmdQueue.value.find(it =>
          (it.status === 'queued' || it.status === 'running')
          && it.cmd === name
          && _argsKey(it.args) === key);
        if (dup) { resolve(false); return; }
        const it = reactive({
          id: _newId(),
          cmd: name,
          args: args || {},
          status: 'queued',
          error: '',
          silent: !!(opts && opts.silent),
          _resolve: resolve,
        });
        cmdQueue.value.unshift(it);
        _scheduleAdvance();
      });
    }
    function removeFromQueue(id) {
      const idx = cmdQueue.value.findIndex(i => i.id === id);
      if (idx < 0) return;
      const it = cmdQueue.value[idx];
      if (it.status === 'running') return;
      cmdQueue.value.splice(idx, 1);
      if (it._resolve) it._resolve(false);
      _scheduleAdvance();
    }
    function pauseQueue() { cmdPaused.value = true; }
    function resumeQueue() {
      cmdPaused.value = false;
      _scheduleAdvance();
    }
    function _scheduleAdvance() {
      if (cmdQueueRunning) return;
      if (cmdPaused.value) return;
      if (cmdQueue.value.length === 0) return;
      // Klipper processes gcode serially: a Load/Unload swap holds
      // its slot for 5-15 min. POSTing /api/macro while
      // state.swap_in_progress would just block waiting for the
      // current swap and eventually hit httpx's ReadTimeout. Let
      // queued items wait visible in the queue; a watcher on
      // state.swap_in_progress re-invokes us when Klipper clears.
      if (state.swap_in_progress) return;
      const arr = cmdQueue.value;
      let target = null;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].status === 'queued') { target = arr[i]; break; }
        if (arr[i].status === 'error')  { return; }
      }
      if (!target) {
        _scheduleIdleClear();
        return;
      }
      _runItem(target);
    }
    function _scheduleIdleClear() {
      const stillActive = cmdQueue.value.some(
        it => it.status === 'queued' || it.status === 'running');
      if (stillActive) return;
      if (cmdPaused.value) cmdPaused.value = false;
    }
    async function _runItem(it) {
      cmdQueueRunning = true;
      it.status = 'running';
      const parts = [it.cmd];
      for (const [k, v] of Object.entries(it.args || {})) {
        parts.push(`${k}=${v}`);
      }
      const script = parts.join(' ');
      try {
        const r = await fetch(`${API}/macro`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({name: it.cmd, args: it.args || {}}),
        });
        const j = await r.json();
        if (!r.ok || j.detail) {
          it.status = 'error';
          it.error = String(j.detail || `HTTP ${r.status}`);
          it.silent = false;
          cmdPaused.value = true;
        } else {
          const idx = cmdQueue.value.indexOf(it);
          if (idx >= 0) cmdQueue.value.splice(idx, 1);
          it.status = 'done';
        }
      } catch (e) {
        it.status = 'error';
        it.error = String(e);
        it.silent = false;
        cmdPaused.value = true;
      } finally {
        cmdQueueRunning = false;
        if (it._resolve) it._resolve(it.status !== 'error');
      }
      _scheduleAdvance();
    }
    function run(name, args) { return enqueue(name, args); }
    function clearAllErrors() {
      cmdQueue.value = cmdQueue.value.filter(it => it.status !== 'error');
      cmdPaused.value = false;
      if (notifications.value.length) {
        dismissAllNotifications();
      }
      _scheduleAdvance();
    }
    const sendingAll = ref(false);
    async function sendAllToPrinter() {
      const items = cmdQueue.value.filter(it => it.status === 'queued');
      if (!items.length) return;
      const commands = items.map(it => ({name: it.cmd, args: it.args || {}}));
      sendingAll.value = true;
      try {
        const r = await fetch(`${API}/macro-batch`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({commands}),
        });
        if (!r.ok) {
          let msg = `${r.status} ${r.statusText}`;
          try { const j = await r.json(); if (j.detail) msg = j.detail; } catch (_) {}
          throw new Error(msg);
        }
        for (const it of items) {
          const idx = cmdQueue.value.indexOf(it);
          if (idx >= 0) cmdQueue.value.splice(idx, 1);
          if (it._resolve) it._resolve(true);
        }
        setMacroLog(t("ui.queue.send_all_done", {count: commands.length}));
      } catch (e) {
        setMacroLog(`${t("ui.queue.send_all_failed")}: ${e.message || e}`);
        confirm({
          title: t("ui.queue.send_all_failed"),
          message: String(e.message || e),
          dismissOnly: true, okLabel: "OK", onOk: () => {},
        });
      } finally {
        sendingAll.value = false;
      }
    }
    function fmtArgs(args) {
      if (!args) return "";
      const parts = [];
      for (const [k, v] of Object.entries(args)) {
        const s = String(v);
        parts.push(`${k}=${s.length > 12 ? s.slice(0, 12) + '…' : s}`);
      }
      return parts.join(' ');
    }
    function cmdLabel(it) {
      const a = it.args || {};
      const di = (n) => dispIdx(Number(n));
      switch (it.cmd) {
        case 'SET_PRINT_FILAMENT_CONFIG':
          return t("ui.controls.cmd_display", {head: di(a.CONFIG_EXTRUDER ?? 0)});
        case 'ACE_LOAD_HEAD':
          return t("ui.controls.cmd_load", {head: di(a.HEAD ?? 0), ace: di(a.ACE ?? 0)});
        case 'ACE_SWAP_HEAD':
          return t("ui.controls.cmd_swap", {head: di(a.HEAD ?? 0), ace: di(a.ACE ?? 0)});
        case 'ACE_UNLOAD_HEAD':
          return t("ui.controls.cmd_unload", {head: di(a.HEAD ?? 0)});
        case 'ACE_UNLOAD_ALL_HEADS':
          return t("ui.enhanced.unload_all");
        case 'ACE_SWITCH':
          return `ACE ${di(a.TARGET ?? 0)}` + ((a.AUTOLOAD == 1 || a.AUTOLOAD === true) ? ' (' + t("ui.controls.auto_load") + ')' : '');
        case 'ACE_DRY':
          return `${t("ui.enhanced.dry_ace")} ${di(a.ACE ?? 0)} ${a.TEMP}°C / ${a.DURATION} ${t("ui.enhanced.minutes_short")}`;
        case 'ACE_STOP_DRYING':
          return `${t("ui.enhanced.stop_dry_ace")} ${di(a.ACE ?? 0)}`;
      }
      return null;
    }
    function slotTitle(ace, slot) {
      const bits = [`ACE ${dispIdx(ace.idx)} / ${t("ui.localized.slot")} ${dispIdx(slot.idx)}`];

      if (slot.material) bits.push(slot.material);
      if (slot.brand) bits.push(slot.brand);

      if (slot.spoolman) {
        const sp = slot.spoolman;

        if (sp.name) bits.push(sp.name);

        if (sp.remaining_weight != null) {
          bits.push(t("ui.controls.remaining_short", {weight: Math.round(sp.remaining_weight)}));
        }

        if (sp.nozzle_temp != null || sp.bed_temp != null) {
          const nozzle = sp.nozzle_temp != null ? `${sp.nozzle_temp}°C` : "?";
          const bed = sp.bed_temp != null ? `${sp.bed_temp}°C` : "?";
          bits.push(t("ui.controls.nozzle_bed", {nozzle, bed}));
        }

        if (sp.spool_id != null) {
          bits.push(`Spoolman #${sp.spool_id}`);
        }
      }

      bits.push(channelStateLabel(slot.state));

      if (slot.color) bits.push(slot.color);

      return bits.join(" · ");
    }

    const wiringContainerEl = ref(null);
    const slotEls = {};
    const thEls = {};
    const layoutTick = ref(0);
    function setSlotEl(ace, slot, el) {
      const k = `${ace}_${slot}`;
      if (el) slotEls[k] = el; else delete slotEls[k];
    }
    function setThEl(idx, el) {
      if (el) thEls[idx] = el; else delete thEls[idx];
    }
    const wiringPaths = ref([]);
    const wiringViewBox = ref("0 0 100 100");
    function recomputeWiring() {
      const c = wiringContainerEl.value;
      if (!c) { wiringPaths.value = []; return; }
      const cb = c.getBoundingClientRect();
      wiringViewBox.value = `0 0 ${cb.width} ${cb.height}`;
      const lines = [];
      for (const w of state.wiring) {
        const sEl = slotEls[`${w.ace}_${w.slot}`];
        const tEl = thEls[w.toolhead];
        if (!sEl || !tEl) continue;
        const sb = sEl.getBoundingClientRect();
        const tb = tEl.getBoundingClientRect();
        const x1 = sb.left + sb.width / 2 - cb.left;
        const y1 = sb.bottom - cb.top;
        const x2 = tb.left + tb.width / 2 - cb.left;
        const y2 = tb.top - cb.top;
        const midY = (y1 + y2) / 2;
        lines.push({
          d: `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`,
          color: w.color || "#888",
        });
      }
      wiringPaths.value = lines;
    }
    let wiringRaf = null;
    let wiringScheduled = false;

    function scheduleWiringRecompute() {
      // Background tabs pause requestAnimationFrame. Do not build up
      // layout work while the page is hidden; one fresh calculation
      // will be scheduled when the tab becomes visible again.
      if (document.visibilityState !== "visible") return;
      if (wiringScheduled) return;

      wiringScheduled = true;

      nextTick(() => {
        if (document.visibilityState !== "visible") {
          wiringScheduled = false;
          return;
        }

        recomputeWiring();

        wiringRaf = requestAnimationFrame(() => {
          wiringRaf = null;
          wiringScheduled = false;
          if (document.visibilityState === "visible") {
            recomputeWiring();
          }
        });
      });
    }
    // Resume the queue automatically the moment Klipper's swap flag
    // flips back to false. Without this the queue would only advance
    // on the next user action.
    watch(() => state.swap_in_progress, (v) => { if (!v) _scheduleAdvance(); });

    watch(() => state.wiring, scheduleWiringRecompute, {deep: true});
    watch(() => state.aces.length, scheduleWiringRecompute);
    watch(() => state.toolheads.length, scheduleWiringRecompute);
    watch(() => tab.value, (v) => { if (v === "dashboard") scheduleWiringRecompute(); });
    function switchAce(idx) {
      run("ACE_SWITCH", {TARGET: idx});
    }
    function loadAll(idx) {
      if (_blockIfPrinting()) return;
      run("ACE_SWITCH", {TARGET: idx, AUTOLOAD: 1});
    }
    function _phaseFor(channelState) {
      if (!channelState) return null;
      const s = String(channelState);
      if (s.endsWith('_finish') || s.endsWith('_fail')) return null;
      if (s === 'wait_insert' || s === 'inited' || s === 'test') return null;
      if (s.startsWith('unload_')) return 'unloading';
      if (s.startsWith('load_'))   return 'loading';
      if (s.startsWith('preload_')) return 'loading';
      if (s.startsWith('manual_sta_')) return 'loading';
      return null;
    }
    const toolheadOps = computed(() => {
      const ops = {};
      for (const t of state.toolheads) {
        const p = _phaseFor(t.channel_state);
        if (p) ops[t.idx] = p;
      }
      return ops;
    });
    // During an ACTIVE print, a user-initiated load/unload from the dashboard
    // would interleave its homing/moves into the running motion queue and ruin
    // the print: Klipper is single-threaded, but gcode injected via Moonraker
    // runs BETWEEN the SD-print lines, it is NOT ignored. The print's OWN swaps
    // (ACE_SWAP_HEAD from the gcode file) and runout-reloads do not go through
    // these buttons, so block the buttons here instead of in the engine (a
    // command-level block would also kill the print's own swap). Gated on
    // 'printing' ONLY - a PAUSED print still needs Load for runout recovery
    // (see needsReload). Drying the other ACE mid-print is a wanted feature and
    // stays enabled (the FA-preserve in _perform_switch + the V2 watchdog keep
    // the printing head fed).
    const printActionBusy = ref("");

    const printStatusActive = computed(() => {
      const ps = state.print_status || {};
      return !!ps.is_active || ["printing", "paused"].includes(
        String(ps.state || "").toLowerCase()
      );
    });

    const printProgressStyle = computed(() => {
      const raw = Number(state.print_status?.progress_percent) || 0;
      const percent = Math.max(0, Math.min(100, raw));
      return {width: `${percent}%`};
    });

    function printStateClass(value) {
      const s = String(value || "standby").toLowerCase();
      if (s === "printing") return "printing";
      if (s === "paused") return "paused";
      if (["error", "cancelled", "canceled"].includes(s)) return "error";
      if (s === "complete") return "complete";
      return "idle";
    }

    function printStateLabel(value) {
      const s = String(value || "standby").toLowerCase();
      const labels = {
        printing: t("ui.enhanced.status_printing"),
        paused: t("ui.enhanced.status_paused"),
        complete: t("ui.enhanced.status_complete"),
        cancelled: t("ui.enhanced.status_cancelled"),
        canceled: t("ui.enhanced.status_cancelled"),
        error: t("ui.enhanced.status_error"),
        standby: t("ui.enhanced.status_ready"),
        idle: t("ui.enhanced.status_ready"),
      };
      return labels[s] || s.toUpperCase();
    }

    function formatPrintTime(seconds) {
      const value = Number(seconds);
      if (!Number.isFinite(value) || value < 0) return "–";

      const total = Math.floor(value);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const secs = total % 60;

      return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(secs).padStart(2, "0"),
      ].join(":");
    }

    function formatFinishTime(timestamp) {
      const value = Number(timestamp);
      if (!Number.isFinite(value) || value <= 0) return "–";

      return new Date(value * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    function formatFilamentUsed(value) {
      const mm = Number(value);
      if (!Number.isFinite(mm) || mm <= 0) return "0 mm";
      if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
      return `${Math.round(mm)} mm`;
    }

    function formatPrintFilename(value) {
      let name = String(value || "").trim();
      if (!name) return t("ui.enhanced.unnamed_print_job");

      try {
        name = decodeURIComponent(name);
      } catch (_) {}

      return name
        .replace(/\+/g, " ")
        .replace(/\.gcode$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const activePrintFilament = computed(() => {
      const toolheads = Array.isArray(state.toolheads)
        ? state.toolheads
        : [];

      const activeToolhead = Number(state.active_toolhead);

      if (!Number.isInteger(activeToolhead)) return null;

      const toolhead = toolheads.find(
        th => Number(th.idx) === activeToolhead
      );

      if (
        !toolhead ||
        !toolhead.head_source_known ||
        toolhead.ace === null ||
        toolhead.ace === undefined ||
        toolhead.slot === null ||
        toolhead.slot === undefined
      ) {
        return null;
      }

      const aces = Array.isArray(state.aces) ? state.aces : [];
      const ace = aces.find(
        item => Number(item.idx) === Number(toolhead.ace)
      );

      if (!ace) return null;

      const slots = Array.isArray(ace.slots) ? ace.slots : [];
      const slot = slots.find(
        item => Number(item.idx) === Number(toolhead.slot)
      );

      if (!slot) return null;

      const spool = (
        slot.spoolman &&
        typeof slot.spoolman === "object"
      )
        ? slot.spoolman
        : {};

      return {
        ace: ace.idx,
        slot: slot.idx,
        toolhead: activeToolhead,
        vendor:
          spool.vendor ||
          slot.brand ||
          slot.vendor ||
          "",
        material:
          spool.material ||
          slot.material ||
          "",
        subtype:
          spool.subtype ||
          slot.subtype ||
          slot.sku ||
          "",
        color:
          spool.color ||
          slot.color ||
          "#777777",
        spool_id:
          spool.spool_id ?? null,
        remaining_weight:
          spool.remaining_weight ?? null,
        initial_weight:
          spool.initial_weight ?? null,
      };
    });

    function activeFilamentColorStyle() {
      const color = String(
        activePrintFilament.value?.color || "#777777"
      ).trim();

      if (/^#[0-9a-fA-F]{6}$/.test(color)) {
        return {"--active-filament-color": color};
      }

      return {"--active-filament-color": "#777777"};
    }

    function activeFilamentTitle() {
      const filament = activePrintFilament.value;
      if (!filament) return t("ui.enhanced.active_filament_unavailable");

      const parts = [];

      if (filament.vendor) parts.push(filament.vendor);
      if (filament.material) parts.push(filament.material);
      if (filament.subtype) parts.push(filament.subtype);

      return parts.join(" · ") || t("ui.enhanced.filament_loaded");
    }

    async function printControl(action) {
      if (printActionBusy.value) return;

      if (action === "cancel") {
        const progress =
          Number(state.print_status?.progress_percent || 0).toFixed(1);

        const approved = window.confirm(
          t("ui.controls.print_cancel_confirm", {progress})
        );

        if (!approved) return;
      }

      printActionBusy.value = action;

      try {
        const response = await fetch(`${API}/print/${action}`, {
          method: "POST",
          headers: {"Accept": "application/json"},
        });

        let result = {};
        try {
          result = await response.json();
        } catch (_) {}

        if (!response.ok) {
          const detail =
            result?.detail ||
            result?.error ||
            `HTTP ${response.status}`;
          throw new Error(detail);
        }

        await new Promise(resolve => setTimeout(resolve, 350));
        await reloadState();
      } catch (error) {
        window.alert(
          t("ui.controls.print_command_failed", {error: String(error?.message || error)})
        );
      } finally {
        printActionBusy.value = "";
      }
    }

    function pausePrint() {
      return printControl("pause");
    }

    function resumePrint() {
      return printControl("resume");
    }

    function cancelPrint() {
      return printControl("cancel");
    }

    // MultiACE Enhanced V5 Temperature Control
    const temperatureBusy = reactive({});
    const temperatureDraft = reactive({});

    function temperatureDraftValue(item) {
      const key = String(item?.object || "");
      if (Object.prototype.hasOwnProperty.call(temperatureDraft, key)) {
        return temperatureDraft[key];
      }
      const target = Number(item?.target);
      return Number.isFinite(target) ? target : 0;
    }

    function setTemperatureDraft(item, value) {
      if (!item?.object) return;
      temperatureDraft[String(item.object)] = value;
    }

    // MULTIACE_NULL_TEMPERATURE_DISPLAY_V1
    function formatTemperature(value) {
      if (value === null || value === undefined || value === "") return "–";
      const n = Number(value);
      return Number.isFinite(n) ? n.toFixed(1) : "–";
    }

    function temperatureControllable(item) {
      return !!(
        item &&
        item.object &&
        item.kind !== "cavity" &&
        item.target !== null &&
        item.target !== undefined
      );
    }

    async function setTemperature(item, rawTarget) {
      if (!temperatureControllable(item)) return;

      const target = Number(rawTarget);

      if (!Number.isFinite(target) || target < 0 || target > 350) {
        window.alert(t("ui.controls.invalid_temperature"));
        return;
      }

      const objectName = String(item.object);
      temperatureBusy[objectName] = true;

      try {
        const r = await fetch(`${API}/temperature`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            object: objectName,
            target,
          }),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

        await new Promise(resolve => setTimeout(resolve, 250));
        await reloadState();

      } catch (e) {
        window.alert(t("ui.controls.temperature_failed", {error: String(e?.message || e)}));
      } finally {
        temperatureBusy[objectName] = false;
      }
    }

    // MultiACE Enhanced V5 Dynamic Macro Panel
    const dynamicMacros = ref({
      multiace: [],
      print: [],
      calibration: [],
      filament: [],
      other: [],
    });

    const dynamicMacroCounts = ref({
      all: 0,
      visible: 0,
      hidden: 0,
    });

    const dynamicMacroLoading = ref(false);
    const dynamicMacroError = ref("");

    const dynamicMacroOpen = reactive({
      multiace: true,
      print: true,
      calibration: false,
      filament: false,
      other: false,
    });

    const dynamicMacroGroups = [
      {key: "multiace"},
      {key: "print"},
      {key: "calibration"},
      {key: "filament"},
      {key: "other"},
    ];

    async function loadDynamicMacros() {
      dynamicMacroLoading.value = true;
      dynamicMacroError.value = "";

      try {
        const r = await fetch(`${API}/enhanced/macros`);
        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

        const cats = (
          j.categorized &&
          typeof j.categorized === "object"
        )
          ? j.categorized
          : {};

        // MULTIACE_BUILTIN_TOOLS_T0_T3_V1
        // T0-T3 are native physical-tool commands registered by
        // kinematics/extruder.py, not gcode_macro objects.  Add them only
        // to the UI; do not create duplicate Klipper macros.
        const builtinToolItems = [0, 1, 2, 3].map(n => ({
          name: `T${n}`,
          object: null,
          group: "other",
          builtin: true,
        }));

        // MULTIACE_UI_MACRO_HIDE_V1
        // Internal/service macros remain available to Klipper but are
        // intentionally omitted from the user-facing MultiACE panel.
        const uiHiddenMacroNames = new Set([
          "AUTO_FEEDING",
          "AUTO_FEEDING_BATCH",
          "AUTO_FEEDING_PREHEAT",
          "CONTROL_EXTRUDE_ACTION",
          "FEED_HANG_NEUTRAL",
          "FEEDING_RUNOUT_EVENT_HANDLE",
          "FINELY_CLEAN_NOZZLE_STAGE_1",
          "FINELY_CLEAN_NOZZLE_STAGE_2",
          "INNER_CUTOFF_BASE_DISCARD",
          "INNER_DETECT_NOZZLE_STAGE_1",
          "INNER_DETECT_NOZZLE_STAGE_2",
          "INNER_FLOW_MEASURE_END_BASE_DISCARD",
          "INNER_MANUAL_FEED_STAGE_EXTRUDE",
          "INNER_MANUAL_FEED_STAGE_FINISH",
          "INNER_MANUAL_FEED_STAGE_FLUSH",
          "INNER_MANUAL_FEED_STAGE_PREPARE",
          "INNER_ROUGHLY_CLEAN_NOZZLE_BASE_DISCARD",
          "MANUAL_FEEDING",
          "CHANGE_TOOL",
          "SENSORLESS_HOME_X",
          "SENSORLESS_HOME_Y",
          "SENSORLESS_HOME_Z",
          "SET_COLOR",
          "SET_MAP",
          "SET_MATERIAL",
          "SET_SPOOL_ID",
          "SET_VENDOR",
          "SET_WEIGHT",
          "SHAKE_Z"
        ]);

        for (const group of dynamicMacroGroups) {
          let items = Array.isArray(cats[group.key])
            ? [...cats[group.key]]
            : [];

          items = items.filter(item =>
            !uiHiddenMacroNames.has(
              String(item?.name || "").toUpperCase()
            )
          );

          if (group.key === "other") {
            const names = new Set(
              items.map(item => String(item?.name || "").toUpperCase())
            );

            items = [
              ...builtinToolItems.filter(
                item => !names.has(item.name.toUpperCase())
              ),
              ...items,
            ];

            // Keep tool commands in natural order:
            // T0,T1,T2,...T31 rather than T0,T1,T10,...
            items.sort((a, b) => {
              const an = /^T(\d+)$/i.exec(String(a?.name || ""));
              const bn = /^T(\d+)$/i.exec(String(b?.name || ""));

              if (an && bn) {
                return Number(an[1]) - Number(bn[1]);
              }
              if (an) return -1;
              if (bn) return 1;

              return String(a?.name || "").localeCompare(
                String(b?.name || ""),
                undefined,
                {sensitivity: "base"}
              );
            });
          }

          dynamicMacros.value[group.key] = items;
        }

        dynamicMacroCounts.value = {
          all: Number(j.counts?.all) || 0,
          visible: Number(j.counts?.visible) || 0,
          hidden: Number(j.counts?.hidden) || 0,
        };

      } catch (e) {
        dynamicMacroError.value = String(e?.message || e);
      } finally {
        dynamicMacroLoading.value = false;
      }
    }

    function toggleDynamicMacroGroup(key) {
      dynamicMacroOpen[key] = !dynamicMacroOpen[key];
    }

    async function selectDynamicMacro(item) {
      if (!item || !item.name) return;

      const script = String(item.name).trim();
      if (!script) return;

      try {
        echoConsoleCommand(script);

        const r = await fetch(`${API}/plugin-api/gcode`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({script}),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

      } catch (e) {
        window.alert(
          t("ui.controls.klipper_failed", {
            error: String(e?.message || e)
          })
        );
      }
    }

    // MultiACE Enhanced V5 Homing Guard
    function axisHomed(axis) {
      const a = String(axis || "").toLowerCase();
      return String(state.homed_axes || "").toLowerCase().includes(a);
    }

    const allAxesHomed = computed(() =>
      axisHomed("x") &&
      axisHomed("y") &&
      axisHomed("z")
    );

    // MultiACE Enhanced V5 Speed Flow Control
    const speedFlowBusy = ref("");
    const speedFactorDraft = ref(null);
    const flowFactorDraft = ref(null);

    function speedFactorValue() {
      return speedFactorDraft.value != null
        ? Number(speedFactorDraft.value)
        : factorPercent(state.speed_factor);
    }

    function flowFactorValue() {
      return flowFactorDraft.value != null
        ? Number(flowFactorDraft.value)
        : factorPercent(state.flow_factor);
    }

    function updateSpeedDraft(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      speedFactorDraft.value = Math.max(1, Math.min(300, n));
    }

    function updateFlowDraft(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      flowFactorDraft.value = Math.max(1, Math.min(200, n));
    }

    function factorPercent(value) {
      const n = Number(value);
      return Math.round((Number.isFinite(n) ? n : 1) * 100);
    }

    async function setSpeedFactor(percent) {
      if (speedFlowBusy.value) return;

      const p = Math.max(1, Math.min(300, Number(percent) || 100));

      speedFlowBusy.value = "speed";

      try {
        await sendConsoleCommandRaw(`M220 S${p}`);
        await new Promise(resolve => setTimeout(resolve, 250));
        await reloadState();
        speedFactorDraft.value = null;
      } finally {
        speedFlowBusy.value = "";
      }
    }

    async function setFlowFactor(percent) {
      if (speedFlowBusy.value) return;

      const p = Math.max(1, Math.min(200, Number(percent) || 100));

      speedFlowBusy.value = "flow";

      try {
        await sendConsoleCommandRaw(`M221 S${p}`);
        await new Promise(resolve => setTimeout(resolve, 250));
        await reloadState();
        flowFactorDraft.value = null;
      } finally {
        speedFlowBusy.value = "";
      }
    }

    const machineLimitBusy = ref("");

    async function setMachineLimit(kind, value) {
      if (machineLimitBusy.value || isPrinting.value) return;

      const n = Number(value);
      if (!Number.isFinite(n)) return;

      const map = {
        velocity: "VELOCITY",
        accel: "ACCEL",
        scv: "SQUARE_CORNER_VELOCITY",
        cruise: "MINIMUM_CRUISE_RATIO",
      };

      const param = map[kind];
      if (!param) return;

      let v = n;

      if (kind === "velocity")
        v = Math.max(1, Math.min(1000, n));

      if (kind === "accel")
        v = Math.max(1, Math.min(30000, n));

      if (kind === "scv")
        v = Math.max(0, Math.min(100, n));

      // UI % kullanır; Klipper 0..1 ratio ister.
      if (kind === "cruise")
        v = Math.max(0, Math.min(100, n)) / 100;

      machineLimitBusy.value = kind;

      try {
        await sendConsoleCommandRaw(
          `SET_VELOCITY_LIMIT ${param}=${v}`
        );
        await new Promise(resolve => setTimeout(resolve, 250));
        await reloadState();
      } finally {
        machineLimitBusy.value = "";
      }
    }

    const zOffsetBusy = ref(false);

    function formatZOffset() {
      const n = Number(state.z_offset || 0);
      return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`;
    }

    async function adjustZOffset(delta) {
      if (zOffsetBusy.value || motionBusy.value || isPrinting.value) return;

      const d = Number(delta);
      if (!Number.isFinite(d) || d === 0) return;

      zOffsetBusy.value = true;

      try {
        await sendConsoleCommandRaw(
          `SET_GCODE_OFFSET Z_ADJUST=${d.toFixed(3)} MOVE=1`
        );
        await new Promise(resolve => setTimeout(resolve, 250));
        await reloadState();
      } finally {
        zOffsetBusy.value = false;
      }
    }

    async function sendConsoleCommandRaw(script) {
      const command = String(script || "").trim();
      if (!command) return;

      echoConsoleCommand(command);

      const r = await fetch(`${API}/plugin-api/gcode`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({script: command}),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(
          j.detail ||
          j.error ||
          `HTTP ${r.status}`
        );
      }

      return j;
    }

    // MultiACE Enhanced V5 Extruder Control
    const extruderBusy = ref(false);
    const extrudeDistance = ref(10);
    const extrudeSpeed = ref(5);

    // MultiACE Enhanced V5:
    // U1/Mainsail exposes T0-T31 tool commands.
    // T4+ are resolved by the printer's existing tool macros.
    const toolNumbers = Array.from(
      {length: 32},
      (_, i) => i
    );

    function toolActive(tool) {
      return Number(state.active_tool) === Number(tool);
    }

    async function selectTool(tool) {
      const n = Number(tool);

      if (
        !Number.isInteger(n) ||
        n < 0 ||
        n > 31 ||
        extruderBusy.value ||
        isPrinting.value
      ) {
        return;
      }

      extruderBusy.value = true;

      try {
        await sendConsoleCommandRaw(`T${n}`);

        await new Promise(resolve => setTimeout(resolve, 500));
        await reloadState();

      } catch (e) {
        window.alert(t("ui.controls.tool_change_failed", {error: String(e?.message || e)}));
      } finally {
        extruderBusy.value = false;
      }
    }

    async function extruderMove(direction) {
      if (
        extruderBusy.value ||
        isPrinting.value ||
        !state.can_extrude
      ) {
        return;
      }

      const distance = Math.max(
        0.1,
        Math.min(100, Number(extrudeDistance.value) || 10)
      );

      const speed = Math.max(
        0.1,
        Math.min(50, Number(extrudeSpeed.value) || 5)
      );

      const signedDistance = direction > 0
        ? distance
        : -distance;

      const feed = Math.round(speed * 60);

      const script = [
        "SAVE_GCODE_STATE NAME=MULTIACE_WEB_EXTRUDE",
        "M83",
        `G1 E${signedDistance} F${feed}`,
        "RESTORE_GCODE_STATE NAME=MULTIACE_WEB_EXTRUDE",
      ].join("\n");

      extruderBusy.value = true;

      try {
        echoConsoleCommand(script);

        const r = await fetch(`${API}/plugin-api/gcode`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({script}),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

      } catch (e) {
        window.alert(t("ui.controls.extrusion_failed", {error: String(e?.message || e)}));
      } finally {
        extruderBusy.value = false;
      }
    }

    // MultiACE Enhanced V5 Motion Control
    const motionBusy = ref(false);

    async function sendMotionGcode(script) {
      if (!script || motionBusy.value || isPrinting.value) return;

      // Mainsail benzeri: gönderilen hareket komutlarını konsolda göster.
      echoConsoleCommand(script);

      motionBusy.value = true;

      try {
        const r = await fetch(`${API}/plugin-api/gcode`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({script}),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

      } catch (e) {
        window.alert(t("ui.controls.motion_failed", {error: String(e?.message || e)}));
      } finally {
        motionBusy.value = false;
      }
    }

    async function homeMotion(axis = "") {
      const a = String(axis || "").toUpperCase();

      if (motionBusy.value || isPrinting.value) return;

      /*
       * Snapmaker U1 / CoreXY:
       * G28 X may home both X and Y through the firmware homing override.
       * Do NOT call SENSORLESS_HOME_X/Y/Z directly; those macros themselves
       * call G28 and can recurse through the override.
       */
      const commands = {
        X: "G28 X",
        Y: "G28 Y",
        Z: "G28 Z",
      };

      const script = a ? commands[a] : "G28";

      if (!script) return;

      motionBusy.value = true;

      let commandError = null;

      // Mainsail benzeri: Home komutunu da konsolda göster.
      echoConsoleCommand(script);

      try {
        const r = await fetch(`${API}/plugin-api/gcode`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({script}),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          commandError = new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

      } catch (e) {
        commandError = e;
      }

      /*
       * Snapmaker U1 homing bazen Moonraker tarafında hata cevabı
       * döndürmesine rağmen ekseni gerçekten home etmiş olabiliyor.
       * Önce gerçek printer state'ini kontrol ediyoruz.
       */
      await new Promise(resolve => setTimeout(resolve, 700));

      try {
        await reloadState();
      } catch (_) {}

      const success = a
        ? axisHomed(a)
        : allAxesHomed.value;

      motionBusy.value = false;

      if (success) {
        return;
      }

      if (commandError) {
        window.alert(t("ui.controls.home_failed", {error: String(commandError?.message || commandError)}));
      }
    }

    async function jogMotion(axis, amount) {
      const a = String(axis || "").toUpperCase();
      const d = Number(amount);

      if (!["X", "Y", "Z"].includes(a)) return;
      if (!axisHomed(a)) return;
      if (!Number.isFinite(d) || d === 0) return;

      const feed = a === "Z" ? 600 : 6000;

      const script = [
        "SAVE_GCODE_STATE NAME=MULTIACE_WEB_JOG",
        "G91",
        `G1 ${a}${d} F${feed}`,
        "RESTORE_GCODE_STATE NAME=MULTIACE_WEB_JOG",
      ].join("\n");

      await sendMotionGcode(script);
    }

    async function disableMotors() {
      if (motionBusy.value || isPrinting.value) return;

      await sendMotionGcode("M84");

      // Motorlar boşa çıktıktan sonra mevcut Home bilgisini ekranda
      // güvenilir kabul etmiyoruz; state bir sonraki sorguda yenilenecek.
      await new Promise(resolve => setTimeout(resolve, 250));

      try {
        await reloadState();
      } catch (_) {}
    }

    // MultiACE Enhanced V5 Fan Control
    const fanBusy = reactive({});
    const fanDraft = reactive({});

    function fanPercent(item) {
      const n = Number(item?.speed);
      if (!Number.isFinite(n)) return 0;
      return Math.round(Math.max(0, Math.min(1, n)) * 100);
    }

    function fanDraftValue(item) {
      const key = String(item?.object || "");

      if (Object.prototype.hasOwnProperty.call(fanDraft, key)) {
        return Number(fanDraft[key]) || 0;
      }

      return fanPercent(item);
    }

    function setFanDraft(item, value) {
      if (!item?.object) return;

      const n = Number(value);
      fanDraft[String(item.object)] = Number.isFinite(n)
        ? Math.max(0, Math.min(100, n))
        : 0;
    }

    async function setFanSpeed(item, percent) {
      if (!item?.controllable || fanBusy[item.object]) return;

      const p = Number(percent);

      if (!Number.isFinite(p)) return;

      const clamped = Math.max(0, Math.min(100, p));
      const objectName = String(item.object);

      fanDraft[objectName] = clamped;
      fanBusy[objectName] = true;

      try {
        const r = await fetch(`${API}/fan`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            object: objectName,
            speed: clamped / 100,
          }),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

        await new Promise(resolve => setTimeout(resolve, 250));
        await reloadState();

      } catch (e) {
        window.alert(t("ui.controls.fan_failed", {error: String(e?.message || e)}));
      } finally {
        fanBusy[objectName] = false;
      }
    }

    // MultiACE Enhanced V5 Klipper Console Panel
    const consoleLines = ref([]);
    const consoleCommand = ref("");
    const consoleSending = ref(false);

    function scrollConsoleBottom() {
      nextTick(() => {
        const el = document.querySelector(".klipper-console-output");
        if (el) el.scrollTop = el.scrollHeight;
      });
    }

    // MultiACE Enhanced V5 Motion Console Echo
    let localConsoleSequence = 0;

    function echoConsoleCommand(script) {
      const lines = String(script || "")
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

      for (const text of lines) {
        localConsoleSequence += 1;

        addConsoleLine({
          id: Date.now() * 1000 + localConsoleSequence,
          ts: Date.now() / 1000,
          text,
          raw: text,
          level: "command",
        });
      }
    }

    function addConsoleLine(line) {
      if (!line || line.id == null) return;

      const id = Number(line.id);

      if (consoleLines.value.some(x => Number(x.id) === id)) {
        return;
      }

      consoleLines.value.push({
        id,
        ts: Number(line.ts) || Date.now() / 1000,
        text: String(line.text || line.raw || ""),
        raw: String(line.raw || line.text || ""),
        level: String(line.level || "normal"),
      });

      if (consoleLines.value.length > 2000) {
        consoleLines.value.splice(
          0,
          consoleLines.value.length - 2000
        );
      }

      scrollConsoleBottom();
    }

    async function loadConsole() {
      try {
        const r = await fetch(`${API}/console?limit=1000`);
        if (!r.ok) return;

        const j = await r.json();
        const rows = Array.isArray(j.lines) ? j.lines : [];

        consoleLines.value = rows.map(line => ({
          id: Number(line.id),
          ts: Number(line.ts) || 0,
          text: String(line.text || line.raw || ""),
          raw: String(line.raw || line.text || ""),
          level: String(line.level || "normal"),
        }));

        scrollConsoleBottom();
      } catch (_) {}
    }

    function onConsoleLine(m) {
      addConsoleLine(m);
    }

    function consoleTime(ts) {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return "";

      try {
        return new Date(n * 1000).toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }
        );
      } catch (_) {
        return "";
      }
    }

    async function sendConsoleCommand() {
      const script = String(consoleCommand.value || "").trim();
      if (!script || consoleSending.value) return;

      consoleSending.value = true;
      echoConsoleCommand(script);

      try {
        const r = await fetch(`${API}/plugin-api/gcode`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({script}),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `HTTP ${r.status}`
          );
        }

        consoleCommand.value = "";

      } catch (e) {
        window.alert(t("ui.controls.klipper_failed", {error: String(e?.message || e)}));
      } finally {
        consoleSending.value = false;
      }
    }

    async function clearConsole() {
      try {
        const r = await fetch(`${API}/console`, {
          method: "DELETE",
        });

        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }

        consoleLines.value = [];
      } catch (e) {
        window.alert(t("ui.controls.console_clear_failed", {error: String(e?.message || e)}));
      }
    }

    const isPrinting = computed(() => state.printer_state === 'printing');
    function _blockIfPrinting() {
      if (isPrinting.value) {
        setMacroLog(t("ui.dashboard.blocked_printing"));
        return true;
      }
      return false;
    }
    function isToolheadOccupied(aceIdx, slotIdx) {
      const th = state.toolheads.find(tt => tt.idx === slotIdx);
      if (!th) return false;

      // Physical occupancy must follow the toolhead/extruder sensor.
      // head_source may legitimately remain set after runout or failed load
      // and must not by itself disable Reload/Load.
      return !!th.filament_at_extruder;
    }
    // Mid-print runout: print paused, the head still owns its ACE source
    // (head_source NOT cleared - that would break FA-rearm on resume), but the
    // toolhead motion sensor reads empty. ACE_LOAD_HEAD's "already loaded" guard
    // is gated on that same toolhead sensor, so a reload goes through during a
    // runout even though head_source is set. We just re-enable the load button.
    function needsReload(aceIdx, slotIdx) {
      if (state.printer_state !== 'paused') return false;
      // The slot to reload is the one a paused head is SOURCED from
      // (head_source ace/slot), not the toolhead whose index == the slot.
      // In head mode a head loads from any slot of its wired ACE, so the old
      // idx===slot lookup blinked "reload" under the wrong slot (slot==head).
      return state.toolheads.some(th =>
        th.head_source_known &&
        th.ace === aceIdx && th.slot === slotIdx &&
        th.filament_at_extruder === false);
    }
    function unloadHead(idx) {
      if (_blockIfPrinting()) return;
      run("ACE_UNLOAD_HEAD", {HEAD: idx});
    }
    function unloadAll() {
      if (_blockIfPrinting()) return;
      run("ACE_UNLOAD_ALL_HEADS");
    }
    async function setHeadManual(idx, enable) {
      try {
        await fetch(`${API}/head-manual`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({head: idx, enable: !!enable}),
        });
      } catch (_) {}
      reloadState();
    }
    async function setHeadFeeder(idx, enable) {
      try {
        await fetch(`${API}/head-feeder`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({head: idx, enable: !!enable}),
        });
      } catch (_) {}
      reloadState();
    }
    // head mode: background-swap opt-in per head (= the HARDWARE declaration
    // "this head's dock is open below"). Engine-persisted (ace__bg_heads),
    // direct macro call like the language dropdown - no command queue entry.
    function bgEnabledFor(idx) {
      return (state.bg_swap.enabled_heads || []).some(h => Number(h) === Number(idx));
    }
    async function setBgHead(idx, enable) {
      try {
        await fetch(`${API}/macro`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({name: "ACE_BG_SET_HEAD",
                                args: {HEAD: idx, ENABLE: enable ? 1 : 0}}),
        });
      } catch (_) {}
      reloadState();
    }
    async function setHeadAce(idx, ace) {
      try {
        await fetch(`${API}/head-ace`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({head: idx, ace: Number(ace)}),
        });
      } catch (_) {}
      reloadState();
    }
    // head mode: connected ACEs as {value,label} for the per-head ACE dropdown.
    const aceOptions = computed(() =>
      (state.aces || []).map(a => ({
        value: a.idx,
        label: "ACE " + dispIdx(a.idx) + (a.protocol ? " (" + a.protocol.toUpperCase() + ")" : ""),
      })));
    // head mode: the ACE currently wired to a head (head_ace), defaulting to the
    // head index.
    function headAceOf(idx) {
      const ha = state.head_ace || {};
      const a = ha[idx] ?? ha[String(idx)];
      return (a === undefined || a === null) ? idx : Number(a);
    }
    // head mode: ACE options for one head's dropdown - exclude ACEs already
    // wired to ANOTHER ACE head (one ACE feeds exactly one head), but always
    // keep this head's own current selection.
    function aceOptionsForHead(idx) {
      const taken = new Set();
      for (const h of (state.ace_heads || [])) {
        if (Number(h) === Number(idx)) continue;
        taken.add(headAceOf(h));
      }
      const mine = headAceOf(idx);
      return aceOptions.value.filter(o => o.value === mine || !taken.has(o.value));
    }
    // head mode: true when every wired ACE head is a right-side head (internal
    // index >= 2, display 3/4) -> right-align the ACE grid so the cards start
    // from the right, lining up with the right toolheads.
    const aceHeadsRightSide = computed(() => {
      const h = state.ace_heads || [];
      return h.length > 0 && h.every(x => Number(x) >= 2);
    });
    // The ACE cards to render. In head mode: only ACEs wired to an ACE head
    // (unused ones hidden), ordered by their head index so each ACE card lines
    // up with its toolhead (T0..T3 left to right). Other modes: all ACEs as-is.
    const visibleAces = computed(() => {
      const aces = state.aces || [];
      if (state.mode !== "head") return aces;
      const byIdx = {};
      for (const a of aces) byIdx[a.idx] = a;
      const out = [];
      const seen = new Set();
      for (const h of [...(state.ace_heads || [])].sort((a, b) => a - b)) {
        const ai = headAceOf(h);
        if (byIdx[ai] && !seen.has(ai)) { out.push(byIdx[ai]); seen.add(ai); }
      }
      return out;
    });
    function loadSlot(aceIdx, slotIdx) {
      if (_blockIfPrinting()) return;
      if (state.mode === "head") {
        // head mode: each ACE head is wired to exactly one ACE (head_ace), so
        // this ACE's slots all feed the head whose head_ace points here. Loading
        // a slot loads that head from this slot (swap if already loaded).
        const h = aceHeadForAce(aceIdx);
        if (h === null) return;
        const th = state.toolheads.find(tt => tt.idx === h);
        if (th && th.head_source_known) {
          enqueue("ACE_UNLOAD_HEAD", {HEAD: h});
        }
        enqueue("ACE_LOAD_HEAD", {HEAD: h, ACE: aceIdx, SLOT: slotIdx});
        return;
      }
      const th = state.toolheads.find(tt => tt.idx === slotIdx);
      if (th && th.head_source_known && th.ace !== aceIdx) {
        enqueue("ACE_UNLOAD_HEAD", {HEAD: slotIdx});
        enqueue("ACE_LOAD_HEAD",   {HEAD: slotIdx, ACE: aceIdx});
        return;
      }
      enqueue("ACE_LOAD_HEAD", {HEAD: slotIdx, ACE: aceIdx});
    }
    // head mode: load a feeder head via its native stock side feeder (no ACE).
    function loadFeederHead(h) {
      if (_blockIfPrinting()) return;
      enqueue("ACE_LOAD_HEAD", {HEAD: h});
    }
    // head mode: the ACE head wired to this ACE (head_ace reverse lookup), or
    // null if no ACE head uses it.
    function aceHeadForAce(aceIdx) {
      const heads = state.ace_heads || [];
      const ha = state.head_ace || {};
      for (const h of heads) {
        const a = Number(ha[h] ?? ha[String(h)] ?? h);
        if (a === aceIdx) return h;
      }
      return null;
    }
    // head mode: is this ACE slot the one currently loaded into its ACE head?
    // (used to disable that slot's Load button; other slots stay loadable=swap).
    function slotLoadedInHead(aceIdx, slotIdx) {
      if (state.mode !== "head") return false;
      const h = aceHeadForAce(aceIdx);
      if (h === null) return false;
      const th = state.toolheads.find(tt => tt.idx === h);
      return !!(
        th &&
        th.head_source_known &&
        th.ace === aceIdx &&
        th.slot === slotIdx &&
        th.filament_at_extruder
      );
    }
    // Default/fallback list; the live list + per-type subtypes are loaded
    // from /api/materials, which sources them from the firmware filament DB
    // (filament_parameters.py) - same materials the printer's display offers.
    const pickerMaterials = ref([
      "PLA", "PLA-CF",
      "PETG", "PETG-CF", "PETG-HF",
      "ABS", "ASA",
      "TPU",
      "PA", "PA-CF", "PA-GF", "PA6-CF", "PA6-GF",
      "PC", "PC-ABS",
      "PVA",
    ]);
    // Full { type: { vendor: [subtype, ...] } } hierarchy from the firmware DB.
    const pickerDb = ref({});
    // Spoolman colors[material][vendor][subtype] = "#rrggbb".
    // This supplements the existing picker; the manual color input remains usable.
    const pickerColors = ref({});
    async function loadMaterials() {
      try {
        const r = await fetch(`${API}/materials`);
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j.materials) && j.materials.length) {
            pickerMaterials.value = j.materials;
          }
          if (j.db && typeof j.db === "object") {
            pickerDb.value = j.db;
          }
          if (j.colors && typeof j.colors === "object") {
            pickerColors.value = j.colors;
          }
        }
      } catch (_) {}
    }
    // Vendors for the chosen material (Generic always first) straight from the
    // firmware DB. The cascade watchers validate a user pick against THIS list.
    const pickerDbVendors = computed(() => {
      const v = Object.keys(pickerDb.value[picker.material] || { Generic: [] });
      return v.includes("Generic") ? ["Generic", ...v.filter(x => x !== "Generic")] : v;
    });
    // Display list for the <select>: the DB vendors PLUS the slot's current
    // vendor when the printer doesn't ship it (e.g. an RFID-set brand). Without
    // this the <select> shows blank for an unknown vendor, so it can't be
    // changed or cleared. Display-only - the cascade still validates against the
    // DB list, so a user material change resets a non-DB vendor.
    const pickerVendors = computed(() => {
      const v = pickerDbVendors.value;
      return (picker.vendor && !v.includes(picker.vendor)) ? [...v, picker.vendor] : v;
    });
    // Subtypes for the chosen material + vendor from the firmware DB; "Basic" =
    // firmware 'generic'.
    const pickerDbSubtypes = computed(() => {
      const byVendor = pickerDb.value[picker.material] || {};
      return ["Basic", ...(byVendor[picker.vendor] || [])];
    });
    // Display list: DB subtypes PLUS the slot's current subtype when the printer
    // doesn't know it (e.g. an RFID-set subtype) - same display-only rationale
    // as pickerVendors (this is the RFID 'Transparent' that couldn't be cleared).
    const currentSubtypes = computed(() => {
      const s = pickerDbSubtypes.value;
      return (picker.subtype && !s.includes(picker.subtype)) ? [...s, picker.subtype] : s;
    });
    const picker = reactive({
      show: false,
      ace: 0,
      slot: 0,
      head: null,     // head mode: set when editing a feeder head (no ACE slot)
      material: "PLA",
      subtype: "Basic",
      vendor: "Generic",
      color: "#ffffff",
    });
      const currentPickerColorOptions = computed(() => {
        const byVendor =
          pickerColors.value?.[picker.material]?.[picker.vendor] || {};

        const out = [];

        const addColors = (name, value) => {
          const values = Array.isArray(value) ? value : [value];

          for (const c of values) {
            if (!/^#[0-9a-fA-F]{6}$/.test(c || "")) continue;

            const color = c.toLowerCase();

            if (!out.some(x => x.name === name && x.color === color)) {
              out.push({
                name: name || "Spoolman",
                color
              });
            }
          }
        };

        // Özel bir subtype seçilmişse öncelikle yalnızca onu göster.
        if (picker.subtype && picker.subtype !== "Basic") {
          const exact = byVendor[picker.subtype];
          addColors(picker.subtype, exact);

          if (out.length) return out;
        }

        // Basic seçildiğinde vendor altındaki tüm Spoolman filamentlerini göster.
        for (const [name, value] of Object.entries(byVendor)) {
          addColors(name, value);
        }

        return out;
      });

      // Eski kodla uyumluluk için renk dizisini de koruyoruz.
      const currentPickerColors = computed(() =>
        currentPickerColorOptions.value.map(x => x.color)
      );

      function _applyPickerAutoColor() {
        const options = currentPickerColorOptions.value;
        if (options.length === 1) {
          picker.color = options[0].color;
        }
      }

    // Suppress the cascade snap while openPicker is programmatically setting the
    // fields, so an RFID-set vendor/subtype the printer doesn't know is NOT
    // snapped away on open (it's preserved + shown via the augmented lists). A
    // real user material/vendor change (flag clear) still snaps to a DB-valid
    // value. Validate against the DB lists, not the augmented display lists.
    let _pickerOpening = false;
    watch(() => picker.material, () => {
      if (_pickerOpening) return;
      if (!pickerDbVendors.value.includes(picker.vendor)) {
        picker.vendor = pickerDbVendors.value[0] || "Generic";
      }
      if (!pickerDbSubtypes.value.includes(picker.subtype)) {
        picker.subtype = "Basic";
      }
      _applyPickerAutoColor();
    });
    watch(() => picker.vendor, () => {
      if (_pickerOpening) return;
      if (!pickerDbSubtypes.value.includes(picker.subtype)) {
        picker.subtype = "Basic";
      }
      _applyPickerAutoColor();
    });
    watch(() => picker.subtype, () => {
      if (_pickerOpening) return;
      _applyPickerAutoColor();
    });
    function _splitMaterialSubtype(material, subtype) {
      const raw = String(material || "").trim();
      const parts = raw.split("|", 2);
      return {
        material: (parts[0] || "PLA").trim(),
        subtype: String(
          subtype || (parts.length > 1 ? parts[1] : "") || "Basic"
        ).trim(),
      };
    }

    // ENHANCED_ANYCUBIC_SKU_VENDOR_V1
    // Anycubic tags may store the vendor name in SKU.
    // Accept SKU as vendor only if the material DB knows it.
    function _pickerRfidVendor(tag, slot, material) {
      const explicit = String(tag?.brand || "").trim();
      if (explicit) return explicit;

      const format = String(
        slot?.tag_format || ""
      ).trim().toLowerCase();

      if (format !== "anycubic") return "Generic";

      const candidate = String(tag?.sku || "").trim();
      if (!candidate) return "Generic";

      const vendors = Object.keys(
        pickerDb.value?.[material] || {}
      );

      return vendors.find(
        v => v.trim().toLowerCase() === candidate.toLowerCase()
      ) || "Generic";
    }

    function openPicker(ace, slot) {
      _pickerOpening = true;
      picker.head = null;
      picker.ace = ace.idx;
      picker.slot = slot.idx;
      const slotMat = _splitMaterialSubtype(
        slot.material,
        slot.subtype
      );
      picker.material = slotMat.material;
      picker.subtype = slotMat.subtype;
      picker.vendor = slot.brand || _pickerRfidVendor(slot.rfid_data, slot, slotMat.material);
      picker.color = slot.color || "#ffffff";
      picker.show = true;
      // Let the watchers' snap run again only after this open settles.
      nextTick(() => { _pickerOpening = false; });
    }
    // head mode: edit a feeder head's filament identity (color/material). It has
    // no ACE slot - the values go straight to the head's print_task_config via
    // SET_PRINT_FILAMENT_CONFIG (same path the touchscreen uses; the heartbeat
    // leaves feeder heads untouched). The RFID/load-after buttons hide because
    // _pickerSlot() is null without an ACE slot.
    function openHeadPicker(th) {
      _pickerOpening = true;
      picker.ace = null;
      picker.slot = null;
      picker.head = th.idx;
      const headMat = _splitMaterialSubtype(
        th.material,
        th.subtype
      );
      picker.material = headMat.material;
      picker.subtype = headMat.subtype;
      picker.vendor = th.brand || "Generic";
      picker.color = th.color || "#ffffff";
      picker.show = true;
      nextTick(() => { _pickerOpening = false; });
    }
    function closePicker() { picker.show = false; }
    function _pickerSlot() {
      const a = state.aces.find(x => x.idx === picker.ace);
      if (!a) return null;
      return (a.slots || []).find(s => s.idx === picker.slot) || null;
    }
    const pickerHasRfid = computed(() => {
      if (!picker.show) return false;
      const s = _pickerSlot();
      return !!(s && s.rfid === 2 && s.rfid_data);
    });
    const pickerRfidStyle = computed(() => {
      if (!pickerHasRfid.value) return {};
      const c = (_pickerSlot()?.rfid_data?.color || "").trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) return {};
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return {
        background: c,
        borderColor: c,
        color: lum > 0.55 ? "#001619" : "#ffffff",
      };
    });
    // Slots without an RFID tag get a "Clear" button instead of "Read
    // RFID"; shown only when the slot's identity actually comes from a
    // manual override (source === "override"), so RFID/derived/empty
    // slots offer nothing to clear.
    const pickerHasOverride = computed(() => {
      if (!picker.show) return false;
      const s = _pickerSlot();
      return !!(s && s.source === "override");
    });
    function readPickerRfid() {
      const s = _pickerSlot();
      const r = s && s.rfid_data;
      if (!r) return;
      // Reset the WHOLE identity to the tag's values unconditionally. Guarding
      // each field on a truthy RFID value left a manually-changed vendor/subtype
      // stuck when the tag had none (empty brand/subtype) - then it never
      // matched _pickerMatchesRfid and save kept a shadow override. Empty tag
      // fields fall back to the same Generic/Basic placeholders openPicker uses,
      // so save then matches the tag and drops the override. _pickerOpening
      // suppresses the cascade snap while we set the fields (as in openPicker),
      // so a tag vendor/subtype the printer doesn't ship isn't snapped away.
      _pickerOpening = true;
      const rfidMat = _splitMaterialSubtype(
        r.material,
        r.subtype
      );
      picker.material = rfidMat.material;
      picker.subtype  = rfidMat.subtype;
      picker.vendor   = _pickerRfidVendor(r, s, rfidMat.material);
      picker.color    = r.color    || "#ffffff";
      nextTick(() => { _pickerOpening = false; });
    }
    function _ptcGcodeFor(aceIdx, slotIdx, mat, brand, sub, colorHex) {
      const dq = (s) => `"${String(s || "").replace(/"/g, "")}"`;
      const hex = (colorHex || "#ffffff").replace("#", "");
      const colorRGBA = hex.toUpperCase() + "FF";
      return {
        CONFIG_EXTRUDER: slotIdx,
        FILAMENT_TYPE:   dq(mat || "PLA"),
        FILAMENT_COLOR_RGBA: colorRGBA,
        VENDOR:          dq(brand || "Generic"),
        FILAMENT_SUBTYPE: dq(sub || ""),
      };
    }
    // Bug 1: saving an RFID slot unchanged must not create an override
    // that masks the tag. openPicker prefills Generic/Basic placeholders
    // for empty vendor/subtype, so normalise those to "" when comparing
    // the form against the tag's rfid_data.
    function _ovNorm(s) { return String(s || "").trim().toLowerCase(); }
    function _ovVendor(s) { const v = _ovNorm(s); return v === "generic" ? "" : v; }
    function _ovSub(s) { const v = _ovNorm(s); return (v === "basic" || v === "generic") ? "" : v; }
    function _ovColor(s) { return _ovNorm(s).replace(/^#/, ""); }
    function _pickerMatchesRfid() {
      const s = _pickerSlot();
      const r = (s && s.rfid === 2) ? s.rfid_data : null;
      if (!r) return false;
      const rfidMat = _splitMaterialSubtype(
        r.material,
        r.subtype
      );
      return _ovNorm(picker.material) === _ovNorm(rfidMat.material)
          && _ovVendor(picker.vendor) === _ovVendor(_pickerRfidVendor(r, s, rfidMat.material))
          && _ovSub(picker.subtype) === _ovSub(rfidMat.subtype)
          && _ovColor(picker.color) === _ovColor(r.color);
    }
    async function savePicker(loadAfter) {
      // Feeder head (no ACE slot): push the identity straight to the head's
      // print_task_config via SET_PRINT_FILAMENT_CONFIG (same path the
      // touchscreen uses). The heartbeat leaves feeder/manual heads untouched,
      // so this sticks until the user changes it.
      if (picker.head !== null && picker.head !== undefined) {
        const dq = (s) => `"${String(s || "").replace(/"/g, "")}"`;
        const hex = (picker.color || "#ffffff").replace("#", "");
        enqueue("SET_PRINT_FILAMENT_CONFIG", {
          CONFIG_EXTRUDER:     picker.head,
          FILAMENT_TYPE:       dq(picker.material || "PLA"),
          FILAMENT_COLOR_RGBA: hex.toUpperCase() + "FF",
          VENDOR:              dq(picker.vendor || "Generic"),
          FILAMENT_SUBTYPE:    dq(picker.subtype || ""),
        });
        closePicker();
        reloadState();
        return;
      }
      const aceIdx = picker.ace;
      const slotIdx = picker.slot;
      if (_pickerMatchesRfid()) {
        // Values equal the RFID tag -> drop any existing override so the
        // RFID identity stays the source of truth (no shadow override).
        try {
          await fetch(`${API}/slot-override/${aceIdx}/${slotIdx}`, {method: "DELETE"});
        } catch (e) {
          setMacroLog(`${t("ui.common.error")}: ${e}`);
        }
        closePicker();
        // MULTIACE_RFID_RESET_DISPLAY_SYNC_V1
        enqueue(
          "MULTIACE_REFRESH_OVERRIDES",
          {ACE: aceIdx, SLOT: slotIdx, RFID_RESET: 1},
          {silent: true}
        );
        if (loadAfter) {
          loadSlot(aceIdx, slotIdx);
        }
        reloadState();
        return;
      }
      try {
        await fetch(`${API}/slot-override`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            ace: aceIdx,
            slot: slotIdx,
            material: picker.material || "",
            brand:    picker.vendor || "",
            subtype:  picker.subtype || "",
            color:    picker.color || "",
          }),
        });
      } catch (e) {
        setMacroLog(`${t("ui.common.error")}: ${e}`);
      }
      closePicker();
      enqueue("MULTIACE_REFRESH_OVERRIDES", {}, {silent: true});
      if (loadAfter) {
        loadSlot(aceIdx, slotIdx);
      }
      reloadState();
    }
    async function clearPickerOverride() {
      const aceIdx = picker.ace;
      const slotIdx = picker.slot;
      try {
        await fetch(`${API}/slot-override/${aceIdx}/${slotIdx}`, {method: "DELETE"});
      } catch (e) {
        setMacroLog(`${t("ui.common.error")}: ${e}`);
      }
      closePicker();
      enqueue("MULTIACE_REFRESH_OVERRIDES", {}, {silent: true});
      reloadState();
    }
    let _lastActive = null;
    watch(() => state.active_device, (newAce) => {
      _lastActive = newAce;
    });
    const dryOpenAce = ref(null);
    function toggleDryPanel(aceIdx) {
      dryOpenAce.value = (dryOpenAce.value === aceIdx) ? null : aceIdx;
    }
    function aceDrying(ace) {
      const d = ace && ace.dryer;
      return !!(d && d.status && d.status !== 'stop');
    }
    function dryStart(aceIdx) {
      const cfg = dryerCfg[aceIdx] || {temp: 50, duration: 240};
      run("ACE_DRY", {ACE: aceIdx, TEMP: cfg.temp, DURATION: cfg.duration});
    }
    function dryStop(aceIdx) {
      run("ACE_STOP_DRYING", {ACE: aceIdx});
    }
    const snapshots = ref([]);
    const selectedSnapshot = ref("");
    const snapshotPreview = computed(() => snapshots.value.find(s => s.name === selectedSnapshot.value));
    // Head-mode snapshots are stored separately from multi - tag every snapshot
    // call with the current mode so each shows/saves its own set.
    function _snapMode() { return state.mode === "head" ? "head" : ""; }
    function _snapQS() { return state.mode === "head" ? "?mode=head" : ""; }
    async function reloadSnapshots() {
      try {
        const r = await fetch(`${API}/snapshots${_snapQS()}`);
        if (!r.ok) return;
        const j = await r.json();
        snapshots.value = j.snapshots || [];
      } catch (_) {}
    }
    // Reload the right snapshot set (and drop a stale selection) on mode switch.
    watch(() => state.mode, () => { selectedSnapshot.value = ""; reloadSnapshots(); });
    async function _doSaveSnapshot(name) {
      try {
        const r = await fetch(`${API}/snapshots`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({name, mode: _snapMode()}),
        });
        if (!r.ok) {
          setMacroLog(t("ui.log.snapshot_save_failed", {error: await r.text()}));
          return;
        }
        setMacroLog(t("ui.log.snapshot_saved", {name}));
        await reloadSnapshots();
        selectedSnapshot.value = name;
      } catch (e) { setMacroLog(`${t("ui.common.error")}: ${e}`); }
    }
    async function saveSnapshot() {
      if (selectedSnapshot.value) {
        const name = selectedSnapshot.value;
        confirm({
          title: t("ui.dialog.overwrite_snapshot_title", {name}),
          message: t("ui.dialog.overwrite_snapshot_msg", {name}),
          okLabel: t("ui.common.save"),
          onOk: () => _doSaveSnapshot(name),
        });
        return;
      }
      const name = prompt(t("ui.dashboard.snapshot_name_prompt"));
      if (!name) return;
      await _doSaveSnapshot(name);
    }
    async function deleteSnapshot() {
      if (!selectedSnapshot.value) return;
      if (!confirmSync(t("ui.dialog.delete_snapshot", {name: selectedSnapshot.value}))) return;
      try {
        await fetch(`${API}/snapshots/${encodeURIComponent(selectedSnapshot.value)}${_snapQS()}`, {method: "DELETE"});
        selectedSnapshot.value = "";
        await reloadSnapshots();
      } catch (e) { setMacroLog(`${t("ui.common.error")}: ${e}`); }
    }
    async function loadSnapshot() {
      if (!selectedSnapshot.value) return;
      const name = selectedSnapshot.value;
      let plan;
      try {
        const r = await fetch(`${API}/snapshots/${encodeURIComponent(name)}/apply${_snapQS()}`, {method: "POST"});
        plan = await r.json();
      } catch (e) {
        setMacroLog(`${t("ui.common.error")}: ${e}`);
        return;
      }
      const errs = plan.errors || [];
      const warns = plan.warnings || [];
      const actions = plan.actions || [];
      if (errs.length) {
        confirm({
          title: t("ui.dialog.snapshot_errors_title"),
          message: errs.map(e => "• " + e.message).join("<br>"),
          okLabel: "OK",
          dismissOnly: true,
          onOk: () => {},
        });
        return;
      }
      const proposals = plan.override_proposals || [];
      const writeOverridesAndEnqueue = async (writeOverrides) => {
        if (writeOverrides && proposals.length) {
          for (const o of proposals) {
            try {
              await fetch(`${API}/slot-override`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(o),
              });
            } catch (e) {
              setMacroLog(`${t("ui.common.error")}: ${e}`);
            }
          }
          enqueue("MULTIACE_REFRESH_OVERRIDES", {}, {silent: true});
        }
        for (const a of actions) {
          enqueue(a.name, a.args || {});
        }
      };
      if (warns.length) {
        confirm({
          title: t("ui.dialog.snapshot_warnings_title"),
          message: warns.map(w => "• " + w.message).join("<br>")
                   + "<br><br>" + t("ui.dialog.snapshot_warnings_hint"),
          okLabel: t("ui.dialog.apply_anyway"),
          checkboxLabel: proposals.length
            ? t("ui.dialog.set_filaments_per_snapshot")
            : null,
          checkboxDefault: false,
          onOk: ({checked}) => { writeOverridesAndEnqueue(checked); },
        });
        return;
      }
      confirm({
        title: t("ui.dialog.apply_snapshot_title", {name}),
        message: t("ui.dialog.apply_snapshot_msg"),
        okLabel: t("ui.common.apply"),
        onOk: () => { writeOverridesAndEnqueue(false); },
      });
    }
    const confirmDialog = reactive({
      show: false, title: "", message: "",
      okLabel: "OK",  _onOk:  null,
      altLabel: null, _onAlt: null,
      dismissOnly: false,
      checkboxLabel: null, checkboxChecked: false,
    });
    function confirm(opts) {
      confirmDialog.show = true;
      confirmDialog.title = opts.title || t("ui.common.confirm");
      confirmDialog.message = opts.message || "";
      confirmDialog.okLabel = opts.okLabel || "OK";
      confirmDialog._onOk   = opts.onOk || (()=>{});
      confirmDialog.altLabel = opts.altLabel || null;
      confirmDialog._onAlt   = opts.onAlt || null;
      confirmDialog.dismissOnly = !!opts.dismissOnly;
      confirmDialog.checkboxLabel = opts.checkboxLabel || null;
      confirmDialog.checkboxChecked = !!opts.checkboxDefault;
    }
    function okConfirm() {
      const cb = confirmDialog._onOk;
      const checked = confirmDialog.checkboxChecked;
      confirmDialog.show = false;
      if (cb) cb({checked});
    }
    function altConfirm() {
      const cb = confirmDialog._onAlt;
      confirmDialog.show = false;
      if (cb) cb();
    }
    function cancelConfirm() { confirmDialog.show = false; }
    function confirmSync(msg) { return window.confirm(msg); }
    const config = reactive({path: "", content: "", params: {}, restartKlipper: false});
    const configLog = ref("");
    const configLoadError = ref("");
    const showRawConfig = ref(false);
    const configForm = reactive({
      ace_device_count: 1,
      feed_speed: 80,
      retract_speed: 80,
      load_length: 2100,
      retract_length: 1950,
      swap_retract_length: '',
      swap_purge_length: '',
      dryer_temp: '',
      dryer_duration: '',
      display_index_base: 0,
      v2_order: 'first',
      load_retry: '',
      extrusion_retry: '',
      unload_retry: '',
      state_debug: false,
      usb_debug: false,
      fa_debug: false,
      perAce: [],
    });
    function _makePerAceEntry() {
      const perSlot = [];
      for (let s = 0; s < 4; s++) {
        perSlot.push({load_length: '', retract_length: '', swap_retract_length: ''});
      }
      return {
        dryer_temp: '', dryer_duration: '',
        feed_speed: '', retract_speed: '',
        load_length: '', retract_length: '', swap_retract_length: '',
        perSlot,
      };
    }
    function _ensurePerAceLength() {
      const n = Math.max(0, Math.min(4, configForm.ace_device_count | 0));
      while (configForm.perAce.length < n) {
        configForm.perAce.push(_makePerAceEntry());
      }
      while (configForm.perAce.length > n) {
        configForm.perAce.pop();
      }
    }
    watch(() => configForm.ace_device_count, _ensurePerAceLength, {immediate: true});
    // True after a config save, which needs a full printer restart to take
    // effect (a bare Klipper restart misses USB/serial + PAXX boot-script
    // changes). Drives the prominent top reboot banner; cleared once a restart
    // actually starts (klippy down). Mode changes do NOT use this - crossing
    // 'normal' raises a backend reboot error that reaches the display too.
    const rebootNeeded = ref(false);
    function paramsToForm(params, perAceParams) {
      if (!params) return;
      const num  = (k) => params[k] != null ? Number(params[k]) : configForm[k];
      const bool = (k) => params[k] != null ? params[k] === 'true' : configForm[k];
      const numOrEmpty = (v) => (v != null && v !== '') ? Number(v) : '';
      configForm.ace_device_count = num('ace_device_count');
      configForm.feed_speed     = num('feed_speed');
      configForm.retract_speed  = num('retract_speed');
      configForm.load_length    = num('load_length');
      configForm.retract_length = num('retract_length');
      configForm.swap_retract_length = numOrEmpty(params.swap_retract_length);
      configForm.swap_purge_length = numOrEmpty(params.swap_purge_length);
      configForm.dryer_temp        = numOrEmpty(params.dryer_temp);
      configForm.dryer_duration    = numOrEmpty(params.dryer_duration);
      configForm.display_index_base = numOrEmpty(params.display_index_base);
      configForm.v2_order = (params.v2_order === 'last') ? 'last' : 'first';
      configForm.load_retry        = numOrEmpty(params.load_retry);
      configForm.extrusion_retry   = numOrEmpty(params.extrusion_retry);
      configForm.unload_retry      = numOrEmpty(params.unload_retry);
      configForm.state_debug    = bool('state_debug');
      configForm.usb_debug      = bool('usb_debug');
      configForm.fa_debug       = bool('fa_debug');
      _ensurePerAceLength();
      const pa = perAceParams || {};
      for (let i = 0; i < configForm.perAce.length; i++) {
        const t = params[`dryer_temp_${i}`];
        const d = params[`dryer_duration_${i}`];
        configForm.perAce[i].dryer_temp     = numOrEmpty(t);
        configForm.perAce[i].dryer_duration = numOrEmpty(d);
        const aceSec = pa[i] || pa[String(i)] || {};
        configForm.perAce[i].feed_speed     = numOrEmpty(aceSec.feed_speed);
        configForm.perAce[i].retract_speed  = numOrEmpty(aceSec.retract_speed);
        configForm.perAce[i].load_length    = numOrEmpty(aceSec.load_length);
        configForm.perAce[i].retract_length = numOrEmpty(aceSec.retract_length);
        configForm.perAce[i].swap_retract_length = numOrEmpty(aceSec.swap_retract_length);
        for (let s = 0; s < 4; s++) {
          configForm.perAce[i].perSlot[s].load_length    = numOrEmpty(aceSec[`load_length_${s}`]);
          configForm.perAce[i].perSlot[s].retract_length = numOrEmpty(aceSec[`retract_length_${s}`]);
          configForm.perAce[i].perSlot[s].swap_retract_length = numOrEmpty(aceSec[`swap_retract_length_${s}`]);
        }
      }
    }
    function formToCfgContent(content) {
      const lines = content.split('\n');
      const numStr = (v) => (v === '' || v == null) ? '' : String(v);
      const mainRepl = {
        ace_device_count:   numStr(configForm.ace_device_count),
        feed_speed:         numStr(configForm.feed_speed),
        retract_speed:      numStr(configForm.retract_speed),
        load_length:        numStr(configForm.load_length),
        retract_length:     numStr(configForm.retract_length),
        swap_retract_length: numStr(configForm.swap_retract_length),
        swap_purge_length:   numStr(configForm.swap_purge_length),
        dryer_temp:         numStr(configForm.dryer_temp),
        dryer_duration:     numStr(configForm.dryer_duration),
        display_index_base: numStr(configForm.display_index_base),
        v2_order:           configForm.v2_order === 'last' ? 'last' : 'first',
        load_retry:         numStr(configForm.load_retry),
        extrusion_retry:    numStr(configForm.extrusion_retry),
        unload_retry:       numStr(configForm.unload_retry),
        state_debug:        configForm.state_debug ? 'true' : 'false',
        usb_debug:          configForm.usb_debug   ? 'true' : 'false',
        fa_debug:           configForm.fa_debug    ? 'true' : 'false',
      };
      for (let i = 0; i < configForm.perAce.length; i++) {
        const p = configForm.perAce[i];
        mainRepl[`dryer_temp_${i}`]     = numStr(p.dryer_temp);
        mainRepl[`dryer_duration_${i}`] = numStr(p.dryer_duration);
      }
      const perAceRepl = {};
      for (let i = 0; i < configForm.perAce.length; i++) {
        const p = configForm.perAce[i];
        const sec = {};
        sec.feed_speed     = numStr(p.feed_speed);
        sec.retract_speed  = numStr(p.retract_speed);
        sec.load_length    = numStr(p.load_length);
        sec.retract_length = numStr(p.retract_length);
        sec.swap_retract_length = numStr(p.swap_retract_length);
        for (let s = 0; s < 4; s++) {
          sec[`load_length_${s}`]    = numStr(p.perSlot[s].load_length);
          sec[`retract_length_${s}`] = numStr(p.perSlot[s].retract_length);
          sec[`swap_retract_length_${s}`] = numStr(p.perSlot[s].swap_retract_length);
        }
        perAceRepl[i] = sec;
      }
      const keyRegex = /^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/;
      const sectionRegex = /^\s*\[(.+?)\]\s*$/;
      const out = [];
      let curSection = null;
      const sectionEnd = {};
      const seenInSection = {};
      const seenSet = (sec) => {
        const k = sec === 'ace' ? 'ace' : `ace${sec}`;
        if (!seenInSection[k]) seenInSection[k] = new Set();
        return seenInSection[k];
      };
      const closeSection = () => {
        if (curSection === null) return;
        const k = curSection === 'ace' ? 'ace' : `ace${curSection}`;
        sectionEnd[k] = out.length;
      };
      for (const raw of lines) {
        const sm = raw.match(sectionRegex);
        if (sm) {
          closeSection();
          const head = sm[1].trim();
          if (head === 'ace') {
            curSection = 'ace';
          } else if (head.startsWith('ace ') || head.startsWith('ace\t')) {
            const idx = parseInt(head.split(/\s+/, 2)[1], 10);
            curSection = isNaN(idx) ? null : idx;
          } else {
            curSection = null;
          }
          out.push(raw);
          continue;
        }
        if (curSection === 'ace') {
          const m = raw.match(keyRegex);
          if (m && (m[1] in mainRepl)) {
            const key = m[1];
            const val = mainRepl[key];
            seenSet('ace').add(key);
            if (val === '' || val == null) continue;
            out.push(`${key}: ${val}`);
            continue;
          }
        } else if (typeof curSection === 'number') {
          const sec = perAceRepl[curSection];
          if (sec) {
            const m = raw.match(keyRegex);
            if (m && (m[1] in sec)) {
              const key = m[1];
              const val = sec[key];
              seenSet(curSection).add(key);
              if (val === '' || val == null) continue;
              out.push(`${key}: ${val}`);
              continue;
            }
          }
        }
        out.push(raw);
      }
      closeSection();
      const insertMissing = (sectionLabel, repl, seen) => {
        const missing = Object.keys(repl)
          .filter(k => !seen.has(k))
          .filter(k => repl[k] !== '' && repl[k] != null);
        if (!missing.length) return;
        const sectionKey = sectionLabel === '[ace]' ? 'ace'
          : `ace${sectionLabel.match(/\[ace (\d+)\]/)[1]}`;
        const endIdx = sectionEnd[sectionKey];
        const block = missing.map(k => `${k}: ${repl[k]}`);
        if (endIdx != null) {
          out.splice(endIdx, 0, ...block);
          for (const k of Object.keys(sectionEnd)) {
            if (sectionEnd[k] > endIdx) sectionEnd[k] += block.length;
          }
        } else {
          out.push('', sectionLabel, ...block);
        }
      };
      insertMissing('[ace]', mainRepl, seenSet('ace'));
      for (let i = 0; i < configForm.perAce.length; i++) {
        insertMissing(`[ace ${i}]`, perAceRepl[i], seenSet(i));
      }
      // Drop any [ace N] section header that ends up with no content.
      // When the user clears all per-ACE overrides, the keyed lines get
      // filtered out by the value=='' rule above, leaving a bare header.
      // Klipper refuses to load an empty section, so strip it here.
      const cleaned = [];
      for (let i = 0; i < out.length; i++) {
        const m = out[i].match(/^\s*\[ace\s+\d+\]\s*$/);
        if (!m) { cleaned.push(out[i]); continue; }
        let j = i + 1;
        let hasContent = false;
        while (j < out.length && !/^\s*\[.+\]\s*$/.test(out[j])) {
          const s = out[j].trim();
          if (s !== '' && !s.startsWith('#') && !s.startsWith(';')) {
            hasContent = true;
          }
          j++;
        }
        if (hasContent) {
          cleaned.push(out[i]);
          continue;
        }
        // Drop header + intervening lines; also strip one trailing blank
        // line from cleaned so we don't pile up separators.
        if (cleaned.length && cleaned[cleaned.length - 1].trim() === '') {
          cleaned.pop();
        }
        i = j - 1;
      }
      return cleaned.join('\n');
    }
    const updateState = reactive({
      current: "",
      latest: "",
      statusText: "",
      canApply: false,
      busy: null,
      log: "",
    });
    const debugState = reactive({
      enabled: false,
      busy: false,
      rebootPrompt: false,
    });
    async function refreshDebugState() {
      try {
        const r = await fetch(`${API}/debug-mode`);
        const j = await r.json();
        if (r.ok) debugState.enabled = !!j.enabled;
      } catch (e) {
      }
    }
    async function debugEnable() {
      if (debugState.busy) return;
      debugState.busy = true;
      try {
        const r = await fetch(`${API}/debug-mode/enable`, {method: "POST"});
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
        debugState.enabled = !!j.enabled;
        debugState.rebootPrompt = debugState.enabled;
      } catch (e) {
        setMacroLog(`${t("ui.config.debug_enable_failed")}: ${e.message || e}`);
      } finally {
        debugState.busy = false;
      }
    }
    async function debugDisable() {
      if (debugState.busy) return;
      confirm({
        title: t("ui.config.debug_disable_title"),
        message: t("ui.config.debug_disable_msg"),
        okLabel: t("ui.config.debug_disable_btn"),
        onOk: async () => {
          debugState.busy = true;
          try {
            const r = await fetch(`${API}/debug-mode/disable`, {method: "POST"});
            const j = await r.json();
            if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
            debugState.enabled = !!j.enabled;
            debugState.rebootPrompt = false;
          } catch (e) {
            setMacroLog(`${t("ui.config.debug_disable_failed")}: ${e.message || e}`);
          } finally {
            debugState.busy = false;
          }
        },
      });
    }
    function _parseUpdateResult(r) {
      const lines = r.status_lines || [];
      let cur = updateState.current, lat = updateState.latest;
      let canApply = false, statusText = "";
      for (const line of lines) {
        const mCur = line.match(/current=(\S+)/);
        if (mCur) cur = mCur[1];
        const mLat = line.match(/latest=(\S+)/);
        if (mLat) lat = mLat[1];
        const mTo = line.match(/to=(\S+)/);
        if (mTo) lat = mTo[1];
        if (line.startsWith("update_available")) canApply = true;
        if (line.startsWith("up_to_date") || line.startsWith("done")
            || line.startsWith("refusing_downgrade")) canApply = false;
        statusText = line;
      }
      updateState.current = cur || updateState.current;
      updateState.latest = lat || updateState.latest;
      updateState.canApply = canApply;
      updateState.statusText = statusText;
      updateState.log = r.stdout || "";
    }
    async function updateCheck() {
      if (updateState.busy) return;
      updateState.busy = "check";
      try {
        const r = await fetch(`${API}/update/check`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
        _parseUpdateResult(j);
      } catch (e) {
        updateState.statusText = `${t("ui.config.update_failed")}: ${e.message || e}`;
        setMacroLog(`${t("ui.config.update_failed")}: ${e.message || e}`);
      } finally {
        updateState.busy = "";
      }
    }
    async function updateApply() {
      if (updateState.busy) return;
      confirm({
        title: t("ui.config.update_apply_title"),
        message: t("ui.config.update_apply_msg", {
          from: updateState.current || "?",
          to:   updateState.latest  || "latest",
        }),
        okLabel: t("ui.config.update_apply_btn"),
        onOk: async () => {
          updateState.busy = "apply";
          try {
            const r = await fetch(`${API}/update/apply`, {method: "POST"});
            const j = await r.json();
            if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`);
            _parseUpdateResult(j);
            if (j.ok) {
              setMacroLog(t("ui.config.update_done"));
            }
          } catch (e) {
            updateState.statusText = `${t("ui.config.update_failed")}: ${e.message || e}`;
            setMacroLog(`${t("ui.config.update_failed")}: ${e.message || e}`);
          } finally {
            updateState.busy = "";
          }
        },
      });
    }
    async function loadConfig() {
      configLoadError.value = "";
      try {
        const r = await fetch(`${API}/config`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        config.path = j.path || "";
        config.content = j.content || "";
        config.params = j.params || {};
        paramsToForm(j.params, j.per_ace_params || {});
      } catch (e) {
        configLoadError.value = t("ui.log.config_load_failed", {error: e});
      }
    }
    async function saveConfigForm() {
      configLog.value = t("ui.common.saving");
      const newContent = formToCfgContent(config.content);
      try {
        // Do NOT auto-restart Klipper: a bare Klipper restart applies most
        // [ace] scalars but NOT changes that need a full reboot (USB/serial
        // re-enumeration, PAXX boot-script settings), and it caused a scary
        // "503 Klippy Host not connected" mid-restart. Save the file and tell
        // the user to restart the printer so every change takes effect.
        const r = await fetch(`${API}/config`, {
          method: "PUT",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({content: newContent, restart_klipper: false}),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
        const j = await r.json();
        config.content = newContent;
        rebootNeeded.value = true;
        configLog.value = `✓ ${j.path}\n${t("ui.controls.backup")}: ${j.backup}\n${t("ui.common.please_restart")}`;
      } catch (e) { configLog.value = `${t("ui.common.error")}: ${e}`; }
    }
    async function saveConfigRaw() {
      configLog.value = t("ui.log.saving_raw");
      try {
        const r = await fetch(`${API}/config`, {
          method: "PUT",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({content: config.content, restart_klipper: config.restartKlipper}),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
        configLog.value = JSON.stringify(await r.json(), null, 2);
      } catch (e) { configLog.value = `${t("ui.common.error")}: ${e}`; }
    }
    async function setMode(m) {
      // multi<->head is a runtime flip (no reboot); only transitions crossing
      // 'normal' need a Klipper restart. In head mode each head is toggled to
      // feeder individually (per-head feeder checkbox), no single ACE head.
      if (state.mode === m) return;
      // Mode changes that cross 'normal' (stock<->ACE file swap) require all
      // toolheads unloaded - mirror the SET_ACE_MODE macro guard client-side so
      // the "unload first" rejection is visible in the web, not only in Fluidd's
      // console (action_respond_info). filament_at_extruder is the same toolhead
      // motion-sensor signal the macro checks (eN_filament.filament_detected).
      const cur = state.mode || "normal";
      if ((cur === "normal") !== (m === "normal")) {
        const loaded = (state.toolheads || []).filter(th => th.filament_at_extruder);
        if (loaded.length) {
          const heads = loaded.map(th => th.name || ("T" + th.idx)).join(", ");
          confirm({
            title: t("ui.config.mode_locked_title"),
            message: t("ui.config.mode_locked_msg", {heads}),
            okLabel: "OK",
            dismissOnly: true,
          });
          return;
        }
      }
      const args = {MODE: m};
      confirm({
        title: t("ui.dialog.switch_mode_title", {mode: m}),
        message: t("ui.dialog.switch_mode_msg", {mode: m}),
        okLabel: t("ui.dialog.switch"),
        onOk: async () => {
          // No web reboot banner for a mode change: a transition crossing
          // 'normal' makes ACE_RUN_MODE_SWITCH raise a reboot error, which
          // shows on the touchscreen popup AND Fluidd AND the web - for both
          // directions and any trigger (web or Fluidd SET_ACE_MODE), unlike a
          // web-only banner. multi<->head is a runtime flip and raises nothing.
          await run("SET_ACE_MODE", args);
        },
      });
    }
    const screenCanvas = ref(null);
    const floatScreenCanvas = ref(null);
    const screenPopout = ref(false);
    const screenFps = ref(0);
    const screenEtag = ref("");
    let frameCount = 0;
    let lastFpsTs = performance.now();
    let pollScreenBusy = false;
    function _liveScreenCanvases() {
      return [screenCanvas.value, floatScreenCanvas.value].filter(Boolean);
    }
    async function pollScreen() {
      if (pollScreenBusy) return;
      const targets = _liveScreenCanvases();
      if (!targets.length) return;
      pollScreenBusy = true;
      try {
        const headers = {};
        if (screenEtag.value) headers["If-None-Match"] = `"${screenEtag.value}"`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        let r;
        try {
          r = await fetch(`${SCREEN}/snapshot`, {
            headers,
            cache: "no-store",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (r.status === 304) {  }
        else if (r.ok) {
          screenEtag.value = (r.headers.get("ETag") || "").replace(/"/g, "");
          const blob = await r.blob();
          const img = await createImageBitmap(blob);
          try {
            for (const c of targets) {
              if (img.width !== c.width || img.height !== c.height) {
                c.width = img.width;
                c.height = img.height;
              }
              c.getContext("2d").drawImage(img, 0, 0);
            }
          } finally {
            img.close();
          }

          frameCount += 1;
          const now = performance.now();
          if (now - lastFpsTs >= 1000) {
            screenFps.value = (frameCount * 1000) / (now - lastFpsTs);
            frameCount = 0;
            lastFpsTs = now;
          }
        }
      } catch (_) {  }
      finally { pollScreenBusy = false; }
    }
    function screenCoords(ev) {
      const c = ev.currentTarget;
      const rect = c.getBoundingClientRect();
      return {
        x: Math.round((ev.clientX - rect.left) * c.width / rect.width),
        y: Math.round((ev.clientY - rect.top) * c.height / rect.height),
      };
    }
    async function sendTouch(action, x, y) {
      try { await fetch(`${SCREEN}/touch?a=${action}&x=${x}&y=${y}`, {method: "POST"}); } catch (_) {}
    }
    function screenDown(ev) {
      ev.currentTarget?.setPointerCapture?.(ev.pointerId);
      const {x, y} = screenCoords(ev); sendTouch("down", x, y);
    }
    function screenMove(ev) {
      if (ev.buttons === 0) return;
      const {x, y} = screenCoords(ev); sendTouch("move", x, y);
    }
    function screenUp(ev) {
      const {x, y} = screenCoords(ev); sendTouch("up", x, y);
    }
    function toggleScreenPopout() {
      screenPopout.value = !screenPopout.value;
    }
    const popoutPos = reactive({
      x: parseFloat(localStorage.getItem("multiace.popout.x")) || null,
      y: parseFloat(localStorage.getItem("multiace.popout.y")) || null,
    });
    const popoutStyle = computed(() => {
      if (popoutPos.x == null || popoutPos.y == null) return {};
      return {
        left: popoutPos.x + "px",
        top:  popoutPos.y + "px",
        right: "auto",
        bottom: "auto",
      };
    });
    let _popoutDrag = null;
    function popoutDragStart(ev) {
      if (ev.target.closest(".screen-popout-close")) return;
      const panel = ev.currentTarget.parentElement;
      const rect = panel.getBoundingClientRect();
      _popoutDrag = {
        offX: ev.clientX - rect.left,
        offY: ev.clientY - rect.top,
        panel,
      };
      ev.currentTarget.setPointerCapture?.(ev.pointerId);
      ev.preventDefault();
    }
    function popoutDragMove(ev) {
      if (!_popoutDrag) return;
      const p = _popoutDrag;
      const w = p.panel.offsetWidth;
      const h = p.panel.offsetHeight;
      const maxX = window.innerWidth - w;
      const maxY = window.innerHeight - h;
      popoutPos.x = Math.max(0, Math.min(maxX, ev.clientX - p.offX));
      popoutPos.y = Math.max(0, Math.min(maxY, ev.clientY - p.offY));
    }
    function popoutDragEnd(ev) {
      if (!_popoutDrag) return;
      _popoutDrag = null;
      ev.currentTarget?.releasePointerCapture?.(ev.pointerId);
      if (popoutPos.x != null) localStorage.setItem("multiace.popout.x", String(popoutPos.x));
      if (popoutPos.y != null) localStorage.setItem("multiace.popout.y", String(popoutPos.y));
    }
    let ws = null;
    let wsReconnectTimer = null;
    let wsConnectCount = 0;
    let wsLastMessageAt = 0;

    function wsConnect(force = false) {
      clearTimeout(wsReconnectTimer);

      if (!force && ws &&
          (ws.readyState === WebSocket.OPEN ||
           ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      if (force && ws) {
        try { ws.close(); } catch (_) {}
      }

      wsConnectCount += 1;
      const attempt = wsConnectCount;
      console.log(`[WS] CONNECT attempt=${attempt}${force ? " forced" : ""}`);

      let socket;
      try { socket = new WebSocket(WS_URL); }
      catch (e) {
        console.error(`[WS] CREATE ERROR attempt=${attempt}`, e);
        conn.value = {state: "err", text: `WS: ${e}`};
        scheduleReconnect();
        return;
      }

      ws = socket;

      socket.onopen = () => {
        if (ws !== socket) return;
        wsLastMessageAt = Date.now();
        console.log(`[WS] OPEN attempt=${attempt}`);
        conn.value = {state: "ok", text: "", i18n_key: "ui.header.live"};
      };

      socket.onmessage = (ev) => {
        if (ws !== socket) return;
        wsLastMessageAt = Date.now();
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "state") applyState(m);
          else if (m.type === "gcode_error") onGcodeError(m);
          else if (m.type === "console_line") onConsoleLine(m);
          else if (m.type === "error") conn.value = m.error
            ? {state: "warn", text: m.error, i18n_key: null}
            : {state: "warn", text: "", i18n_key: "ui.header.ws_error"};
        } catch (_) {}
      };

      socket.onclose = (ev) => {
        if (ws !== socket) return;
        console.warn(`[WS] CLOSE attempt=${attempt} code=${ev.code} reason=${ev.reason || ""}`);
        ws = null;
        conn.value = {state: "warn", text: "", i18n_key: "ui.header.offline"};
        scheduleReconnect();
      };

      socket.onerror = (ev) => {
        if (ws !== socket) return;
        console.error(`[WS] ERROR attempt=${attempt}`, ev);
        conn.value = {state: "err", text: "", i18n_key: "ui.header.ws_error"};
      };
    }

    function scheduleReconnect() {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(() => wsConnect(false), 3000);
    }

    function _onVisibilityChange() {
      if (document.visibilityState !== "visible") {
        if (wiringRaf !== null) {
          cancelAnimationFrame(wiringRaf);
          wiringRaf = null;
        }
        wiringScheduled = false;
        return;
      }

      // Rebuild the wiring once after returning from a background tab.
      scheduleWiringRecompute();

      const stale =
        !wsLastMessageAt ||
        (Date.now() - wsLastMessageAt > 5000);

      if (!ws ||
          ws.readyState !== WebSocket.OPEN ||
          stale) {
        console.warn(`[WS] VISIBILITY RECOVER stale=${stale}`);
        wsConnect(true);
      }
    }
    let screenTimer = null;
    function _updateScreenTimer() {
      clearInterval(screenTimer);
      const wantPoll = screenAvailable.value && screenPopout.value;
      if (wantPoll) screenTimer = setInterval(pollScreen, 200);
    }
    watch([screenPopout, screenAvailable], _updateScreenTimer, {immediate: true});
    const uploading = ref(false);
    const uploadInput = ref(null);
    const preflight = reactive({
      open:    false,
      busy:    false,
      sending: "",
      // Non-empty while "apply loadout" is writing slot-overrides / feeder
      // identities (the plan key being applied).
      applying: "",
      report:  null,
      history: [],
      historyLoading: false,
      error:   "",
      progress: null,
      // Manual slot reassignment for the slicer plan only: {origT: "ace-slot"}.
      // slicerSwaps holds the recomputed swap count (null = use the plan's
      // server value); slicerDirty = overrides changed since the last recalc.
      slicerOverrides: {},
      slicerSwaps: null,
      slicerDirty: false,
      // Head mode: same idea for the single colour->target table. headOverrides
      // is {origT: target_id} ("feeder-N" / "slot-A-S"); headSwaps the recomputed
      // ACE-head swap count (null = use the server plan value).
      headOverrides: {},
      headSwaps: null,
      headDirty: false,
      // Print-preference toggles (default off): inject SET_PRINT_PREFERENCES so
      // an upload/SD start runs bed mesh / timelapse camera (stock only does
      // these on the official start).
      bedMesh: false,
      camera:  false,
      // true when this report was produced in-browser (Pyodide worker) rather
      // than by the printer backend - selects the local rewrite+upload path.
      local: false,
    });
    function triggerUpload() { uploadInput.value && uploadInput.value.click(); }
    function tierLabel(tier) {
      const t_map = {
        exact_hex:  t("ui.preflight.match_exact_hex"),
        name_exact: t("ui.preflight.match_name_exact"),
        name_base:  t("ui.preflight.match_name_base"),
        name_canon: t("ui.preflight.match_name_canon"),
        fuzzy:      t("ui.preflight.match_fuzzy"),
        fallback:   t("ui.preflight.match_fallback"),
        duplicate:  t("ui.preflight.match_duplicate"),
        no_slot:    t("ui.preflight.match_no_slot"),
      };
      return t_map[tier] || tier;
    }
    function tierWarn(tier) {
      return tier && (tier === "fallback"
                      || tier === "duplicate"
                      || tier === "no_slot");
    }
    function rgbDec(hex) {
      const s = (hex || "").replace(/^#/, "");
      if (s.length < 6) return "";
      const r = parseInt(s.slice(0, 2), 16);
      const g = parseInt(s.slice(2, 4), 16);
      const b = parseInt(s.slice(4, 6), 16);
      return `${r},${g},${b}`;
    }
    function sortedMapping(plan) {
      const rows = (plan && plan.mapping) || [];
      return rows.slice().sort((a, b) => {
        const sa = a.slot, sb = b.slot;
        if (!sa && !sb) return a.t - b.t;
        if (!sa) return  1;
        if (!sb) return -1;
        if (sa.ace !== sb.ace)   return sa.ace  - sb.ace;
        if (sa.slot !== sb.slot) return sa.slot - sb.slot;
        return a.t - b.t;
      });
    }
    // --- slicer-plan manual slot reassignment ---------------------------
    function slotKey(slot) { return slot ? (slot.ace + "-" + slot.slot) : ""; }
    function textOn(hex) {
      // Readable text colour (dark/light) for a coloured background, by
      // perceived luminance. Unknown/short colour -> neutral light text.
      const s = (hex || "").replace(/^#/, "");
      if (s.length < 6) return "#e8e8e8";
      const r = parseInt(s.slice(0, 2), 16);
      const g = parseInt(s.slice(2, 4), 16);
      const b = parseInt(s.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111" : "#fff";
    }
    function _liveSlotByKey(key) {
      const [a, s] = (key || "").split("-").map(Number);
      return (preflight.report?.live_slots || [])
        .find(ls => ls.ace === a && ls.slot === s) || null;
    }
    function _slicerColorMat(tt) {
      const c = (preflight.report?.slicer_colors || []).find(x => x.t === tt);
      return ((c && c.material) || "").split("|", 1)[0].trim().toLowerCase();
    }
    function slicerSlotOptions(tt) {
      // Only loaded slots whose material matches the slicer-T (material-strict,
      // mirrors the auto-matcher / CLAUDE.md §23).
      const mat = _slicerColorMat(tt);
      return (preflight.report?.live_slots || []).filter(ls => {
        const m = (ls.material || "").split("|", 1)[0].trim().toLowerCase();
        return !mat || !m || m === mat;
      });
    }
    function _slicerBaseSlot(tt) {
      const plan = preflight.report && preflight.report.plans
                 && preflight.report.plans.slicer;
      const row = ((plan && plan.mapping) || []).find(m => m.t === tt);
      return (row && row.slot) || null;
    }
    function slicerEffectiveSlot(tt) {
      const ov = preflight.slicerOverrides[tt];
      return ov ? _liveSlotByKey(ov) : _slicerBaseSlot(tt);
    }
    function onSlicerSlotChange(tt, key) {
      const base = _slicerBaseSlot(tt);
      if (base && slotKey(base) === key) delete preflight.slicerOverrides[tt];
      else preflight.slicerOverrides[tt] = key;
      preflight.slicerDirty = true;
    }
    function _slicerEffectiveMapping() {
      const plan = preflight.report && preflight.report.plans
                 && preflight.report.plans.slicer;
      return ((plan && plan.mapping) || [])
        .map(m => ({t: m.t, slot: slicerEffectiveSlot(m.t)}));
    }
    function realSwapCount(events, mapping) {
      // Port of backend _real_swap_count: replay the toolchange T-sequence,
      // initial loadout = slot==head per head, count head re-(ace,slot) changes.
      const byT = {};
      for (const m of mapping) if (m.slot) byT[m.t] = m.slot;
      const head = {0: [0, 0], 1: [0, 1], 2: [0, 2], 3: [0, 3]};
      let swaps = 0;
      for (const tt of (events || [])) {
        const slot = byT[tt];
        if (!slot) continue;
        const cur = head[slot.slot];
        if (!cur || cur[0] !== slot.ace || cur[1] !== slot.slot) {
          swaps++;
          head[slot.slot] = [slot.ace, slot.slot];
        }
      }
      return swaps;
    }
    function recalcSlicer() {
      preflight.slicerSwaps = realSwapCount(
        (preflight.report && preflight.report.events) || [],
        _slicerEffectiveMapping());
      preflight.slicerDirty = false;
    }
    function slicerSwapsDisplay() {
      if (preflight.slicerSwaps !== null) return preflight.slicerSwaps;
      const plan = preflight.report && preflight.report.plans
                 && preflight.report.plans.slicer;
      return (plan && plan.swaps) || 0;
    }
    // --- head-mode colour -> target (feeder pin / ACE slot) assignment -----
    function headTargets() {
      return (preflight.report && preflight.report.targets) || [];
    }
    function _headTargetById(id) {
      return headTargets().find(tg => tg.id === id) || null;
    }
    function headTargetOptions(tt) {
      // Only targets whose material matches the slicer-T (material-strict,
      // mirrors compute_head_mode_layout's pre-filter). Empty material on
      // either side is treated as a wildcard.
      const mat = _slicerColorMat(tt);
      return headTargets().filter(tg => {
        const m = (tg.material || "").split("|", 1)[0].trim().toLowerCase();
        return !mat || !m || m === mat;
      });
    }
    function _headBaseTargetId(tt) {
      const plan = preflight.report && preflight.report.plans
                 && preflight.report.plans.loadout;
      const row = ((plan && plan.mapping) || []).find(m => m.t === tt);
      return (row && row.target_id) || "";
    }
    function headEffectiveTargetId(tt) {
      const ov = preflight.headOverrides[tt];
      return ov !== undefined ? ov : _headBaseTargetId(tt);
    }
    function headTargetLabel(tg) {
      if (!tg) return "";
      const mat = tg.material || "?";
      if (tg.kind === "pin") return t("ui.preflight.feeder") + " " + dispIdx(tg.head) + " · " + mat;
      return "ACE " + dispIdx(tg.ace) + " " + t("ui.localized.slot") + " " + dispIdx(tg.slot) + " · " + mat;
    }
    function headTargetColor(id) {
      const tg = _headTargetById(id);
      return (tg && tg.color) || "#444";
    }
    function headTargetLabelById(id) {
      const tg = _headTargetById(id);
      return tg ? headTargetLabel(tg) : "";
    }
    // Custom dropdown for the head-mode target picker: native <option>s
    // cannot render a colour chip NEXT to a label (only full-background
    // fills, which were loud/uneven - Dirk 2026-07-10), so the open list is
    // a small custom popup with chip + label per entry. One open at a time,
    // keyed by the slicer-T; items pick on mousedown (fires before the
    // button's blur closes the list).
    const hmDropOpen = ref(null);
    function hmDdToggle(tt) {
      hmDropOpen.value = (hmDropOpen.value === tt) ? null : tt;
    }
    function hmDdClose() { hmDropOpen.value = null; }
    function hmDdPick(tt, id) {
      hmDropOpen.value = null;
      onHeadTargetChange(tt, id);
    }
    function onHeadTargetChange(tt, id) {
      const base = _headBaseTargetId(tt);
      if (id === base) delete preflight.headOverrides[tt];
      else preflight.headOverrides[tt] = id;
      preflight.headDirty = true;
    }
    function _headEffectiveAssignment() {
      // {origT: target_id} across every slicer colour (base plan + overrides).
      const out = {};
      for (const c of ((preflight.report && preflight.report.slicer_colors) || [])) {
        out[c.t] = headEffectiveTargetId(c.t);
      }
      return out;
    }
    function headSwapCount(events, assignment) {
      // Port of backend head_mode_swap_count: only ACE-target (ace,slot)
      // changes count, PER ACE head (each ACE head swaps independently);
      // pinned feeder colours never swap.
      const cur = {};
      let swaps = 0;
      for (const tt of (events || [])) {
        const tg = _headTargetById(assignment[tt]);
        if (!tg || tg.kind !== "ace") continue;
        const key = tg.ace + "-" + tg.slot;
        if (cur[tg.head] !== key) { swaps++; cur[tg.head] = key; }
      }
      return swaps;
    }
    function recalcHead() {
      preflight.headSwaps = headSwapCount(
        (preflight.report && preflight.report.events) || [],
        _headEffectiveAssignment());
      preflight.headDirty = false;
    }
    function headSwapsDisplay() {
      if (preflight.headSwaps !== null) return preflight.headSwaps;
      const plan = preflight.report && preflight.report.plans
                 && preflight.report.plans.loadout;
      return (plan && plan.swaps) || 0;
    }
    function headFeasible() {
      // Every slicer colour must resolve to a real target (no unassigned row).
      const asn = _headEffectiveAssignment();
      return Object.values(asn).every(id => !!_headTargetById(id));
    }
    // --- the three head plans (loadout editable, optimize/layer proposed) -----
    function headPlanFeasible(hp) {
      if (hp === "loadout") return headFeasible();
      const p = preflight.report && preflight.report.plans
              && preflight.report.plans[hp];
      return !!(p && p.feasible);
    }
    function headPlanSwaps(hp) {
      if (hp === "loadout") return headSwapsDisplay();
      const p = preflight.report && preflight.report.plans
              && preflight.report.plans[hp];
      return (p && p.swaps) || 0;
    }
    // Background-unload balance of a head-mode plan (server-computed;
    // stale after loadout edits like the swap count - same stale marker).
    function headPlanBg(hp) {
      const p = preflight.report && preflight.report.plans
              && preflight.report.plans[hp];
      return (p && p.bg && p.bg.unloads > 0) ? p.bg : null;
    }
    function headPlanBgLabel(hp) {
      const bg = headPlanBg(hp);
      if (!bg) return "";
      let s = t('ui.preflight.bg_label') + " " + bg.bg_ok + "/" + bg.unloads;
      const min = Math.round((bg.saved_s || 0) / 60);
      if (bg.bg_ok > 0 && min > 0) {
        s += " (~" + min + " min " + t('ui.preflight.bg_saved') + ")";
      }
      // Why the rest does NOT qualify - the diagnosis Dirk was missing
      // (">4 colours and still no benefit": short windows vs chain on a
      // non-BG head vs missing M73 look different here).
      const parts = [];
      if (bg.bg_small)    parts.push(bg.bg_small + " " + t('ui.preflight.bg_too_short'));
      if (bg.bg_disabled) parts.push(bg.bg_disabled + " " + t('ui.preflight.bg_not_enabled'));
      if (bg.bg_unknown)  parts.push(bg.bg_unknown + " " + t('ui.preflight.bg_no_m73'));
      if (parts.length) s += " · " + parts.join(", ");
      return s;
    }
    function _headSlicerColor(tt) {
      return ((preflight.report && preflight.report.slicer_colors) || [])
        .find(c => c.t === tt) || null;
    }
    function headSlicerHex(tt) {
      const c = _headSlicerColor(tt);
      return (c && c.hex) || "#444";
    }
    function headSlicerMat(tt) {
      const c = _headSlicerColor(tt);
      return (c && c.material) || "?";
    }
    function headProposalLabel(m) {
      // The proposed destination for a slicer colour (load that colour here).
      if (!m || m.kind === "none") return "";
      if (m.kind === "pin") return t("ui.preflight.feeder") + " " + dispIdx(m.head);
      return "ACE " + dispIdx(m.ace) + " " + t("ui.localized.slot") + " " + dispIdx(m.slot);
    }
    async function onUploadGcode(fileList) {
      const f = fileList && fileList[0];
      if (uploadInput.value) uploadInput.value.value = "";
      if (!f) return;

      const lower = f.name.toLowerCase();
      if (!(lower.endsWith(".gcode") || lower.endsWith(".gco") || lower.endsWith(".g"))) {
        confirm({
          title: t("ui.upload.title"),
          message: t("ui.upload.bad_ext"),
          dismissOnly: true, okLabel: "OK", onOk: () => {},
        });
        return;
      }

      uploading.value = true;
      try {
        const fd = new FormData();
        fd.append("root", "gcodes");
        fd.append("print", "false");
        fd.append("file", f, f.name);

        const r = await fetch("/server/files/upload", {
          method: "POST",
          body: fd,
        });

        const body = await r.json().catch(() => ({}));

        if (!r.ok) {
          const detail = body.error || body.detail || body.message
            || `${r.status} ${r.statusText}`;
          throw new Error(
            typeof detail === "string" ? detail : JSON.stringify(detail)
          );
        }

        setMacroLog(`${t("ui.enhanced.uploaded")}: ${f.name}`);
        await loadGcodeFiles();

      } catch (e) {
        confirm({
          title: t("ui.upload.title"),
          message: e && e.message ? e.message : String(e),
          dismissOnly: true,
          okLabel: "OK",
          onOk: () => {},
        });
      } finally {
        uploading.value = false;
      }
    }
    // ---- in-browser (Pyodide) preflight ----------------------------------
    // The heavy parse/rewrite runs in a Web Worker via Pyodide, executing the
    // UNMODIFIED post-processor + preflight_core (served by /api/preflight/pysrc)
    // - the same Python the backend runs, so no JS re-port / drift. Falls back
    // to the server /api/preflight path if the browser can't do it (no Worker,
    // offline CDN, etc.).
    const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
    let preflightWorker = null;
    let preflightWorkerReady = null;
    let preflightFile = null;
    let preflightJobId = "";
    let preflightJobSeq = 0;

    function ensurePreflightWorker() {
      if (!window.Worker) throw new Error(t("ui.preflight.local_worker_missing"));
      if (preflightWorker && preflightWorkerReady) return preflightWorkerReady;
      preflightWorker = new Worker("preflight_pyodide_worker.js?v=pyodide-20260624");
      preflightWorkerReady = (async () => {
        const r = await fetch(`${API}/preflight/pysrc`);
        if (!r.ok) throw new Error("pysrc " + r.status);
        const src = await r.json();
        await new Promise((resolve, reject) => {
          const onMsg = (ev) => {
            const m = ev.data || {};
            if (m.type === "ready") {
              preflightWorker.removeEventListener("message", onMsg); resolve();
            } else if (m.type === "error") {
              preflightWorker.removeEventListener("message", onMsg);
              reject(new Error(m.message || "worker init failed"));
            }
          };
          preflightWorker.addEventListener("message", onMsg);
          preflightWorker.postMessage({
            type: "init",
            pyodideIndexURL: PYODIDE_INDEX_URL,
            postprocessSrc: src.postprocess,
            coreSrc: src.core,
          });
        });
      })();
      // On a failed bring-up, drop the worker so the next attempt re-inits.
      preflightWorkerReady.catch(() => {
        try { preflightWorker.terminate(); } catch (_) {}
        preflightWorker = null; preflightWorkerReady = null;
      });
      return preflightWorkerReady;
    }

    function runPreflightWorker(type, payload, onProgress) {
      return new Promise((resolve, reject) => {
        const worker = preflightWorker;
        const jobId = payload.jobId;
        const onMsg = (ev) => {
          const msg = ev.data || {};
          if (msg.jobId && msg.jobId !== jobId) return;
          if (msg.type === "progress") { if (onProgress) onProgress(msg); return; }
          if (msg.type === "error") {
            worker.removeEventListener("message", onMsg);
            reject(new Error(msg.message || "worker error"));
            return;
          }
          if ((type === "analyze" && msg.type === "analyze-done")
              || (type === "rewrite" && msg.type === "rewrite-done")) {
            worker.removeEventListener("message", onMsg);
            resolve(msg);
          }
        };
        worker.addEventListener("message", onMsg);
        worker.postMessage(Object.assign({type}, payload));
      });
    }

    // Live ACE/slot identity + head-mode context, in the exact shape
    // preflight_core expects. Fetched from the backend (single source) rather
    // than re-derived in JS.
    async function loadLiveSlotsForPreflight() {
      const r = await fetch(`${API}/preflight/livedata`);
      if (!r.ok) {
        let d = `${r.status}`;
        try { const j = await r.json(); if (j.detail) d = j.detail; } catch (_) {}
        throw new Error(d);
      }
      return await r.json();   // {live_slots, head_ctx}
    }

    function clearLocalPreflightJob() {
      if (preflightWorker && preflightJobId) {
        try { preflightWorker.postMessage({type: "clear", jobId: preflightJobId}); } catch (_) {}
      }
      preflightJobId = "";
      preflightFile = null;
    }

    // Entry point: prefer browser/Pyodide, but automatically fall back
    // to the server path if Worker/Pyodide/CDN initialization fails.
    async function _runPreflight(f) {
      try {
        await _runLocalPreflight(f);
      } catch (e) {
        console.warn(
          "[preflight] local path failed; falling back to server:",
          e && e.message ? e.message : String(e)
        );
        await _runServerPreflight(f);
      }
    }

    async function _runLocalPreflight(f) {
      preflight.open    = true;
      preflight.busy    = true;
      preflight.sending = "";
      preflight.report  = null;
      preflight.history = [];
      preflight.historyLoading = false;
      preflight.error   = "";
      preflight.local   = true;
      preflight.progress = {percent: 0, stage: "queued", running: true};
      uploading.value   = true;
      clearLocalPreflightJob();
      preflightFile  = f;
      preflightJobId = `local-${Date.now()}-${++preflightJobSeq}`;
      try {
        await ensurePreflightWorker();
        const live = await loadLiveSlotsForPreflight();
        const j = await runPreflightWorker("analyze", {
          jobId: preflightJobId, file: f,
          liveSlots: live.live_slots, headCtx: live.head_ctx,
        }, msg => {
          preflight.progress = {
            percent: Number(msg.percent || 0),
            stage:   String(msg.stage || ""), running: true};
        });
        preflight.report = Object.assign({local: true}, j.report || {});
        await loadPreflightHistory();
        preflight.slicerOverrides = {};
        preflight.slicerSwaps = null;
        preflight.slicerDirty = false;
        preflight.headOverrides = {};
        preflight.headSwaps = null;
        preflight.headDirty = false;
        preflight.progress = null;
      } finally {
        uploading.value = false;
        preflight.busy  = false;
      }
    }

    async function _runServerPreflight(f) {
      preflight.open    = true;
      preflight.busy    = true;
      preflight.sending = "";
      preflight.report  = null;
      preflight.history = [];
      preflight.historyLoading = false;
      preflight.error   = "";
      preflight.local   = false;
      preflight.progress = null;
      uploading.value   = true;
      try {
        const fd = new FormData();
        fd.append("file", f, f.name);
        const r = await fetch(`${API}/preflight`, {method: "POST", body: fd});
        if (!r.ok) {
          let msg = `${r.status} ${r.statusText}`;
          try { const j = await r.json(); if (j.detail) msg = j.detail; } catch (_) {}
          throw new Error(msg);
        }
        preflight.report = await r.json();
        await loadPreflightHistory();
        preflight.slicerOverrides = {};
        preflight.slicerSwaps = null;
        preflight.slicerDirty = false;
        preflight.headOverrides = {};
        preflight.headSwaps = null;
        preflight.headDirty = false;
      } catch (e) {
        preflight.error = e.message || String(e);
      } finally {
        uploading.value = false;
        preflight.busy  = false;
      }
    }
    function closePreflight() {
      preflight.open    = false;
      preflight.report  = null;
      preflight.error   = "";
      preflight.sending = "";
      preflight.progress = null;
      preflight.local   = false;
      clearLocalPreflightJob();
    }
    function preflightHistoryDate(ts) {
      const n = Number(ts || 0);
      if (!n) return "-";
      try {
        return new Date(n * 1000).toLocaleString();
      } catch (_) {
        return "-";
      }
    }

    function preflightHistoryTools(report) {
      const tm = (report && report.tool_mm) || {};
      return Object.keys(tm)
        .filter(k => Number(tm[k] || 0) > 0)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => ({
          tool: "T" + (Number(k) + 1),
          mm: Number(tm[k] || 0)
        }));
    }

    function preflightHistoryState(state) {
      const s = String(state || "").toLowerCase();
      if (s === "complete") return t("ui.preflight.history_complete");
      if (s === "cancelled") return t("ui.preflight.history_cancelled");
      if (s === "error") return t("ui.preflight.history_error");
      return state || "-";
    }

    function stageLabel(stage) {
      const map = {
        queued:            t("ui.preflight.stage_queued"),
        analyze:           t("ui.preflight.stage_analyze"),
        apply_remap:       t("ui.preflight.stage_apply_remap"),
        optimize:          t("ui.preflight.stage_optimize"),
        layer:             t("ui.preflight.stage_layer"),
        print_prefs:       t("ui.preflight.stage_print_prefs"),
        rewrite:           t("ui.preflight.stage_rewrite"),
        inject_auto_load:  t("ui.preflight.stage_inject_auto_load"),
        upload:            t("ui.preflight.stage_upload"),
        done:              t("ui.preflight.stage_done"),
      };
      return map[stage] || stage || "";
    }
    // Mirror of the backend _prepend_print_prefs for the in-browser path: the
    // prefs prepend lives in main.py (the I/O shell), not the shared core, so
    // the local worker path applies it here before upload.
    function _prependPrintPrefs(text) {
      // Always inject preferences so unchecked BED_MESH explicitly means
      // BED_LEVEL=0 instead of inheriting a previous/default setting.
      const line = "SET_PRINT_PREFERENCES BED_LEVEL=" + (preflight.bedMesh ? 1 : 0)
        + " FLOW_CALIBRATE=0 TIME_LAPSE_CAMERA=" + (preflight.camera ? 1 : 0)
        + " FORCE=1";
      let body = (text || "").replace(
        /^(\s*SET_PRINT_PREFERENCES\b.*)$/gim,
        "; multiACE disabled: $1"
      );

      if (!preflight.bedMesh) {
        body = body.replace(
          /^(\s*BED_MESH_CALIBRATE\b.*)$/gim,
          "; multiACE skipped bed mesh: $1"
        );
      }

      return "; multiACE preflight: print preferences\n" + line + "\n" + body;
    }
    async function startPreflightPrint(mode, headPlan) {
      if (preflight.busy || preflight.sending) return;
      const rep = preflight.report;
      if (!rep) return;
      if (rep.local) { await _startLocalPreflightPrint(mode, headPlan); return; }
      await _startServerPreflightPrint(mode, headPlan);
    }

    async function startNativePreflightPrint() {
      if (preflight.busy || preflight.sending) return;

      const rep = preflight.report;
      if (!rep || !rep.filename) return;

      if (Array.isArray(rep.missing_materials) &&
          rep.missing_materials.length) {
        preflight.error = t("ui.preflight.missing_mat_msg");
        return;
      }

      preflight.sending = "native";
      preflight.error = "";

      try {
        const r = await fetch(`${API}/print/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            filename: rep.filename,
          }),
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          throw new Error(
            j.detail ||
            j.error ||
            `${r.status} ${r.statusText}`
          );
        }

        setMacroLog(
          t("ui.upload.started", {name: rep.filename})
        );

        closePreflight();

      } catch (e) {
        preflight.error = e && e.message
          ? e.message
          : String(e);
      } finally {
        preflight.sending = "";
      }
    }

    // Browser path: rewrite in the worker, upload straight to Moonraker.
    async function _startLocalPreflightPrint(mode, headPlan) {
      const rep = preflight.report;
      if (!rep || !preflightFile || !preflightJobId) return;
      preflight.sending = (mode === "head") ? (headPlan || "loadout") : mode;
      preflight.error   = "";
      preflight.progress = {percent: 0, stage: "queued", running: true};
      const startedAt = Date.now();
      const MIN_VISIBLE_MS = 1500;
      try {
        const payload = {jobId: preflightJobId, file: preflightFile, mode};
        if (mode === "slicer") {
          // Same (possibly user-edited) remap the server path sends.
          const remap = {};
          for (const m of _slicerEffectiveMapping()) {
            if (!m.slot) continue;
            const synth = m.slot.ace * 4 + m.slot.slot;
            if (synth !== m.t) remap[String(m.t)] = synth;
          }
          payload.remapOverride = remap;
        } else if (mode === "head") {
          const hp = headPlan || "loadout";
          payload.headPlan = hp;
          if (hp === "loadout") {
            const asn = {};
            const eff = _headEffectiveAssignment();
            for (const k of Object.keys(eff)) { if (eff[k]) asn[String(k)] = eff[k]; }
            payload.headAssignment = asn;
          }
        }
        const live = await loadLiveSlotsForPreflight();
        payload.liveSlots = live.live_slots;
        payload.headCtx   = live.head_ctx;
        const j = await runPreflightWorker("rewrite", payload, msg => {
          preflight.progress = {
            percent: Number(msg.percent || 0),
            stage:   String(msg.stage || ""), running: true};
        });
        preflight.progress = {percent: 90, stage: "upload", running: true};
        const fd = new FormData();
        fd.append("root", "gcodes");
        fd.append("print", "true");
        fd.append("file",
          new Blob([_prependPrintPrefs(j.text)], {type: "application/octet-stream"}),
          rep.filename || preflightFile.name);
        const r = await fetch("/server/files/upload", {method: "POST", body: fd});
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          const detail = body.error || body.detail || body.message
            || `${r.status} ${r.statusText}`;
          throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
        }
        preflight.progress = {percent: 100, stage: "done", running: true};
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
        if (wait > 0) await new Promise(res => setTimeout(res, wait));
        setMacroLog(t("ui.upload.started", {name: rep.filename || preflightFile.name}));
        closePreflight();
      } catch (e) {
        preflight.error = e.message || String(e);
      } finally {
        preflight.sending = "";
        if (preflight.progress) preflight.progress.running = false;
      }
    }

    async function _startServerPreflightPrint(mode, headPlan) {
      const rep = preflight.report;
      if (!rep || !rep.token) return;
      // For head mode the button identity is the head plan (loadout/optimize/
      // layer); for multi it is the mode.
      preflight.sending = (mode === "head") ? (headPlan || "loadout") : mode;
      preflight.error   = "";
      preflight.progress = {percent: 0, stage: "queued", running: true};
      const startedAt = Date.now();
      const MIN_VISIBLE_MS = 1500;
      const FIRST_POLL_MS  = 250;
      const POLL_MS        = 500;
      try {
        const body = {token: rep.token, mode,
                      bed_mesh: !!preflight.bedMesh, camera: !!preflight.camera};
        if (mode === "slicer") {
          // Send the (possibly user-edited) slot assignment verbatim so the
          // print matches the preview exactly. Only entries differing from
          // slot==head go into the remap.
          const remap = {};
          for (const m of _slicerEffectiveMapping()) {
            if (!m.slot) continue;
            const synth = m.slot.ace * 4 + m.slot.slot;
            if (synth !== m.t) remap[String(m.t)] = synth;
          }
          body.remap = remap;
        } else if (mode === "head") {
          const hp = headPlan || "loadout";
          body.head_plan = hp;
          if (hp === "loadout") {
            // Send the (possibly user-edited) colour->target assignment verbatim
            // so the print matches the preview exactly. Keys are slicer-T strings.
            const asn = {};
            const eff = _headEffectiveAssignment();
            for (const k of Object.keys(eff)) {
              if (eff[k]) asn[String(k)] = eff[k];
            }
            body.head_assignment = asn;
          }
          // optimize / layer: the server recomputes the proposed loadout, so we
          // send no assignment (the user has arranged spools to match it).
        }
        const r = await fetch(`${API}/preflight/print`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j.detail || `${r.status} ${r.statusText}`);
        }
        const jobId = j.job_id;
        let last;
        let pollDelay = FIRST_POLL_MS;
        for (;;) {
          await new Promise(res => setTimeout(res, pollDelay));
          pollDelay = POLL_MS;
          let sr;
          try {
            sr = await fetch(`${API}/preflight/print/status?job_id=${encodeURIComponent(jobId)}`);
          } catch (_) {
            continue;
          }
          if (!sr.ok) {
            const sj = await sr.json().catch(() => ({}));
            throw new Error(sj.detail || `${sr.status} ${sr.statusText}`);
          }
          last = await sr.json();
          preflight.progress = {
            percent: Number(last.percent || 0),
            stage:   String(last.stage || ""),
            running: !last.done,
          };
          if (last.done) break;
        }
        if (last.error) throw new Error(last.error);
        preflight.progress = {percent: 100, stage: "done", running: true};
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
        if (wait > 0) {
          await new Promise(res => setTimeout(res, wait));
        }
        setMacroLog(t("ui.upload.started", {name: rep.filename}));
        closePreflight();
      } catch (e) {
        preflight.error = e.message || String(e);
      } finally {
        preflight.sending = "";
        if (preflight.progress) preflight.progress.running = false;
      }
    }

    // "Loadout übernehmen": the user has physically rearranged the spools to
    // match a proposed (optimize/layer) plan; write those identities onto the
    // ACE slots (slot-override) and, in head mode, onto the pinned feeder heads
    // (print_task_config). This only SETS filaments/colours - it does NOT start
    // a print.
    function _hex6(c) {
      let s = String(c || "").trim().toLowerCase();
      if (!s) return "";
      if (s[0] !== "#") s = "#" + s;
      if (s.length === 9) s = s.slice(0, 7); // #rrggbbaa -> #rrggbb
      return s;
    }
    function _loadoutOps(mode, headPlan) {
      // -> {overrides:[{ace,slot,material,color}], feeders:[{head,material,color}]}
      const overrides = [], feeders = [];
      const rep = preflight.report;
      if (!rep) return {overrides, feeders};
      if (mode === "head") {
        const plan = rep.plans[headPlan];
        if (!plan || !plan.mapping) return {overrides, feeders};
        for (const m of plan.mapping) {
          if (!m || m.kind === "none") continue;
          const color = _hex6(headSlicerHex(m.t));
          const mat = headSlicerMat(m.t);
          const material = (mat === "?") ? "" : mat;
          if (m.kind === "pin" && m.head !== null && m.head !== undefined) {
            feeders.push({head: m.head, material, color});
          } else if (m.kind === "ace" && m.ace !== null && m.ace !== undefined) {
            overrides.push({ace: m.ace, slot: m.slot, material, color});
          }
        }
      } else {
        const plan = rep.plans[mode];
        if (!plan || !plan.mapping) return {overrides, feeders};
        for (const m of plan.mapping) {
          if (!m || !m.slot) continue;
          overrides.push({
            ace: m.slot.ace, slot: m.slot.slot,
            material: m.slot.material || "", color: _hex6(m.slot.color),
          });
        }
      }
      return {overrides, feeders};
    }
    async function applyLoadout(mode, headPlan) {
      if (preflight.applying || preflight.sending) return;
      const ops = _loadoutOps(mode, headPlan);
      const total = ops.overrides.length + ops.feeders.length;
      if (!total) return;
      confirm({
        title:   t("ui.preflight.apply_loadout"),
        message: t("ui.preflight.apply_loadout_confirm", {count: total}),
        okLabel: t("ui.preflight.apply_loadout"),
        onOk: async () => {
          preflight.applying = (mode === "head") ? (headPlan || "loadout") : mode;
          try {
            for (const o of ops.overrides) {
              await fetch(`${API}/slot-override`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                  ace: o.ace, slot: o.slot, material: o.material,
                  brand: "", subtype: "", color: o.color,
                }),
              });
            }
            for (const f of ops.feeders) {
              const dq = (s) => `"${String(s || "").replace(/"/g, "")}"`;
              const hex = (f.color || "#ffffff").replace("#", "");
              enqueue("SET_PRINT_FILAMENT_CONFIG", {
                CONFIG_EXTRUDER:     f.head,
                FILAMENT_TYPE:       dq(f.material || "PLA"),
                FILAMENT_COLOR_RGBA: hex.toUpperCase() + "FF",
                VENDOR:              dq("Generic"),
                FILAMENT_SUBTYPE:    dq(""),
              });
            }
            if (ops.overrides.length) {
              enqueue("MULTIACE_REFRESH_OVERRIDES", {}, {silent: true});
            }
            setMacroLog(t("ui.preflight.apply_loadout_done", {count: total}));
            reloadState();
          } catch (e) {
            setMacroLog(`${t("ui.common.error")}: ${e}`);
          } finally {
            preflight.applying = "";
          }
        },
      });
    }

    function fanDisplayLabel(fan) {
      const s = String((fan && fan.label) || "");

      if (s === "Part Cooling")
        return t("ui.localized.fan_part_cooling");

      if (s === "Cavity Fan")
        return t("ui.localized.fan_cavity");

      if (s === "Power Fan")
        return t("ui.localized.fan_power");

      let m = s.match(/^E([0-9]+) Fan$/);
      if (m)
        return t("ui.localized.fan_extruder", {n:m[1]});

      m = s.match(/^E([0-9]+) Nozzle Fan$/);
      if (m)
        return t("ui.localized.fan_nozzle", {n:m[1]});

      return s;
    }

    function fanKindLabel(kind) {
      const s=String(kind || "").toLowerCase();

      if (s === "generic")
        return t("ui.localized.fan_kind_generic");

      if (s === "heater")
        return t("ui.localized.fan_kind_heater");

      if (s === "fan")
        return t("ui.localized.fan_kind_fan");

      return kind || "";
    }


    function colorNameLabel(name) {
      const raw = String(name || "").trim();
      if (!raw) return raw;

      const norm = raw.toLowerCase().replace(/[\s-]+/g, "_");
      const aliases = {
        black:"black", siyah:"black", schwarz:"black", "黑色":"black",
        white:"white", beyaz:"white", "weiß":"white", weiss:"white", "白色":"white",
        yellow:"yellow", "sarı":"yellow", gelb:"yellow", "黄色":"yellow",
        red:"red", "kırmızı":"red", rot:"red", "红色":"red",
        green:"green", "yeşil":"green", "grün":"green", gruen:"green", "绿色":"green",
        blue:"blue", mavi:"blue", blau:"blue", "蓝色":"blue",
        orange:"orange", turuncu:"orange", "橙色":"orange",
        purple:"purple", mor:"purple", lila:"purple", "紫色":"purple",
        violet:"violet", "menekşe":"violet", violett:"violet", "紫罗兰色":"violet",
        pink:"pink", pembe:"pink", rosa:"pink", "粉色":"pink",
        brown:"brown", kahverengi:"brown", braun:"brown", "棕色":"brown",
        gray:"gray", grey:"gray", gri:"gray", grau:"gray", "灰色":"gray",
        silver:"silver", "gümüş":"silver", silber:"silver", "银色":"silver",
        gold:"gold", "altın":"gold", "金色":"gold",
        beige:"beige", bej:"beige", "米色":"beige",
        cyan:"cyan", "camgöbeği":"cyan", "青色":"cyan",
        magenta:"magenta", macenta:"magenta", "洋红色":"magenta",
        transparent:"transparent", clear:"transparent", "şeffaf":"transparent", "透明":"transparent",
        natural:"natural", "doğal":"natural", natur:"natural", "本色":"natural",
        navy:"navy", navy_blue:"navy", lacivert:"navy", marineblau:"navy", "藏蓝色":"navy",
        turquoise:"turquoise", turkuaz:"turquoise", "türkis":"turquoise", tuerkis:"turquoise", "绿松石色":"turquoise",
        teal:"teal", "blaugrün":"teal", blaugruen:"teal", "蓝绿色":"teal",
        lime:"lime", "açık_yeşil":"light_green", "limettengrün":"lime", limettengruen:"lime", "青柠色":"lime",
        olive:"olive", "zeytin_yeşili":"olive", "olivgrün":"olive", olivgruen:"olive", "橄榄绿":"olive",
        maroon:"maroon", bordo:"maroon", kastanienbraun:"maroon", "栗色":"maroon",
        burgundy:"burgundy", burgunderrot:"burgundy", "酒红色":"burgundy",
        ivory:"ivory", "fildişi":"ivory", elfenbein:"ivory", "象牙白":"ivory",
        cream:"cream", krem:"cream", creme:"cream", "奶油色":"cream",
        tan:"tan", taba:"tan", hellbraun:"tan", "棕褐色":"tan",
        khaki:"khaki", haki:"khaki", "卡其色":"khaki",
        bronze:"bronze", bronz:"bronze", "青铜色":"bronze",
        copper:"copper", "bakır":"copper", kupfer:"copper", "铜色":"copper",
        rose:"rose", "gül":"rose", "rosé":"rose", rose_:"rose", "玫瑰色":"rose",
        rose_gold:"rose_gold", pembe_altın:"rose_gold", "roségold":"rose_gold", "玫瑰金":"rose_gold",
        light_blue:"light_blue", açık_mavi:"light_blue", hellblau:"light_blue", "浅蓝色":"light_blue",
        dark_blue:"dark_blue", koyu_mavi:"dark_blue", dunkelblau:"dark_blue", "深蓝色":"dark_blue",
        light_green:"light_green", "açık_yeşil":"light_green", "hellgrün":"light_green", hellgruen:"light_green", "浅绿色":"light_green",
        dark_green:"dark_green", "koyu_yeşil":"dark_green", "dunkelgrün":"dark_green", dunkelgruen:"dark_green", "深绿色":"dark_green",
        light_gray:"light_gray", light_grey:"light_gray", açık_gri:"light_gray", hellgrau:"light_gray", "浅灰色":"light_gray",
        dark_gray:"dark_gray", dark_grey:"dark_gray", koyu_gri:"dark_gray", dunkelgrau:"dark_gray", "深灰色":"dark_gray",
        light_pink:"light_pink", açık_pembe:"light_pink", hellrosa:"light_pink", "浅粉色":"light_pink",
        dark_red:"dark_red", "koyu_kırmızı":"dark_red", dunkelrot:"dark_red", "深红色":"dark_red",
        dark_purple:"dark_purple", koyu_mor:"dark_purple", dunkellila:"dark_purple", "深紫色":"dark_purple",
        rainbow:"rainbow", "gökkuşağı":"rainbow", regenbogen:"rainbow", "彩虹":"rainbow",
        multicolor:"multicolor", multi_color:"multicolor", "çok_renkli":"multicolor", mehrfarbig:"multicolor", "多色":"multicolor"
      };
      const key = aliases[norm] || norm;
      const translated = t("ui.colors." + key);
      return translated === "ui.colors." + key ? raw : translated;
    }

    function aceStatusLabel(status) {
      const raw = String(status || "").trim();
      if (!raw) return raw;
      const key = "ui.controls.ace_status_" + raw.toLowerCase().replace(/[\s-]+/g, "_");
      const translated = t(key);
      return translated === key ? raw : translated;
    }

    function temperatureDisplayLabel(item) {
      const raw = String((item && item.label) || "").trim();
      if (!raw) return raw;
      let m = raw.match(/^E(\d+)\s+Nozzle$/i);
      if (m) return t("ui.controls.temp_nozzle", {n:m[1]});
      if (/^(Bed|Bed Heater|Heater Bed)$/i.test(raw)) return t("ui.controls.temp_bed");
      if (/^(Cavity|Chamber|Chamber Temperature)$/i.test(raw)) return t("ui.controls.temp_chamber");
      return raw;
    }

    function modeLabel(mode) {
      const raw = String(mode || "").trim().toLowerCase();
      if (!raw) return mode || "";
      const key = "ui.controls.mode_" + raw;
      const translated = t(key);
      return translated === key ? mode : translated;
    }

    let resizeObserver = null;

    // MultiACE Enhanced - Machine Readonly UI
    const machineInfo = ref(null);
    const machineFiles = ref([]);
    const machineSelectedKey = ref("");
    const machineFile = ref(null);
    const machineLoading = ref(false);
    const machineFileLoading = ref(false);
    const machineError = ref("");
    const machineFileError = ref("");

    const machinePrinter = computed(() => {
      const x = machineInfo.value?.printer || {};
      return x.result || x;
    });

    const machineMoonraker = computed(() => {
      const x = machineInfo.value?.moonraker || {};
      return x.result || x;
    });

    const machineSystem = computed(() => {
      const x = machineInfo.value?.system || {};
      const r = x.result || x;
      return r.system_info || r;
    });

    const machineNozzleText = computed(() => {
      const n = machineInfo.value?.nozzles;
      if (n == null) return "—";
      if (typeof n === "string" || typeof n === "number") return String(n);
      try { return JSON.stringify(n); } catch (_) { return "—"; }
    });

    const machineSystemText = computed(() => {
      const s = machineSystem.value || {};
      const d = s.distribution || {};
      const c = s.cpu_info || {};
      return [
        d.name || d.id || "",
        d.version || d.version_id || "",
        c.model || c.cpu_desc || ""
      ].filter(Boolean).join(" · ") || "—";
    });

    function machineValue(v) {
      if (v === undefined || v === null || v === "") return "—";
      return String(v);
    }

    function machineFormatBytes(v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return "—";
      if (n < 1024) return `${n} B`;
      if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
      return `${(n/1048576).toFixed(2)} MB`;
    }

    async function openMachineFile(key) {
      const k = String(key || "").trim();
      if (!k) return;

      machineSelectedKey.value = k;
      machineFileLoading.value = true;
      machineFileError.value = "";

      try {
        const r = await fetch(`${API}/machine/file?key=${encodeURIComponent(k)}`);
        const d = await r.json();

        if (!r.ok || !d?.ok)
          throw new Error(d?.detail || `HTTP ${r.status}`);

        machineFile.value = d;
      } catch (e) {
        machineFile.value = null;
        machineFileError.value = String(e?.message || e);
      } finally {
        machineFileLoading.value = false;
      }
    }

    async function loadMachinePage(force=false) {
      if (machineLoading.value) return;
      if (!force && machineInfo.value && machineFiles.value.length) return;

      machineLoading.value = true;
      machineError.value = "";

      try {
        const [ri,rf] = await Promise.all([
          fetch(`${API}/machine`),
          fetch(`${API}/machine/files`)
        ]);

        const [di,df] = await Promise.all([ri.json(),rf.json()]);

        if (!ri.ok || !di?.ok)
          throw new Error(di?.detail || `Machine HTTP ${ri.status}`);

        if (!rf.ok || !df?.ok)
          throw new Error(df?.detail || `Files HTTP ${rf.status}`);

        machineInfo.value = di;

        machineFiles.value = Object.entries(df.files || {})
          .map(([key,meta]) => ({key,...(meta || {})}))
          .sort((a,b) => a.key.localeCompare(b.key));

        if (!machineSelectedKey.value && machineFiles.value.length) {
          const f =
            machineFiles.value.find(x => x.key === "printer.cfg") ||
            machineFiles.value[0];

          if (f) await openMachineFile(f.key);
        }
      } catch (e) {
        machineError.value = String(e?.message || e);
      } finally {
        machineLoading.value = false;
      }
    }

    watch(tab, v => {
      if (v === "machine") loadMachinePage();
    }, { immediate: true });

    onMounted(async () => {
      window.addEventListener("visibilitychange", _onVisibilityChange);
      wsConnect();

      await loadLanguageList();
      // No explicit browser choice yet -> follow the printer's persisted
      // language (ace__language), so a fresh browser opens in the same
      // language as the printer instead of defaulting to English.
      if (!localStorage.getItem("multiace.lang")) {
        try {
          const r = await fetch(`${API}/state`);
          if (r.ok) {
            const s = await r.json();
            if (s && s.language) language.value = s.language;
          }
        } catch (_) {}
      }
      await loadCatalog(language.value);
      try {
        const r = await fetch(`${API}/version`);
        if (r.ok) {
          const j = await r.json();
          version.value = `v${j.web}`;
          const p = j.printer || {};
          printerName.value = p.device_name || "";
          printerFw.value   = p.firmware_version || "";
        }
      } catch (_) {}
      try { const r = await fetch(`${API}/screen-available`); if (r.ok) screenAvailable.value = (await r.json()).available; } catch (_) {}
      await reloadState();
      await reloadSnapshots();
      await loadConfig();
      await loadMaterials();
      await loadNotifications();
      await loadConsole();
      await loadDynamicMacros();
      await refreshDebugState();
      await refreshPlugins();
      if (state.mode === "normal" && tab.value === "dashboard") tab.value = "config";

      if (tab.value === "files") {
        await loadGcodeFiles();
      }

      if (window.ResizeObserver && wiringContainerEl.value) {
        resizeObserver = new ResizeObserver(() => recomputeWiring());
        resizeObserver.observe(wiringContainerEl.value);
      } else {
        window.addEventListener("resize", recomputeWiring);
      }
      scheduleWiringRecompute();
      window.addEventListener("beforeunload", _onBeforeUnload);
    });
    function _onBeforeUnload(ev) {
      const pending = cmdQueue.value.some(
        it => it.status === 'queued' || it.status === 'running');
      if (!pending) return;
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    }
    onUnmounted(() => {
      clearTimeout(wsReconnectTimer);
      clearInterval(screenTimer);
      try { ws?.close(); } catch (_) {}
      try { resizeObserver?.disconnect(); } catch (_) {}
      window.removeEventListener("resize", recomputeWiring);
      window.removeEventListener("beforeunload", _onBeforeUnload);
      window.removeEventListener("visibilitychange", _onVisibilityChange);
    });
    return {
      subText,
      sourceLabel,
      channelStateLabel,
      tab, sidebarOpen, version, printerName, printerFw, connClass, connText, screenAvailable,
      machineInfo, machineFiles, machineSelectedKey, machineFile,
      machineLoading, machineFileLoading, machineError, machineFileError,
      machinePrinter, machineMoonraker, machineSystem,
      machineNozzleText, machineSystemText,
      loadMachinePage, openMachineFile, machineValue, machineFormatBytes,
      state, loadError, run, macroLog,
      slotTitle, switchAce, loadSlot, loadFeederHead, slotLoadedInHead, loadAll, unloadHead, unloadAll, setHeadManual, setHeadFeeder, setHeadAce, aceOptionsForHead, headAceOf, visibleAces, openHeadPicker, isToolheadOccupied, needsReload, toolheadOps, bgEnabledFor, setBgHead,
      isPrinting,
      printStatusActive, printProgressStyle, printActionBusy,
      printStateClass, printStateLabel,
      formatPrintTime, formatFinishTime, formatFilamentUsed,
      formatPrintFilename,
      activePrintFilament, activeFilamentColorStyle, activeFilamentTitle,
      pausePrint, resumePrint, cancelPrint,
      temperatureBusy, temperatureDraft,
      temperatureDraftValue, setTemperatureDraft,
      formatTemperature, temperatureControllable, setTemperature,
      fanBusy, fanDraft, fanPercent,
      fanDraftValue, setFanDraft, setFanSpeed,
      fanDisplayLabel, fanKindLabel, colorNameLabel, aceStatusLabel, temperatureDisplayLabel, modeLabel,
      motionBusy, sendMotionGcode, homeMotion, jogMotion,
      disableMotors, axisHomed, allAxesHomed,
      speedFlowBusy, factorPercent,
      speedFactorDraft, flowFactorDraft,
      speedFactorValue, flowFactorValue,
      updateSpeedDraft, updateFlowDraft,
      setSpeedFactor, setFlowFactor,
      machineLimitBusy, setMachineLimit,
      zOffsetBusy, formatZOffset, adjustZOffset,
      extruderBusy, extrudeDistance, extrudeSpeed,
      toolNumbers, toolActive, selectTool, extruderMove,
      consoleLines, consoleCommand, consoleSending,
      loadConsole, onConsoleLine, consoleTime,
      sendConsoleCommand, clearConsole,
      dynamicMacros, dynamicMacroCounts,
      dynamicMacroLoading, dynamicMacroError,
      dynamicMacroOpen, dynamicMacroGroups,
      loadDynamicMacros, toggleDynamicMacroGroup,
      selectDynamicMacro,
      dryerCfg, dryStart, dryStop, dryOpenAce, toggleDryPanel, aceDrying,
      snapshots, selectedSnapshot, snapshotPreview, saveSnapshot, loadSnapshot, deleteSnapshot,
      config, configLog, configLoadError, showRawConfig, configForm, rebootNeeded,
      aceHeadsRightSide,
      loadConfig, saveConfigForm, saveConfigRaw, setMode,
      preflight, closePreflight, startPreflightPrint, startNativePreflightPrint, applyLoadout, stageLabel,
      preflightHistoryDate, preflightHistoryTools, preflightHistoryState,
      tierLabel, tierWarn, rgbDec, sortedMapping,
      slotKey, textOn, slicerSlotOptions, slicerEffectiveSlot, onSlicerSlotChange,
      recalcSlicer, slicerSwapsDisplay,
      headTargets, headTargetOptions, headEffectiveTargetId, headTargetLabel,
      headTargetColor, headTargetLabelById, onHeadTargetChange, recalcHead, headSwapsDisplay,
      hmDropOpen, hmDdToggle, hmDdClose, hmDdPick,
      headFeasible, headPlanFeasible, headPlanSwaps, headPlanBg, headPlanBgLabel, headSlicerHex,
      headSlicerMat, headProposalLabel,
      updateState, updateCheck, updateApply,
      debugState, debugEnable, debugDisable,
      plugins, refreshPlugins, pluginIframeSrc,
      notifications, dismissNotification, dismissAllNotifications,
      pendingFilamentSelection, pendingSelectionChoices,
      loadPendingFilamentSelection, choosePendingFilament,
      pendingFilamentChoiceKey, pendingFilamentAllSelected,
      submitPendingFilamentSelection, cancelPendingFilamentSelection,
      confirmDialog, okConfirm, altConfirm, cancelConfirm,
      screenCanvas, floatScreenCanvas, screenPopout, toggleScreenPopout,
      popoutStyle, popoutDragStart, popoutDragMove, popoutDragEnd,
      screenFps, screenEtag,
      screenDown, screenMove, screenUp,
      wiringContainerEl, setSlotEl, setThEl, wiringPaths, wiringViewBox,
      t, dispIdx, language, languages, setLanguage,
      picker, openPicker, closePicker, savePicker, clearPickerOverride, pickerMaterials,
      pickerDb, pickerVendors, currentSubtypes, currentPickerColors, currentPickerColorOptions,
      pickerHasRfid, pickerHasOverride, pickerRfidStyle, readPickerRfid,
      cmdQueue, visibleQueue, cmdPaused, removeFromQueue, pauseQueue, resumeQueue, clearAllErrors,
      sendingAll, sendAllToPrinter,
      fmtArgs, cmdLabel,
      uploading, uploadInput, triggerUpload, onUploadGcode,
      gcodeFiles, gcodeFilesLoading, gcodeFilesError,
      loadGcodeFiles, formatFileSize, formatFileDate, printStoredGcode,
    };
  },
}).mount("#app");
