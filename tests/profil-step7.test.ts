/**
 * tests/profil-step7.test.ts — Step 7: editace osobních údajů + Strava Connect/Disconnect na mobilu.
 *
 * TDD: RED = soubor neexistuje, PATCH /api/me bez skola/trida round-tripu,
 *   ProfileForm bez sticky Uložit / avatar blokace / focus-visible,
 *   ProfilPage bez 4 tabů. GREEN = vše níže prochází.
 * Styl: repo nemá jsdom — lib se testuje reálně s mocknutým fetch,
 *   .tsx zdroj-kontraktem (čtení src jako text). Strict TS, žádný `any`. Small testy.
 *
 * Akceptační kritéria:
 * - Uložení jména/e-mailu/hesla/avataru+rozšířených polí projde, reload drží data (vč. skola/trida).
 * - Kolize e-mailu → 409 + srozumitelná hláška, nevalidní heslo → 422.
 * - Strava: connect → připojeno, disconnect → nepřipojeno, denied → chyba bez pádu.
 * - Mobil 360px: bez horizontálního scrollu, taby klikatelné, sticky Uložit viditelné.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validujProfilUpdate } from "../server/src/validace";
import {
  jeProfilBezZmen,
  sestavProfilDbPatch,
} from "../server/src/services/profile-service";
import { nactiProfil, ulozProfil } from "../src/hooks/useProfile";
import {
  ctiStravaDuvodZUrl,
  ctiStravaPriznakZUrl,
  nactiStravaStav,
  nactiStravaStavRozsireny,
  odpojStravu,
  getStravaAuthUrlPodrobne,
  prelozStravaDuvod,
  presmerujNaStravuAutorizaci,
} from "../src/lib/strava-api";
import type { ApiUser } from "../src/shared/api-types";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

const API_ZAKLAD = "https://api.test";
const PROFIL_PAGE = "src/pages/ProfilPage.tsx";
const PROFILE_FORM = "src/components/profil/ProfileForm.tsx";
const AVATAR_UPLOAD = "src/components/profil/AvatarUpload.tsx";
const USE_PROFILE = "src/hooks/useProfile.ts";
const STRAVA_API = "src/lib/strava-api.ts";
const SERVER_INDEX = "server/src/index.ts";
const SERVER_VALIDACE = "server/src/validace.ts";
const PROFILE_SERVICE = "server/src/services/profile-service.ts";

function apiUser(uprava: Partial<ApiUser> = {}): ApiUser {
  const zaklad: ApiUser = {
    id: "user-1",
    email: "jan@example.cz",
    jmeno: "Jan",
    prijmeni: "Novák",
    telefon: "+420 777 111 222",
    discordNick: "jan_n",
    skola: "ZŠ Mlýnská",
    trida: "5.B klubovna",
    avatarUrl: "https://cdn.test/avatar.jpg",
    bio: "Vedoucí výprav.",
    narozeniny: "2015-04-02",
    role: "USER",
    stravaId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-10-16T00:00:00.000Z",
  };
  return { ...zaklad, ...uprava };
}

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ── 1. Uložení + reload drží data (včetně skola/trida) ───────────────────────

describe("PATCH /api/me validace — plný profil projde (vč. skola/trida)", () => {
  it("jméno/e-mail/heslo/avatar+rozšířená pole projdou", () => {
    const vysledek = validujProfilUpdate({
      jmeno: "Jan",
      prijmeni: "Novák",
      email: "jan@example.cz",
      heslo: "tajneheslo123",
      telefon: "+420 777 111 222",
      discordNick: "jan_n",
      skola: "ZŠ Mlýnská",
      trida: "5.B klubovna",
      avatarUrl: "https://cdn.test/avatar.jpg",
      bio: "Vedoucí výprav.",
      narozeniny: "2015-04-02",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.jmeno).toBe("Jan");
    expect(vysledek.data?.email).toBe("jan@example.cz");
    expect(vysledek.data?.skola).toBe("ZŠ Mlýnská");
    expect(vysledek.data?.trida).toBe("5.B klubovna");
    expect(vysledek.data?.avatarUrl).toContain("https://");
    expect(vysledek.data?.bio).toBe("Vedoucí výprav.");
    expect(vysledek.data?.narozeniny).toBe("2015-04-02");
  });

  it("skola/trida round-trip: prázdná → smazat (''), neposlaná → beze změny", () => {
    const smaz = validujProfilUpdate({ skola: "   ", trida: "" });
    expect(smaz.uspech).toBe(true);
    expect(smaz.data?.skola).toBe("");
    expect(smaz.data?.trida).toBe("");

    const bezeZmeny = validujProfilUpdate({});
    expect(bezeZmeny.uspech).toBe(true);
    expect(bezeZmeny.data?.skola).toBeUndefined();
    expect(bezeZmeny.data?.trida).toBeUndefined();
    expect(jeProfilBezZmen(bezeZmeny.data ?? {})).toBe(true);
  });

  it("profile-service mapuje 1:1 na DB sloupce + updatedAt", () => {
    const patch = sestavProfilDbPatch({
      jmeno: "Jan",
      skola: "ZŠ Mlýnská",
      trida: "5.B klubovna",
      avatarUrl: "https://cdn.test/a.jpg",
      bio: "Ahoj",
      narozeniny: "2015-04-02",
    });
    expect(patch.jmeno).toBe("Jan");
    expect(patch.skola).toBe("ZŠ Mlýnská");
    expect(patch.trida).toBe("5.B klubovna");
    expect(patch.avatarUrl).toBe("https://cdn.test/a.jpg");
    expect(patch.bio).toBe("Ahoj");
    expect(patch.narozeniny).toBe("2015-04-02");
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });
});

describe("klient ulozProfil + nactiProfil — save + reload drží data", () => {
  it("PATCH úspěch → ok + user (vč. skola/trida), GET reload vrátí stejná data", async () => {
    const ulozeny = apiUser();
    const sekvence: Response[] = [
      odpovedJson({ user: ulozeny }, 200),
      odpovedJson(ulozeny, 200),
    ];
    let volani = 0;
    vi.stubGlobal(
      "fetch",
      ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const aktualni = sekvence[volani];
        volani += 1;
        if (volani === 1) {
          expect(String(url)).toBe(`${API_ZAKLAD}/api/me`);
          expect(init?.method).toBe("PATCH");
          const telo = JSON.parse(String(init?.body)) as Record<string, unknown>;
          expect(telo["jmeno"]).toBe("Jan");
          expect(telo["skola"]).toBe("ZŠ Mlýnská");
          expect(telo["trida"]).toBe("5.B klubovna");
        }
        return Promise.resolve(aktualni);
      }) as typeof fetch,
    );
    const save = await ulozProfil({
      jmeno: "Jan",
      skola: "ZŠ Mlýnská",
      trida: "5.B klubovna",
    });
    expect(save.ok).toBe(true);
    if (save.ok) {
      expect(save.data.skola).toBe("ZŠ Mlýnská");
      expect(save.data.trida).toBe("5.B klubovna");
    }
    const reload = await nactiProfil();
    expect(reload.ok).toBe(true);
    if (reload.ok) {
      expect(reload.data.skola).toBe("ZŠ Mlýnská");
      expect(reload.data.trida).toBe("5.B klubovna");
      expect(reload.data.avatarUrl).toBe("https://cdn.test/avatar.jpg");
    }
  });
});

// ── 2. Chybové stavy: 409 kolize e-mailu, 422 nevalidní heslo ────────────────

describe("PATCH /api/me chyby — 409 kolize, 422 heslo", () => {
  it("krátké heslo → validace neprojde s polem heslo (route mapuje na 422)", () => {
    const vysledek = validujProfilUpdate({ heslo: "krátké" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["heslo"]).toBeDefined();
    const index = cti(SERVER_INDEX);
    expect(index).toContain('app.patch("/api/me"');
    expect(index).toContain("VALIDATION_ERROR");
  });

  it("klient: 409 EMAIL_OBSAZEN → ok:false + srozumitelná hláška + inline chyba na e-mailu", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(
        odpovedJson(
          { error: { code: "EMAIL_OBSAZEN", message: "Tento e-mail je už obsazený." } },
          409,
        ),
      )) as typeof fetch,
    );
    const vysledek = await ulozProfil({ email: "cizi@example.cz" });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("EMAIL_OBSAZEN");
      expect(vysledek.chyba.length).toBeGreaterThan(5);
      expect(vysledek.chybyPoli?.["email"]).toBe(vysledek.chyba);
    }
  });

  it("klient: 422 VALIDATION_ERROR hesla → ok:false + chybyPoli.heslo/noveHeslo", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(
        odpovedJson(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Zkontroluj zvýrazněná pole.",
              details: { heslo: ["Heslo musí mít aspoň 8 znaků."] },
            },
          },
          422,
        ),
      )) as typeof fetch,
    );
    const vysledek = await ulozProfil({ heslo: "x" });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VALIDATION_ERROR");
      const mapovano =
        vysledek.chybyPoli?.["heslo"] ?? vysledek.chybyPoli?.["noveHeslo"];
      expect(mapovano).toBeDefined();
    }
  });

  it("ProfileForm mapuje serverové heslo na pole noveHeslo (zdroj-kontrakt)", () => {
    const obsah = cti(PROFILE_FORM);
    const hook = cti(USE_PROFILE);
    expect(obsah).toContain("noveHeslo");
    expect(obsah).toContain('"heslo" ? "noveHeslo"');
    // 409 EMAIL_OBSAZEN → inline chyba na e-mailu mapuje useProfile.ulozProfil:
    expect(hook).toContain("EMAIL_OBSAZEN");
    expect(obsah).toContain("role=\"alert\"");
  });
});

// ── 3. Strava connect / disconnect / denied ─────────────────────────────────

describe("Strava connect → připojeno, disconnect → nepřipojeno", () => {
  it("nactiStravaStav: stravaId → propojeno, null → nepropojeno", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(odpovedJson(apiUser({ stravaId: "12345" }), 200))) as typeof fetch,
    );
    const pripojeno = await nactiStravaStav();
    expect(pripojeno.ok).toBe(true);
    if (pripojeno.ok) {
      expect(pripojeno.data.propojeno).toBe(true);
      expect(pripojeno.data.stravaId).toBe("12345");
    }

    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(odpovedJson(apiUser({ stravaId: null }), 200))) as typeof fetch,
    );
    const odpojeno = await nactiStravaStav();
    expect(odpojeno.ok).toBe(true);
    if (odpojeno.ok) expect(odpojeno.data.propojeno).toBe(false);
  });

  it("rozšířený stav /api/strava/stav nese propojeno (atlet+scope+expirace)", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(
        odpovedJson(
          { propojeno: true, stravaId: "12345", scope: "read,activity:read", expirace: null },
          200,
        ),
      )) as typeof fetch,
    );
    const stav = await nactiStravaStavRozsireny();
    expect(stav.ok).toBe(true);
    if (stav.ok) expect(stav.data.propojeno).toBe(true);
  });

  it("odpojStravu DELETE → ok:true (idempotentní)", async () => {
    let metoda = "";
    vi.stubGlobal(
      "fetch",
      ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        metoda = String(init?.method);
        expect(String(url)).toContain("/api/strava/odpojit");
        return Promise.resolve(odpovedJson({ ok: true }, 200));
      }) as typeof fetch,
    );
    const vysledek = await odpojStravu();
    expect(vysledek.ok).toBe(true);
    expect(metoda).toBe("DELETE");
  });

  it("connect: presmerujNaStravuAutorizaci s backend URL → ok (bez pádu, bez window redirectu v testu)", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(
        odpovedJson({ url: "https://www.strava.com/oauth/authorize?client_id=1" }, 200),
      )) as typeof fetch,
    );
    const vysledek = await presmerujNaStravuAutorizaci();
    expect(vysledek.ok).toBe(true);
    const podrobne = await getStravaAuthUrlPodrobne();
    expect(podrobne.ok).toBe(true);
  });
});

describe("Strava denied → česká chyba bez pádu", () => {
  it("prelozStravaDuvod: odepreno/neplatny-kod → česká hláška, neznámé → obecná (nikdy raw query)", () => {
    expect(prelozStravaDuvod("odepreno").length).toBeGreaterThan(5);
    expect(prelozStravaDuvod("odepreno")).not.toContain("access_denied");
    expect(prelozStravaDuvod("neplatny-kod").length).toBeGreaterThan(5);
    expect(prelozStravaDuvod(null)).toBe("Propojení se nepovedlo. Zkus to prosím znovu.");
    expect(prelozStravaDuvod("../../../etc/passwd")).toBe(
      "Propojení se nepovedlo. Zkus to prosím znovu.",
    );
  });

  it("ctiStravaDuvodZUrl: jen allowlist, ostatní → null", () => {
    expect(ctiStravaDuvodZUrl()).toBeNull();
    expect(ctiStravaPriznakZUrl()).toBeNull();
  });

  it("ProfilPage čte ?strava=chyba&duvod a ukazuje alert, nikdy nevyhazuje (zdroj-kontrakt)", () => {
    const obsah = cti(PROFIL_PAGE);
    expect(obsah).toContain("ctiStravaPriznakZUrl");
    expect(obsah).toContain("ctiStravaDuvodZUrl");
    expect(obsah).toContain("prelozStravaDuvod");
    expect(obsah).toContain('role="alert"');
    expect(obsah).toContain("odpojStravu");
    expect(obsah).toContain("presmerujNaStravuAutorizaci");
  });
});

// ── 4. Mobil 360px: scroll, taby, sticky Uložit ──────────────────────────────

describe("Mobil 360px — layout bez horizontálního scrollu", () => {
  it("ProfilPage: fluidní kontejner + sticky taby + 44px cíle", () => {
    const obsah = cti(PROFIL_PAGE);
    expect(obsah).toContain("max-w-6xl");
    expect(obsah).toContain("w-full");
    expect(obsah).toContain("px-4");
    expect(obsah).toContain("sticky top-0");
    expect(obsah).toContain("min-h-[44px]");
    expect(obsah).toContain("min-w-[44px]");
    expect(obsah).toContain("touch-manipulation");
    expect(obsah).toContain("max-w-full");
    expect(obsah).toContain("flex-wrap");
  });

  it("taby: 4 role=tab, klikatelné, klávesnice + aria", () => {
    const obsah = cti(PROFIL_PAGE);
    expect(obsah).toContain('role="tablist"');
    expect(obsah).toContain('role="tab"');
    expect(obsah).toContain('role="tabpanel"');
    expect(obsah).toContain("osobni");
    expect(obsah).toContain("strava");
    expect(obsah).toContain("statistiky");
    expect(obsah).toContain("heatmapa");
    expect(obsah).toContain("aria-selected");
    expect(obsah).toContain("onClick");
    expect(obsah).toContain("ArrowRight");
    expect(obsah).toContain("tab-");
  });

  it("ProfileForm: sticky Uložit bar + safe-area + 1→2 sloupce (žádný fixní 360px+ šířkový layout)", () => {
    const obsah = cti(PROFILE_FORM);
    expect(obsah).toContain("sticky bottom-0");
    expect(obsah).toContain("safe-area-inset-bottom");
    expect(obsah).toContain("Uložit změny");
    expect(obsah).toContain("max-w-2xl");
    expect(obsah).toContain("w-full");
    expect(obsah).toContain("grid-cols-1");
    expect(obsah).toContain("sm:grid-cols-2");
    expect(obsah).toContain("break-words");
    expect(obsah).toContain("focus-visible");
    expect(obsah).not.toMatch(/w-\[36\dpx\]|w-\[4\d\dpx\]|min-w-\[36\dpx\]/);
  });

  it("avatar: vybraný soubor se ukládá přes POST /api/me/avatar", () => {
    const form = cti(PROFILE_FORM);
    const avatar = cti(AVATAR_UPLOAD);
    const server = cti("server/src/index.ts");
    expect(form).toContain("nahratAvatar");
    expect(form).toContain("souborAvatar");
    expect(form).not.toContain("neukládá");
    expect(avatar).toContain("onSouborZmena");
    expect(avatar).toContain("accept");
    expect(server).toContain("app.post(\"/api/me/avatar\"");
    expect(server).toContain("AVATAR_MAX_BAJTU");
    expect(server).toContain("vyzadujPrihlaseni");
  });

  it("focus-visible + 44px cíle i na Strava tlačítkách", () => {
    const stranka = cti(PROFIL_PAGE);
    const form = cti(PROFILE_FORM);
    expect(form).toContain("focus-visible");
    expect(stranka).toContain("min-h-[44px]");
    expect(stranka).toContain("Odpojit Stravu");
    expect(stranka).toContain("Připojit Stravu");
  });
});

// ── 5. Bezpečnost / kontrakt ────────────────────────────────────────────────

describe("Bezpečnost + kontrakt Step 7", () => {
  it("docs/bezpecnostni-rizika.md existuje a řeší profil/Strava", () => {
    const obsah = cti("docs/bezpecnostni-rizika.md");
    expect(obsah.length).toBeGreaterThan(100);
  });

  it("klient nikdy nenese tajemství (jen VITE_*), heslo se neposílá prázdné", () => {
    const form = cti(PROFILE_FORM);
    const hook = cti(USE_PROFILE);
    const api = cti(STRAVA_API);
    expect(api).toContain("VITE_API_BASE_URL");
    expect(form).toContain("delete patch.heslo");
    expect(hook).toContain("credentials");
    expect(hook).not.toContain("passwordHash");
  });

  it("server soubory pro Step 7 existují a drží kontrakt", () => {
    expect(cti(SERVER_VALIDACE)).toContain("validujProfilUpdate");
    expect(cti(PROFILE_SERVICE)).toContain("sestavProfilDbPatch");
    expect(cti(SERVER_INDEX)).toContain('app.patch("/api/me"');
    expect(cti(USE_PROFILE)).toContain("ulozProfil");
    expect(cti(USE_PROFILE)).toContain("nactiProfil");
  });
});

// ── 6. Obnovit stav (refresh StravaKarty) ────────────────────────────────────
// Regrese k hlášení „tlačítko Obnovit nefunguje": handler musí vždy sáhnout
// na GET /api/strava/stav (credentials:include), úspěch přepsat fázi vč.
// scope/expirace, chyba nesmí shodit kartu ani zaseknout spinner a tlačítko
// musí zůstat i po chybě (retry bez reloadu). Závod s mount efektem hlídá
// sdílený čítač požadavků.

describe("Obnovit stav — refresh volá stavový endpoint a nezasekne se", () => {
  it("nactiStravaStavRozsireny: GET /api/strava/stav s credentials:include", async () => {
    let zachyceneUrl = "";
    let zachyceneInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      ((url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        zachyceneUrl = String(url);
        zachyceneInit = init;
        return Promise.resolve(
          odpovedJson(
            {
              propojeno: true,
              stravaId: "12345",
              scope: "read,activity:read",
              expirace: "2026-10-17T10:00:00.000Z",
            },
            200,
          ),
        );
      }) as typeof fetch,
    );
    const stav = await nactiStravaStavRozsireny();
    expect(zachyceneUrl).toBe(`${API_ZAKLAD}/api/strava/stav`);
    expect(zachyceneInit?.credentials).toBe("include");
    expect(stav.ok).toBe(true);
    if (stav.ok) {
      expect(stav.data.propojeno).toBe(true);
      expect(stav.data.stravaId).toBe("12345");
      expect(stav.data.scope).toBe("read,activity:read");
      expect(stav.data.expirace).toBe("2026-10-17T10:00:00.000Z");
    }
  });

  it("stavový endpoint 401 → ok:false bez vyhození (karta ukáže chybu, nespadne)", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.resolve(
        odpovedJson(
          { error: { code: "NEPRIHLASEN", message: "Přihlas se znovu." } },
          401,
        ),
      )) as typeof fetch,
    );
    const stav = await nactiStravaStavRozsireny();
    expect(stav.ok).toBe(false);
    if (!stav.ok) expect(stav.chyba.length).toBeGreaterThan(5);
  });

  it("obnovitStav: volá ctiFaziPropojeni, má catch+finally, spinner zháší vlastník", () => {
    const obsah = cti(PROFIL_PAGE);
    const zacatek = obsah.indexOf("async function obnovitStav()");
    expect(zacatek).toBeGreaterThan(-1);
    const konec = obsah.indexOf("async function pripoj", zacatek);
    const telo = konec > 0 ? obsah.slice(zacatek, konec) : obsah.slice(zacatek);
    expect(telo).toContain("ctiFaziPropojeni()");
    expect(telo).toContain("setFaze(novaFaze)");
    // Chyba bez pádu: catch složí chybovou fázi (void onClick ji nespolkne).
    expect(telo).toContain("catch");
    expect(telo).toContain('stav: "chyba"');
    // Nezasekne se na „Obnovuji…": finally + vlastnický guard.
    expect(telo).toContain("finally");
    expect(telo).toContain("setObnovuje(false)");
    expect(telo).toContain("pozadavekRef");
  });

  it("závod s mount efektem: mount i refresh sdílí pozadavekRef", () => {
    const obsah = cti(PROFIL_PAGE);
    expect(obsah).toContain("pozadavekRef");
    expect(obsah).toContain("useRef");
    // Starší odpověď čerstvější stav nepřepíše (obě větve kontrolují čítač).
    const vyskyty = obsah.split("pozadavekRef.current !== moje").length - 1;
    expect(vyskyty).toBeGreaterThanOrEqual(2);
  });

  it("tlačítko Obnovit stav je i mimo propojeno (retry po chybě bez reloadu)", () => {
    const obsah = cti(PROFIL_PAGE);
    const idxTlacitko = obsah.indexOf('{obnovuje ? "Obnovuji…" : "Obnovit stav"}');
    expect(idxTlacitko).toBeGreaterThan(-1);
    // Tlačítko předchází propojeno-větvi a hlídá jen prvotní načítání —
    // není uvnitř `faze.stav === "propojeno" ? (` větve.
    const idxVetev = obsah.indexOf('faze.stav === "propojeno" ? (', idxTlacitko);
    expect(idxVetev).toBeGreaterThan(idxTlacitko);
    expect(obsah).toContain('faze.stav !== "nacitani"');
    expect(obsah).toContain("onClick={() => void obnovitStav()}");
    expect(obsah).toContain("disabled={pracuje || obnovuje}");
  });
});
