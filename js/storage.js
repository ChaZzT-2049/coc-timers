const VILLAGE_KEY = "coc-timers:village";
const SETTINGS_KEY = "coc-timers:settings";
const NOTIFIED_KEY = "coc-timers:notified";

const DEFAULT_SETTINGS = {
  notifyOnComplete: true,
  notifyMinutesBefore: 15,
  notifyHelpersReady: true,
  sound: true,
  timeFormat: "24",
  sleepBed: "",
  sleepWake: "",
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function loadVillage() {
  return readJson(VILLAGE_KEY, null);
}

export function saveVillage(snapshot) {
  localStorage.setItem(VILLAGE_KEY, JSON.stringify(snapshot));
}

export function clearVillage() {
  localStorage.removeItem(VILLAGE_KEY);
  localStorage.removeItem(NOTIFIED_KEY);
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadNotified() {
  const list = readJson(NOTIFIED_KEY, []);
  return new Set(Array.isArray(list) ? list : []);
}

export function saveNotified(ids) {
  const list = [...ids].slice(-400);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(list));
}
