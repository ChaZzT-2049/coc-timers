import { requireIdentity } from "../../../cursor/identity.js";
import { loadClanReview } from "../../../lib/coc.js";
import { allowRequest } from "../../../lib/guard.js";
import { normalizeTag } from "../../../lib/tags.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map();
const CACHE_MS = 60_000;

function json(body, status) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function cached(tag) {
  const hit = cache.get(tag);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(tag);
    return null;
  }
  return hit.review;
}

function remember(tag, review) {
  cache.set(tag, { at: Date.now(), review });
  if (cache.size > 20) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export async function POST(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return json({ error: "forbidden", message: "La consulta tiene que salir de esta app." }, 403);
  }
  if (request.headers.get("x-revision-clan") !== "1") {
    return json({ error: "forbidden", message: "La consulta tiene que salir de esta app." }, 403);
  }

  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  if (!allowRequest(identity.sub)) {
    return json({ error: "rate_limited", message: "Demasiadas consultas seguidas. Espera un minuto." }, 429);
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2000) {
    return json({ error: "invalid_tag", message: "Esa etiqueta no es válida. Usa el formato #ABC123, solo con los caracteres del juego." }, 400);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tag = typeof body?.tag === "string" ? body.tag : "";
  const parsed = normalizeTag(tag);
  if (parsed.ok) {
    const fresh = cached(parsed.tag);
    if (fresh) return json(fresh, 200);
  }

  const result = await loadClanReview(tag, { token: process.env.COC_API_TOKEN });
  if (!result.ok) return json({ error: result.error, message: result.message }, result.status);
  remember(result.review.clan.tag, result.review);
  return json(result.review, 200);
}
