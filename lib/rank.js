import { countLabel, districtName, heroName, leagueName, roleLabel, warFrequencyLabel, clanTypeLabel, warStateLabel } from "./labels.js";
import { normalizeTag, tagsEqual } from "./tags.js";

export const RULES = {
  donationReceivedFloor: 100,
  donationMedianFloor: 100,
  recentWars: 8,
  weights: {
    donations: 30,
    warPerMiss: 12,
    warCap: 48,
    cwlPerMiss: 12,
    cwlCap: 36,
    capital: 24,
    trophies: 18,
  },
};

const LEADERSHIP = new Set(["leader", "coLeader"]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function cocTimeToIso(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/.exec(String(value || ""));
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`;
}

function indexPlayers(players) {
  const map = new Map();
  const list = Array.isArray(players) ? players : Object.values(players || {});
  for (const player of list) {
    const parsed = normalizeTag(player?.tag);
    if (!parsed.ok) continue;
    map.set(parsed.tag, player);
  }
  return map;
}

function attacksUsed(member) {
  const attacks = Array.isArray(member?.attacks) ? member.attacks : [];
  const seen = new Set();
  let count = 0;
  for (const attack of attacks) {
    const key = `${attack?.order ?? ""}:${attack?.defenderTag ?? ""}:${attack?.attackerTag ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    count += 1;
  }
  return count;
}

function attacksExpected(value) {
  const number = finite(value);
  if (number == null || number < 1 || number > 5) return null;
  return number;
}

function findRosterMember(members, tag) {
  return (members || []).find((member) => tagsEqual(member?.tag, tag)) || null;
}

function latestSeason(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (!items.length) return null;
  return [...items].sort((a, b) => String(b.endTime || b.startTime || "").localeCompare(String(a.endTime || a.startTime || "")))[0];
}

function recentWarEntries(warLog, currentWar) {
  const items = Array.isArray(warLog?.items) ? warLog.items : [];
  const currentEnd = currentWar?.endTime || "";
  return items
    .filter((entry) => entry && entry.result && entry.opponent?.tag && Array.isArray(entry.clan?.members))
    .filter((entry) => !(currentEnd && entry.endTime === currentEnd))
    .sort((a, b) => String(b.endTime || "").localeCompare(String(a.endTime || "")))
    .slice(0, RULES.recentWars);
}

function leagueOf(player, member) {
  const name = player?.leagueTier?.name || player?.league?.name || member?.leagueTier?.name || member?.league?.name || "";
  return name ? leagueName(name) : "Sin liga";
}

function heroLine(heroes) {
  const list = Array.isArray(heroes) ? heroes : [];
  const home = list.filter((hero) => !hero?.village || hero.village === "home");
  const chosen = home.length ? home : list;
  if (!chosen.length) return "";
  return chosen.map((hero) => `${heroName(hero.name)} ${finite(hero.level) ?? "?"}`).join(" · ");
}

function ourSide(war, clanTag) {
  if (tagsEqual(war?.clan?.tag, clanTag)) return war.clan;
  if (tagsEqual(war?.opponent?.tag, clanTag)) return war.opponent;
  return null;
}

function warMissesFor(tag, roster, expected) {
  if (!expected) return null;
  const member = findRosterMember(roster, tag);
  if (!member) return null;
  return Math.max(0, expected - attacksUsed(member));
}

function summarizeCapital(clan, capitalRaids, capitalStatus) {
  const districts = Array.isArray(clan?.clanCapital?.districts) ? clan.clanCapital.districts : [];
  const season = capitalStatus === "ok" ? latestSeason(capitalRaids) : null;
  const attackers = Array.isArray(season?.members)
    ? season.members
        .map((member) => {
          const parsed = normalizeTag(member.tag);
          return {
            tag: parsed.ok ? parsed.tag : String(member.tag || ""),
            name: String(member.name || "Jugador"),
            attacks: finite(member.attacks) ?? 0,
            attackLimit: finite(member.attackLimit),
            looted: finite(member.capitalResourcesLooted) ?? 0,
          };
        })
        .sort((a, b) => b.looted - a.looted || a.name.localeCompare(b.name, "es"))
    : [];

  let message = "";
  if (capitalStatus !== "ok") {
    message = "No se pudo leer la capital. Los distritos que vengan en la ficha del clan sí se muestran; el saqueo queda vacío.";
  } else if (!season) {
    message = "La API no trajo una temporada de asalto a la capital.";
  } else {
    message = season.state === "ongoing"
      ? "Temporada de capital en curso. Quien no tiene ataques sale en el ranking de revisión."
      : "Última temporada de capital cerrada. Quien no atacó sale en el ranking de revisión.";
  }

  return {
    status: capitalStatus === "ok" ? "ok" : "unavailable",
    message,
    hallLevel: finite(clan?.clanCapital?.capitalHallLevel),
    districts: districts.map((district) => ({
      name: districtName(district?.name),
      level: finite(district?.districtHallLevel) ?? 0,
    })),
    season: season
      ? {
          state: season.state || "",
          stateLabel: season.state === "ongoing" ? "En curso" : season.state === "ended" ? "Terminada" : "Sin dato",
          startIso: cocTimeToIso(season.startTime),
          endIso: cocTimeToIso(season.endTime),
          capitalTotalLoot: finite(season.capitalTotalLoot) ?? 0,
          totalAttacks: finite(season.totalAttacks) ?? 0,
          raidsCompleted: finite(season.raidsCompleted) ?? 0,
          enemyDistrictsDestroyed: finite(season.enemyDistrictsDestroyed) ?? 0,
          offensiveReward: finite(season.offensiveReward) ?? 0,
          defensiveReward: finite(season.defensiveReward) ?? 0,
          attackers,
        }
      : null,
  };
}

function summarizeCwl(leagueGroup, cwlWars, cwlStatus, clanTag) {
  if (cwlStatus !== "active") {
    return {
      status: cwlStatus === "unavailable" ? "unavailable" : "inactive",
      message: cwlStatus === "unavailable"
        ? "No se pudo leer la liga de clanes. Las columnas de liga quedan vacías."
        : "El clan no está en una liga de clanes ahora. No hay ataques de liga que contar.",
      season: null,
      state: null,
      stateLabel: null,
      wars: [],
    };
  }

  const wars = (Array.isArray(cwlWars) ? cwlWars : [])
    .map((war) => {
      const side = ourSide(war, clanTag);
      const other = side && tagsEqual(war?.clan?.tag, clanTag) ? war.opponent : war.clan;
      if (!side) return null;
      return {
        state: war.state || "",
        stateLabel: warStateLabel(war.state),
        opponent: other?.name || "Rival",
        teamSize: finite(war.teamSize),
        attacksPerMember: attacksExpected(war.attacksPerMember),
        ourStars: finite(side.stars) ?? 0,
        theirStars: finite(other?.stars) ?? 0,
        endIso: cocTimeToIso(war.endTime),
      };
    })
    .filter(Boolean);

  return {
    status: "active",
    message: "Hay un grupo de liga activo. Solo cuentan las guerras ya empezadas en las que el jugador estaba en la alineación.",
    season: leagueGroup?.season || null,
    state: leagueGroup?.state || null,
    stateLabel: warStateLabel(leagueGroup?.state),
    wars,
  };
}

function memberWarFacts(tag, context) {
  if (context.warStatus !== "public") {
    return { shown: false, missed: 0, label: null, text: "" };
  }

  const parts = [];
  let missed = 0;
  const current = context.currentWar;
  const state = current?.state;
  const expected = attacksExpected(current?.attacksPerMember);
  let label = "Sin guerra";

  if (state === "preparation") {
    label = "En preparación";
  } else if (state === "inWar" || state === "warEnded") {
    const currentMissed = warMissesFor(tag, current?.clan?.members, expected);
    if (currentMissed == null) {
      label = "Sin dato de ataques";
    } else {
      const used = expected - currentMissed;
      label = state === "inWar" ? `${used}/${expected} en curso` : `${used}/${expected}`;
      if (currentMissed > 0) {
        missed += currentMissed;
        const verb = state === "inWar" ? "Lleva" : "Dejó";
        const where = state === "inWar" ? "en la guerra en curso" : "en la guerra recién terminada";
        parts.push(`${verb} ${countLabel(currentMissed, "ataque sin usar", "ataques sin usar")} ${where} (${used}/${expected}).`);
      }
    }
  }

  let logMissed = 0;
  let logWars = 0;
  for (const entry of context.logEntries) {
    const entryExpected = attacksExpected(entry.attacksPerMember);
    const entryMissed = warMissesFor(tag, entry.clan?.members, entryExpected);
    if (entryMissed == null) continue;
    logWars += 1;
    logMissed += entryMissed;
  }
  if (logMissed > 0) {
    missed += logMissed;
    parts.push(`En el registro público dejó ${countLabel(logMissed, "ataque sin usar", "ataques sin usar")} en ${countLabel(logWars, "guerra reciente", "guerras recientes")}.`);
  }

  return { shown: true, missed, label, text: parts.join(" ") };
}

function memberCwlFacts(tag, context) {
  if (context.cwlStatus !== "active") {
    return { shown: false, missed: 0, label: null, text: "" };
  }

  let missed = 0;
  let counted = 0;
  let ongoing = 0;
  let finished = 0;
  for (const war of context.cwlWars) {
    if (war?.state !== "inWar" && war?.state !== "warEnded") continue;
    const side = ourSide(war, context.clanTag);
    if (!side) continue;
    const expected = attacksExpected(war.attacksPerMember);
    const warMissed = warMissesFor(tag, side.members, expected);
    if (warMissed == null) continue;
    counted += 1;
    if (warMissed > 0) {
      missed += warMissed;
      if (war.state === "inWar") ongoing += warMissed;
      else finished += warMissed;
    }
  }

  const bits = [];
  if (ongoing > 0) bits.push(`Todavía no atacó en ${countLabel(ongoing, "guerra de liga en curso", "guerras de liga en curso")}.`);
  if (finished > 0) bits.push(`No atacó en ${countLabel(finished, "guerra de liga ya terminada", "guerras de liga ya terminadas")}.`);
  const label = counted ? `${missed === 0 ? "Atacó" : "Faltan " + missed} · ${countLabel(counted, "guerra", "guerras")}` : "No estaba en la alineación";
  return { shown: true, missed, label, text: bits.join(" ") };
}

function capitalAttacksOf(tag, season) {
  if (!season) return { known: false, attacks: null };
  const row = (season.attackers || []).find((member) => tagsEqual(member.tag, tag));
  if (!row) return { known: true, attacks: 0 };
  return { known: true, attacks: row.attacks };
}

function buildMember(member, context) {
  const parsed = normalizeTag(member?.tag);
  const tag = parsed.ok ? parsed.tag : String(member?.tag || "");
  const player = context.players.get(tag) || null;
  const donations = finite(member?.donations) ?? 0;
  const donationsReceived = finite(member?.donationsReceived) ?? 0;
  const trophies = finite(member?.trophies);
  const war = memberWarFacts(tag, context);
  const cwl = memberCwlFacts(tag, context);
  const capital = capitalAttacksOf(tag, context.capital.season);
  const reasons = [];

  const farBelow = donationsReceived >= RULES.donationReceivedFloor && donations * 2 <= donationsReceived;
  const lowVsClan = context.donationMedian >= RULES.donationMedianFloor && donations * 2 < context.donationMedian;
  if (farBelow && lowVsClan) {
    reasons.push({
      id: "donations",
      text: `Dio ${donations} y recibió ${donationsReceived}: las dadas no llegan a la mitad de las recibidas, y están por debajo de la mitad de la mediana del clan (${context.donationMedian}).`,
    });
  }

  if (war.shown && war.missed > 0) {
    reasons.push({ id: "war", text: war.text });
  }
  if (cwl.shown && cwl.missed > 0) {
    reasons.push({ id: "cwl", text: cwl.text });
  }
  if (capital.known && capital.attacks === 0) {
    const when = context.capital.season?.stateLabel || "la última";
    reasons.push({
      id: "capital",
      text: `No atacó en la última temporada de la capital (${when}).`,
    });
  }
  const required = context.requiredTrophies;
  if (required > 0 && trophies != null && trophies < required) {
    reasons.push({
      id: "trophies",
      text: `Tiene ${trophies} copas, por debajo del requisito del clan (${required}).`,
    });
  }

  const weights = RULES.weights;
  let score = 0;
  for (const reason of reasons) {
    if (reason.id === "donations") score += weights.donations;
    if (reason.id === "war") score += Math.min(weights.warCap, war.missed * weights.warPerMiss);
    if (reason.id === "cwl") score += Math.min(weights.cwlCap, cwl.missed * weights.cwlPerMiss);
    if (reason.id === "capital") score += weights.capital;
    if (reason.id === "trophies") score += weights.trophies;
  }

  const leadership = LEADERSHIP.has(member?.role);
  return {
    tag,
    name: String(player?.name || member?.name || "Jugador"),
    role: member?.role || "member",
    roleLabel: roleLabel(member?.role),
    kickCandidate: !leadership,
    townHall: finite(player?.townHallLevel) ?? finite(findRosterMember(context.currentWar?.clan?.members, tag)?.townhallLevel),
    trophies,
    donations,
    donationsReceived,
    league: leagueOf(player, member),
    warStars: finite(player?.warStars),
    heroes: player ? heroLine(player.heroes) : "",
    profileMissing: !player,
    war: { shown: war.shown, label: war.label },
    cwl: { shown: cwl.shown, label: cwl.label },
    capitalAttacks: capital.known ? capital.attacks : null,
    reasons,
    signalCount: reasons.length,
    score,
    rank: null,
  };
}

function warMessage(warStatus, currentWar, warLog, warLogUnread) {
  if (warStatus === "private") {
    return "El registro de guerra es privado. No se leen la guerra actual ni el historial, y las columnas de guerra quedan vacías.";
  }
  if (warStatus === "unavailable") {
    return "No se pudo leer la guerra. Las columnas de guerra quedan vacías.";
  }
  const state = currentWar?.state;
  const opponent = currentWar?.opponent?.name;
  let message = "El registro de guerra es público.";
  if (state === "inWar") message += opponent ? ` Guerra en curso contra ${opponent}.` : " Guerra en curso.";
  else if (state === "preparation") message += opponent ? ` Preparación contra ${opponent}.` : " El clan está en preparación.";
  else if (state === "warEnded") message += opponent ? ` La última guerra, contra ${opponent}, ya terminó.` : " La última guerra ya terminó.";
  else message += " Ahora mismo el clan no está en guerra.";
  if (warLogUnread) {
    message += " El historial de guerra no se pudo leer; esa parte queda vacía.";
  } else if (warLog && Array.isArray(warLog.items) && warLog.items.length && !warLog.items.some((entry) => Array.isArray(entry?.clan?.members))) {
    message += " El historial no trae ataques por jugador, así que esos fallos no se cuentan.";
  }
  return message;
}

export function reviewClan(input) {
  const clan = input?.clan || {};
  const parsedClan = normalizeTag(clan.tag);
  const clanTag = parsedClan.ok ? parsedClan.tag : String(clan.tag || "");
  const memberList = Array.isArray(clan.memberList) ? clan.memberList.slice(0, 50) : [];
  const warStatus = input?.warStatus === "private" || input?.warStatus === "unavailable" ? input.warStatus : "public";
  const currentWar = warStatus === "public" && input?.currentWar?.state ? input.currentWar : null;
  const logEntries = warStatus === "public" ? recentWarEntries(input?.warLog, currentWar) : [];
  const capitalStatus = input?.capitalStatus === "unavailable" ? "unavailable" : "ok";
  const capital = summarizeCapital(clan, input?.capitalRaids, capitalStatus);
  const cwlStatus = input?.cwlStatus === "active" || input?.cwlStatus === "unavailable" ? input.cwlStatus : "inactive";
  const donationValues = memberList.map((member) => finite(member?.donations) ?? 0);
  const context = {
    clanTag,
    players: indexPlayers(input?.players),
    warStatus,
    currentWar,
    logEntries,
    donationMedian: median(donationValues),
    requiredTrophies: finite(clan.requiredTrophies) ?? 0,
    capital,
    cwlStatus,
    cwlWars: cwlStatus === "active" && Array.isArray(input?.cwlWars) ? input.cwlWars : [],
  };

  const views = memberList.map((member) => buildMember(member, context));
  const leadership = views
    .filter((member) => !member.kickCandidate)
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "leader" ? -1 : 1;
      return a.name.localeCompare(b.name, "es");
    });
  const candidates = views
    .filter((member) => member.kickCandidate)
    .sort((a, b) => b.score - a.score || b.signalCount - a.signalCount || a.name.localeCompare(b.name, "es"));
  candidates.forEach((member, index) => {
    member.rank = index + 1;
  });

  const perMemberLog = logEntries.length > 0 || (Array.isArray(input?.warLog?.items) && input.warLog.items.some((entry) => Array.isArray(entry?.clan?.members)));

  return {
    clan: {
      tag: clanTag,
      name: String(clan.name || "Clan"),
      level: finite(clan.clanLevel),
      points: finite(clan.clanPoints),
      builderPoints: finite(clan.clanBuilderBasePoints ?? clan.clanVersusPoints),
      capitalPoints: finite(clan.clanCapitalPoints),
      typeLabel: clanTypeLabel(clan.type),
      requiredTrophies: finite(clan.requiredTrophies) ?? 0,
      requiredBuilderBaseTrophies: finite(clan.requiredBuilderBaseTrophies) ?? 0,
      requiredTownhallLevel: finite(clan.requiredTownhallLevel) ?? 0,
      warFrequencyLabel: warFrequencyLabel(clan.warFrequency),
      memberCount: finite(clan.members) ?? memberList.length,
      warLeague: clan.warLeague?.name ? leagueName(clan.warLeague.name) : "Sin liga de guerra",
      donationMedian: context.donationMedian,
      description: String(clan.description || "").slice(0, 400),
    },
    war: {
      status: warStatus,
      message: warMessage(warStatus, currentWar, warStatus === "public" ? input?.warLog : null, warStatus === "public" && input?.warLogUnread === true),
      state: currentWar?.state || null,
      stateLabel: currentWar?.state ? warStateLabel(currentWar.state) : null,
      opponent: currentWar?.opponent?.name || null,
      teamSize: finite(currentWar?.teamSize),
      attacksPerMember: attacksExpected(currentWar?.attacksPerMember),
      perMemberLog: warStatus === "public" ? perMemberLog || logEntries.length > 0 : false,
    },
    capital,
    cwl: summarizeCwl(input?.leagueGroup, context.cwlWars, cwlStatus, clanTag),
    candidates,
    leadership,
    counts: {
      withSignals: candidates.filter((member) => member.signalCount > 0).length,
      withoutSignals: candidates.filter((member) => member.signalCount === 0).length,
      leadership: leadership.length,
    },
  };
}
