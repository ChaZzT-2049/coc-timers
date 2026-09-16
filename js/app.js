import {
  HELPER_LAB,
  KIND_LABELS,
  clockTowerBoostMinutes,
  isKnownId,
  isUtilityHelper,
  nameCatalog,
  resolveName,
} from "./ids.js";
import { busyBuilders, crewVillage, isComplete, occupiesBuilder, parseVillageText, remainingMs } from "./parser.js";
import {
  clearVillage,
  loadNotified,
  loadSettings,
  loadVillage,
  saveNotified,
  saveSettings,
  saveVillage,
} from "./storage.js";
import {
  clearScheduled,
  requestPermission,
  scheduleUpgradeAlerts,
  setServiceWorker,
} from "./notify.js";
import { getPushToken, syncPushAlerts } from "./push.js";

const $ = (id) => document.getElementById(id);

const els = {
  empty: $("empty-state"),
  dashboard: $("dashboard"),
  tag: $("player-tag"),
  halls: $("hall-levels"),
  exported: $("exported-at"),
  next: $("next-finish"),
  homeList: $("home-list"),
  homeBoosts: $("home-boosts"),
  builderList: $("builder-list"),
  clockTower: $("clock-tower"),
  helpersPanel: $("helpers-panel"),
  helpersList: $("helpers-list"),
  helpersUtility: $("helpers-utility"),
  helpersReady: $("helpers-ready"),
  json: $("json-input"),
  error: $("import-error"),
  toast: $("toast"),
  notifyStatus: $("notify-status"),
  notifyComplete: $("notify-complete"),
  notifyBefore: $("notify-before"),
  notifySound: $("notify-sound"),
  notifyHelpers: $("notify-helpers"),
  installBtn: $("install-btn"),
  installGuide: $("install-guide"),
  namesSearch: $("names-search"),
  namesUnknown: $("names-unknown"),
  namesCatalog: $("names-catalog"),
  drawer: $("import-drawer"),
  settingsModal: $("settings-modal"),
  clipboardModal: $("clipboard-modal"),
  clipboardSummary: $("clipboard-summary"),
  clipboardReplace: $("clipboard-replace"),
  sleepBed: $("sleep-bed"),
  sleepWake: $("sleep-wake"),
  sleepReport: $("sleep-report"),
  viewSummary: $("view-summary"),
  viewUpgrades: $("view-upgrades"),
};

let snapshot = loadVillage();
let settings = loadSettings();
let notified = loadNotified();
let filter = "all";
let dashView = "summary";
let deferredPrompt = null;
let ticker = null;
let pendingClipboard = null;
let clipboardBusy = false;
const dismissedClipboard = new Set();

function isStandaloneDisplay() {
  const modes = [
    "standalone",
    "fullscreen",
    "minimal-ui",
    "window-controls-overlay",
    "borderless",
    "tabbed",
  ];
  if (modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)) return true;
  if (window.navigator.standalone === true) return true;
  if (String(document.referrer).startsWith("android-app://")) return true;
  return false;
}

function rememberInstalled() {
  if (settings.installedPwa) return;
  settings.installedPwa = true;
  saveSettings(settings);
}

async function isAppInstalled() {
  if (isStandaloneDisplay()) {
    rememberInstalled();
    return true;
  }
  if (typeof navigator.getInstalledRelatedApps === "function") {
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length) {
        rememberInstalled();
        return true;
      }
    } catch {
      /* no disponible en este navegador */
    }
  }
  return Boolean(settings.installedPwa);
}

async function syncInstallUi() {
  const installed = await isAppInstalled();
  document.documentElement.classList.toggle("is-installed", installed);
  if (els.installBtn) els.installBtn.hidden = installed || !deferredPrompt;
  if (els.installGuide) els.installGuide.hidden = installed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function unknownIdsFromSnapshot() {
  if (!snapshot) return [];
  const ids = new Set();
  for (const upgrade of snapshot.upgrades || []) {
    if (!isKnownId(upgrade.dataId)) ids.add(Number(upgrade.dataId));
  }
  for (const helper of snapshot.helpers || []) {
    if (!isKnownId(helper.dataId)) ids.add(Number(helper.dataId));
  }
  return [...ids].sort((a, b) => a - b);
}

function renderNamesCatalog() {
  if (!els.namesCatalog) return;
  const query = String(els.namesSearch?.value || "").trim().toLowerCase();
  const unknown = unknownIdsFromSnapshot();
  if (els.namesUnknown) {
    if (unknown.length) {
      els.namesUnknown.hidden = false;
      els.namesUnknown.textContent =
        `En tu export hay IDs sin nombre: ${unknown.join(", ")}. Añádelos en js/ids.js.`;
    } else {
      els.namesUnknown.hidden = true;
      els.namesUnknown.textContent = "";
    }
  }

  const groups = nameCatalog().map((group) => {
    const rows = group.rows.filter((row) => {
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || String(row.id).includes(query);
    });
    return { ...group, rows };
  }).filter((group) => group.rows.length);

  if (!groups.length) {
    els.namesCatalog.innerHTML = `<p class="empty-list">Nada coincide con esa búsqueda.</p>`;
    return;
  }

  els.namesCatalog.innerHTML = groups.map((group) => `
    <h4>${escapeHtml(group.title)} · ${group.rows.length}</h4>
    <ul>
      ${group.rows.map((row) => `<li>${escapeHtml(row.name)}<span>${row.id}</span></li>`).join("")}
    </ul>
  `).join("");
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 2800);
}

function formatDuration(ms) {
  if (ms <= 0) return "LISTA";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}D ${h}H`;
  if (h > 0) return `${h}H ${m}M`;
  if (m > 0) return `${m}M ${s}S`;
  return `${s}S`;
}

function formatDate(ms) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: settings.timeFormat === "12",
  }).format(new Date(ms));
}

function formatWhen(ms) {
  const when = new Date(ms);
  const now = new Date();
  const time = new Intl.DateTimeFormat("es", {
    timeStyle: "short",
    hour12: settings.timeFormat === "12",
  }).format(when);
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(when) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return `hoy ${time}`;
  if (diffDays === 1) return `mañana ${time}`;
  if (diffDays === -1) return `ayer ${time}`;
  return formatDate(ms);
}

function parseClock(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function sleepSchedule() {
  const bed = parseClock(settings.sleepBed);
  const wake = parseClock(settings.sleepWake);
  if (bed == null || wake == null || bed === wake) return null;
  return { bed, wake };
}

function nextSleepRange(now, bed, wake) {
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMilliseconds(0);
  const nowMin = start.getHours() * 60 + start.getMinutes();
  const end = new Date(start);

  if (bed > wake) {
    if (nowMin >= bed) {
      start.setHours(Math.floor(bed / 60), bed % 60, 0, 0);
      end.setDate(end.getDate() + 1);
      end.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
      return { start: start.getTime(), end: end.getTime() };
    }
    if (nowMin < wake) {
      start.setDate(start.getDate() - 1);
      start.setHours(Math.floor(bed / 60), bed % 60, 0, 0);
      end.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
      return { start: start.getTime(), end: end.getTime() };
    }
    start.setHours(Math.floor(bed / 60), bed % 60, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
    return { start: start.getTime(), end: end.getTime() };
  }

  if (nowMin >= bed && nowMin < wake) {
    start.setHours(Math.floor(bed / 60), bed % 60, 0, 0);
    end.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
    return { start: start.getTime(), end: end.getTime() };
  }
  if (nowMin < bed) {
    start.setHours(Math.floor(bed / 60), bed % 60, 0, 0);
    end.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
    return { start: start.getTime(), end: end.getTime() };
  }
  start.setDate(start.getDate() + 1);
  start.setHours(Math.floor(bed / 60), bed % 60, 0, 0);
  end.setDate(end.getDate() + 1);
  end.setHours(Math.floor(wake / 60), wake % 60, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

function sleepSlotLabel(upgrade) {
  if (upgrade.kind === "lab" || upgrade.kind === "workshop") return "Laboratorio";
  if (upgrade.kind === "starlab") return "Lab. estelar";
  if (upgrade.kind === "pet") return "Mascota";
  if (crewVillage(upgrade) === "builder") return "Constructor (base)";
  if (upgrade.kind === "gearup") return "Constructor (aldea · base)";
  if (occupiesBuilder(upgrade)) return "Constructor (aldea)";
  return KIND_LABELS[upgrade.kind] || "Mejora";
}

function applyDashView() {
  const summary = dashView === "summary";
  els.viewSummary.hidden = !summary;
  els.viewUpgrades.hidden = summary;
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === dashView);
  });
}

function renderSleepReport(now = Date.now()) {
  const box = els.sleepReport;
  if (!box) return;
  const sched = sleepSchedule();
  if (!sched) {
    box.innerHTML = `<p class="empty-list">Pon a qué hora te acuestas y te levantas para ver si alguna mejora cae en el sueño y cuánto se pararían los constructores.</p>`;
    return;
  }

  const range = nextSleepRange(now, sched.bed, sched.wake);
  const overnight = range.end <= now
    ? nextSleepRange(range.end + 60_000, sched.bed, sched.wake)
    : range;
  const hits = (snapshot?.upgrades || [])
    .filter((upgrade) => !isComplete(upgrade, now))
    .filter((upgrade) => upgrade.finishAt >= overnight.start && upgrade.finishAt < overnight.end)
    .sort((a, b) => a.finishAt - b.finishAt);

  const idle = { home: 0, builder: 0, lab: 0 };
  const rows = hits.map((upgrade) => {
    const idleMs = Math.max(0, overnight.end - upgrade.finishAt);
    if (upgrade.kind === "lab" || upgrade.kind === "workshop") idle.lab += idleMs;
    else if (upgrade.kind === "starlab") idle.lab += idleMs;
    else if (occupiesBuilder(upgrade) && crewVillage(upgrade) === "builder") idle.builder += idleMs;
    else if (occupiesBuilder(upgrade)) idle.home += idleMs;
    return `<article class="sleep-hit">
      <div class="card-top">
        <span class="kind">${sleepSlotLabel(upgrade)}</span>
        <span class="sleep-idle">${formatDuration(idleMs)} parado</span>
      </div>
      <h3>${displayName(upgrade)}</h3>
      <p class="finish">Termina ${formatWhen(upgrade.finishAt)} · parado hasta ${formatWhen(overnight.end)}</p>
    </article>`;
  });

  const totals = [];
  if (idle.home) totals.push(`aldea ${formatDuration(idle.home)}`);
  if (idle.builder) totals.push(`base ${formatDuration(idle.builder)}`);
  if (idle.lab) totals.push(`lab ${formatDuration(idle.lab)}`);
  const headline = hits.length
    ? `${hits.length} mejora${hits.length === 1 ? "" : "s"} en este sueño${totals.length ? ` · parados: ${totals.join(" · ")}` : ""}`
    : "Nada termina mientras duermes en esta ventana. Los que siguen de largo no dejan hueco hasta que te levantes.";

  box.innerHTML = `
    <p class="sleep-window">De ${formatWhen(overnight.start)} a ${formatWhen(overnight.end)}</p>
    <p class="sleep-headline">${headline}</p>
    ${rows.length ? `<div class="sleep-hits">${rows.join("")}</div>` : ""}
  `;
}

function helperReadyAt(helper) {
  if (Number(helper.readyAt) > 0) return Number(helper.readyAt);
  if (helper.cooldownLeft > 0 && snapshot?.exportedAt) {
    return snapshot.exportedAt + helper.cooldownLeft * 1000;
  }
  return 0;
}

function displayName(upgrade) {
  const base = resolveName(upgrade.dataId, upgrade.village);
  const suffix = String(upgrade.name || "").match(/ #\d+$/);
  return suffix ? `${base}${suffix[0]}` : base;
}

function secondsSinceExport(now = Date.now()) {
  if (!snapshot?.exportedAt) return 0;
  return Math.max(0, Math.floor((now - snapshot.exportedAt) / 1000));
}

function helperState(upgrade, now) {
  const info = upgrade.helper;
  if (!info) return null;
  const elapsed = secondsSinceExport(now);
  const sessionLeft = Math.max(0, (info.sessionLeft || 0) - elapsed);
  const lab = info.dataId === HELPER_LAB;
  return {
    active: sessionLeft > 0,
    auto: Boolean(info.recurrent),
    sessionLeft,
    speed: info.speed,
    label: lab ? "Asistente" : "Aprendiz",
  };
}

function helperBadge(upgrade, now) {
  const state = helperState(upgrade, now);
  if (!state) return { classes: "", chip: "", detail: "" };

  const classes = [
    "has-helper",
    state.active ? "has-helper-active" : "",
    state.auto && !state.active ? "has-helper-auto" : "",
  ].filter(Boolean).join(" ");

  const chipText = state.active
    ? `Activo ×${state.speed}${state.sessionLeft ? ` · ${formatDuration(state.sessionLeft * 1000)}` : ""}`
    : state.auto
      ? `Automático ×${state.speed}`
      : `Ayudante ×${state.speed}`;
  const chipClass = state.active ? "is-active" : state.auto ? "is-auto" : "";
  const chip = `<span class="helper-chip ${chipClass}">
      <svg class="icon" aria-hidden="true"><use href="#i-helper"></use></svg>
      ${chipText}
    </span>`;

  const bits = [`${state.label} ×${state.speed}`];
  if (state.active) bits.push(`${formatDuration(state.sessionLeft * 1000)} de turno`);
  if (state.auto) bits.push("se asigna solo hasta que termine");
  const detail = `<p class="helper-tag">${bits.join(" · ")}</p>`;

  return { classes, chip, detail };
}

function helperCard(helper, now) {
  const elapsed = secondsSinceExport(now);
  const sessionLeft = Math.max(0, (helper.sessionLeft || 0) - elapsed);
  const readyAt = helperReadyAt(helper);
  const assigned = (snapshot.upgrades || []).find((u) => u.id === helper.assignedId);
  const assignedName = assigned ? displayName(assigned) : null;
  const name = resolveName(helper.dataId, "home");
  const readyLabel = readyAt > now
    ? `${formatWhen(readyAt)} · ${formatDuration(readyAt - now)}`
    : "";

  let state = "idle";
  let eta = "Disponible";
  let detail = helper.dataId === HELPER_LAB
    ? "Laboratorio y asedios"
    : "Edificios y héroes";
  let finish = "Lista para asignar";

  if (sessionLeft > 0 && assignedName) {
    state = "working";
    eta = "Trabajando";
    detail = helper.recurrent
      ? `Automático en ${assignedName} · ×${helper.speed} · ${formatDuration(sessionLeft * 1000)} de turno`
      : `Acelerando ${assignedName} · ×${helper.speed} · ${formatDuration(sessionLeft * 1000)} de turno`;
    finish = helper.recurrent && readyAt > now
      ? `Se reasigna sola ${readyLabel}`
      : readyAt > now
        ? `Lista para usar ${readyLabel}`
        : "Turno en curso";
  } else if (helper.recurrent && assignedName && readyAt > now) {
    state = "queued";
    eta = "Automático";
    detail = `Se asigna sola a ${assignedName} hasta que termine · ×${helper.speed}`;
    finish = `Próximo turno ${readyLabel}`;
  } else if (readyAt > now) {
    state = "rest";
    eta = "Descanso";
    detail = "Jornada de 23 h en curso";
    finish = `Lista para usar ${readyLabel}`;
  }

  return `<article class="card helper-card is-${state}">
    <div class="card-top">
      <span class="kind">Nv. ${helper.level} · ×${helper.speed}</span>
      <span class="eta is-${state}">${eta}</span>
    </div>
    <h3>${name}</h3>
    <p class="helper-tag">${detail}</p>
    <p class="finish">${finish}</p>
  </article>`;
}

function helperMini(helper, now) {
  const readyAt = helperReadyAt(helper);
  const name = resolveName(helper.dataId, "home");
  const ready = readyAt <= now;
  const status = ready
    ? "Disponible"
    : `${formatWhen(readyAt)} · ${formatDuration(readyAt - now)}`;
  return `<span class="helper-mini ${ready ? "is-idle" : "is-rest"}"><b>${name}</b><span>${status}</span></span>`;
}

function clockTowerBoostLeft(now) {
  const ct = snapshot?.clockTower;
  if (!ct) return 0;
  if (ct.boostUntil > 0) return Math.max(0, Math.floor((ct.boostUntil - now) / 1000));
  return Math.max(0, (ct.boostLeft || 0) - secondsSinceExport(now));
}

function clockTowerChip(now) {
  const left = clockTowerBoostLeft(now);
  if (left <= 0) return "";
  return `<span class="helper-chip is-active">
      <svg class="icon" aria-hidden="true"><use href="#i-clock"></use></svg>
      Reloj ×10 · ${formatDuration(left * 1000)}
    </span>`;
}

function potionChip(upgrade, now) {
  const pots = upgrade.potions || [];
  if (!pots.length) return { chip: "", active: false };
  const elapsed = secondsSinceExport(now);
  const active = pots.filter((pot) => Math.max(0, (pot.left || 0) - elapsed) > 0);
  if (!active.length) return { chip: "", active: false };
  const extra = active.reduce((sum, pot) => sum + (pot.extra || 0), 0);
  const rate = 1 + extra;
  const left = Math.min(...active.map((pot) => (pot.left || 0) - elapsed));
  const label = active.length === 1 ? active[0].label : "Boost";
  return {
    active: true,
    chip: `<span class="helper-chip is-active">${label} ×${rate} · ${formatDuration(left * 1000)}</span>`,
  };
}

function renderHomeBoosts(now = Date.now()) {
  const items = snapshot?.potions?.items || [];
  if (!els.homeBoosts) return;
  const elapsed = secondsSinceExport(now);
  const active = items.filter((item) => {
    if (item.until > 0) return item.until > now;
    return Math.max(0, (item.left || 0) - elapsed) > 0;
  });
  if (!active.length) {
    els.homeBoosts.hidden = true;
    els.homeBoosts.innerHTML = "";
    return;
  }
  els.homeBoosts.hidden = false;
  els.homeBoosts.innerHTML = active.map((item) => {
    const left = item.until > 0
      ? Math.max(0, item.until - now)
      : Math.max(0, (item.left || 0) - elapsed) * 1000;
    return `<span class="helper-mini is-idle"><b>${item.name}</b><span>×${item.rate} · ${formatDuration(left)}</span></span>`;
  }).join("");
}

function renderClockTower(now = Date.now()) {
  const ct = snapshot?.clockTower;
  if (!els.clockTower) return;
  if (!ct) {
    els.clockTower.hidden = true;
    els.clockTower.innerHTML = "";
    els.clockTower.className = "clock-tower";
    return;
  }
  const boostLeft = clockTowerBoostLeft(now);
  const readyAt = Number(ct.readyAt) || 0;
  const minutes = clockTowerBoostMinutes(ct.level);
  let cls = "";
  let status = `Nv. ${ct.level} · ×${ct.speed}`;
  if (boostLeft > 0) {
    cls = "is-active";
    status = `Activa ×10 · ${formatDuration(boostLeft * 1000)}`;
  } else if (ct.upgrading) {
    status = "Mejorando · no se puede activar";
  } else if (readyAt > now) {
    status = `Lista ${formatWhen(readyAt)} · ${formatDuration(readyAt - now)}`;
  } else {
    cls = "is-ready";
    status = minutes ? `Lista para activar · ${minutes} min a ×10` : "Lista para activar";
  }
  els.clockTower.hidden = false;
  els.clockTower.className = `clock-tower ${cls}`.trim();
  els.clockTower.innerHTML = `<b>Torre del reloj</b><span>${status}</span>`;
}

function renderHelpers(now = Date.now()) {
  const helpers = snapshot?.helpers || [];
  const timed = helpers.filter((helper) => !isUtilityHelper(helper.dataId));
  const utility = helpers.filter((helper) => isUtilityHelper(helper.dataId));
  if (!els.helpersPanel) return;
  if (!helpers.length) {
    els.helpersPanel.hidden = true;
    els.helpersList.innerHTML = "";
    if (els.helpersUtility) {
      els.helpersUtility.innerHTML = "";
      els.helpersUtility.hidden = true;
    }
    if (els.helpersReady) els.helpersReady.textContent = "";
    return;
  }
  els.helpersPanel.hidden = false;
  els.helpersList.innerHTML = timed.map((helper) => helperCard(helper, now)).join("");
  if (els.helpersUtility) {
    els.helpersUtility.hidden = !utility.length;
    els.helpersUtility.innerHTML = utility.map((helper) => helperMini(helper, now)).join("");
  }

  if (!els.helpersReady) return;
  const nextReady = timed
    .map((helper) => helperReadyAt(helper))
    .filter((ms) => ms > now)
    .sort((a, b) => a - b)[0];
  const freeNow = timed.filter((helper) => helperReadyAt(helper) <= now && !helper.recurrent);
  if (nextReady) {
    const auto = timed.filter((helper) => helper.recurrent && helperReadyAt(helper) === nextReady);
    const free = timed.filter((helper) => !helper.recurrent && helperReadyAt(helper) === nextReady);
    const bits = [];
    if (free.length) bits.push(`listos para usar ${formatWhen(nextReady)}`);
    if (auto.length) bits.push(`asignación automática ${formatWhen(nextReady)}`);
    els.helpersReady.textContent = bits.length
      ? `Próxima jornada ${formatWhen(nextReady)} · ${bits.join(" · ")}`
      : `Próxima jornada ${formatWhen(nextReady)}`;
  } else if (freeNow.length) {
    els.helpersReady.textContent = "Ya puedes asignarlos";
  } else {
    els.helpersReady.textContent = "";
  }
}

function markNotified(id) {
  notified.add(id);
  saveNotified(notified);
}

function filtered(village) {
  const list = (snapshot?.upgrades || []).filter((u) => u.village === village);
  if (filter === "all") return list;
  if (filter === "builder") return list.filter((u) => u.kind === "builder" || u.kind === "trap" || u.kind === "gearup");
  if (filter === "lab") return list.filter((u) => u.kind === "lab" || u.kind === "starlab" || u.kind === "workshop");
  if (filter === "hero") return list.filter((u) => u.kind === "hero" || u.kind === "pet");
  return list;
}

function card(upgrade, now) {
  const left = remainingMs(upgrade, now);
  const done = left <= 0;
  const total = Math.max(upgrade.remainingAtExport * 1000, 1);
  const elapsed = Math.min(total, now - (upgrade.finishAt - total));
  const pct = done ? 100 : Math.max(2, Math.min(100, (elapsed / total) * 100));
  const kind = KIND_LABELS[upgrade.kind] || upgrade.kind;
  const helper = helperBadge(upgrade, now);
  const clockChip = upgrade.village === "builder" ? clockTowerChip(now) : "";
  const potion = potionChip(upgrade, now);
  const clockClass = clockChip ? " has-clock" : "";
  const potionClass = potion.active ? " has-potion" : "";

  return `<article class="card ${done ? "is-done" : ""} ${helper.classes}${clockClass}${potionClass}">
    <div class="card-top">
      <span class="kind-row">
        <span class="kind">${kind}</span>
        ${helper.chip}
        ${clockChip}
        ${potion.chip}
      </span>
    </div>
    <h3>${displayName(upgrade)}</h3>
    <p class="levels">${upgrade.kind === "gearup"
      ? `Perfeccionamiento · nivel ${upgrade.level}`
      : `Nivel ${upgrade.level} → ${upgrade.targetLevel}`}</p>
    ${helper.detail}
    <div class="progress-block">
      <p class="eta">${done ? "COMPLETADA" : formatDuration(left)}</p>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    </div>
    <p class="finish">${done ? "Lista para recoger" : `Termina ${formatDate(upgrade.finishAt)}`}</p>
  </article>`;
}

function villageCrew(village, now) {
  const total = Number(snapshot?.builders?.[village]?.total) || 0;
  const busyRaw = busyBuilders(snapshot?.upgrades, village, now);
  const busy = total ? Math.min(busyRaw, total) : busyRaw;
  const idle = total ? Math.max(0, total - busy) : 0;
  return { total, busy, idle };
}

function gearUpNote(now) {
  const n = (snapshot?.upgrades || []).filter((u) => u.kind === "gearup" && !isComplete(u, now)).length;
  if (!n) return "";
  return n === 1
    ? "1 constructor de la base perfeccionando en la aldea"
    : `${n} constructores de la base perfeccionando en la aldea`;
}

function idleCrewText(home, builder) {
  const parts = [];
  if (home.total && home.idle > 0) {
    parts.push(home.idle === 1 ? "1 constructor libre en la aldea" : `${home.idle} constructores libres en la aldea`);
  }
  if (builder.total && builder.idle > 0) {
    parts.push(builder.idle === 1 ? "1 libre en la base" : `${builder.idle} libres en la base`);
  }
  return parts.join(" · ");
}

function renderCrew(now) {
  const home = villageCrew("home", now);
  const builder = villageCrew("builder", now);
  const homeBit = home.total ? `${home.busy}/${home.total}` : String(home.busy);
  const builderBit = builder.total ? `${builder.busy}/${builder.total}` : String(builder.busy);
  $("builder-crew").textContent = `${homeBit} · ${builderBit}`;

  const idle = idleCrewText(home, builder);
  const gear = gearUpNote(now);
  const status = $("builder-crew-status");
  const banner = $("idle-banner");
  const stat = $("crew-stat");
  if (idle) {
    status.textContent = gear ? `${idle} · ${gear}` : idle;
    banner.hidden = false;
    banner.textContent = idle;
    stat?.classList.add("is-idle");
  } else if (home.total || builder.total) {
    status.textContent = gear ? `Todos trabajando · ${gear}` : "Todos trabajando";
    banner.hidden = true;
    stat?.classList.remove("is-idle");
  } else {
    status.textContent = "Ocupados ahora · reimporta para ver el total";
    banner.hidden = true;
    stat?.classList.remove("is-idle");
  }
}

function renderLists(now = Date.now()) {
  if (!snapshot) return;
  const home = filtered("home");
  const builder = filtered("builder");
  const activeHome = (snapshot.upgrades || []).filter((u) => u.village === "home" && !isComplete(u, now));
  const activeBuilder = (snapshot.upgrades || []).filter((u) => u.village === "builder" && !isComplete(u, now));
  const next = [...activeHome, ...activeBuilder].sort((a, b) => a.finishAt - b.finishAt)[0];

  $("home-badge").textContent = activeHome.length ? String(activeHome.length) : "";
  $("builder-badge").textContent = activeBuilder.length ? String(activeBuilder.length) : "";
  renderCrew(now);
  els.next.textContent = next
    ? `${displayName(next)} · ${formatDuration(remainingMs(next, now))}`
    : "Ninguna en curso";

  els.homeList.innerHTML = home.length
    ? home.map((u) => card(u, now)).join("")
    : `<p class="empty-list">No hay mejoras activas en la aldea principal.</p>`;
  els.builderList.innerHTML = builder.length
    ? builder.map((u) => card(u, now)).join("")
    : `<p class="empty-list">No hay mejoras activas en la base de constructores.</p>`;
  renderHelpers(now);
  renderClockTower(now);
  renderHomeBoosts(now);
  renderSleepReport(now);
}

function renderShell() {
  const hasData = Boolean(snapshot);
  els.empty.hidden = hasData;
  els.dashboard.hidden = !hasData;
  if (!hasData) return;

  const th = snapshot.townHallLevel != null ? `TH ${snapshot.townHallLevel}` : "TH —";
  const bh = snapshot.builderHallLevel != null ? `BH ${snapshot.builderHallLevel}` : "BH —";
  els.tag.textContent = snapshot.tag;
  els.halls.textContent = `${th} · ${bh}`;
  els.exported.textContent = `Exportado ${formatDate(snapshot.exportedAt)}`;
  applyDashView();
  renderLists();
}

function applySettingsToForm() {
  els.notifyComplete.checked = Boolean(settings.notifyOnComplete);
  els.notifyBefore.value = String(settings.notifyMinutesBefore);
  els.notifySound.checked = Boolean(settings.sound);
  if (els.notifyHelpers) els.notifyHelpers.checked = settings.notifyHelpersReady !== false;
  if (els.sleepBed) els.sleepBed.value = settings.sleepBed || "";
  if (els.sleepWake) els.sleepWake.value = settings.sleepWake || "";
  if (settings.timeFormat !== "12" && settings.timeFormat !== "24") settings.timeFormat = "24";
  document.querySelectorAll("[data-time-format]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.timeFormat === settings.timeFormat);
  });
}

function syncAlerts() {
  if (!snapshot) {
    clearScheduled();
    void syncPushAlerts([]);
    return;
  }
  const helpers = (snapshot.helpers || []).map((helper) => ({
    ...helper,
    name: resolveName(helper.dataId, "home"),
    readyAt: helperReadyAt(helper),
  }));
  const jobs = scheduleUpgradeAlerts(
    snapshot.upgrades,
    settings,
    notified,
    markNotified,
    helpers,
    snapshot.clockTower || null
  );
  void syncPushAlerts(jobs);
}

function startTicker() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => renderLists(), 1000);
}

function importSnapshot(next) {
  snapshot = next;
  filter = "all";
  document.querySelectorAll("[data-filter]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.filter === "all");
  });
  saveVillage(snapshot);
  renderShell();
  startTicker();
  syncAlerts();
  const n = next.upgrades.length;
  const helpers = (next.helpers || []).filter((h) => !isUtilityHelper(h.dataId)).length;
  const helperBit = helpers
    ? ` · ${helpers} ayudante${helpers === 1 ? "" : "s"}`
    : "";
  const home = villageCrew("home");
  const builder = villageCrew("builder");
  const idle = idleCrewText(home, builder);
  const idleBit = idle ? ` · ${idle}` : "";
  toast(`${n} mejora${n === 1 ? "" : "s"} detectada${n === 1 ? "" : "s"}${helperBit}${idleBit}`);
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

async function importFromText(text) {
  showError("");
  try {
    const next = parseVillageText(text);
    importSnapshot(next);
    els.json.value = "";
    closeDrawer();
    const permission = await requestPermission();
    updateNotifyStatus(permission);
  } catch (error) {
    showError(error.message || "No se pudo importar el JSON.");
  }
}

function demoPayload() {
  const now = Math.floor(Date.now() / 1000);
  return {
    tag: "#DEMO123",
    timestamp: now,
    helpers: [
      { data: 93000000, lvl: 3, helper_cooldown: 82788 },
      { data: 93000001, lvl: 4, helper_cooldown: 82788 },
      { data: 93000002, lvl: 2, helper_cooldown: 0 },
      { data: 93000003, lvl: 1, helper_cooldown: 36000 },
    ],
    boosts: {
      clocktower_boost: 120,
      clocktower_cooldown: 0,
      builder_boost: 40,
      lab_boost: 50,
    },
    buildings: [
      { data: 1000001, lvl: 16 },
      { data: 1000008, lvl: 21, timer: 25, helper_timer: 20 },
      { data: 1000009, lvl: 21, timer: 95 },
      { data: 1000015, lvl: 1 },
      { data: 1000015, lvl: 2 },
      { data: 1000015, lvl: 4 },
      { data: 1000015, lvl: 5 },
      { data: 1000015, lvl: 6 },
    ],
    heroes: [{ data: 28000000, lvl: 90, timer: 180 }],
    units: [{ data: 4000008, lvl: 10, timer: 4000, helper_timer: 3500, helper_recurrent: true }],
    buildings2: [
      { data: 1000034, lvl: 10 },
      { data: 1000039, lvl: 9 },
      { data: 1000044, lvl: 9, timer: 400 },
      { data: 1000065, lvl: 5 },
      { data: 1000078, lvl: 9 },
    ],
    heroes2: [{ data: 28000003, lvl: 30, timer: 130 }],
    units2: [{ data: 4000025, lvl: 18, timer: 70 }],
  };
}

function updateNotifyStatus(permission) {
  const labels = {
    granted: "Notificaciones activas. Con la app cerrada, Chrome en Android avisa por Firebase si ya importaste el JSON.",
    denied: "Notificaciones bloqueadas en el navegador",
    default: "Activa las notificaciones para avisarte",
    unsupported: "Este navegador no admite notificaciones",
  };
  els.notifyStatus.textContent = labels[permission] || labels.default;
}

function openOverlay(el) {
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
}

function closeOverlay(el) {
  el.classList.remove("is-open");
  el.setAttribute("aria-hidden", "true");
}

function openDrawer() {
  openOverlay(els.drawer);
}

function closeDrawer() {
  closeOverlay(els.drawer);
}

function openSettings() {
  renderNamesCatalog();
  openOverlay(els.settingsModal);
}

function closeSettings() {
  closeOverlay(els.settingsModal);
}

function clipboardKey(parsed) {
  return `${parsed.tag}|${parsed.exportedAt}`;
}

function looksLikeVillageJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("{") || trimmed.length < 40) return false;
  return /"buildings"\s*:/.test(trimmed) || /"buildings2"\s*:/.test(trimmed);
}

function overlayOpen() {
  return (
    els.drawer.classList.contains("is-open") ||
    els.settingsModal.classList.contains("is-open") ||
    els.clipboardModal.classList.contains("is-open")
  );
}

function dismissClipboardPrompt() {
  if (pendingClipboard) dismissedClipboard.add(clipboardKey(pendingClipboard));
  pendingClipboard = null;
  closeOverlay(els.clipboardModal);
}

function openClipboardPrompt(parsed) {
  pendingClipboard = parsed;
  const th = parsed.townHallLevel != null ? `TH ${parsed.townHallLevel}` : "TH —";
  const bh = parsed.builderHallLevel != null ? `BH ${parsed.builderHallLevel}` : "BH —";
  const n = parsed.upgrades.length;
  els.clipboardSummary.textContent =
    `Encontré un export de ${parsed.tag} (${th} · ${bh}) con ${n} mejora${n === 1 ? "" : "s"} en curso. ¿Lo importas?`;
  els.clipboardReplace.hidden = !snapshot;
  openOverlay(els.clipboardModal);
}

async function importPendingClipboard() {
  if (!pendingClipboard) return;
  const next = pendingClipboard;
  dismissedClipboard.add(clipboardKey(next));
  pendingClipboard = null;
  closeOverlay(els.clipboardModal);
  importSnapshot(next);
  const permission = await requestPermission();
  updateNotifyStatus(permission);
}

async function offerClipboardIfValid() {
  if (clipboardBusy || overlayOpen() || !navigator.clipboard?.readText) return;
  if (document.visibilityState !== "visible") return;
  clipboardBusy = true;
  try {
    const text = await navigator.clipboard.readText();
    if (!looksLikeVillageJson(text)) return;
    const parsed = parseVillageText(text);
    const key = clipboardKey(parsed);
    if (dismissedClipboard.has(key)) return;
    if (snapshot && clipboardKey(snapshot) === key) return;
    openClipboardPrompt(parsed);
  } catch {
    /* sin permiso o portapapeles vacío */
  } finally {
    clipboardBusy = false;
  }
}

function bind() {
  $("open-import").addEventListener("click", openDrawer);
  $("open-import-2")?.addEventListener("click", openDrawer);
  $("close-import").addEventListener("click", closeDrawer);
  $("import-backdrop").addEventListener("click", closeDrawer);
  $("open-settings").addEventListener("click", openSettings);
  $("close-settings").addEventListener("click", closeSettings);
  $("settings-backdrop").addEventListener("click", closeSettings);
  $("confirm-clipboard").addEventListener("click", () => importPendingClipboard());
  $("dismiss-clipboard").addEventListener("click", dismissClipboardPrompt);
  $("close-clipboard").addEventListener("click", dismissClipboardPrompt);
  $("clipboard-backdrop").addEventListener("click", dismissClipboardPrompt);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (els.clipboardModal.classList.contains("is-open")) {
      dismissClipboardPrompt();
      return;
    }
    closeDrawer();
    closeSettings();
  });

  $("paste-btn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      els.json.value = text;
      await importFromText(text);
    } catch {
      showError("No pude leer el portapapeles. Pégalo en el recuadro y pulsa Importar.");
    }
  });

  $("import-btn").addEventListener("click", () => importFromText(els.json.value));
  $("file-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    els.json.value = text;
    await importFromText(text);
    event.target.value = "";
  });

  $("demo-btn").addEventListener("click", async () => {
    importSnapshot(
      (await import("./parser.js")).parseVillageExport(demoPayload())
    );
    const permission = await requestPermission();
    updateNotifyStatus(permission);
    closeDrawer();
  });

  $("clear-btn").addEventListener("click", () => {
    clearVillage();
    snapshot = null;
    notified = loadNotified();
    clearScheduled();
    void syncPushAlerts([]);
    renderShell();
    closeSettings();
    toast("Aldea borrada de este dispositivo");
  });

  $("enable-notify").addEventListener("click", async () => {
    const permission = await requestPermission();
    updateNotifyStatus(permission);
    if (permission === "granted") {
      void getPushToken();
      syncAlerts();
      toast("Avisos listos");
    }
  });

  els.notifyComplete.addEventListener("change", () => {
    settings.notifyOnComplete = els.notifyComplete.checked;
    saveSettings(settings);
    syncAlerts();
  });
  els.notifyBefore.addEventListener("change", () => {
    settings.notifyMinutesBefore = Number(els.notifyBefore.value);
    saveSettings(settings);
    syncAlerts();
  });
  els.notifySound.addEventListener("change", () => {
    settings.sound = els.notifySound.checked;
    saveSettings(settings);
  });
  els.notifyHelpers?.addEventListener("change", () => {
    settings.notifyHelpersReady = els.notifyHelpers.checked;
    saveSettings(settings);
    syncAlerts();
  });
  document.querySelectorAll("[data-time-format]").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.timeFormat = btn.dataset.timeFormat;
      saveSettings(settings);
      applySettingsToForm();
      if (snapshot) renderShell();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      renderLists();
    });
  });

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      dashView = btn.dataset.view;
      applyDashView();
    });
  });

  const saveSleep = () => {
    settings.sleepBed = els.sleepBed?.value || "";
    settings.sleepWake = els.sleepWake?.value || "";
    saveSettings(settings);
    if (snapshot) renderSleepReport();
  };
  els.sleepBed?.addEventListener("change", saveSleep);
  els.sleepWake?.addEventListener("change", saveSleep);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    void (async () => {
      if (await isAppInstalled()) {
        deferredPrompt = null;
        await syncInstallUi();
        return;
      }
      deferredPrompt = event;
      await syncInstallUi();
    })();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    rememberInstalled();
    void syncInstallUi();
  });
  for (const mode of ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]) {
    const media = window.matchMedia(`(display-mode: ${mode})`);
    media.addEventListener?.("change", () => void syncInstallUi());
  }

  els.installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    syncInstallUi();
  });
  els.namesSearch?.addEventListener("input", renderNamesCatalog);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      renderLists();
      syncAlerts();
      offerClipboardIfValid();
    } else {
      syncAlerts();
    }
  });
  window.addEventListener("pagehide", () => syncAlerts());
  window.addEventListener("focus", () => offerClipboardIfValid());
}

async function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    setServiceWorker(reg);
  } catch {
    /* ignore */
  }
}

bind();
applySettingsToForm();
void syncInstallUi();
window.addEventListener("load", () => void syncInstallUi());
renderShell();
if (snapshot) startTicker();
updateNotifyStatus("Notification" in window ? Notification.permission : "unsupported");
registerWorker().then(() => {
  if (snapshot) syncAlerts();
});
offerClipboardIfValid();
