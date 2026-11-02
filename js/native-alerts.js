import { registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const CHANNEL_ID = "upgrades";
const ACTION_TYPE = "READY_ALERTS";
const ACTION_OPEN_GAME = "open-game";
const OpenGame = registerPlugin("OpenGame");

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

async function openClashOfClans() {
  try {
    await OpenGame.openClash();
  } catch {
    /* el juego o Play no respondieron */
  }
}

async function handleAction(event) {
  const markId = event?.notification?.extra?.markId;
  if (markId && onMark) onMark(markId);
  if (event?.actionId === ACTION_OPEN_GAME) {
    await openClashOfClans();
  }
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
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE,
          actions: [
            {
              id: ACTION_OPEN_GAME,
              title: "Abrir juego",
              foreground: true,
            },
          ],
        },
      ],
    });
  } catch {
    /* acciones no disponibles */
  }
  if (!listening) {
    listening = true;
    await LocalNotifications.addListener("localNotificationReceived", (notification) => {
      const markId = notification?.extra?.markId;
      if (markId && onMark) onMark(markId);
    });
    await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      void handleAction(event);
    });
  }
  ready = true;
}

export async function startNativeAlertListeners(markNotified) {
  onMark = markNotified || onMark;
  await ensureReady();
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
      const item = {
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
      if (job.openGame) item.actionTypeId = ACTION_TYPE;
      return item;
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
        body: "Aviso de prueba. Toca el aviso para abrir esta app, o Abrir juego para Clash of Clans.",
        channelId: CHANNEL_ID,
        actionTypeId: ACTION_TYPE,
        extra: { markId: "", jobId: "test" },
        schedule: {
          at: new Date(Date.now() + 8000),
          allowWhileIdle: true,
        },
      },
    ],
  });
}
