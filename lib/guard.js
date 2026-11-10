const hits = new Map();

export function allowRequest(key, { now = Date.now(), limit = 10, windowMs = 60_000 } = {}) {
  const id = String(key || "anon").slice(0, 120);
  const recent = (hits.get(id) || []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(id, recent);
    return false;
  }
  recent.push(now);
  hits.set(id, recent);
  return true;
}

export function resetRequestGuard() {
  hits.clear();
}
