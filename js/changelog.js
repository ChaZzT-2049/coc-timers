const CHANGELOG_URL = "./changelog.json";
const SEEN_KEY = "coc-timers:changelog-seen";

export async function loadChangelog() {
  const response = await fetch(`${CHANGELOG_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("changelog");
  const data = await response.json();
  const releases = Array.isArray(data.releases) ? data.releases : [];
  const latest = Number(data.latest) || Math.max(0, ...releases.map((item) => Number(item.id) || 0));
  return {
    latest,
    releases: releases
      .map((item) => ({
        id: Number(item.id) || 0,
        date: String(item.date || ""),
        title: String(item.title || ""),
        notes: Array.isArray(item.notes) ? item.notes.map((note) => String(note)) : [],
      }))
      .filter((item) => item.id > 0)
      .sort((a, b) => b.id - a.id),
  };
}

export function seenChangelogId() {
  return Number(localStorage.getItem(SEEN_KEY) || 0);
}

export function markChangelogSeen(latest) {
  const id = Number(latest) || 0;
  if (id) localStorage.setItem(SEEN_KEY, String(id));
}

export function unseenReleases(changelog) {
  const seen = seenChangelogId();
  const latest = changelog?.latest || 0;
  if (!latest || seen >= latest) return [];
  const newer = (changelog.releases || []).filter((item) => item.id > seen);
  if (!seen) return newer.slice(0, 1);
  return newer;
}
