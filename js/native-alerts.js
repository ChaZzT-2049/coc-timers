import { LocalNotifications } from "@capacitor/local-notifications";

const CHANNEL_ID = "upgrades";
let ready = false;
let listening = false;
let onMark = null;

function toNotifId(key) {
  let hash = 2166136261;
  for (let i = 0; i < String(key).length; i += 1) {
    hash ^= String(key).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647 || 1;
}

async function ensureReady() {
  if (ready) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Mejoras",
      description: "Avisos de mejoras y ayudantes",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  } catch {
    /* canal ya existe o no aplica */
  }
  if (!listening) {
    listening = true;
    await LocalNotifications.addListener("localNotificationReceived", (notification) => {
      const markId = notification?.extra?.markId;
      if (markId && onMark) onMark(markId);
    });
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const markId = event?.notification?.extra?.markId;
      if (markId && onMark) onMark(markId);
    });
  }
  ready = true;
}

async function cancelPending() {
  try {
    if (typeof LocalNotifications.cancelAll === "function") {
      await LocalNotifications.cancelAll();
      return;
    }
  } catch {
    /* fallback */
  }
  const pending = await LocalNotifications.getPending();
  const list = pending?.notifications || [];
  if (list.length) {
    await LocalNotifications.cancel({
      notifications: list.map((item) => ({ id: item.id })),
    });
  }
}

export async function requestNativePermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return "granted";
  const next = await LocalNotifications.requestPermissions();
  return next.display === "granted" ? "granted" : "denied";
}

export async function syncNativeAlerts(jobs, markNotified) {
  onMark = markNotified || onMark;
  await ensureReady();
  await cancelPending();
  const now = Date.now();
  const notifications = (jobs || [])
    .slice(0, 64)
    .map((job) => {
      const fireAt = Number(job.fireAt) || 0;
      const at = new Date(Math.max(fireAt, now + 1200));
      return {
        id: toNotifId(job.id),
        title: String(job.title || "COC Timers").slice(0, 80),
        body: String(job.body || "").slice(0, 180),
        extra: { markId: job.markId || "", jobId: job.id },
        channelId: CHANNEL_ID,
        schedule: {
          at,
          allowWhileIdle: true,
        },
      };
    });
  if (!notifications.length) return;
  await LocalNotifications.schedule({ notifications });
}

export async function sendNativeTestAlert() {
  await ensureReady();
  const granted = await requestNativePermission();
  if (granted !== "granted") throw new Error("Activa avisos primero");
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 900001,
        title: "COC Timers",
        body: "Aviso de prueba. Si ves esto con la app cerrada, los avisos del teléfono llegan bien.",
        channelId: CHANNEL_ID,
        schedule: {
          at: new Date(Date.now() + 8000),
          allowWhileIdle: true,
        },
      },
    ],
  });
}
