const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KLIC_RE = new RegExp(`^soukrome:(${UUID}):(${UUID})$`, "i");

/** Shared key for one pair. Uuids are sorted so both people open the same thread. */
export function klicSoukromehoChatu(a: string, b: string): string | null {
  const prvni = a.trim().toLowerCase();
  const druhy = b.trim().toLowerCase();
  if (!new RegExp(`^${UUID}$`, "i").test(prvni)) return null;
  if (!new RegExp(`^${UUID}$`, "i").test(druhy)) return null;
  if (prvni === druhy) return null;
  const [nizsi, vyssi] = prvni < druhy ? [prvni, druhy] : [druhy, prvni];
  return `soukrome:${nizsi}:${vyssi}`;
}

/** The two account ids, or null when the key is not a private thread. */
export function ucastniciSoukromeho(klic: string): [string, string] | null {
  const shoda = KLIC_RE.exec(klic.trim());
  const a = shoda?.[1]?.toLowerCase();
  const b = shoda?.[2]?.toLowerCase();
  if (a === undefined || b === undefined) return null;
  if (klicSoukromehoChatu(a, b) !== `soukrome:${a}:${b}`) return null;
  return [a, b];
}

export function jeUcastnikSoukromeho(klic: string, userId: string): boolean {
  const par = ucastniciSoukromeho(klic);
  if (par === null) return false;
  const ja = userId.trim().toLowerCase();
  return par[0] === ja || par[1] === ja;
}

export function partnerSoukromeho(klic: string, userId: string): string | null {
  const par = ucastniciSoukromeho(klic);
  if (par === null) return null;
  const ja = userId.trim().toLowerCase();
  if (par[0] === ja) return par[1];
  if (par[1] === ja) return par[0];
  return null;
}
