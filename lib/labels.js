const ROLES = {
  leader: "Líder",
  coLeader: "Colíder",
  admin: "Anciano",
  member: "Miembro",
};

const WAR_FREQUENCY = {
  always: "Siempre",
  moreThanOncePerWeek: "Más de una por semana",
  oncePerWeek: "Una por semana",
  lessThanOncePerWeek: "Menos de una por semana",
  never: "Nunca",
  unknown: "No indicada",
};

const CLAN_TYPE = {
  open: "Abierto",
  inviteOnly: "Solo con invitación",
  closed: "Cerrado",
};

const WAR_STATE = {
  inWar: "En guerra",
  preparation: "Preparación",
  warEnded: "Guerra terminada",
  notInWar: "Sin guerra",
  ended: "Temporada terminada",
};

const HEROES = {
  "Barbarian King": "Rey bárbaro",
  "Archer Queen": "Reina arquera",
  "Grand Warden": "Gran centinela",
  "Royal Champion": "Campeona real",
  "Minion Prince": "Príncipe minion",
  "Battle Machine": "Máquina de guerra",
  "Battle Copter": "Helicóptero de combate",
};

const DISTRICTS = {
  "Capital Peak": "Pico de la capital",
  "Barbarian Camp": "Campamento bárbaro",
  "Wizard Valley": "Valle del mago",
  "Balloon Lagoon": "Laguna de los globos",
  "Builder's Workshop": "Taller del constructor",
  "Dragon Cliffs": "Acantilados del dragón",
  "Golem Quarry": "Cantera de gólems",
  "Skeleton Park": "Parque esqueleto",
  "Goblin Mines": "Minas goblin",
  "Graveyard": "Cementerio",
  "Wizard's Peak": "Pico del mago",
};

const LEAGUE_PATTERNS = [
  [/Legend League/gi, "Liga leyenda"],
  [/Titan League/gi, "Liga titán"],
  [/Electro League/gi, "Liga electro"],
  [/Champion League/gi, "Liga campeón"],
  [/Master League/gi, "Liga de maestros"],
  [/Crystal League/gi, "Liga de cristal"],
  [/Gold League/gi, "Liga de oro"],
  [/Silver League/gi, "Liga de plata"],
  [/Bronze League/gi, "Liga de bronce"],
  [/Unranked/gi, "Sin clasificar"],
];

export function roleLabel(role) {
  return ROLES[role] || "Miembro";
}

export function warFrequencyLabel(value) {
  if (!value) return "No indicada";
  return WAR_FREQUENCY[value] || "No indicada";
}

export function clanTypeLabel(value) {
  if (!value) return "No indicado";
  return CLAN_TYPE[value] || "No indicado";
}

export function warStateLabel(value) {
  if (!value) return "Sin dato";
  return WAR_STATE[value] || "Sin dato";
}

export function heroName(name) {
  if (!name) return "Héroe";
  return HEROES[name] || name;
}

export function districtName(name) {
  if (!name) return "Distrito";
  return DISTRICTS[name] || name;
}

export function leagueName(name) {
  if (!name) return "Sin liga";
  let text = String(name);
  for (const [pattern, replacement] of LEAGUE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function countLabel(count, one, many) {
  const n = Number(count) || 0;
  return `${n} ${n === 1 ? one : many}`;
}
