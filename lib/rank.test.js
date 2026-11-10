import assert from "node:assert/strict";
import test from "node:test";
import { reviewClan } from "./rank.js";

function member(tag, extra = {}) {
  return {
    tag,
    name: extra.name || tag,
    role: extra.role || "member",
    expLevel: 200,
    league: { id: 29000012, name: extra.league || "Crystal League I" },
    trophies: extra.trophies ?? 2500,
    donations: extra.donations ?? 400,
    donationsReceived: extra.donationsReceived ?? 80,
    clanRank: 1,
  };
}

function player(tag, extra = {}) {
  return {
    tag,
    name: extra.name || tag,
    townHallLevel: extra.townHallLevel ?? 15,
    warStars: extra.warStars ?? 900,
    league: { name: extra.league || "Crystal League I" },
    heroes: extra.heroes || [
      { name: "Barbarian King", level: 80, maxLevel: 90, village: "home" },
      { name: "Archer Queen", level: 80, maxLevel: 90, village: "home" },
    ],
  };
}

function attack(tag, order) {
  return {
    attackerTag: tag,
    defenderTag: "#DEFENDER",
    stars: 3,
    destructionPercentage: 100,
    order,
    duration: 90,
  };
}

function warMember(tag, used, townhallLevel = 15) {
  return {
    tag,
    name: tag,
    townhallLevel,
    mapPosition: 1,
    opponentAttacks: 1,
    attacks: Array.from({ length: used }, (_, index) => attack(tag, index + 1)),
  };
}

function clan(members, extra = {}) {
  return {
    tag: "#2PP",
    name: "Los del muro",
    type: "inviteOnly",
    description: "Clan de prueba",
    clanLevel: 18,
    clanPoints: 42000,
    clanBuilderBasePoints: 30000,
    clanCapitalPoints: 2400,
    requiredTrophies: extra.requiredTrophies ?? 2000,
    requiredBuilderBaseTrophies: 0,
    requiredTownhallLevel: 12,
    warFrequency: "always",
    isWarLogPublic: extra.isWarLogPublic ?? true,
    warLeague: { name: "Master League I" },
    members: members.length,
    memberList: members,
    clanCapital: extra.clanCapital ?? {
      capitalHallLevel: 8,
      districts: [
        { name: "Capital Peak", districtHallLevel: 8 },
        { name: "Wizard Valley", districtHallLevel: 4 },
      ],
    },
  };
}

function endedWar({ opponent = "Rivales", endTime = "20241101T120000.000Z", attacksPerMember = 2, members }) {
  return {
    state: "warEnded",
    teamSize: members.length,
    attacksPerMember,
    endTime,
    clan: { tag: "#2PP", name: "Los del muro", stars: 20, members },
    opponent: { tag: "#99QQ", name: opponent, stars: 10, members: [] },
  };
}

function capitalSeason(attackers) {
  return {
    items: [
      {
        state: "ended",
        startTime: "20241028T070000.000Z",
        endTime: "20241101T070000.000Z",
        capitalTotalLoot: 180000,
        raidsCompleted: 40,
        totalAttacks: 90,
        enemyDistrictsDestroyed: 12,
        offensiveReward: 1200,
        defensiveReward: 400,
        members: attackers,
      },
    ],
  };
}

test("varias señales ordenan por encima de una sola, y el liderazgo queda fuera", () => {
  const members = [
    member("#PYLQ", { name: "Lalo", role: "leader", donations: 0, donationsReceived: 800, trophies: 100 }),
    member("#QGRJ", { name: "Cora", role: "coLeader", donations: 0, donationsReceived: 800, trophies: 100 }),
    member("#CUPY", { name: "Ana", donations: 10, donationsReceived: 500, trophies: 900 }),
    member("#V8R2", { name: "Beto", donations: 400, donationsReceived: 100, trophies: 2600 }),
    member("#L9Q0", { name: "Carla", role: "admin", donations: 400, donationsReceived: 80, trophies: 1200 }),
    member("#J2UC", { name: "Dani", donations: 450, donationsReceived: 90, trophies: 2400 }),
  ];
  const roster = [
    warMember("#CUPY", 2),
    warMember("#V8R2", 0),
    warMember("#L9Q0", 2),
    warMember("#J2UC", 2),
    warMember("#PYLQ", 0),
    warMember("#QGRJ", 0),
  ];
  const review = reviewClan({
    clan: clan(members),
    players: members.map((item) => player(item.tag, { name: item.name })),
    warStatus: "public",
    currentWar: endedWar({ members: roster }),
    warLog: { items: [] },
    capitalRaids: capitalSeason([
      { tag: "#V8R2", name: "Beto", attacks: 6, attackLimit: 6, capitalResourcesLooted: 30000 },
      { tag: "#L9Q0", name: "Carla", attacks: 5, attackLimit: 5, capitalResourcesLooted: 20000 },
      { tag: "#J2UC", name: "Dani", attacks: 4, attackLimit: 5, capitalResourcesLooted: 15000 },
      { tag: "#PYLQ", name: "Lalo", attacks: 5, attackLimit: 5, capitalResourcesLooted: 10000 },
      { tag: "#QGRJ", name: "Cora", attacks: 5, attackLimit: 5, capitalResourcesLooted: 9000 },
    ]),
    capitalStatus: "ok",
    cwlStatus: "inactive",
  });

  assert.deepEqual(review.candidates.map((item) => item.tag), ["#CUPY", "#V8R2", "#L9Q0", "#J2UC"]);
  assert.equal(review.candidates[0].signalCount > review.candidates[1].signalCount, true);
  assert.ok(review.candidates[0].reasons.some((reason) => reason.id === "donations"));
  assert.ok(review.candidates[0].reasons.some((reason) => reason.id === "capital"));
  assert.ok(review.candidates[0].reasons.some((reason) => reason.id === "trophies"));
  assert.deepEqual(review.candidates[1].reasons.map((reason) => reason.id), ["war"]);
  assert.equal(review.candidates[0].kickCandidate, true);
  assert.equal(review.candidates[2].roleLabel, "Anciano");
  assert.deepEqual(review.leadership.map((item) => item.tag), ["#PYLQ", "#QGRJ"]);
  assert.equal(review.leadership[0].rank, null);
  assert.equal(review.leadership[0].kickCandidate, false);
  assert.ok(review.leadership[0].reasons.length > 1);
  assert.equal(review.candidates[0].heroes.includes("Rey bárbaro"), true);
  assert.equal(review.candidates[0].townHall, 15);
  assert.equal(review.clan.warFrequencyLabel, "Siempre");
  assert.equal(review.capital.districts[0].name, "Pico de la capital");
  assert.equal(review.capital.season.capitalTotalLoot, 180000);
  assert.equal(review.capital.season.attackers[0].tag, "#V8R2");
});

test("las donaciones solo cuentan si fallan las dos condiciones a la vez", () => {
  const members = [
    member("#LOW1", { name: "Baja", donations: 10, donationsReceived: 400, trophies: 2500 }),
    member("#RATIO", { name: "Ratio", donations: 300, donationsReceived: 900, trophies: 2500 }),
    member("#MED1", { name: "Media", donations: 400, donationsReceived: 100, trophies: 2500 }),
    member("#MED2", { name: "Media2", donations: 500, donationsReceived: 80, trophies: 2500 }),
    member("#OKAY", { name: "Ok", donations: 450, donationsReceived: 90, trophies: 2500 }),
  ];
  const review = reviewClan({
    clan: clan(members, { requiredTrophies: 0 }),
    players: [],
    warStatus: "private",
    capitalStatus: "unavailable",
    cwlStatus: "inactive",
  });
  const byTag = Object.fromEntries(review.candidates.map((item) => [item.tag, item]));
  assert.ok(byTag["#LOW1"].reasons.some((reason) => reason.id === "donations"));
  assert.equal(byTag["#RATIO"].reasons.some((reason) => reason.id === "donations"), false);
  assert.equal(review.war.status, "private");
  assert.equal(byTag["#LOW1"].war.shown, false);
  assert.equal(byTag["#LOW1"].war.label, null);
  assert.match(review.war.message, /privado/);
});

test("la guerra en preparación y el historial sin ataques por jugador no inventan fallos", () => {
  const members = [member("#CUPY", { name: "Ana" }), member("#V8R2", { name: "Beto" })];
  const review = reviewClan({
    clan: clan(members, { requiredTrophies: 0 }),
    players: [],
    warStatus: "public",
    currentWar: {
      state: "preparation",
      teamSize: 2,
      attacksPerMember: 2,
      clan: { tag: "#2PP", members: [warMember("#CUPY", 0), warMember("#V8R2", 0)] },
      opponent: { tag: "#99QQ", name: "Rivales" },
    },
    warLog: {
      items: [
        {
          result: "win",
          endTime: "20241001T000000.000Z",
          teamSize: 2,
          attacksPerMember: 2,
          clan: { tag: "#2PP", attacks: 4, stars: 6 },
          opponent: { tag: "#88CC", name: "Otros" },
        },
      ],
    },
    capitalStatus: "ok",
    capitalRaids: { items: [] },
    cwlStatus: "inactive",
  });
  assert.equal(review.candidates.every((item) => item.reasons.length === 0), true);
  assert.match(review.war.message, /no trae ataques por jugador/);
  assert.equal(review.capital.season, null);
});

test("no cuenta dos veces la guerra que acaba de terminar y sí el resto del registro", () => {
  const members = [member("#CUPY", { name: "Ana", trophies: 2500, donations: 400, donationsReceived: 40 })];
  const endTime = "20241102T150000.000Z";
  const review = reviewClan({
    clan: clan(members, { requiredTrophies: 0 }),
    players: [player("#CUPY")],
    warStatus: "public",
    currentWar: endedWar({ endTime, members: [warMember("#CUPY", 0)] }),
    warLog: {
      items: [
        {
          result: "lose",
          endTime,
          teamSize: 1,
          attacksPerMember: 2,
          clan: { tag: "#2PP", members: [warMember("#CUPY", 0)] },
          opponent: { tag: "#99QQ", name: "Rivales" },
        },
        {
          result: "win",
          endTime: "20241020T150000.000Z",
          teamSize: 1,
          attacksPerMember: 1,
          clan: { tag: "#2PP", members: [warMember("#CUPY", 0)] },
          opponent: { tag: "#88CC", name: "Otros" },
        },
      ],
    },
    capitalStatus: "ok",
    capitalRaids: { items: [] },
    cwlStatus: "inactive",
  });
  const ana = review.candidates[0];
  assert.equal(ana.reasons.filter((reason) => reason.id === "war").length, 1);
  assert.match(ana.reasons[0].text, /recién terminada/);
  assert.match(ana.reasons[0].text, /1 ataque sin usar/);
  assert.match(ana.reasons[0].text, /1 guerra reciente/);
});

test("la liga solo penaliza a quien estaba en la alineación de una guerra ya empezada", () => {
  const members = [
    member("#CUPY", { name: "Ana", donations: 400, donationsReceived: 40, trophies: 2500 }),
    member("#V8R2", { name: "Beto", donations: 400, donationsReceived: 40, trophies: 2500 }),
    member("#L9Q0", { name: "Carla", donations: 400, donationsReceived: 40, trophies: 2500 }),
  ];
  const base = {
    clan: clan(members, { requiredTrophies: 0 }),
    players: [],
    warStatus: "private",
    capitalStatus: "ok",
    capitalRaids: capitalSeason([
      { tag: "#CUPY", name: "Ana", attacks: 5, attackLimit: 5, capitalResourcesLooted: 20000 },
      { tag: "#V8R2", name: "Beto", attacks: 5, attackLimit: 5, capitalResourcesLooted: 15000 },
      { tag: "#L9Q0", name: "Carla", attacks: 5, attackLimit: 5, capitalResourcesLooted: 10000 },
    ]),
    cwlStatus: "active",
    leagueGroup: { state: "inWar", season: "2024-11", rounds: [{ warTags: ["#PPLYQ", "#0"] }] },
  };
  const active = reviewClan({
    ...base,
    cwlWars: [
      {
        state: "preparation",
        attacksPerMember: 1,
        clan: { tag: "#2PP", name: "Los del muro", members: [warMember("#CUPY", 0)] },
        opponent: { tag: "#99QQ", name: "Rivales", members: [] },
      },
      {
        state: "warEnded",
        attacksPerMember: 1,
        endTime: "20241103T120000.000Z",
        clan: { tag: "#2PP", stars: 15, members: [warMember("#CUPY", 0), warMember("#V8R2", 1)] },
        opponent: { tag: "#88CC", name: "Otros", stars: 10 },
      },
      {
        state: "inWar",
        attacksPerMember: 1,
        clan: { tag: "#99QQ", name: "Rivales" },
        opponent: {
          tag: "#2PP",
          stars: 3,
          members: [warMember("#L9Q0", 0)],
        },
      },
    ],
  });
  const byTag = Object.fromEntries(active.candidates.map((item) => [item.tag, item]));
  assert.equal(byTag["#CUPY"].reasons.some((reason) => reason.id === "cwl"), true);
  assert.match(byTag["#CUPY"].reasons.find((reason) => reason.id === "cwl").text, /ya terminada/);
  assert.equal(byTag["#V8R2"].reasons.some((reason) => reason.id === "cwl"), false);
  assert.equal(byTag["#L9Q0"].reasons.some((reason) => reason.id === "cwl"), true);
  assert.match(byTag["#L9Q0"].cwl.label, /en curso|Faltan/);
  assert.equal(active.cwl.wars.length, 3);

  const idle = reviewClan({ ...base, cwlStatus: "inactive", cwlWars: [] });
  assert.equal(idle.candidates.every((item) => item.cwl.shown === false), true);
  assert.match(idle.cwl.message, /no está en una liga/);
});

test("las copas justo en el requisito no son señal, y un perfil ausente se nota", () => {
  const members = [
    member("#CUPY", { name: "Ana", trophies: 2000, donations: 300, donationsReceived: 40 }),
    member("#V8R2", { name: "Beto", trophies: 1999, donations: 300, donationsReceived: 40 }),
  ];
  const review = reviewClan({
    clan: clan(members, { requiredTrophies: 2000 }),
    players: [player("#CUPY", { name: "Ana" })],
    warStatus: "unavailable",
    capitalStatus: "unavailable",
    cwlStatus: "unavailable",
  });
  const ana = review.candidates.find((item) => item.tag === "#CUPY");
  const beto = review.candidates.find((item) => item.tag === "#V8R2");
  assert.equal(ana.reasons.some((reason) => reason.id === "trophies"), false);
  assert.equal(beto.reasons.some((reason) => reason.id === "trophies"), true);
  assert.equal(beto.profileMissing, true);
  assert.equal(beto.war.shown, false);
  assert.equal(beto.cwl.shown, false);
  assert.equal(beto.capitalAttacks, null);
  assert.equal(review.candidates[0].tag, "#V8R2");
});
