const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFunctions } = require("firebase-admin/functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");

initializeApp();

const REGION = "us-central1";
const ICON = "https://chazzt-2049.github.io/coc-timers/icons/icon-192.png";
const LINK = "https://chazzt-2049.github.io/coc-timers/";
const MAX_SCHEDULE_MS = 29 * 24 * 60 * 60 * 1000;

function taskId(deviceId, alertId) {
  const digest = crypto.createHash("sha256").update(`${deviceId}:${alertId}`).digest("hex").slice(0, 40);
  return `a${digest}`;
}

function queue() {
  return getFunctions().taskQueue("locations/us-central1/functions/sendPush");
}

async function deleteTask(id) {
  try {
    await queue().delete(id);
  } catch {
    /* ya no existía */
  }
}

async function enqueueAlert(payload, whenMs) {
  const now = Date.now();
  const fireAt = Number(whenMs);
  if (!Number.isFinite(fireAt) || fireAt <= now + 1000) return;
  const scheduleTime = new Date(Math.min(fireAt, now + MAX_SCHEDULE_MS));
  const id = taskId(payload.deviceId, payload.alertId);
  await deleteTask(id);
  await queue().enqueue(
    { ...payload, fireAt },
    { id, scheduleTime }
  );
}

exports.sendPush = onTaskDispatched(
  {
    region: REGION,
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 15 },
    rateLimits: { maxConcurrentDispatches: 6 },
  },
  async (event) => {
    const data = event.data || {};
    const token = String(data.token || "");
    const fireAt = Number(data.fireAt) || 0;
    if (!token) return;

    if (fireAt > Date.now() + 5000) {
      await enqueueAlert(data, fireAt);
      return;
    }

    try {
      await getMessaging().send({
        token,
        notification: {
          title: String(data.title || "COC Timers").slice(0, 80),
          body: String(data.body || "").slice(0, 180),
        },
        webpush: {
          fcmOptions: { link: LINK },
          notification: {
            icon: ICON,
            badge: ICON,
            tag: String(data.tag || "coc-timers"),
            renotify: true,
          },
        },
        data: { url: "./" },
      });
    } catch (error) {
      const code = error?.code || "";
      if (String(code).includes("registration-token-not-registered")) return;
      throw error;
    }
  }
);

exports.syncAlerts = onRequest(
  {
    region: REGION,
    cors: [
      "https://chazzt-2049.github.io",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    invoker: "public",
    maxInstances: 4,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const token = String(body.token || "").trim();
    const deviceId = String(body.deviceId || "").trim();
    const alerts = Array.isArray(body.alerts) ? body.alerts.slice(0, 60) : [];
    const previousIds = Array.isArray(body.previousIds) ? body.previousIds.map(String).slice(0, 80) : [];

    if (!token || token.length < 20 || token.length > 4096) {
      res.status(400).json({ error: "token inválido" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(deviceId)) {
      res.status(400).json({ error: "deviceId inválido" });
      return;
    }

    const nextIds = new Set();
    const jobs = [];
    for (const item of alerts) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || "").slice(0, 180);
      const fireAt = Number(item.fireAt);
      if (!id || !Number.isFinite(fireAt)) continue;
      if (fireAt > Date.now() + 400 * 24 * 60 * 60 * 1000) continue;
      nextIds.add(id);
      jobs.push({
        token,
        deviceId,
        alertId: id,
        title: String(item.title || "COC Timers").slice(0, 80),
        body: String(item.body || "").slice(0, 180),
        tag: String(item.tag || id).slice(0, 120),
        fireAt,
      });
    }

    for (const oldId of previousIds) {
      if (nextIds.has(oldId)) continue;
      await deleteTask(taskId(deviceId, oldId));
    }

    for (const job of jobs) {
      await enqueueAlert(job, job.fireAt);
    }

    res.json({ ok: true, scheduled: jobs.length });
  }
);
