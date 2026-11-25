/**
 * Offline přístup: výpadek není odhlášení, kopie účtu nenese tajemství
 * a data v telefonu patří jen svému majiteli.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vyhodnotSession } from "../src/lib/session-overeni";
import {
  KLIC_CEKA_ODHLASENI,
  KLIC_JEN_RELACE,
  KLIC_MAJITELE,
  KLIC_UCTU,
  PLATNOST_UCTU_MS,
  jeApiUser,
  nactiUcet,
  nastavCekaOdhlaseni,
  nastavTrvalost,
  prevezmiData,
  smazSoukromaData,
  smazUcet,
  ulozUcet,
  type DvojiUloziste,
  type Uloziste,
} from "../src/lib/ulozeny-ucet";
import {
  CEKANI_NA_SIT_MS,
  HISTORIE_PREFIX,
  OFFLINE_HLAVICKA,
  jeHistorickeCteni,
  klicHistorickeCache,
  nactiHistorii,
  obsluzHistorickeVolani,
  ulozHistorii,
  zapniOfflineHistorii,
} from "../src/lib/pwa-historie";
import { maSpojeni, oznamSpojeni, sledujSpojeni } from "../src/lib/spojeni";
import { KLIC_KNIHY } from "../src/lib/zpevnik-offline";
import type { ApiUser } from "../src/shared/api-types";

interface Pamet extends Uloziste {
  klice(): string[];
}

function pamet(zaklad: Record<string, string> = {}): Pamet {
  const mapa = new Map<string, string>(Object.entries(zaklad));
  return {
    getItem: (klic) => mapa.get(klic) ?? null,
    setItem: (klic, hodnota) => {
      mapa.set(klic, hodnota);
    },
    removeItem: (klic) => {
      mapa.delete(klic);
    },
    key: (index) => [...mapa.keys()][index] ?? null,
    get length() {
      return mapa.size;
    },
    klice: () => [...mapa.keys()].sort(),
  };
}

function telefon(): { trvale: Pamet; relace: Pamet } {
  return { trvale: pamet(), relace: pamet() };
}

const UCET = {
  id: "ucet-a",
  email: "a@example.cz",
  jmeno: "Anna",
  prijmeni: "Nováková",
  telefon: "+420777123456",
  discordNick: "anna",
  role: "admin",
  authRole: "ADMIN",
  clenstvi: "aktivni_clen",
  funkce: "vedeni",
  isAdmin: true,
  isSuperadmin: false,
  stravaId: "12345",
  avatarUrl: null,
  bio: "soukromé bio",
  narozeniny: "2010-01-01",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as ApiUser;

const ctiUsera = (telo: unknown): ApiUser | null => (jeApiUser(telo) ? telo : null);
const CHYBA_401 = { error: { code: "NEPRIHLASEN", message: "Přihlas se znovu." } };

describe("vyhodnotSession", () => {
  it("200 s profilem je přihlášení", () => {
    expect(vyhodnotSession({ druh: "odpoved", status: 200, telo: UCET }, ctiUsera)).toEqual({
      druh: "prihlasen",
      user: UCET,
    });
  });

  it("odhlašuje jen 401 z našeho API", () => {
    const ano = vyhodnotSession({ druh: "odpoved", status: 401, telo: CHYBA_401 }, ctiUsera);
    const cizi = vyhodnotSession({ druh: "odpoved", status: 401, telo: null }, ctiUsera);
    expect(ano.druh).toBe("odhlasen");
    expect(cizi.druh).toBe("neznamy");
  });

  it("výpadek sítě, 5xx, 429 ani cizí stránka neznamenají odhlášení", () => {
    expect(vyhodnotSession({ druh: "sit" }, ctiUsera).druh).toBe("neznamy");
    for (const status of [200, 403, 404, 429, 500, 502, 503, 504]) {
      const stav = vyhodnotSession({ druh: "odpoved", status, telo: null }, ctiUsera);
      expect(stav.druh).toBe("neznamy");
    }
  });
});

describe("uložený účet", () => {
  it("vrátí naposledy ověřený účet i s rolí pro zobrazení", () => {
    const u = telefon();
    ulozUcet(UCET, 1000, u);
    expect(nactiUcet(2000, u)).toMatchObject({ id: "ucet-a", jmeno: "Anna", isAdmin: true });
  });

  it("neukládá token, heslo ani osobní údaje mimo výčet", () => {
    const u = telefon();
    const sPridanym = { ...UCET, token: "tajne", passwordHash: "hash", exapp_session: "jwt" };
    ulozUcet(sPridanym, 1000, u);
    const surovy = u.trvale.getItem(KLIC_UCTU) ?? "";
    expect(surovy).toContain("Anna");
    for (const tajne of ["tajne", "hash", "jwt", "777123456", "soukromé bio", "2010-01-01", "12345"]) {
      expect(surovy).not.toContain(tajne);
    }
  });

  it("starou nebo poškozenou kopii zahodí", () => {
    const u = telefon();
    ulozUcet(UCET, 0, u);
    expect(nactiUcet(PLATNOST_UCTU_MS + 1, u)).toBeNull();
    expect(u.trvale.getItem(KLIC_UCTU)).toBeNull();
    u.trvale.setItem(KLIC_UCTU, "{rozbité");
    expect(nactiUcet(1, u)).toBeNull();
    u.trvale.setItem(KLIC_UCTU, JSON.stringify({ user: { id: "x" }, overeno: 1 }));
    expect(nactiUcet(1, u)).toBeNull();
  });

  it("bez „Zůstat přihlášený“ žije jen do zavření aplikace", () => {
    const u = telefon();
    ulozUcet(UCET, 1, u);
    nastavTrvalost(false, u);
    ulozUcet(UCET, 2, u);
    expect(u.trvale.klice()).toEqual([KLIC_JEN_RELACE]);
    expect(nactiUcet(3, u)?.id).toBe("ucet-a");
    expect(nactiUcet(3, { trvale: u.trvale, relace: pamet() })).toBeNull();
    nastavTrvalost(true, u);
    ulozUcet(UCET, 4, u);
    expect(u.trvale.klice()).toEqual([KLIC_UCTU]);
    expect(u.relace.klice()).toEqual([]);
  });

  it("po odhlášení bez sítě se neobnoví, ani když kopie zůstane", () => {
    const u = telefon();
    ulozUcet(UCET, 1, u);
    nastavCekaOdhlaseni(true, u);
    expect(nactiUcet(2, u)).toBeNull();
    nastavCekaOdhlaseni(false, u);
    expect(u.trvale.getItem(KLIC_CEKA_ODHLASENI)).toBeNull();
  });

  it("chybějící nebo zakázané úložiště nic neshodí", () => {
    const spadni = (): never => {
      throw new Error("zakázáno");
    };
    const zakazane: Uloziste = {
      getItem: spadni,
      setItem: spadni,
      removeItem: spadni,
      key: spadni,
      length: 1,
    };
    const moznosti: DvojiUloziste[] = [
      { trvale: null, relace: null },
      { trvale: zakazane, relace: zakazane },
    ];
    for (const u of moznosti) {
      ulozUcet(UCET, 1, u);
      prevezmiData("ucet-a", u);
      smazSoukromaData({ iZpevnik: true }, u);
      smazUcet(u);
      expect(nactiUcet(1, u)).toBeNull();
    }
  });
});

describe("soukromá data mají majitele", () => {
  const DATA: Record<string, string> = {
    [`${HISTORIE_PREFIX}/api/expeditions`]: "{}",
    "exapp:konverzace-v1": "[]",
    "exapp:discussion-unread-v1": "{}",
    "exapp:discussion-lastRead-v1:vyprava": "x",
    "exapp-demo-kody": "[]",
    [KLIC_KNIHY]: "[]",
    "exapp:zpevnik:cteni": "{}",
  };

  function sDaty(majitel?: string): { trvale: Pamet; relace: Pamet } {
    const navic: Record<string, string> = majitel === undefined ? {} : { [KLIC_MAJITELE]: majitel };
    return { trvale: pamet({ ...DATA, ...navic }), relace: pamet() };
  }

  it("odhlášení smaže data i zpěvník, nastavení čtení nechá", () => {
    const u = sDaty("ucet-a");
    smazSoukromaData({ iZpevnik: true }, u);
    expect(u.trvale.klice()).toEqual(["exapp:zpevnik:cteni"]);
  });

  it("vypršená session smaže soukromá data, zpěvník klubu nechá", () => {
    const u = sDaty("ucet-a");
    smazSoukromaData({ iZpevnik: false }, u);
    expect(u.trvale.klice()).toEqual([KLIC_KNIHY, KLIC_MAJITELE, "exapp:zpevnik:cteni"].sort());
  });

  it("stejnému účtu data zůstanou, jinému se smažou", () => {
    const stejny = sDaty("ucet-a");
    prevezmiData("ucet-a", stejny);
    expect(stejny.trvale.length).toBe(Object.keys(DATA).length + 1);

    const jiny = sDaty("ucet-a");
    prevezmiData("ucet-b", jiny);
    expect(jiny.trvale.klice()).toEqual([KLIC_MAJITELE, "exapp:zpevnik:cteni"].sort());
    expect(jiny.trvale.getItem(KLIC_MAJITELE)).toBe("ucet-b");
  });

  it("data bez majitele ze starší verze nepřevezme", () => {
    const u = sDaty();
    prevezmiData("ucet-a", u);
    expect(u.trvale.getItem("exapp:konverzace-v1")).toBeNull();
    expect(u.trvale.getItem(KLIC_KNIHY)).not.toBeNull();
  });
});

describe("čtení z kopie při výpadku", () => {
  const URL_SEZNAMU = "/api/expeditions";
  const KLIC = klicHistorickeCache(URL_SEZNAMU);

  function visiciSit(): { sit: typeof fetch; dorazi: (odpoved: Response) => void } {
    let hotovo: (odpoved: Response) => void = () => undefined;
    const cekani = new Promise<Response>((vyres) => {
      hotovo = vyres;
    });
    return { sit: () => cekani, dorazi: (odpoved) => hotovo(odpoved) };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("přidává účastníky, trasy žebříčku a moje statistiky, nic dalšího", () => {
    expect(jeHistorickeCteni("GET", "/api/expeditions/abc/ucastnici")).toBe(true);
    expect(jeHistorickeCteni("GET", "/api/zebricky/trasy?obdobi=celkem")).toBe(true);
    expect(jeHistorickeCteni("GET", "/api/statistiky/moje")).toBe(true);
    expect(jeHistorickeCteni("POST", "/api/expeditions/abc/ucastnici")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/expeditions/abc/fotky")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/expeditions/abc/zpravy")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/statistiky")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/me")).toBe(false);
    expect(jeHistorickeCteni("GET", "/api/users")).toBe(false);
  });

  it("5xx nahradí kopií, 401, 403 a 404 předá", async () => {
    const u = pamet();
    ulozHistorii(u, KLIC, '{"expedice":[]}');
    const stav = (status: number): typeof fetch => async () => new Response("{}", { status });
    const vypadek = await obsluzHistorickeVolani(URL_SEZNAMU, undefined, stav(503), u);
    expect(vypadek.status).toBe(200);
    expect(vypadek.headers.get(OFFLINE_HLAVICKA)).toBe("1");
    for (const status of [401, 403, 404]) {
      const odpoved = await obsluzHistorickeVolani(URL_SEZNAMU, undefined, stav(status), u);
      expect(odpoved.status).toBe(status);
    }
  });

  it("bez kopie předá výpadek dál", async () => {
    const padla: typeof fetch = async () => new Response("", { status: 502 });
    const odpoved = await obsluzHistorickeVolani(URL_SEZNAMU, undefined, padla, pamet());
    expect(odpoved.status).toBe(502);
  });

  it("visící spojení po chvíli ukáže kopii a pozdní odpověď ji obnoví", async () => {
    vi.useFakeTimers();
    const u = pamet();
    ulozHistorii(u, KLIC, '{"expedice":["stará"]}');
    const { sit, dorazi } = visiciSit();
    const volani = obsluzHistorickeVolani(URL_SEZNAMU, undefined, sit, u);
    await vi.advanceTimersByTimeAsync(CEKANI_NA_SIT_MS);
    expect(await (await volani).text()).toContain("stará");
    dorazi(new Response('{"expedice":["nová"]}', { status: 200 }));
    vi.useRealTimers();
    await vi.waitFor(() => expect(nactiHistorii(u, KLIC)).toContain("nová"));
  });

  it("odpověď rozběhnutá před odhlášením se už neuloží", async () => {
    const u = pamet();
    const { sit, dorazi } = visiciSit();
    const volani = obsluzHistorickeVolani(URL_SEZNAMU, undefined, sit, u);
    smazSoukromaData({ iZpevnik: true }, { trvale: u, relace: null });
    dorazi(new Response('{"expedice":[]}', { status: 200 }));
    await volani;
    expect(u.length).toBe(0);
  });

  it("zrušené volání kopii nevrací", async () => {
    const u = pamet();
    ulozHistorii(u, KLIC, "{}");
    const zruseno = Object.assign(new Error("zrušeno"), { name: "AbortError" });
    const sit: typeof fetch = async () => {
      throw zruseno;
    };
    await expect(obsluzHistorickeVolani(URL_SEZNAMU, undefined, sit, u)).rejects.toBe(zruseno);
  });
});

describe("stav spojení", () => {
  const ZNACKA = "__exappZapnutaOfflineHistorie";

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { [klic: string]: unknown })[ZNACKA];
    oznamSpojeni(true);
  });

  it("výpadek našeho API ho shodí, odpověď vrátí, cizí adresa a zrušení nic", async () => {
    vi.stubGlobal("__EXAPP_API_BASE__", "https://app.example");
    const sit = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", sit);
    zapniOfflineHistorii(pamet());
    const zmeny = vi.fn();
    const zrus = sledujSpojeni(zmeny);

    sit.mockRejectedValueOnce(new TypeError("Load failed"));
    await expect(fetch("https://jinde.example/api/x")).rejects.toThrow();
    sit.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "AbortError" }));
    await expect(fetch("https://app.example/api/alba")).rejects.toThrow();
    expect(maSpojeni()).toBe(true);

    sit.mockRejectedValueOnce(new TypeError("Load failed"));
    await expect(fetch("https://app.example/api/alba")).rejects.toThrow();
    expect(maSpojeni()).toBe(false);

    sit.mockResolvedValueOnce(new Response("", { status: 500 }));
    await fetch("https://app.example/api/alba");
    expect(maSpojeni()).toBe(false);

    sit.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await fetch("https://app.example/api/alba");
    expect(maSpojeni()).toBe(true);
    expect(zmeny).toHaveBeenCalledTimes(2);
    zrus();
  });
});

describe("napojení v klientovi", () => {
  const zdroj = (cesta: string): string =>
    readFileSync(new URL(`../${cesta}`, import.meta.url), "utf8");

  it("výpadek sítě nespadne na demo účty", () => {
    const auth = zdroj("src/hooks/useAuth.ts");
    expect(auth).toContain("chyba: BEZ_SPOJENI_PRIHLASENI");
    expect(auth).toContain("chyba: BEZ_SPOJENI_REGISTRACE");
    expect(auth).toContain("throw new Error(BEZ_SPOJENI_NOVY_KOD)");
    expect(auth).toContain('else if (stav.druh === "odhlasen") zahodUcet(false)');
  });

  it("odhlášení smaže účet i data a bez sítě se dokončí později", () => {
    const auth = zdroj("src/hooks/useAuth.ts");
    const odhlasit = auth.slice(auth.indexOf("const odhlasit ="), auth.indexOf("const generujKod ="));
    expect(odhlasit).toContain("nastavCekaOdhlaseni(true)");
    expect(odhlasit).toContain("zahodUcet(true)");
  });

  it("neověřený start bez účtu nevede na přihlášení", () => {
    const brana = zdroj("src/components/Auth/RequireAuth.tsx");
    const vysvetleni = brana.indexOf("<BezUctuOffline />");
    expect(vysvetleni).toBeGreaterThan(0);
    expect(vysvetleni).toBeLessThan(brana.indexOf("<Navigate to"));
    expect(zdroj("src/pages/DomuPage.tsx")).toContain("if (bezOvereni) return <BezUctuOffline />");
  });

  it("přehled konverzací se z telefonu bere až pro známý účet", () => {
    const prehled = zdroj("src/hooks/useKonverzacePrehled.tsx");
    expect(prehled).toContain("idUctu === null ? [] : ctiKonverzaceZCache()");
    expect(prehled).toContain("useState<ApiKonverzace[]>([])");
  });
});
