/**
 * tests/diskuze-step2.test.ts — Step 2: jména + seskupení + guard (TDD RED).
 *
 * Bez DB, bez HTTP — čistě kontrakt + čistá logika + mock fetch:
 * - GET diskuze JOIN User → authorName (jmeno+prijmeni, fallback
 *   discordNick/email/Bývalý člen; SET NULL drží snapshot autor_jmeno).
 * - GET konverzace [{key, expeditionId, channel, lastMessage, unreadCount}].
 * - POST guard channel=dulezite jen vedeni/rada/admin (jinak 403),
 *   general každý přihlášený.
 * - POST read lastReadAt (upsert per-user, čas razí server).
 * Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GLOBALNI_ZPRAVY_PATH,
  KONVERZACE_PATH,
  KONVERZACE_READ_PATH,
  MATICE_KONVERZACE,
  PRISTUP_KONVERZACE,
  jeApiKonverzace,
  jeKanalDiskuze,
  jeKonverzaceOdpoved,
  konverzaceReadPath,
  type ApiKonverzace,
  type ApiZprava,
} from "../src/shared/api-types";
import {
  BYVALY_CLEN,
  seskupKonverzace,
  slozAuthorName,
  smiPsatKanal,
  toApiZprava,
  type ProfilProJmeno,
  type ProfilProPravo,
} from "../server/src/diskuze";
import {
  getKonverzace,
  oznacKonverzaciJakoPrectenou,
  posliGlobalZpravu,
} from "../src/lib/diskuze-api";

const API_ZAKLAD = "https://api.test";

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dbRadek(overrides: Record<string, unknown> = {}): {
  id: string;
  expediceId: string | null;
  kanal: string;
  autorId: string | null;
  autorJmeno: string;
  text: string;
  createdAt: Date;
  smazanoAt: Date | null;
} {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    expediceId: "sumava-2026",
    kanal: "expedice",
    autorId: "22222222-2222-4222-8222-222222222222",
    autorJmeno: "Jan Novák",
    text: "Ahoj z výpravy",
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    smazanoAt: null,
    ...overrides,
  } as {
    id: string;
    expediceId: string | null;
    kanal: string;
    autorId: string | null;
    autorJmeno: string;
    text: string;
    createdAt: Date;
    smazanoAt: Date | null;
  };
}

function profilJmeno(overrides: Partial<ProfilProJmeno> = {}): ProfilProJmeno {
  return {
    jmeno: "Jan",
    prijmeni: "Novák",
    discordNick: null,
    email: "jan@example.cz",
    ...overrides,
  };
}

function pravo(overrides: Partial<ProfilProPravo> = {}): ProfilProPravo {
  return { funkce: null, isAdmin: false, ...overrides };
}

function dobraZprava(overrides: Partial<ApiZprava> = {}): ApiZprava {
  return {
    id: "z1",
    expeditionId: "sumava-2026",
    autorId: "u1",
    authorName: "Jan Novák",
    channel: "expedice",
    text: "Ahoj",
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

function dobraKonverzace(overrides: Partial<ApiKonverzace> = {}): ApiKonverzace {
  return {
    key: "general",
    expeditionId: null,
    channel: "general",
    lastMessage: dobraZprava({
      id: "g1",
      expeditionId: null,
      channel: "general",
    }),
    unreadCount: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("slozAuthorName — JOIN User → authorName", () => {
  it("složí jmeno + prijmeni", () => {
    expect(slozAuthorName(profilJmeno(), "")).toBe("Jan Novák");
  });

  it("prázdné jméno padá na discordNick", () => {
    expect(
      slozAuthorName(
        profilJmeno({ jmeno: "  ", prijmeni: "" , discordNick: "honza_d"}),
        "",
      ),
    ).toBe("honza_d");
  });

  it("bez nicku padá na e-mail", () => {
    expect(
      slozAuthorName(
        profilJmeno({ jmeno: "", prijmeni: "", discordNick: null }),
        "",
      ),
    ).toBe("jan@example.cz");
  });

  it("SET NULL drží snapshot autor_jmeno", () => {
    expect(slozAuthorName(null, "Jan Novák")).toBe("Jan Novák");
  });

  it("SET NULL bez snapshotu → Bývalý člen", () => {
    expect(slozAuthorName(null, "")).toBe(BYVALY_CLEN);
    expect(BYVALY_CLEN).toBe("Bývalý člen");
  });
});

describe("toApiZprava — jména bez extra fetch (JOIN v odpovědi)", () => {
  it("nese authorName z JOINu (živé jméno má přednost před snapshotem)", () => {
    const api = toApiZprava(dbRadek({ autorJmeno: "Staré Jméno" }), profilJmeno());
    expect(api?.authorName).toBe("Jan Novák");
    expect(api?.channel).toBe("expedice");
    expect(api?.expeditionId).toBe("sumava-2026");
  });

  it("globál nese expeditionId null + channel", () => {
    const api = toApiZprava(
      dbRadek({ expediceId: null, kanal: "general", autorJmeno: "" }),
      profilJmeno(),
    );
    expect(api?.expeditionId).toBeNull();
    expect(api?.channel).toBe("general");
    expect(api?.authorName).toBe("Jan Novák");
    expect(api?.authorAvatarUrl).toBeNull();
  });

  it("nese https avatar autora z JOINu", () => {
    const api = toApiZprava(
      dbRadek({ autorJmeno: "Staré Jméno" }),
      profilJmeno({ avatarUrl: "https://cdn.test/jan.jpg" }),
    );
    expect(api?.authorAvatarUrl).toBe("https://cdn.test/jan.jpg");
  });

  it("porušený CHECK (kanal expedice + NULL expedice) → null", () => {
    expect(toApiZprava(dbRadek({ expediceId: null, kanal: "expedice" }), profilJmeno())).toBeNull();
  });

  it("porušený CHECK (globál + NOT NULL expedice) → null", () => {
    expect(
      toApiZprava(dbRadek({ expediceId: "x", kanal: "general" }), profilJmeno()),
    ).toBeNull();
  });

  it("neznámý kanál → null", () => {
    expect(toApiZprava(dbRadek({ kanal: "tajne" }), profilJmeno())).toBeNull();
  });
});

describe("smiPsatKanal — POST guard", () => {
  it("Důležité smí vedení", () => {
    expect(smiPsatKanal(pravo({ funkce: "vedeni" }), "dulezite")).toBe(true);
  });

  it("Důležité smí rada", () => {
    expect(smiPsatKanal(pravo({ funkce: "rada" }), "dulezite")).toBe(true);
  });

  it("Důležité smí admin", () => {
    expect(smiPsatKanal(pravo({ isAdmin: true }), "dulezite")).toBe(true);
  });

  it("Důležité nesmí běžný USER (→ 403)", () => {
    expect(smiPsatKanal(pravo(), "dulezite")).toBe(false);
  });

  it("General projde každý přihlášený", () => {
    expect(smiPsatKanal(pravo(), "general")).toBe(true);
    expect(smiPsatKanal(pravo({ isAdmin: true }), "general")).toBe(true);
  });

  it("Vlákno výpravy projde každý přihlášený", () => {
    expect(smiPsatKanal(pravo(), "expedice")).toBe(true);
  });
});

describe("seskupKonverzace — GET konverzace", () => {
  it("seskupí podle key + lastMessage = MAX + unreadCount po lastRead", () => {
    const zpravy: ApiZprava[] = [
      dobraZprava({ id: "g1", expeditionId: null, channel: "general", createdAt: "2026-10-01T10:00:00.000Z" }),
      dobraZprava({ id: "g2", expeditionId: null, channel: "general", createdAt: "2026-10-01T11:00:00.000Z" }),
      dobraZprava({ id: "e1", expeditionId: "sumava-2026", channel: "expedice", createdAt: "2026-10-01T09:00:00.000Z" }),
    ];
    const vysledek = seskupKonverzace(zpravy, { general: "2026-10-01T10:30:00.000Z" });
    const general = vysledek.find((k) => k.key === "general");
    const vlakno = vysledek.find((k) => k.key === "expedice:sumava-2026");
    expect(general?.lastMessage?.id).toBe("g2");
    expect(general?.unreadCount).toBe(1);
    expect(general?.expeditionId).toBeNull();
    expect(vlakno?.unreadCount).toBe(1);
    expect(vlakno?.expeditionId).toBe("sumava-2026");
  });

  it("bez lastRead je unreadCount = vše", () => {
    const vysledek = seskupKonverzace(
      [dobraZprava({ id: "d1", expeditionId: null, channel: "dulezite" })],
      {},
    );
    expect(vysledek[0]?.unreadCount).toBe(1);
    expect(vysledek[0]?.key).toBe("dulezite");
  });
});

describe("kontrakt Step 2 — cesty + guardy", () => {
  it("nové cesty konverzace + globální zprávy", () => {
    expect(KONVERZACE_PATH).toBe("/api/diskuze/konverzace");
    expect(KONVERZACE_READ_PATH).toBe("/api/diskuze/konverzace/read");
    expect(GLOBALNI_ZPRAVY_PATH).toBe("/api/diskuze/zpravy");
    expect(konverzaceReadPath()).toBe("/api/diskuze/konverzace/read");
  });

  it("matice: čtení PUBLIC, zápis USER, Důležité hlídá server 403", () => {
    expect(PRISTUP_KONVERZACE[KONVERZACE_PATH]).toBe("PUBLIC");
    expect(PRISTUP_KONVERZACE[KONVERZACE_READ_PATH]).toBe("USER");
    expect(PRISTUP_KONVERZACE[GLOBALNI_ZPRAVY_PATH]).toBe("PUBLIC");
    const radky = MATICE_KONVERZACE.map((r) => `${r.metoda} ${r.cesta} ${r.kdo}`);
    expect(radky).toContain("GET /api/diskuze/konverzace PUBLIC");
    expect(radky).toContain("POST /api/diskuze/zpravy USER");
    expect(radky).toContain("POST /api/diskuze/konverzace/read USER");
  });

  it("jeKanalDiskuze přijme klubové kanály a soukromý chat", () => {
    expect(jeKanalDiskuze("expedice")).toBe(true);
    expect(jeKanalDiskuze("dulezite")).toBe(true);
    expect(jeKanalDiskuze("general")).toBe(true);
    expect(jeKanalDiskuze("soukrome")).toBe(true);
    expect(jeKanalDiskuze("tajne")).toBe(false);
  });

  it("jeApiKonverzace přijme plný tvar a odmítne záporný unreadCount", () => {
    expect(jeApiKonverzace(dobraKonverzace())).toBe(true);
    expect(jeApiKonverzace({ ...dobraKonverzace(), unreadCount: -1 })).toBe(false);
    expect(jeApiKonverzace(null)).toBe(false);
  });

  it("jeKonverzaceOdpoved přijme prázdný seznam", () => {
    expect(jeKonverzaceOdpoved({ konverzace: [] })).toBe(true);
    expect(
      jeKonverzaceOdpoved({ konverzace: [dobraKonverzace()] }),
    ).toBe(true);
    expect(jeKonverzaceOdpoved({ konverzace: "ne" })).toBe(false);
  });
});

describe("klient Step 2 — mock fetch", () => {
  it("getKonverzace vrátí seznam bez extra fetch jmen (jméno je v lastMessage)", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          odpovedJson({ konverzace: [dobraKonverzace()] }, 200),
        ) as Promise<Response>,
    );
    const vysledek = await getKonverzace();
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.konverzace).toHaveLength(1);
      expect(vysledek.data.konverzace[0]?.lastMessage?.authorName).toBe("Jan Novák");
    }
  });

  it("posliGlobalZpravu 403 nese ZAKAZANO (Důležité pro USER)", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          odpovedJson(
            { error: { code: "ZAKAZANO", message: "Důležité zprávy může psát jen vedení, rada nebo admin." } },
            403,
          ),
        ) as Promise<Response>,
    );
    const vysledek = await posliGlobalZpravu("dulezite", "Ahoj");
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("ZAKAZANO");
  });

  it("posliGlobalZpravu 201 projde (General pro přihlášeného)", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          odpovedJson({ zprava: dobraZprava({ expeditionId: null, channel: "general" }) }, 201),
        ) as Promise<Response>,
    );
    const vysledek = await posliGlobalZpravu("general", "Ahoj všem");
    expect(vysledek.ok).toBe(true);
  });

  it("oznacKonverzaciJakoPrectenou vrátí lastReadAt", async () => {
    vi.stubGlobal(
      "fetch",
      () =>
        Promise.resolve(
          odpovedJson({ lastReadAt: "2026-10-15T10:00:00.000Z" }, 200),
        ) as Promise<Response>,
    );
    const vysledek = await oznacKonverzaciJakoPrectenou("general");
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) expect(vysledek.data.lastReadAt).toBe("2026-10-15T10:00:00.000Z");
  });
});

describe("Step 2 — soubory bez any", () => {
  it("žádný zakázaný typ any ve scope souborech + testu", () => {
    const zakazanyTyp = ["as", "any"].join(" ");
    for (const soubor of [
      "server/src/diskuze.ts",
      "server/src/index.ts",
      "src/shared/api-types.ts",
      "src/lib/diskuze-api.ts",
      "tests/diskuze-step2.test.ts",
    ]) {
      const obsah = readFileSync(soubor, "utf8");
      expect(obsah).not.toMatch(/:\s*any\b/);
      expect(obsah).not.toContain(zakazanyTyp);
    }
  });
});
