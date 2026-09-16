import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";
import { firebaseConfig, syncAlertsUrl, vapidKey } from "./firebase-config.js";

const DEVICE_KEY = "coc-timers:device";
const PUSH_IDS_KEY = "coc-timers:push-ids";

let app = null;
let messaging = null;

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id && /^[a-zA-Z0-9_-]+$/.test(id)) return id;
  id = `d${crypto.randomUUID().replaceAll("-", "")}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function loadPreviousIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(PUSH_IDS_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String).slice(0, 80) : [];
  } catch {
    return [];
  }
}

function savePreviousIds(ids) {
  localStorage.setItem(PUSH_IDS_KEY, JSON.stringify(ids.slice(0, 80)));
}

async function ensureMessaging() {
  if (messaging) return messaging;
  if (!(await isSupported())) return null;
  app = app || initializeApp(firebaseConfig);
  messaging = getMessaging(app);
  return messaging;
}

export async function getPushToken() {
  if (!("Notification" in window) || Notification.permission !== "granted") return null;
  const msg = await ensureMessaging();
  if (!msg) return null;
  const registration = await navigator.serviceWorker?.ready;
  if (!registration) return null;
  return getToken(msg, { vapidKey, serviceWorkerRegistration: registration });
}

function remoteJobs(jobs) {
  const now = Date.now();
  return (jobs || []).filter((job) => Number(job.fireAt) > now + 1500).slice(0, 60);
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
    const previousIds = loadPreviousIds();
    if (!alerts.length && !previousIds.length) return;

    const token = await getPushToken();
    if (!token) {
      if (previousIds.length) savePreviousIds([]);
      return;
    }

    const response = await fetch(syncAlertsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        deviceId: deviceId(),
        alerts,
        previousIds,
      }),
    });
    if (!response.ok) return;
    savePreviousIds(alerts.map((alert) => alert.id));
  } catch {
    /* sin red o FCM no disponible: siguen los avisos locales */
  }
}
