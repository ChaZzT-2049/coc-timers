const TAG_BODY = /^[0289PYLQGRJCUV]{3,12}$/;

export function normalizeTag(input) {
  const raw = String(input ?? "").trim().toUpperCase();
  if (!raw) return { ok: false, error: "empty_tag" };
  const body = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!TAG_BODY.test(body)) return { ok: false, error: "invalid_tag" };
  return { ok: true, tag: `#${body}` };
}

export function tagsEqual(left, right) {
  const a = normalizeTag(left);
  const b = normalizeTag(right);
  return a.ok && b.ok && a.tag === b.tag;
}
