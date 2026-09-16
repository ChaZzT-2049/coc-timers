const crypto = require("crypto");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFunctions } = require("firebase-admin/functions");
const { onRequest } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { logger } = require("firebase-functions");

initializeApp();

const REGION = "us-central1";
const LINK = "https://chazzt-2049.github.io/coc-timers/";
const MAX_SCHEDULE_MS = 29 * 24 * 60 * 60 * 1000;

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function taskId(deviceId, alertId, fireAtSec, scheduleSec) {
  return `a${digest(`${deviceId}:${alertId}:${fireAtSec}:${scheduleSec}`)}`;
}

function legacyTaskId(deviceId, alertId) {
  return `a${digest(`${deviceId}:${alertId}`)}`;
}

function toSec(ms) {
  return Math.floor(Number(ms) / 1000);
}

function queue() {
  return getFunctions().taskQueue("sendPush");
}

async function deleteTask(id) {
  if (!id) return;
  try {
    await queue().delete(id);
  } catch {
    /* ya no existía */
  }
}

async function sendFcm(payload) {
  const title = String(payload.title || "COC Timers").slice(0, 80);
  const body = String(payload.body || "").slice(0, 180);
  const tag = String(payload.tag || "coc-timers").slice(0, 120);
  await getMessaging().send({
    token: String(payload.token),
    data: {
      title,
      body,
      tag,
      url: LINK,
    },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400",
      },
      fcmOptions: { link: LINK },
    },
  });
}

async function enqueueAlert(payload, whenMs) {
  const now = Date.now();
  const fireAt = Number(whenMs);
  if (!Number.isFinite(fireAt) || fireAt <= now) return null;
  const scheduleTime = new Date(Math.min(fireAt, now + MAX_SCHEDULE_MS));
  const id = taskId(
    payload.deviceId,
    payload.alertId,
    toSec(fireAt),
    toSec(scheduleTime.getTime())
  );
  await queue().enqueue(
    { ...payload, fireAt },
    { id, scheduleTime }
  );
  return id;
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
      await sendFcm(data);
    } catch (error) {
      const code = error?.code || "";
      if (String(code).includes("registration-token-not-registered")) return;
      logger.error("sendFcm failed", error);
      throw error;
    }
  }
);

function parsePrevious(body, deviceId) {
  if (Array.isArray(body.previous) && body.previous.length) {
    return body.previous.slice(0, 80).map((item) => {
      if (!item || typeof item !== "object") return null;
      return {
        id: String(item.id || "").slice(0, 180),
        fireAt: Number(item.fireAt) || 0,
        taskId: String(item.taskId || ""),
      };
    }).filter((item) => item?.id);
  }
  const ids = Array.isArray(body.previousIds) ? body.previousIds.map(String).slice(0, 80) : [];
  return ids.map((id) => ({
    id,
    fireAt: 0,
    taskId: legacyTaskId(deviceId, id),
  }));
}

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

    if (!token || token.length < 20 || token.length > 4096) {
      res.status(400).json({ error: "token inválido" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(deviceId)) {
      res.status(400).json({ error: "deviceId inválido" });
      return;
    }

    if (body.test) {
      try {
        await sendFcm({
          token,
          title: "COC Timers",
          body: "Aviso de prueba. Si ves esto con la app cerrada, Firebase llega bien.",
          tag: "coc-test",
        });
        res.json({ ok: true, test: true });
      } catch (error) {
        logger.error("test push failed", error);
        res.status(502).json({ ok: false, error: String(error.message || error) });
      }
      return;
    }

    const previous = parsePrevious(body, deviceId);
    const nextJobs = new Map();
    for (const item of alerts) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.id || "").slice(0, 180);
      const fireAt = Number(item.fireAt);
      if (!id || !Number.isFinite(fireAt)) continue;
      if (fireAt > Date.now() + 400 * 24 * 60 * 60 * 1000) continue;
      nextJobs.set(id, {
        token,
        deviceId,
        alertId: id,
        title: String(item.title || "COC Timers").slice(0, 80),
        body: String(item.body || "").slice(0, 180),
        tag: String(item.tag || id).slice(0, 120),
        fireAt,
      });
    }

    const prevMap = new Map(previous.map((item) => [item.id, item]));
    const kept = [];

    try {
      for (const prev of previous) {
        if (!prev.taskId || !prev.fireAt) {
          await deleteTask(legacyTaskId(deviceId, prev.id));
        }
        const next = nextJobs.get(prev.id);
        const sameTime = next && toSec(next.fireAt) === toSec(prev.fireAt);
        if (sameTime) continue;
        await deleteTask(prev.taskId);
      }

      for (const job of nextJobs.values()) {
        const prev = prevMap.get(job.alertId);
        if (prev && toSec(prev.fireAt) === toSec(job.fireAt) && prev.taskId) {
          kept.push({ id: job.alertId, fireAt: job.fireAt, taskId: prev.taskId });
          continue;
        }
        const created = await enqueueAlert(job, job.fireAt);
        if (created) kept.push({ id: job.alertId, fireAt: job.fireAt, taskId: created });
      }
    } catch (error) {
      logger.error("syncAlerts enqueue failed", error);
      res.status(502).json({ ok: false, error: String(error.message || error) });
      return;
    }

    res.json({ ok: true, scheduled: kept.length, previous: kept });
  }
);
