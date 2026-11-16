/**
 * Mention tokens in global chats. The message text is the only source.
 * Role tokens use a hyphen so they stay one word. A person is @user:<uuid>.
 */

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const TOKEN = `everyone|aktivni-clen|clen|rada|vedeni|admin|user:${UUID}`;

const VZOR = new RegExp(`(^|[\\s])@(${TOKEN})(?=$|[\\s.,!?;:])`, "g");

export type DruhZminky =
  | "everyone"
  | "clen"
  | "aktivni-clen"
  | "rada"
  | "vedeni"
  | "admin"
  | "uzivatel";

export interface Zminka {
  druh: DruhZminky;
  userId?: string;
}

export interface ClenProZminku {
  id: string;
  clenstvi: string;
  funkce: string | null;
  isAdmin: boolean;
  isSuperadmin: boolean;
}

export interface NabidkaZminky {
  token: string;
  popisek: string;
}

export const ROLE_ZMINKY: readonly NabidkaZminky[] = [
  { token: "@everyone", popisek: "Všichni" },
  { token: "@clen", popisek: "Člen" },
  { token: "@aktivni-clen", popisek: "Aktivní člen" },
  { token: "@rada", popisek: "Rada" },
  { token: "@vedeni", popisek: "Vedení" },
  { token: "@admin", popisek: "Admin" },
];

export type CastZpravy =
  | { druh: "text"; text: string }
  | { druh: "zminka"; klic: string; popisek: string };

function klicZminky(token: string): string {
  return token.startsWith("user:") ? `user:${token.slice(5).toLowerCase()}` : token;
}

export function rozparsujZminky(text: string): Zminka[] {
  const videne = new Set<string>();
  const vysledek: Zminka[] = [];
  for (const shoda of text.matchAll(VZOR)) {
    const token = shoda[2];
    if (token === undefined) continue;
    const klic = klicZminky(token);
    if (videne.has(klic)) continue;
    videne.add(klic);
    if (klic.startsWith("user:")) {
      vysledek.push({ druh: "uzivatel", userId: klic.slice(5) });
      continue;
    }
    vysledek.push({ druh: klic as DruhZminky });
  }
  return vysledek;
}

/** Who should be notified. The author is never included. */
export function idPrijemcu(
  zminky: readonly Zminka[],
  lide: readonly ClenProZminku[],
  autorId: string,
): string[] {
  const cile = new Set<string>();
  const autor = autorId.toLowerCase();
  for (const zminka of zminky) {
    for (const clovek of lide) {
      const id = clovek.id.toLowerCase();
      if (id === autor) continue;
      if (zminka.druh === "everyone") cile.add(id);
      else if (zminka.druh === "clen" && clovek.clenstvi === "clen") cile.add(id);
      else if (zminka.druh === "aktivni-clen" && clovek.clenstvi === "aktivni_clen") cile.add(id);
      else if (zminka.druh === "rada" && clovek.funkce === "rada") cile.add(id);
      else if (zminka.druh === "vedeni" && clovek.funkce === "vedeni") cile.add(id);
      else if (zminka.druh === "admin" && (clovek.isAdmin || clovek.isSuperadmin)) cile.add(id);
      else if (zminka.druh === "uzivatel" && zminka.userId === id) cile.add(id);
    }
  }
  return [...cile];
}

export function popisekZminky(
  klic: string,
  jmena: Readonly<Record<string, string>> = {},
): string {
  if (klic === "everyone") return "Všichni";
  if (klic === "clen") return "Člen";
  if (klic === "aktivni-clen") return "Aktivní člen";
  if (klic === "rada") return "Rada";
  if (klic === "vedeni") return "Vedení";
  if (klic === "admin") return "Admin";
  if (klic.startsWith("user:")) return jmena[klic.slice(5)] ?? "Člen";
  return klic;
}

/** Split a message so mentions can render as chips without HTML. */
export function castiZpravy(
  text: string,
  jmena: Readonly<Record<string, string>> = {},
): CastZpravy[] {
  const casti: CastZpravy[] = [];
  let od = 0;
  for (const shoda of text.matchAll(VZOR)) {
    const index = shoda.index ?? 0;
    const predpona = shoda[1] ?? "";
    const token = shoda[2];
    if (token === undefined) continue;
    const zacatek = index + predpona.length;
    if (zacatek > od) casti.push({ druh: "text", text: text.slice(od, zacatek) });
    const klic = klicZminky(token);
    casti.push({ druh: "zminka", klic, popisek: popisekZminky(klic, jmena) });
    od = zacatek + 1 + token.length;
  }
  if (od < text.length) casti.push({ druh: "text", text: text.slice(od) });
  if (casti.length === 0) casti.push({ druh: "text", text });
  return casti;
}

/** The @ fragment the caret is still typing, if any. */
export function rozpracovanaZminka(
  text: string,
  caret: number,
): { od: number; dotaz: string } | null {
  const doCaret = text.slice(0, Math.max(0, caret));
  const shoda = /(^|[\s])@([^\s@]*)$/.exec(doCaret);
  if (shoda === null || shoda.index === undefined) return null;
  return { od: shoda.index + shoda[1].length, dotaz: (shoda[2] ?? "").toLowerCase() };
}

export function nabidkyZminky(
  dotaz: string,
  lide: readonly { id: string; jmeno: string }[],
): NabidkaZminky[] {
  const q = dotaz.trim().toLowerCase();
  const role = ROLE_ZMINKY.filter(
    (nabidka) =>
      q.length === 0 ||
      nabidka.token.slice(1).toLowerCase().startsWith(q) ||
      nabidka.popisek.toLowerCase().startsWith(q),
  );
  const osoby = lide
    .filter((clovek) => q.length === 0 || clovek.jmeno.toLowerCase().includes(q))
    .slice(0, 8)
    .map((clovek) => ({ token: `@user:${clovek.id}`, popisek: clovek.jmeno }));
  return [...role, ...osoby].slice(0, 12);
}

export function vlozZminku(text: string, od: number, caret: number, token: string): string {
  const pred = text.slice(0, od);
  const za = text.slice(Math.max(od, caret)).replace(/^\s/, "");
  return `${pred}${token} ${za}`;
}
