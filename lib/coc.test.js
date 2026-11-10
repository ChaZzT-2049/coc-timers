import assert from "node:assert/strict";
import test from "node:test";
import { loadClanReview } from "./coc.js";

const TOKEN = "TEST_TOKEN_SHOULD_NOT_LEAK";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clanBody(extra = {}) {
  return {
    tag: "#2PP",
    name: "Los del muro",
    type: "open",
    clanLevel: 10,
    clanPoints: 30000,
    clanCapitalPoints: 1000,
    requiredTrophies: 1500,
    requiredTownhallLevel: 10,
    warFrequency: "oncePerWeek",
    isWarLogPublic: extra.isWarLogPublic ?? false,
    members: 2,
    warLeague: { name: "Gold League I" },
    memberList: [
      {
        tag: "#PYLQ",
        name: "Ana",
        role: "leader",
        trophies: 3000,
        donations: 100,
        donationsReceived: 50,
      },
      {
        tag: "#V8R2",
        name: "Beto",
        role: "member",
        trophies: 800,
        donations: 10,
        donationsReceived: 400,
      },
    ],
    clanCapital: { capitalHallLevel: 5, districts: [{ name: "Capital Peak", districtHallLevel: 5 }] },
    ...extra.clan,
  };
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, authorization: options?.headers?.Authorization || "" });
    return handler(url, calls);
  };
  return { fetchImpl, calls };
}

test("sin token no llama a la API y no inventa un clan", async () => {
  let called = false;
  const result = await loadClanReview("#2PP", {
    token: "",
    fetchImpl: async () => {
      called = true;
      return json(200, {});
    },
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.error, "missing_token");
  assert.equal(result.status, 503);
  assert.match(result.message, /COC_API_TOKEN/);
  assert.equal(result.review, undefined);
});

test("etiqueta vacía o inválida no llama a la API", async () => {
  for (const tag of ["", "   ", "#ZZZ", "nope", "#AB"]) {
    let called = false;
    const result = await loadClanReview(tag, {
      token: TOKEN,
      fetchImpl: async () => {
        called = true;
        return json(200, {});
      },
    });
    assert.equal(called, false, tag);
    assert.equal(result.status, 400);
    assert.ok(result.error === "empty_tag" || result.error === "invalid_tag");
  }
});

test("registro privado: no pide guerra y el ranking deja esas columnas vacías", async () => {
  const { fetchImpl, calls } = mockFetch((url) => {
    const path = new URL(url).pathname;
    if (path === "/v1/clans/%232PP") return json(200, clanBody());
    if (path === "/v1/players/%23PYLQ") {
      return json(200, { tag: "#PYLQ", name: "Ana", townHallLevel: 16, warStars: 10, heroes: [], league: { name: "Gold League I" } });
    }
    if (path === "/v1/players/%23V8R2") return json(404, { reason: "notFound" });
    if (path === "/v1/clans/%232PP/capitalraidseasons") {
      return json(200, {
        items: [{
          state: "ended",
          endTime: "20241101T070000.000Z",
          capitalTotalLoot: 1000,
          members: [{ tag: "#PYLQ", name: "Ana", attacks: 3, attackLimit: 5, capitalResourcesLooted: 400 }],
        }],
      });
    }
    if (path === "/v1/clans/%232PP/currentwar/leaguegroup") return json(404, { reason: "notFound" });
    return json(500, { reason: "unexpected" });
  });

  const result = await loadClanReview("#2pp", { token: TOKEN, fetchImpl });
  assert.equal(result.ok, true);
  const paths = calls.map((call) => new URL(call.url).pathname);
  assert.equal(paths.some((path) => path.endsWith("/currentwar")), false);
  assert.equal(paths.some((path) => path.endsWith("/warlog")), false);
  assert.equal(result.review.war.status, "private");
  assert.equal(result.review.candidates[0].war.label, null);
  assert.equal(result.review.candidates[0].tag, "#V8R2");
  assert.equal(result.review.candidates[0].capitalAttacks, 0);
  assert.equal(result.review.leadership[0].townHall, 16);
  const packed = JSON.stringify(result);
  assert.equal(packed.includes(TOKEN), false);
  assert.equal(calls.every((call) => call.authorization === `Bearer ${TOKEN}`), true);
});

test("clan inexistente, token rechazado y etiqueta de guerra ajena", async () => {
  const missing = await loadClanReview("#2PP", {
    token: TOKEN,
    fetchImpl: async () => json(404, { reason: "notFound" }),
  });
  assert.equal(missing.error, "not_found");

  const denied = await loadClanReview("#2PP", {
    token: TOKEN,
    fetchImpl: async () => json(403, { reason: "accessDenied" }),
  });
  assert.equal(denied.error, "token_rejected");
  assert.equal(JSON.stringify(denied).includes(TOKEN), false);

  const { fetchImpl, calls } = mockFetch((url) => {
    const path = new URL(url).pathname;
    if (path === "/v1/clans/%232PP") return json(200, clanBody({ isWarLogPublic: true }));
    if (path.startsWith("/v1/players/")) return json(404, { reason: "notFound" });
    if (path.endsWith("/currentwar")) return json(200, { state: "notInWar" });
    if (path.endsWith("/warlog")) return json(200, { items: [] });
    if (path.endsWith("/capitalraidseasons")) return json(200, { items: [] });
    if (path.endsWith("/leaguegroup")) {
      return json(200, {
        state: "inWar",
        season: "2024-11",
        rounds: [{ warTags: ["#0", "http://evil.example/war", "#NOTAG", "#PPLYQ"] }],
      });
    }
    if (path === "/v1/clanwarleagues/wars/%23PPLYQ") {
      return json(200, {
        state: "inWar",
        attacksPerMember: 1,
        clan: { tag: "#99QQ", name: "Otros", members: [] },
        opponent: { tag: "#8888", name: "Nadie", members: [] },
      });
    }
    return json(500, { reason: "unexpected" });
  });
  const result = await loadClanReview("#2PP", { token: TOKEN, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.review.cwl.status, "active");
  assert.equal(result.review.cwl.wars.length, 0);
  assert.equal(calls.some((call) => call.url.includes("evil")), false);
  assert.equal(calls.some((call) => call.url.includes("NOTAG")), false);
});
