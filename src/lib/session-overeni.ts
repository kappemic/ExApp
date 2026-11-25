/**
 * Co odpověď `GET /api/me` znamená pro session. Výpadek není odhlášení:
 * odhlašuje jen 401 z našeho API. Síťová chyba, timeout, 5xx, 429 nebo cizí
 * stránka z přihlašovací brány Wi-Fi nechávají účet, jak byl.
 */
import { jeApiChyba, type ApiUser } from "../shared/api-types";

export type OdpovedBackendu =
  /** `VITE_API_BASE_URL` je prázdné: offline/demo klient. */
  | { druh: "neni" }
  /** Backend nastavený je, ale odpověď nepřišla. */
  | { druh: "sit" }
  | { druh: "odpoved"; status: number; telo: unknown };

export type StavSession =
  | { druh: "prihlasen"; user: ApiUser }
  | { druh: "odhlasen" }
  | { druh: "neznamy" };

export function vyhodnotSession(
  odpoved: OdpovedBackendu,
  ctiUsera: (telo: unknown) => ApiUser | null,
): StavSession {
  if (odpoved.druh !== "odpoved") return { druh: "neznamy" };
  if (odpoved.status === 200) {
    const user = ctiUsera(odpoved.telo);
    return user === null ? { druh: "neznamy" } : { druh: "prihlasen", user };
  }
  if (odpoved.status === 401 && jeApiChyba(odpoved.telo)) return { druh: "odhlasen" };
  return { druh: "neznamy" };
}
