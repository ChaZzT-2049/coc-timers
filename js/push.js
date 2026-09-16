import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";
import { firebaseConfig, syncAlertsUrl, vapidKey } from "./firebase-config.js";

const DEVICE_KEY = "coc-timers:device";
const PUSH_IDS_KEY = "coc-timers:push-ids";
const TOKEN_KEY = "coc-timers:fcm-token";
const STATUS_KEY = "coc-timers:push-status";

let app = null;
let messaging = null;
let foregroundBound = false;

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  id = `d${crypto.randomUUID().replaceAll("-", "")}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function loadPrevious() {
  try {
    const raw = JSON.parse(localStorage.getItem(PUSH_IDS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    if (raw.length && typeof raw[0] === "object") {
      return raw.slice(0, 80).map((item) => ({
        id: String(item.id || ""),
        fireAt: Number(item.fireAt) || 0,
        taskId: String(item.taskId || ""),
      })).filter((item) => item.id);
    }
    return raw.map(String).slice(0, 80).map((id) => ({ id, fireAt: 0, taskId: "" }));
  } catch {
    return [];
  }
}

function savePrevious(entries) {
  localStorage.setItem(PUSH_IDS_KEY, JSON.stringify((entries || []).slice(0, 80)));
}

export function loadPushStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || "null");
  } catch {
    return null;
  }
}

function savePushStatus(status) {
  localStorage.setItem(STATUS_KEY, JSON.stringify(status));
}

async function ensureMessaging() {
  if (messaging) return messaging;
  if (!(await isSupported())) return null;
  app = app || initializeApp(firebaseConfig);
  messaging = getMessaging(app);
  if (!foregroundBound) {
    foregroundBound = true;
    onMessage(messaging, (payload) => {
      const title = payload.data?.title || payload.notification?.title || "COC Timers";
      const body = payload.data?.body || payload.notification?.body || "";
      const tag = payload.data?.tag || "coc-timers";
      if (Notification.permission !== "granted") return;
      void navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification(title, {
          body,
          tag,
          icon: "./icons/icon-192.png",
          badge: "./icons/icon-192.png",
          data: { url: "./" },
          renotify: true,
        })
      );
    });
  }
  return messaging;
}

export async function getPushToken() {
  if (!("Notification" in window) || Notification.permission !== "granted") return null;
  const msg = await ensureMessaging();
  if (!msg) return null;
  const registration = await navigator.serviceWorker?.ready;
  if (!registration) return localStorage.getItem(TOKEN_KEY);
  const token = await getToken(msg, { vapidKey, serviceWorkerRegistration: registration });
  if (token) localStorage.setItem(TOKEN_KEY, token);
  return token || localStorage.getItem(TOKEN_KEY);
}

function remoteJobs(jobs) {
  const now = Date.now();
  return (jobs || []).filter((job) => Number(job.fireAt) > now).slice(0, 60);
}

async function postAlerts(body) {
  const response = await fetch(syncAlertsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function sendTestPush() {
  const token = await getPushToken();
  if (!token) throw new Error("No hay token FCM. Activa avisos en Chrome.");
  await postAlerts({
    token,
    deviceId: deviceId(),
    alerts: [],
    previous: [],
    test: true,
  });
  savePushStatus({ ok: true, at: Date.now(), text: "Aviso de prueba enviado" });
}

export async function syncPushAlerts(jobs) {
  try {
    const alerts = remoteJobs(jobs).map((job) => ({
      id: String(job.id),
      fireAt: Number(job.fireAt),
      title: String(job.title || "").slice(0, 80),
      body: String(job.body || "").slice(0, 180),
      tag: String(job.tag || job.id).slice(0, 120),
    }));
    const previous = loadPrevious();
    if (!alerts.length && !previous.length) {
      savePushStatus({ ok: true, at: Date.now(), text: "Nada que programar en la nube" });
      return;
    }

    const token = await getPushToken();
    if (!token) {
      if (previous.length) savePrevious([]);
      savePushStatus({ ok: false, at: Date.now(), text: "Sin token FCM (¿avisos denegados?)" });
      return;
    }

    const payload = await postAlerts({
      token,
      deviceId: deviceId(),
      alerts,
      previous,
    });
    if (payload && Array.isArray(payload.previous)) savePrevious(payload.previous);
    else savePrevious(alerts.map((alert) => ({ id: alert.id, fireAt: alert.fireAt, taskId: "" })));
    const n = Number(payload?.scheduled) || 0;
    savePushStatus({
      ok: true,
      at: Date.now(),
      text: n ? `${n} aviso${n === 1 ? "" : "s"} programado${n === 1 ? "" : "s"} en la nube` : "Nube al día",
    });
  } catch (error) {
    savePushStatus({
      ok: false,
      at: Date.now(),
      text: `Nube: ${error.message || "falló el sync"}`,
    });
  }
}
