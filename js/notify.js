const MAX_TIMEOUT = 2_147_000_000;
const scheduled = new Map();
let registration = null;
let audioCtx = null;

export function setServiceWorker(reg) {
  registration = reg;
}

function beep() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    /* ignore */
  }
}

export async function requestPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function showUpgradeNotification({ title, body, tag, vibrate = true }) {
  const options = {
    body,
    tag,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    vibrate: vibrate ? [180, 80, 180] : undefined,
    renotify: true,
    data: { url: "./" },
  };

  try {
    const sw = registration || (await navigator.serviceWorker?.ready);
    if (sw?.showNotification) {
      await sw.showNotification(title, options);
      return;
    }
  } catch {
    /* fall through */
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, options);
  }
}

export function clearScheduled() {
  for (const handle of scheduled.values()) clearTimeout(handle);
  scheduled.clear();
}

function scheduleAt(key, when, fn) {
  const delay = Math.max(0, when - Date.now());
  if (delay > MAX_TIMEOUT) return;
  const prev = scheduled.get(key);
  if (prev) clearTimeout(prev);
  const handle = setTimeout(() => {
    scheduled.delete(key);
    fn();
  }, delay);
  scheduled.set(key, handle);
}

export function scheduleUpgradeAlerts(upgrades, settings, notified, markNotified, helpers = [], clockTower = null) {
  clearScheduled();

  const now = Date.now();
  const aheadMs = Math.max(0, Number(settings.notifyMinutesBefore) || 0) * 60_000;

  if (settings.notifyOnComplete) {
    for (const upgrade of upgrades || []) {
      const village = upgrade.village === "builder" ? "Base de constructores" : "Aldea principal";
      const name = `${upgrade.name} ${upgrade.level} → ${upgrade.targetLevel}`;

      if (aheadMs > 0 && upgrade.finishAt - aheadMs > now) {
        scheduleAt(`soon:${upgrade.id}`, upgrade.finishAt - aheadMs, () => {
          showUpgradeNotification({
            title: `Quedan ${settings.notifyMinutesBefore} min`,
            body: `${name} · ${village}`,
            tag: `soon-${upgrade.id}`,
          });
        });
      }

      if (notified.has(`done:${upgrade.id}`)) continue;

      const fire = () => {
        if (notified.has(`done:${upgrade.id}`)) return;
        markNotified(`done:${upgrade.id}`);
        if (settings.sound) beep();
        showUpgradeNotification({
          title: "Mejora lista",
          body: `${name} · ${village}`,
          tag: `done-${upgrade.id}`,
        });
      };

      if (upgrade.finishAt <= now + 400) {
        fire();
      } else {
        scheduleAt(`done:${upgrade.id}`, upgrade.finishAt, fire);
      }
    }
  }

  if (!settings.notifyHelpersReady) return;

  const groups = new Map();
  for (const helper of helpers || []) {
    if (helper.recurrent) continue;
    const readyAt = Number(helper.readyAt) || 0;
    if (readyAt <= now + 400) continue;
    const key = String(readyAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(helper);
  }

  for (const [when, list] of groups) {
    const id = `helper-ready:${when}`;
    if (notified.has(id)) continue;
    const names = list.map((helper) => helper.name || `ID ${helper.dataId}`);
    const label = names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

    scheduleAt(id, Number(when), () => {
      if (notified.has(id)) return;
      markNotified(id);
      if (settings.sound) beep();
      showUpgradeNotification({
        title: list.length > 1 ? "Ayudantes listos" : "Ayudante listo",
        body: `${label} · ya puedes asignarlo${list.length > 1 ? "s" : ""}`,
        tag: id,
      });
    });
  }

  if (!clockTower?.readyAt || clockTower.active || clockTower.readyAt <= now + 400) return;
  const clockId = `clock-ready:${clockTower.readyAt}`;
  if (notified.has(clockId)) return;
  scheduleAt(clockId, clockTower.readyAt, () => {
    if (notified.has(clockId)) return;
    markNotified(clockId);
    if (settings.sound) beep();
    showUpgradeNotification({
      title: "Torre del reloj lista",
      body: "Ya puedes acelerar la base de constructores ×10",
      tag: clockId,
    });
  });
}
