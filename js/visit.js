import { registerVisitUrl } from "./firebase-config.js";

const DONE_KEY = "coc-timers:visit-done";
const ID_KEY = "coc-timers:visit-id";

function visitorId() {
  let id = localStorage.getItem(ID_KEY);
  if (id && /^[a-zA-Z0-9-]{8,64}$/.test(id)) return id;
  id = crypto.randomUUID();
  localStorage.setItem(ID_KEY, id);
  return id;
}

export function pingUniqueVisit() {
  if (localStorage.getItem(DONE_KEY) === "1") return;
  if (!registerVisitUrl) return;
  const visitor = visitorId();
  void fetch(registerVisitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor }),
    keepalive: true,
  })
    .then((response) => {
      if (response.ok) localStorage.setItem(DONE_KEY, "1");
    })
    .catch(() => {
      /* se reintenta en la siguiente apertura */
    });
}
