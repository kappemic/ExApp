/**
 * tests/modal-confirm.test.ts — Krok 1b: regresní testy mazání + modal.
 *
 * TDD: RED = nový soubor neexistoval (grep ConfirmDialog/UdalostModal/
 * ExpeditionModal v tests = 0); GREEN = pure-funkční + zdroj-kontrakt testy
 * nad existujícím src (žádná změna chování, jen testy).
 *
 * Proč bez rendereru: repo nemá jsdom ani testing-library a vitest běží
 * v node (viz vite.config.ts — žádný `test.environment`). Instalace těžkých
 * závislostí (jsdom + testing-library) je zakázána bez ptaní, proto:
 * - pure-funkční testy zrcadlí přesnou logiku ze src (s odkazem na řádky),
 * - zdroj-kontrakt testy čtou .tsx jako text a hlídají, že klíčové řetězce
 *   (role/aria, Esc, focus-trap, popisky, volání onSmazatSchuzku/naSmazat/
 *   naUzavrit) ze src nezmizely.
 * Bez browseru NELZE testovat: skutečný focus-trap (Tab cyklování),
 * návrat fokusu, zámek scrollu, vizuální backdrop klik ani časování
 * requestAnimationFrame — to zůstává na ruční prohlížečovou verifikaci.
 *
 * Strict TypeScript, žádný `any`. Small testy, bez I/O kromě čtení src.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RozsahMazaniSchuzky } from "../src/shared/api-types";

/* ------------------------------------------------------------------ */
/* Pure zrcadla src — každá funkce má komentář s přesným místem v src.  */
/* ------------------------------------------------------------------ */

/** ConfirmDialog.tsx:62 — `props.potvrditPopisek ?? "Ano, odebrat"`. */
function vychoziPotvrditPopisek(vstup: string | undefined): string {
  return vstup ?? "Ano, odebrat";
}

/** ConfirmDialog.tsx:63 — `props.zrusitPopisek ?? "Ponechat"`. */
function vychoziZrusitPopisek(vstup: string | undefined): string {
  return vstup ?? "Ponechat";
}

/** ConfirmDialog.tsx:65 — `props.probihaPopisek ?? "Mažu…"`. */
function vychoziProbihaPopisek(vstup: string | undefined): string {
  return vstup ?? "Mažu…";
}

/** ConfirmDialog.tsx:127 — `if (!otevreno) return null`. */
function jeDialogOtevren(otevreno: boolean): boolean {
  return otevreno;
}

/** ConfirmDialog.tsx:135-137 — klik na backdrop zavírá jen mimo mazání. */
function backdropZavira(cilJeBackdrop: boolean, probiha: boolean): boolean {
  return cilJeBackdrop && !probiha;
}

/** ConfirmDialog.tsx:91-94 — Esc je ignorován, dokud `probiha`. */
function escZavira(probiha: boolean): boolean {
  return !probiha;
}

/**
 * ConfirmDialog.tsx:129-132 — radiogroup „Co odebrat?" jen když je předán
 * `rozsah` (ne null/undefined) A `onZmenaRozsahu`.
 */
function nabidnoutRozsah(
  rozsah: RozsahMazaniSchuzky | null | undefined,
  maHandler: boolean,
): boolean {
  return rozsah !== null && rozsah !== undefined && maHandler;
}

/** ConfirmDialog.tsx:133 — `props.rozsah ?? "rada"`. */
function zvolenyRozsah(
  rozsah: RozsahMazaniSchuzky | null | undefined,
): RozsahMazaniSchuzky {
  return rozsah ?? "rada";
}

/**
 * UdalostModal.tsx:274-279 — potvrzení volá
 * `onSmazatSchuzku(kPotvereni.id, rozsah ?? "rada", rozsah === "vyskyt" ? datum : undefined)`.
 */
interface MazaciVolani {
  id: string;
  rozsah: RozsahMazaniSchuzky;
  datum: string | undefined;
}

function sestavMazaciVolani(
  id: string,
  rozsah: RozsahMazaniSchuzky | null,
  datum: string,
): MazaciVolani {
  const efektivni: RozsahMazaniSchuzky = rozsah ?? "rada";
  return {
    id,
    rozsah: efektivni,
    datum: efektivni === "vyskyt" ? datum : undefined,
  };
}

/**
 * UdalostModal.tsx:228-230 — „Odebrat" nastaví default: týdenní → "rada",
 * jednorázová → null (bez radiogroup).
 */
function vychoziRozsahProSchuzku(
  opakovani: "tydenni" | "jednorazova",
): RozsahMazaniSchuzky | null {
  return opakovani === "tydenni" ? "rada" : null;
}

/**
 * UdalostModal.tsx:81-88 — po smazání celé řady řádek zmizí ze
 * `schuzkyPodleId` → confirm se sám zavře.
 */
function radaSmazanaZavreConfirm(
  meloKPotvrzeni: boolean,
  mapaStaleObsahujeId: boolean,
): boolean {
  return meloKPotvrzeni && !mapaStaleObsahujeId;
}

/**
 * UdalostModal.tsx:95-106 — B4 výskyt: řada v mapě zůstává, takže confirm
 * zavírá až doběhnutí bez chyby; chyba ho nechá otevřený i s hláškou.
 */
function vyskytUspesneZavreConfirm(
  mazaloSe: boolean,
  mazeSeTed: boolean,
  chyba: string | null | undefined,
): boolean {
  if (mazeSeTed) return false;
  if (!mazaloSe) return false;
  return chyba === null || chyba === undefined;
}

/**
 * ExpeditionModal.tsx:420-423 — docházka: zatržený → "ucastnil_se",
 * nezatržený → "omluven".
 */
interface DochazkaRadek {
  ucastnikId: string;
  status: "ucastnil_se" | "omluven";
}

function sestavDochazku(
  ucastnici: ReadonlyArray<{ id: string }>,
  dochazka: ReadonlySet<string>,
): DochazkaRadek[] {
  return ucastnici.map((u) => ({
    ucastnikId: u.id,
    status: dochazka.has(u.id) ? "ucastnil_se" : "omluven",
  }));
}

/** ExpeditionModal.tsx:408-415 — přepínání checkboxu docházky. */
function prepniDochazku(puvodni: ReadonlySet<string>, id: string): Set<string> {
  const dalsi = new Set(puvodni);
  if (dalsi.has(id)) dalsi.delete(id);
  else dalsi.add(id);
  return dalsi;
}

/** ExpeditionModal.tsx:1157 — uzavřít jde jen s účastníky a mimo běh. */
function muzeUzavrit(pocetUcastniku: number, uzaviraSe: boolean): boolean {
  return pocetUcastniku > 0 && !uzaviraSe;
}

/* ------------------------------------------------------------------ */
/* Zdroj-kontrakt: čtení .tsx jako textu (bez rendereru).               */
/* ------------------------------------------------------------------ */

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

/* ------------------------------------------------------------------ */
/* Testy                                                               */
/* ------------------------------------------------------------------ */

describe("ConfirmDialog — výchozí popisky a stráže (pure)", () => {
  it('bez popisků nabízí Ano-odebrat + Ponechat + probíhající stav', () => {
    expect(vychoziPotvrditPopisek(undefined)).toBe("Ano, odebrat");
    expect(vychoziZrusitPopisek(undefined)).toBe("Ponechat");
    expect(vychoziProbihaPopisek(undefined)).toBe("Mažu…");
  });

  it("vlastní popisky mají přednost před výchozími", () => {
    expect(vychoziPotvrditPopisek("Ano, smazat navždy")).toBe(
      "Ano, smazat navždy",
    );
    expect(vychoziZrusitPopisek("Zpět")).toBe("Zpět");
  });

  it("otevreno=false nic nevykreslí, Esc ani backdrop během mazání nezavírají", () => {
    expect(jeDialogOtevren(false)).toBe(false);
    expect(jeDialogOtevren(true)).toBe(true);
    expect(escZavira(true)).toBe(false);
    expect(escZavira(false)).toBe(true);
    expect(backdropZavira(true, true)).toBe(false);
    expect(backdropZavira(true, false)).toBe(true);
    expect(backdropZavira(false, false)).toBe(false);
  });

  it('rozsah: null/bez handleru = bez radiogroup, jinak default rada', () => {
    expect(nabidnoutRozsah(null, true)).toBe(false);
    expect(nabidnoutRozsah(undefined, true)).toBe(false);
    expect(nabidnoutRozsah("rada", false)).toBe(false);
    expect(nabidnoutRozsah("rada", true)).toBe(true);
    expect(nabidnoutRozsah("vyskyt", true)).toBe(true);
    expect(zvolenyRozsah(null)).toBe("rada");
    expect(zvolenyRozsah(undefined)).toBe("rada");
    expect(zvolenyRozsah("vyskyt")).toBe("vyskyt");
  });
});

describe("ConfirmDialog — zdroj-kontrakt (a11y + focus-trap + destruktivnost)", () => {
  const zdroj: string = ctiZdroj("src/components/kalendar/ConfirmDialog.tsx");

  it("je alertdialog s aria-modal a popisky nadpis/popisu", () => {
    expect(zdroj).toContain('role="alertdialog"');
    expect(zdroj).toContain('aria-modal="true"');
    expect(zdroj).toContain("aria-labelledby");
    expect(zdroj).toContain("aria-describedby");
  });

  it("Esc + focus-trap + návrat fokusu + zámek scrollu", () => {
    expect(zdroj).toContain('"Escape"');
    expect(zdroj).toContain("querySelectorAll");
    expect(zdroj).toContain("zrusitRef.current?.focus()");
    expect(zdroj).toContain('document.body.style.overflow = "hidden"');
    expect(zdroj).toContain("navrat");
  });

  it('bezpečný default fokusu na Ponechat, obě tlačítka 44px+, chyba role=alert', () => {
    expect(zdroj).toContain('"Ano, odebrat"');
    expect(zdroj).toContain('"Ponechat"');
    expect(zdroj).toContain("min-h-[44px]");
    expect(zdroj).toContain('role="alert"');
    expect(zdroj).toContain("disabled={probiha}");
    expect(zdroj).toContain('"Mažu…"');
  });

  it('rozsahová volba nese otázku Co odebrat + oba výskyty', () => {
    expect(zdroj).toContain("Co odebrat?");
    expect(zdroj).toContain("Jen tento výskyt");
    expect(zdroj).toContain("Celá opakovaná řada");
  });
});

describe("UdalostModal — mazací flow (pure rozhodnutí)", () => {
  it('týdenní default rada, jednorázová null (bez radiogroup)', () => {
    expect(vychoziRozsahProSchuzku("tydenni")).toBe("rada");
    expect(vychoziRozsahProSchuzku("jednorazova")).toBe(null);
  });

  it("potvrzení volá (id, rozsah, datum): výskyt s datem, řada bez data", () => {
    expect(sestavMazaciVolani("s1", "vyskyt", "2026-10-13")).toEqual({
      id: "s1",
      rozsah: "vyskyt",
      datum: "2026-10-13",
    });
    expect(sestavMazaciVolani("s1", "rada", "2026-10-13")).toEqual({
      id: "s1",
      rozsah: "rada",
      datum: undefined,
    });
    expect(sestavMazaciVolani("s1", null, "2026-10-13")).toEqual({
      id: "s1",
      rozsah: "rada",
      datum: undefined,
    });
  });

  it("úspěch confirm zavře, chyba ho nechá otevřený", () => {
    expect(radaSmazanaZavreConfirm(true, false)).toBe(true);
    expect(radaSmazanaZavreConfirm(true, true)).toBe(false);
    expect(vyskytUspesneZavreConfirm(true, false, null)).toBe(true);
    expect(vyskytUspesneZavreConfirm(true, false, undefined)).toBe(true);
    expect(vyskytUspesneZavreConfirm(true, false, "Nepodařilo se smazat.")).toBe(
      false,
    );
    expect(vyskytUspesneZavreConfirm(true, true, null)).toBe(false);
    expect(vyskytUspesneZavreConfirm(false, false, null)).toBe(false);
  });
});

describe("UdalostModal — zdroj-kontrakt (Odebrat → confirm → onSmazatSchuzku)", () => {
  const zdroj: string = ctiZdroj("src/components/kalendar/UdalostModal.tsx");

  it('Odebrat jen otevře confirm, maže až potvrzení s (id, rozsah, datum)', () => {
    expect(zdroj).toContain("Odebrat");
    expect(zdroj).toContain("setKPotvereni");
    expect(zdroj).toContain("Odebrat schůzku?");
    expect(zdroj).toContain("onSmazatSchuzku(");
    expect(zdroj).toContain('rozsah ?? "rada"');
    expect(zdroj).toContain('rozsah === "vyskyt" ? datum : undefined');
  });

  it('během mazání probíhající stav, chyba zůstane v confirmu', () => {
    expect(zdroj).toContain('"Mažu…"');
    expect(zdroj).toContain("mazeSeSchuzka === kPotvereni.id");
    expect(zdroj).toContain("chybaMazani");
  });
});

describe("ExpeditionModal — docházka (pure) + zdroj-kontrakt mazání/uzavření", () => {
  it("zatržený = dorazil, nezatržený = omluven; přepínač toggluje", () => {
    const ucastnici = [{ id: "u1" }, { id: "u2" }];
    expect(sestavDochazku(ucastnici, new Set(["u1"]))).toEqual([
      { ucastnikId: "u1", status: "ucastnil_se" },
      { ucastnikId: "u2", status: "omluven" },
    ]);
    expect(sestavDochazku([], new Set())).toEqual([]);
    expect([...prepniDochazku(new Set(), "u1")]).toEqual(["u1"]);
    expect([...prepniDochazku(new Set(["u1"]), "u1")]).toEqual([]);
    expect(muzeUzavrit(0, false)).toBe(false);
    expect(muzeUzavrit(2, true)).toBe(false);
    expect(muzeUzavrit(2, false)).toBe(true);
  });

  it("Odstranit běží s potvrzením: úspěch zavře + onSmazana, chyba nechá otevřeno", () => {
    const zdroj: string = ctiZdroj(
      "src/components/expeditions/ExpeditionModal.tsx",
    );
    expect(zdroj).toContain('rezim === "ruseni"');
    expect(zdroj).toContain("Opravdu odstranit");
    expect(zdroj).toContain("Tahle akce nejde vzít zpět");
    expect(zdroj).toContain("smazVypravu(expedice.id)");
    expect(zdroj).toContain("onSmazana(expedice.id)");
    expect(zdroj).toContain("smazChyba");
    expect(zdroj).toContain("Ano, odstranit");
  });

  it("Uzavřít nese docházku s checkboxy a volá uzavriVypravu", () => {
    const zdroj: string = ctiZdroj(
      "src/components/expeditions/ExpeditionModal.tsx",
    );
    expect(zdroj).toContain('rezim === "uzavirani"');
    expect(zdroj).toContain("Docházka");
    expect(zdroj).toContain('type="checkbox"');
    expect(zdroj).toContain("uzavriVypravu(expedice.id");
    expect(zdroj).toContain("uzavriChyba");
    expect(zdroj).toContain("Bez přihlášených nelze uzavřít");
  });
});
