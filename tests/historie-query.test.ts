/**
 * tests/historie-query.test.ts — Krok 3: historie `?stav=proběhlá&page/pageSize`.
 * Stavitel `expediceListUrl` + guard odpovědi s paginací z kontraktu
 * `src/shared/api-types.ts` (EXPEDITIONS_PATH, ExpediceListQuery, Strankovani).
 * Bez DB, bez HTTP — čistě hranice URL a tvar odpovědi. Strict TS, žádný `any`.
 */
import { describe, expect, it } from "vitest";
import {
  EXPEDITIONS_PATH,
  expediceListUrl,
  type ApiExpedice,
  type ExpediceListResponse,
  type Strankovani,
} from "../src/shared/api-types";

function dobraExpedice(): ApiExpedice {
  return {
    id: "abc",
    nazev: "Šumava — Tříjezerní slať",
    datum: "2099-06-12",
    datumDo: null,
    sraz: "Praha hl. n. 7:30",
    popis: "",
    trasaOdkaz: "",
    kapacita: { prihlaseno: 0, celkem: 10 },
    stav: "volno",
  };
}

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

function jeCeleKladne(hodnota: unknown, max?: number): boolean {
  if (typeof hodnota !== "number" || !Number.isInteger(hodnota)) return false;
  if (hodnota < 1) return false;
  if (max !== undefined && hodnota > max) return false;
  return true;
}

/** Guard kontraktu `Strankovani` (server: page ≥ 1, pageSize 1–100). */
function jeStrankovani(hodnota: unknown): hodnota is Strankovani {
  if (!jeRecord(hodnota)) return false;
  if (!jeCeleKladne(hodnota["page"])) return false;
  if (!jeCeleKladne(hodnota["pageSize"], 100)) return false;
  const totalItems = hodnota["totalItems"];
  if (
    typeof totalItems !== "number" ||
    !Number.isInteger(totalItems) ||
    totalItems < 0
  )
    return false;
  if (!jeCeleKladne(hodnota["totalPages"])) return false;
  return true;
}

/** Guard kontraktu `ExpediceListResponse` (pagination optional). */
function jeExpediceListOdpoved(hodnota: unknown): hodnota is ExpediceListResponse {
  if (!jeRecord(hodnota)) return false;
  if (!Array.isArray(hodnota["expedice"])) return false;
  const pagination = hodnota["pagination"];
  if (pagination === undefined) return true;
  return jeStrankovani(pagination);
}

function queryParams(url: string): URLSearchParams {
  const casti: string[] = url.split("?");
  const qs: string = casti[1] ?? "";
  return new URLSearchParams(qs);
}

describe("EXPEDITIONS_PATH — kontrakt listu", () => {
  it("je /api/expeditions", () => {
    expect(EXPEDITIONS_PATH).toBe("/api/expeditions");
  });
});

describe("expediceListUrl — stavba historie query", () => {
  it("prázdný query staví holou cestu (bez otazníku)", () => {
    expect(expediceListUrl({})).toBe("/api/expeditions");
  });

  it("?stav=proběhlá se kóduje a dekóduje zpět (historie)", () => {
    const url = expediceListUrl({ stav: "proběhlá" });
    expect(url.startsWith("/api/expeditions?")).toBe(true);
    expect(queryParams(url).get("stav")).toBe("proběhlá");
  });

  it("?page/pageSize kontrakt (page=2&pageSize=5)", () => {
    const url = expediceListUrl({ page: 2, pageSize: 5 });
    const params = queryParams(url);
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("5");
  });

  it("kombinace stav + stránkování v jedné URL", () => {
    const url = expediceListUrl({ stav: "proběhlá", page: 1, pageSize: 20 });
    const params = queryParams(url);
    expect(params.get("stav")).toBe("proběhlá");
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("20");
  });

  it("jen pageSize bez page staví platnou URL (server defaultuje page=1)", () => {
    const url = expediceListUrl({ pageSize: 20 });
    const params = queryParams(url);
    expect(params.get("pageSize")).toBe("20");
    expect(params.get("page")).toBeNull();
  });
});

describe("guard odpovědi s paginací — ExpediceListResponse", () => {
  it("bez pagination = vše (platná)", () => {
    expect(jeExpediceListOdpoved({ expedice: [] })).toBe(true);
    expect(
      jeExpediceListOdpoved({ expedice: [dobraExpedice()] }),
    ).toBe(true);
  });

  it("s pagination = stránka (kladná čísla, pageSize ≤ 100)", () => {
    expect(
      jeExpediceListOdpoved({
        expedice: [dobraExpedice()],
        pagination: { page: 2, pageSize: 5, totalItems: 11, totalPages: 3 },
      }),
    ).toBe(true);
  });

  it("page 0, pageSize 0 a pageSize 101 neprojdou (server vrací 422 page)", () => {
    const zaklad = { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 };
    expect(
      jeExpediceListOdpoved({
        expedice: [],
        pagination: { ...zaklad, page: 0 },
      }),
    ).toBe(false);
    expect(
      jeExpediceListOdpoved({
        expedice: [],
        pagination: { ...zaklad, pageSize: 0 },
      }),
    ).toBe(false);
    expect(
      jeExpediceListOdpoved({
        expedice: [],
        pagination: { ...zaklad, pageSize: 101 },
      }),
    ).toBe(false);
  });

  it("cizí tvary neprojdou (expedice není pole, pagination není objekt)", () => {
    expect(jeExpediceListOdpoved(null)).toBe(false);
    expect(jeExpediceListOdpoved({ expedice: "x" })).toBe(false);
    expect(
      jeExpediceListOdpoved({ expedice: [], pagination: "strana-1" }),
    ).toBe(false);
  });
});
