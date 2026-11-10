import { reviewClan } from "./rank.js";
import { normalizeTag } from "./tags.js";

const API = "https://api.clashofclans.com/v1";

const MESSAGES = {
  empty_tag: "Escribe la etiqueta del clan.",
  invalid_tag: "Esa etiqueta no es válida. Usa el formato #ABC123, solo con los caracteres del juego.",
  missing_token: "Falta el token de la API oficial en el servidor (COC_API_TOKEN). No hay datos de ejemplo. Quien publica la app lo guarda como secreto en Cursor; el navegador nunca lo ve.",
  not_found: "No encontré ese clan en la API oficial.",
  token_rejected: "La API oficial rechazó el token. Hay que revisar el secreto COC_API_TOKEN.",
  api_rate: "La API oficial pidió esperar un momento. Inténtalo de nuevo.",
  api_unreachable: "No pude conectar con la API oficial.",
  api_error: "La API oficial no respondió bien. Inténtalo de nuevo.",
};

export function failure(error, status) {
  return { ok: false, status, error, message: MESSAGES[error] || MESSAGES.api_error };
}

async function cocFetch(path, token, fetchImpl) {
  const response = await fetchImpl(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: response.status, body };
}

async function pool(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function clanStatus(result) {
  if (!result) return "unreachable";
  if (result.status === 200) return "ok";
  if (result.status === 403) return "denied";
  if (result.status === 404) return "missing";
  if (result.status === 429) return "rate";
  return "error";
}

export async function loadClanReview(tagInput, { token, fetchImpl = fetch } = {}) {
  const parsed = normalizeTag(tagInput);
  if (!parsed.ok) return failure(parsed.error, 400);
  if (!String(token || "").trim()) return failure("missing_token", 503);

  const tag = parsed.tag;
  const encoded = encodeURIComponent(tag);
  let clanResult;
  try {
    clanResult = await cocFetch(`/clans/${encoded}`, token, fetchImpl);
  } catch {
    return failure("api_unreachable", 502);
  }

  if (clanResult.status === 404) return failure("not_found", 404);
  if (clanResult.status === 403) return failure("token_rejected", 502);
  if (clanResult.status === 429) return failure("api_rate", 429);
  if (clanResult.status !== 200 || !clanResult.body?.tag) return failure("api_error", 502);

  const clan = clanResult.body;
  const members = Array.isArray(clan.memberList) ? clan.memberList.slice(0, 50) : [];
  const warPublic = clan.isWarLogPublic === true;

  const tasks = [
    pool(members, 4, async (member) => {
      const memberTag = normalizeTag(member?.tag);
      if (!memberTag.ok) return null;
      try {
        const result = await cocFetch(`/players/${encodeURIComponent(memberTag.tag)}`, token, fetchImpl);
        return result.status === 200 ? result.body : null;
      } catch {
        return null;
      }
    }),
    warPublic
      ? cocFetch(`/clans/${encoded}/currentwar`, token, fetchImpl).catch(() => null)
      : Promise.resolve(null),
    warPublic
      ? cocFetch(`/clans/${encoded}/warlog?limit=10`, token, fetchImpl).catch(() => null)
      : Promise.resolve(null),
    cocFetch(`/clans/${encoded}/capitalraidseasons?limit=3`, token, fetchImpl).catch(() => null),
    cocFetch(`/clans/${encoded}/currentwar/leaguegroup`, token, fetchImpl).catch(() => null),
  ];

  const [players, currentWarResult, warLogResult, capitalResult, leagueResult] = await Promise.all(tasks);

  let warStatus = "public";
  let currentWar = null;
  let warLog = null;
  let warLogUnread = false;
  if (!warPublic) {
    warStatus = "private";
  } else {
    const currentCode = clanStatus(currentWarResult);
    const logCode = clanStatus(warLogResult);
    const denied = currentCode === "denied" || logCode === "denied";
    if (denied) {
      warStatus = "private";
    } else if (currentCode !== "ok" && logCode !== "ok") {
      warStatus = "unavailable";
    } else {
      if (currentCode === "ok") currentWar = currentWarResult.body;
      if (logCode === "ok") warLog = warLogResult.body;
      else warLogUnread = true;
      if (!currentWar?.state && !warLog) warStatus = "unavailable";
    }
  }

  const capitalOk = clanStatus(capitalResult) === "ok";
  let cwlStatus = "inactive";
  let leagueGroup = null;
  let cwlWars = [];
  const leagueCode = clanStatus(leagueResult);
  if (leagueCode === "ok" && leagueResult.body?.state && leagueResult.body.state !== "notInWar") {
    cwlStatus = "active";
    leagueGroup = leagueResult.body;
    const warTags = [];
    for (const round of leagueGroup.rounds || []) {
      for (const warTag of round?.warTags || []) {
        const parsedWar = normalizeTag(warTag);
        if (!parsedWar.ok || warTags.includes(parsedWar.tag)) continue;
        warTags.push(parsedWar.tag);
      }
    }
    const limited = warTags.slice(0, 28);
    const wars = await pool(limited, 3, async (warTag) => {
      try {
        const result = await cocFetch(`/clanwarleagues/wars/${encodeURIComponent(warTag)}`, token, fetchImpl);
        if (result.status !== 200 || !result.body?.state) return null;
        const home = normalizeTag(result.body.clan?.tag);
        const away = normalizeTag(result.body.opponent?.tag);
        const ours = (home.ok && home.tag === tag) || (away.ok && away.tag === tag);
        return ours ? result.body : null;
      } catch {
        return null;
      }
    });
    cwlWars = wars.filter(Boolean);
  } else if (leagueCode === "rate" || leagueCode === "error" || leagueCode === "unreachable" || leagueCode === "denied") {
    cwlStatus = "unavailable";
  }

  const review = reviewClan({
    clan,
    players: players.filter(Boolean),
    currentWar,
    warLog,
    warLogUnread,
    warStatus,
    capitalRaids: capitalOk ? capitalResult.body : null,
    capitalStatus: capitalOk ? "ok" : "unavailable",
    leagueGroup,
    cwlWars,
    cwlStatus,
  });

  return { ok: true, status: 200, review };
}
