import type { ApiZprava } from "../shared/api-types";

/** Open thread refresh. Unread overview stays on its own 30s poll. */
export const INTERVAL_ZIVYCH_ZPRAV_MS: number = 4_000;

/** Stay pinned to the latest message when the user is this close to the end. */
export const PRAH_DNA_PX: number = 120;

/** How long a deleted bubble takes to fold away. */
export const ODCHOD_ZPRAVY_MS: number = 240;

/** Skip the fold when the reader asked for less motion. */
export function dobaOdchoduZpravy(): number {
  if (typeof matchMedia !== "function") return ODCHOD_ZPRAVY_MS;
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ODCHOD_ZPRAVY_MS;
}

export interface VolbySlouceni {
  /** Sent locally, kept until a later poll includes the same id. */
  drzet?: readonly ApiZprava[];
  /** Deleted locally, hidden even if an in-flight poll still returns them. */
  skrytId?: ReadonlySet<string>;
  /**
   * Server payload is the latest page, not the oldest one.
   * Messages older than that page stay on screen.
   */
  konecOkna?: boolean;
}

export interface VysledekSlouceni {
  zpravy: ApiZprava[];
  /** Ids that were not in the local thread (optimistic ids excluded). */
  novaId: string[];
  /** Non-optimistic id set changed (append or delete). */
  zmenilaSeSada: boolean;
}

export interface ScrollKontejner {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function jeOptimistickeId(id: string): boolean {
  return id.startsWith("optimistic-");
}

function poradi(a: ApiZprava, b: ApiZprava): number {
  const cas: number = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (cas !== 0 && !Number.isNaN(cas)) return cas;
  return a.id.localeCompare(b.id);
}

function serad(zpravy: readonly ApiZprava[]): ApiZprava[] {
  return [...zpravy].sort(poradi);
}

function sadaId(zpravy: readonly ApiZprava[]): string {
  return zpravy
    .filter((zprava) => !jeOptimistickeId(zprava.id))
    .map((zprava) => zprava.id)
    .sort()
    .join("\0");
}

/**
 * Server page wins. Optimistic bubbles stay until a new server row matches
 * the same author and text, or the server returns the same id. Held messages
 * cover the race where send lands before the poll response.
 */
export function vyhodnotSlouceni(
  mistni: readonly ApiZprava[],
  zeServeru: readonly ApiZprava[],
  volby: VolbySlouceni = {},
): VysledekSlouceni {
  const skryt: ReadonlySet<string> = volby.skrytId ?? new Set<string>();
  const server: ApiZprava[] = zeServeru.filter((zprava) => !skryt.has(zprava.id));
  const serverId: Set<string> = new Set(server.map((zprava) => zprava.id));
  const mistniId: Set<string> = new Set(mistni.map((zprava) => zprava.id));
  let kSlouceni: readonly ApiZprava[] = mistni;
  let starsi: ApiZprava[] = [];
  if (volby.konecOkna === true && server.length > 0) {
    const hranice: ApiZprava = server.reduce((min, zprava) => (poradi(zprava, min) < 0 ? zprava : min));
    starsi = mistni.filter(
      (zprava) => !jeOptimistickeId(zprava.id) && !skryt.has(zprava.id) && poradi(zprava, hranice) < 0,
    );
    const starsiId: Set<string> = new Set(starsi.map((zprava) => zprava.id));
    kSlouceni = mistni.filter((zprava) => !starsiId.has(zprava.id));
  }
  const neparovaneNove: ApiZprava[] = server.filter((zprava) => !mistniId.has(zprava.id));
  const optimisticke: ApiZprava[] = [];

  for (const zprava of kSlouceni) {
    if (!jeOptimistickeId(zprava.id) || serverId.has(zprava.id)) continue;
    const shoda: number = neparovaneNove.findIndex(
      (kandidat) => kandidat.text === zprava.text && kandidat.autorId === zprava.autorId,
    );
    if (shoda >= 0) {
      neparovaneNove.splice(shoda, 1);
      continue;
    }
    optimisticke.push(zprava);
  }

  const videne: Set<string> = new Set(server.map((zprava) => zprava.id));
  const drzene: ApiZprava[] = [];
  for (const zprava of volby.drzet ?? []) {
    if (skryt.has(zprava.id) || videne.has(zprava.id) || jeOptimistickeId(zprava.id)) continue;
    videne.add(zprava.id);
    drzene.push(zprava);
  }

  const zpravy: ApiZprava[] = serad([...starsi, ...server, ...optimisticke, ...drzene]);
  const novaId: string[] = zpravy
    .filter((zprava) => !mistniId.has(zprava.id) && !jeOptimistickeId(zprava.id))
    .map((zprava) => zprava.id);

  return {
    zpravy,
    novaId,
    zmenilaSeSada: sadaId(mistni) !== sadaId(zpravy),
  };
}

export function slucVlakno(
  mistni: readonly ApiZprava[],
  zeServeru: readonly ApiZprava[],
  volby: VolbySlouceni = {},
): ApiZprava[] {
  return vyhodnotSlouceni(mistni, zeServeru, volby).zpravy;
}

/** Skip a React update when the visible thread did not change. */
export function vlaknaSeLisi(
  predchozi: readonly ApiZprava[],
  dalsi: readonly ApiZprava[],
): boolean {
  if (predchozi.length !== dalsi.length) return true;
  for (let i = 0; i < predchozi.length; i += 1) {
    const a: ApiZprava | undefined = predchozi[i];
    const b: ApiZprava | undefined = dalsi[i];
    if (a === undefined || b === undefined) return true;
    if (
      a.id !== b.id ||
      a.text !== b.text ||
      a.authorName !== b.authorName ||
      a.authorAvatarUrl !== b.authorAvatarUrl ||
      a.createdAt !== b.createdAt ||
      a.autorId !== b.autorId
    ) {
      return true;
    }
  }
  return false;
}

export function jsemUDna(prvek: ScrollKontejner, prah: number = PRAH_DNA_PX): boolean {
  return prvek.scrollHeight - prvek.scrollTop - prvek.clientHeight <= prah;
}

/** Pin to the end at the bottom, or when the new row is the current user's. */
export function maScrollovatNaNove(
  uDna: boolean,
  nove: readonly Pick<ApiZprava, "autorId">[],
  currentUserId: string | null,
): boolean {
  if (nove.length === 0) return false;
  if (uDna) return true;
  if (currentUserId === null) return false;
  return nove.some((zprava) => zprava.autorId === currentUserId);
}

/** Remove one message immediately; the server call follows. */
export function odeberZpravu(
  zpravy: readonly ApiZprava[],
  id: string,
): ApiZprava[] {
  return zpravy.filter((zprava) => zprava.id !== id);
}

/** Put a message back in time order after a failed delete. */
export function vratZpravu(
  zpravy: readonly ApiZprava[],
  zprava: ApiZprava,
): ApiZprava[] {
  if (zpravy.some((polozka) => polozka.id === zprava.id)) return [...zpravy];
  return serad([...zpravy, zprava]);
}
