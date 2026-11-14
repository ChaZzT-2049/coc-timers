import {
  BUILDER_HALL_ID,
  BOB_CONTROL_ID,
  CLOCK_TOWER_ID,
  CRAFTING_STATION_ID,
  CLOCK_TOWER_SPEED,
  GEAR_UP_BUILDING_IDS,
  HOME_BUILDER_HUT_ID,
  OTTO_OUTPOST_ID,
  BOTO_SHACK_ID,
  helperIdForKind,
  isUtilityHelper,
  kindFromFieldAndId,
  resolveName,
} from "./ids.js";

const TIMER_KEYS = ["timer", "res_time", "const_time", "upgrade_time"];
const HELPER_SESSION = 3600;
const HELPER_WORK_DAY = 23 * 3600;

const FIELD_VILLAGE = {
  buildings: "home",
  traps: "home",
  heroes: "home",
  units: "home",
  spells: "home",
  siege_machines: "home",
  siege: "home",
  pets: "home",
  equipment: "home",
  buildings2: "builder",
  traps2: "builder",
  heroes2: "builder",
  units2: "builder",
  spells2: "builder",
};

function remainingSeconds(item) {
  if (!item || typeof item !== "object") return 0;
  for (const key of TIMER_KEYS) {
    const value = Number(item[key]);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return 0;
}

function levelOf(item) {
  const raw = item.lvl ?? item.level ?? 0;
  const level = Number(raw);
  return Number.isFinite(level) ? level : 0;
}

function helperTimerOf(item) {
  const value = Number(item.helper_timer);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isRecurrentHelper(item) {
  return item.helper_recurrent === true || item.helper_recurrent === 1;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** El `timer` del JSON es trabajo a 1x. El ayudante y las pociones suman extras sobre esa base. */
export function wallClockWithHelper(workLeft, speed, helperTimer, cooldownLeft, recurrent, extras = []) {
  let remainingWork = Math.max(0, Math.floor(workLeft) || 0);
  let elapsed = 0;
  const helperRate = Math.max(1, Number(speed) || 1);
  let session = Math.max(0, Math.floor(helperTimer) || 0);
  let nextSessionAt = recurrent ? Math.max(0, Math.floor(cooldownLeft) || 0) : Number.POSITIVE_INFINITY;
  const extraLeft = (Array.isArray(extras) ? extras : [])
    .map((item) => ({
      extra: Math.max(0, Number(item.extra) || 0),
      left: Math.max(0, Math.floor(item.left) || 0),
    }))
    .filter((item) => item.extra > 0);

  const extraSum = () => extraLeft.reduce((sum, item) => sum + (item.left > 0 ? item.extra : 0), 0);
  const rateNow = () => Math.max(1, (session > 0 ? helperRate : 1) + extraSum());

  for (let i = 0; i < 400 && remainingWork > 0; i += 1) {
    const rate = rateNow();
    let slice = Math.ceil(remainingWork / rate);
    if (session > 0) slice = Math.min(slice, session);
    else if (recurrent && nextSessionAt > elapsed) slice = Math.min(slice, nextSessionAt - elapsed);
    for (const item of extraLeft) {
      if (item.left > 0) slice = Math.min(slice, item.left);
    }
    if (slice <= 0) {
      elapsed += remainingWork;
      remainingWork = 0;
      break;
    }

    const work = slice * rate;
    if (work >= remainingWork) {
      elapsed += Math.ceil(remainingWork / rate);
      remainingWork = 0;
      break;
    }

    remainingWork -= work;
    elapsed += slice;
    if (session > 0) session = Math.max(0, session - slice);
    for (const item of extraLeft) {
      if (item.left > 0) item.left = Math.max(0, item.left - slice);
    }
    if (session <= 0 && recurrent && elapsed >= nextSessionAt) {
      session = HELPER_SESSION;
      nextSessionAt = elapsed + (HELPER_WORK_DAY - HELPER_SESSION);
    }
  }
  return elapsed;
}

function collectField(payload, field) {
  const village = FIELD_VILLAGE[field];
  if (!village) return [];
  const list = payload[field];
  if (!Array.isArray(list)) return [];

  const counts = new Map();
  const totals = new Map();
  for (const item of list) {
    if (!item || typeof item !== "object" || item.data == null) continue;
    const id = Number(item.data);
    totals.set(id, (totals.get(id) || 0) + 1);
  }

  const upgrades = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || item.data == null) continue;
    const seconds = remainingSeconds(item);
    if (seconds <= 0) continue;

    const dataId = Number(item.data);
    const n = (counts.get(dataId) || 0) + 1;
    counts.set(dataId, n);

    const level = levelOf(item);
    const name = resolveName(dataId, village);
    const numbered = (totals.get(dataId) || 1) > 1 ? `${name} #${n}` : name;
    const gearUp = isGearUpInProgress(item, field);
    const kind = gearUp ? "gearup" : kindFromFieldAndId(field, dataId);

    upgrades.push({
      village,
      field,
      kind,
      occupiesVillage: gearUp ? "builder" : village,
      dataId,
      slot: n,
      name: numbered,
      level,
      targetLevel: gearUp ? level : level + 1,
      workRemainingAtExport: seconds,
      remainingAtExport: seconds,
      helperTimer: helperTimerOf(item),
      helperRecurrent: isRecurrentHelper(item),
    });
  }
  return upgrades;
}

function craftedDisplayName(dataId, parentName) {
  const own = resolveName(dataId, "home");
  if (parentName && parentName !== own && own !== "Módulo" && own !== "Defensa artesanal") {
    return `${parentName} · ${own}`;
  }
  if (parentName && (own === "Módulo" || own === "Defensa artesanal" || own.startsWith("ID "))) {
    return parentName === own ? own : `${parentName} · ${own}`;
  }
  return own;
}

function pushCraftedUpgrade(upgrades, item, parentName, slot) {
  const seconds = remainingSeconds(item);
  const dataId = Number(item?.data);
  if (!item || !Number.isFinite(dataId) || dataId === CRAFTING_STATION_ID || seconds <= 0) return slot;
  const next = slot + 1;
  const level = levelOf(item);
  upgrades.push({
    village: "home",
    field: "crafted_defenses",
    kind: "crafted",
    occupiesVillage: "home",
    dataId,
    slot: next,
    name: craftedDisplayName(dataId, parentName),
    level,
    targetLevel: level + 1,
    workRemainingAtExport: seconds,
    remainingAtExport: seconds,
    helperTimer: helperTimerOf(item),
    helperRecurrent: isRecurrentHelper(item),
  });
  return next;
}

function walkCraftedTree(node, parentName, upgrades, slot) {
  if (!node || typeof node !== "object") return slot;
  if (Array.isArray(node)) {
    for (const child of node) slot = walkCraftedTree(child, parentName, upgrades, slot);
    return slot;
  }
  const dataId = Number(node.data);
  let nextParent = parentName;
  if (Number.isFinite(dataId) && dataId >= 103000000 && dataId < 104000000) {
    nextParent = resolveName(dataId, "home");
  }
  slot = pushCraftedUpgrade(upgrades, node, nextParent, slot);
  if (Array.isArray(node.types)) slot = walkCraftedTree(node.types, nextParent, upgrades, slot);
  if (Array.isArray(node.modules)) slot = walkCraftedTree(node.modules, nextParent, upgrades, slot);
  return slot;
}

function collectCraftedDefenses(payload) {
  const upgrades = [];
  let slot = 0;
  const buildings = Array.isArray(payload.buildings) ? payload.buildings : [];
  for (const item of buildings) {
    if (!item || Number(item.data) !== CRAFTING_STATION_ID) continue;
    slot = walkCraftedTree(item, null, upgrades, slot);
  }
  for (const field of ["crafted_defenses", "crafted", "artisan_defenses"]) {
    slot = walkCraftedTree(payload[field], null, upgrades, slot);
  }
  const seen = new Set();
  return upgrades.filter((upgrade) => {
    const key = `${upgrade.dataId}:${upgrade.workRemainingAtExport}:${upgrade.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseHelpers(payload) {
  const boosts = payload.boosts && typeof payload.boosts === "object" ? payload.boosts : {};
  const globalCooldown = positiveInt(boosts.helper_cooldown);
  const list = Array.isArray(payload.helpers) ? payload.helpers : [];

  return list
    .filter((item) => item && item.data != null)
    .map((item) => {
      const dataId = Number(item.data);
      const level = levelOf(item);
      return {
        dataId,
        level,
        speed: Math.max(1, level),
        cooldownLeft: positiveInt(item.helper_cooldown) || globalCooldown,
        sessionLeft: 0,
        recurrent: false,
        assignedId: null,
        readyAt: 0,
        name: resolveName(dataId, "home"),
      };
    });
}

function findHelper(helpers, dataId) {
  return helpers.find((helper) => helper.dataId === dataId);
}

function parsePotions(payload, exportedAtMs) {
  const boosts = payload.boosts && typeof payload.boosts === "object" ? payload.boosts : {};
  const builderPotion = positiveInt(boosts.builder_boost);
  const builderBite = positiveInt(boosts.builder_consumable);
  const labPotion = positiveInt(boosts.lab_boost);
  const labSoup = positiveInt(boosts.lab_consumable);
  const petPotion = positiveInt(boosts.pet_boost);
  const items = [];
  if (builderPotion) {
    items.push({
      id: "builder-potion",
      name: "Poción de constructor",
      extra: 9,
      rate: 10,
      left: builderPotion,
      until: exportedAtMs + builderPotion * 1000,
    });
  }
  if (builderBite) {
    items.push({
      id: "builder-bite",
      name: "Bocadillo de constructor",
      extra: 1,
      rate: 2,
      left: builderBite,
      until: exportedAtMs + builderBite * 1000,
    });
  }
  if (labPotion) {
    items.push({
      id: "lab-potion",
      name: "Poción de investigación",
      extra: 23,
      rate: 24,
      left: labPotion,
      until: exportedAtMs + labPotion * 1000,
    });
  }
  if (labSoup) {
    items.push({
      id: "lab-soup",
      name: "Sopa de estudio",
      extra: 3,
      rate: 4,
      left: labSoup,
      until: exportedAtMs + labSoup * 1000,
    });
  }
  if (petPotion) {
    items.push({
      id: "pet-potion",
      name: "Poción de mascotas",
      extra: 23,
      rate: 24,
      left: petPotion,
      until: exportedAtMs + petPotion * 1000,
    });
  }
  return {
    builderPotion,
    builderBite,
    labPotion,
    labSoup,
    petPotion,
    items,
  };
}

function potionExtrasFor(upgrade, potions) {
  if (!potions || upgrade.village !== "home") return [];
  const extras = [];
  if (upgrade.kind === "builder" || upgrade.kind === "trap" || upgrade.kind === "hero" || upgrade.kind === "gearup" || upgrade.kind === "crafted") {
    if (potions.builderPotion) {
      extras.push({
        id: "builder-potion",
        extra: 9,
        left: potions.builderPotion,
        label: "Poción",
        rate: 10,
      });
    }
    if (potions.builderBite) {
      extras.push({
        id: "builder-bite",
        extra: 1,
        left: potions.builderBite,
        label: "Bocadillo",
        rate: 2,
      });
    }
  }
  if (upgrade.kind === "lab" || upgrade.kind === "workshop") {
    if (potions.labPotion) {
      extras.push({
        id: "lab-potion",
        extra: 23,
        left: potions.labPotion,
        label: "Poción lab",
        rate: 24,
      });
    }
    if (potions.labSoup) {
      extras.push({
        id: "lab-soup",
        extra: 3,
        left: potions.labSoup,
        label: "Sopa",
        rate: 4,
      });
    }
  }
  if (upgrade.kind === "pet" && potions.petPotion) {
    extras.push({
      id: "pet-potion",
      extra: 23,
      left: potions.petPotion,
      label: "Poción mascota",
      rate: 24,
    });
  }
  return extras;
}

function applyHelpers(upgrades, helpers, potions) {
  for (const upgrade of upgrades) {
    const extras = potionExtrasFor(upgrade, potions);
    const helperTimer = upgrade.helperTimer || 0;
    const recurrent = Boolean(upgrade.helperRecurrent);
    if (helperTimer <= 0 && !recurrent && extras.length === 0) continue;

    const helperId = helperIdForKind(upgrade.kind, upgrade.village);
    const helper = helperId ? findHelper(helpers, helperId) : null;
    const usingHelper = Boolean(helper) && (helperTimer > 0 || recurrent);
    const speed = usingHelper ? helper.speed : 1;
    const cooldownLeft = usingHelper ? helper.cooldownLeft : 0;
    const wall = wallClockWithHelper(
      upgrade.workRemainingAtExport,
      speed,
      usingHelper ? helperTimer : 0,
      cooldownLeft,
      usingHelper && recurrent,
      extras
    );

    upgrade.remainingAtExport = wall;
    if (usingHelper) {
      upgrade.helper = {
        dataId: helperId,
        level: helper.level,
        speed,
        sessionLeft: helperTimer,
        recurrent,
        cooldownLeft,
      };
    }
    if (extras.length) upgrade.potions = extras;
  }
}

function linkHelpers(upgrades, helpers) {
  for (const helper of helpers) {
    if (isUtilityHelper(helper.dataId)) continue;
    const assigned = upgrades
      .filter((upgrade) => {
        const info = upgrade.helper;
        if (!info || info.dataId !== helper.dataId) return false;
        return info.sessionLeft > 0 || info.recurrent;
      })
      .sort((a, b) => (b.helper.sessionLeft || 0) - (a.helper.sessionLeft || 0))[0];
    if (!assigned) continue;
    helper.sessionLeft = assigned.helper.sessionLeft;
    helper.recurrent = Boolean(assigned.helper.recurrent);
    helper.assignedId = assigned.id;
  }
}

function stampIds(upgrades, exportedAtMs) {
  for (const upgrade of upgrades) {
    const finishAt = exportedAtMs + upgrade.remainingAtExport * 1000;
    upgrade.finishAt = finishAt;
    upgrade.id = `${upgrade.village}:${upgrade.field}:${upgrade.dataId}:${upgrade.slot}:${finishAt}`;
  }
}

function stampHelpers(helpers, exportedAtMs) {
  for (const helper of helpers) {
    helper.readyAt = helper.cooldownLeft > 0
      ? exportedAtMs + helper.cooldownLeft * 1000
      : 0;
  }
}

function wallClockWithClockTower(workLeft, boostLeft) {
  const remainingWork = Math.max(0, Math.floor(workLeft) || 0);
  const boost = Math.max(0, Math.floor(boostLeft) || 0);
  if (boost <= 0 || remainingWork <= 0) return remainingWork;
  const work = boost * CLOCK_TOWER_SPEED;
  if (work >= remainingWork) return Math.ceil(remainingWork / CLOCK_TOWER_SPEED);
  return boost + (remainingWork - work);
}

function parseClockTower(payload, exportedAtMs) {
  const list = Array.isArray(payload.buildings2) ? payload.buildings2 : [];
  const building = list.find((item) => item && Number(item.data) === CLOCK_TOWER_ID);
  const boosts = payload.boosts && typeof payload.boosts === "object" ? payload.boosts : {};
  const boostLeft = positiveInt(boosts.clocktower_boost) || positiveInt(building?.clocktower_boost);
  const cooldownLeft = positiveInt(boosts.clocktower_cooldown) || positiveInt(building?.clocktower_cooldown);
  if (!building && boostLeft <= 0 && cooldownLeft <= 0) return null;

  const level = building ? levelOf(building) : 0;
  const upgrading = remainingSeconds(building) > 0;
  return {
    level,
    speed: CLOCK_TOWER_SPEED,
    boostLeft,
    cooldownLeft,
    boostUntil: boostLeft > 0 ? exportedAtMs + boostLeft * 1000 : 0,
    readyAt: cooldownLeft > 0 ? exportedAtMs + cooldownLeft * 1000 : 0,
    active: boostLeft > 0,
    available: boostLeft <= 0 && cooldownLeft <= 0 && !upgrading,
    upgrading,
  };
}

function applyClockTower(upgrades, clockTower) {
  if (!clockTower?.active) return;
  for (const upgrade of upgrades) {
    if (upgrade.village !== "builder") continue;
    const wall = wallClockWithClockTower(upgrade.workRemainingAtExport, clockTower.boostLeft);
    upgrade.remainingAtExport = wall;
    upgrade.clockTower = {
      speed: clockTower.speed,
      boostLeft: clockTower.boostLeft,
    };
  }
}

function hallLevel(items, dataId) {
  if (!Array.isArray(items)) return null;
  const match = items.find((item) => item && Number(item.data) === dataId);
  if (!match) return null;
  const level = levelOf(match);
  return Number.isFinite(level) ? level : null;
}

/** `timestamp` del export: unix en segundos o milisegundos. El `timer` es restante en esa foto. */
export function exportTimeMs(payload, importedAt = Date.now()) {
  const raw = Number(payload && payload.timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return importedAt;
  const ms = raw < 1e11 ? raw * 1000 : raw;
  if (!Number.isFinite(ms) || ms <= 0) return importedAt;
  return Math.min(ms, importedAt);
}

export function parseVillageExport(payload, importedAt = Date.now()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("El JSON no parece un export de aldea.");
  }

  const hasHome = Array.isArray(payload.buildings);
  const hasBuilder = Array.isArray(payload.buildings2);
  if (!hasHome && !hasBuilder && payload.tag == null && payload.timestamp == null) {
    throw new Error("No encuentro buildings, buildings2 ni tag. ¿Pegaste el JSON completo?");
  }

  const exportedAt = exportTimeMs(payload, importedAt);
  const exportLagMs = Math.max(0, importedAt - exportedAt);

  const upgrades = [
    ...Object.keys(FIELD_VILLAGE).flatMap((field) => collectField(payload, field)),
    ...collectCraftedDefenses(payload),
  ];
  const helpers = parseHelpers(payload);
  const potions = parsePotions(payload, exportedAt);
  const clockTower = parseClockTower(payload, exportedAt);
  stampHelpers(helpers, exportedAt);
  applyHelpers(upgrades, helpers, potions);
  applyClockTower(upgrades, clockTower);
  stampIds(upgrades, exportedAt);
  linkHelpers(upgrades, helpers);

  upgrades.sort((a, b) => a.finishAt - b.finishAt);

  const townHallLevel = hallLevel(payload.buildings, 1000001);
  const builderHallLevel = hallLevel(payload.buildings2, 1000034);

  return {
    tag: String(payload.tag || payload.village_id || "").trim() || "Sin etiqueta",
    exportedAt,
    importedAt,
    exportLagMs,
    townHallLevel,
    builderHallLevel,
    helpers,
    potions,
    clockTower,
    builders: parseBuilders(payload),
    upgrades,
  };
}

export function parseVillageText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("El portapapeles o el archivo está vacío.");
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new Error("Ese texto no es JSON válido.");
  }
  return parseVillageExport(payload);
}

function isGearUpInProgress(item, field) {
  if (field !== "buildings" || !item) return false;
  if (!GEAR_UP_BUILDING_IDS.has(Number(item.data))) return false;
  if (!Object.prototype.hasOwnProperty.call(item, "gear_up")) return false;
  return Number(item.gear_up) === 0;
}

export function crewVillage(upgrade) {
  return upgrade?.occupiesVillage || upgrade?.village;
}

export function occupiesBuilder(upgrade) {
  if (!upgrade) return false;
  if (upgrade.field === "equipment" || upgrade.field === "pets") return false;
  if (upgrade.kind === "lab" || upgrade.kind === "starlab" || upgrade.kind === "workshop" || upgrade.kind === "pet") {
    return false;
  }
  return upgrade.kind === "builder" || upgrade.kind === "trap" || upgrade.kind === "hero" || upgrade.kind === "gearup" || upgrade.kind === "crafted";
}

export function busyBuilders(upgrades, village, now = Date.now()) {
  return (upgrades || []).filter((item) => (
    crewVillage(item) === village && occupiesBuilder(item) && !isComplete(item, now)
  )).length;
}

function instanceCount(item) {
  if (!item || typeof item !== "object") return 0;
  const n = Number(item.cnt ?? item.count ?? item.qty ?? 1);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.floor(n);
}

function countByDataId(items, dataId) {
  if (!Array.isArray(items)) return 0;
  const id = Number(dataId);
  return items.reduce((sum, item) => {
    if (!item || Number(item.data) !== id) return sum;
    return sum + instanceCount(item);
  }, 0);
}

function parseBuilders(payload) {
  const huts = countByDataId(payload.buildings, HOME_BUILDER_HUT_ID);
  const bobLevel = hallLevel(payload.buildings2, BOB_CONTROL_ID) || 0;
  let homeTotal = huts;
  if (bobLevel >= 5 && homeTotal < 6) homeTotal += 1;
  if (Array.isArray(payload.buildings) && payload.buildings.length && homeTotal < 1) homeTotal = 1;
  homeTotal = Math.min(6, homeTotal);

  const otto = countByDataId(payload.buildings2, OTTO_OUTPOST_ID);
  const boto = countByDataId(payload.buildings2, BOTO_SHACK_ID);
  const bh = hallLevel(payload.buildings2, BUILDER_HALL_ID) || 0;
  let builderTotal = 0;
  if (Array.isArray(payload.buildings2) && payload.buildings2.length) {
    builderTotal = 1; // Maestro constructor
    if (bh >= 6 || otto > 0) builderTotal += 1; // O.T.T.O.
    if (boto > 0) builderTotal += 1; // B.O.T.O. (se queda en la base; B.O.B. es el 6.º de la aldea)
  }

  return {
    home: { total: homeTotal },
    builder: { total: builderTotal },
  };
}

export const POTION_PLANS = [
  { id: "builder-potion", name: "Poción de constructor", extra: 9, rate: 10, duration: 3600 },
  { id: "builder-bite", name: "Bocadillo", extra: 1, rate: 2, duration: 3600 },
  { id: "lab-potion", name: "Poción de laboratorio", extra: 23, rate: 24, duration: 3600 },
  { id: "lab-soup", name: "Sopa de estudio", extra: 3, rate: 4, duration: 3600 },
  { id: "pet-potion", name: "Poción de mascotas", extra: 23, rate: 24, duration: 3600 },
];

function potionPlanMatches(plan, upgrade) {
  if (!upgrade || upgrade.village !== "home") return false;
  if (plan.id === "builder-potion" || plan.id === "builder-bite") {
    return upgrade.kind === "builder" || upgrade.kind === "trap" || upgrade.kind === "hero"
      || upgrade.kind === "gearup" || upgrade.kind === "crafted";
  }
  if (plan.id === "lab-potion" || plan.id === "lab-soup") {
    return upgrade.kind === "lab" || upgrade.kind === "workshop";
  }
  if (plan.id === "pet-potion") return upgrade.kind === "pet";
  return false;
}

/** Recorta timers si bebes más pociones ahora. Las que ya corren siguen en la cuenta actual. */
export function simulatePotionPlan(upgrades, counts, exportedAt, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - Number(exportedAt || now)) / 1000));
  const addById = {};
  for (const plan of POTION_PLANS) {
    const n = Math.max(0, Math.min(9, Math.floor(Number(counts?.[plan.id]) || 0)));
    if (n > 0) addById[plan.id] = { extra: plan.extra, addLeft: n * plan.duration };
  }

  const rows = [];
  for (const upgrade of upgrades || []) {
    const currentLeft = Math.ceil(remainingMs(upgrade, now) / 1000);
    if (currentLeft <= 0) continue;
    const addons = POTION_PLANS.filter((plan) => addById[plan.id] && potionPlanMatches(plan, upgrade));
    if (!addons.length) continue;

    const extras = (upgrade.potions || []).map((item) => ({
      id: item.id,
      extra: item.extra,
      left: item.left,
    }));
    for (const plan of addons) {
      const add = addById[plan.id];
      const found = extras.find((item) => item.id === plan.id);
      if (found) found.left += add.addLeft;
      else extras.push({ id: plan.id, extra: add.extra, left: add.addLeft });
    }

    const helper = upgrade.helper;
    const wall = wallClockWithHelper(
      upgrade.workRemainingAtExport,
      helper?.speed || 1,
      helper?.sessionLeft || 0,
      helper?.cooldownLeft || 0,
      Boolean(helper?.recurrent),
      extras
    );
    const simulatedLeft = Math.max(0, wall - elapsed);
    const saved = Math.max(0, currentLeft - simulatedLeft);
    rows.push({
      upgrade,
      currentLeft,
      simulatedLeft,
      saved,
    });
  }

  rows.sort((a, b) => b.saved - a.saved || a.simulatedLeft - b.simulatedLeft);
  const saved = rows.reduce((sum, row) => sum + row.saved, 0);
  const currentLeft = rows.reduce((sum, row) => sum + row.currentLeft, 0);
  const simulatedLeft = rows.reduce((sum, row) => sum + row.simulatedLeft, 0);
  return { rows, saved, currentLeft, simulatedLeft };
}

export function remainingMs(upgrade, now = Date.now()) {
  return Math.max(0, upgrade.finishAt - now);
}

export function isComplete(upgrade, now = Date.now()) {
  return remainingMs(upgrade, now) <= 0;
}
