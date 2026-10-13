/**
 * src/lib/kalendar.ts — Fáze 3: čistá logika měsíčního kalendáře.
 *
 * Bez závislostí na Reactu — UI (`KalendarMesic`) ji jen konzumuje.
 * - `mesicMrizka(rok, mesic)` — plná mřížka Po–Ne jako YMD (včetně dnů
 *   z vedlejších měsíců pro doplnění do celých týdnů).
 * - `mesicMrizkaSKontextem(rok, mesic)` — stejná mřížka + příznak
 *   `mimoMesic` pro šedé neklikatelné dny.
 * - `dnyVypravy(expedice)` — dny pokryté výpravou (datum..datumDo, cap 62).
 * - `vyskytySchuzky(schuzka, rok, mesic)` — rozpad opakování na výskyty
 *   v daném měsíci (`jednorazova` = 0–1 den, `tydenni` = stejný weekday
 *   od prvního výskytu dál).
 * - `udalostiProMesic(...)` — sjednocení výprav + schůzek na dny YMD
 *   (včetně vedlejších dnů viditelných v mřížce).
 *
 * Volba 5x7 vs 5-6x7: mřížka má min 35 a max 42 buněk (5–6 řádků x 7).
 * Primárně 5x7 (35); měsíce potřebující 6 týdnů (např. srpen 2026 —
 * 31 dní od soboty) padnou na 6x7 (42). Vždy 35 by ořezalo poslední
 * dny 6týdenních měsíců (ztráta událostí, rozbitý pás), proto fallback 42.
 */

import type { ApiSchuzka } from "../shared/api-types";
import type { Expedition } from "./mock-expeditions";

export type TypUdalosti = "vyprava" | "schuzka";

export interface KalendarniUdalost {
  typ: TypUdalosti;
  id: string;
  nazev: string;
  /** Den výskytu YYYY-MM-DD (u vícedenní výpravy každý pokrytý den). */
  datum: string;
  /** Druhotná informace do výpisu dne (sraz / místnost). */
  detail: string | null;
}

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function jeYmd(hodnota: string): boolean {
  return YMD_REGEX.test(hodnota);
}

function ymd(rok: number, mesic: number, den: number): string {
  return `${rok}-${String(mesic).padStart(2, "0")}-${String(den).padStart(2, "0")}`;
}

/** Počet dní v měsíci (mesic 1–12). */
export function dnuVMesici(rok: number, mesic: number): number {
  return new Date(rok, mesic, 0).getDate();
}

/** Weekday dne YMD jako Po=0..Ne=6. */
export function weekdayPondeliPrvni(denYmd: string): number {
  const den = new Date(`${denYmd}T12:00:00`);
  return (den.getDay() + 6) % 7;
}

/** Buňka měsíční mřížky s kontextem (šedý neklikatelní den mimo měsíc). */
export interface BunkaMesice {
  ymd: string;
  mimoMesic: boolean;
}

/**
 * Plná měsíční mřížka Po–Ne s kontextem: vždy celé týdny, min 35
 * a max 42 buněk (5–6x7), bez `null` — dny mimo měsíc jsou YMD
 * z předchozího/následujícího měsíce s `mimoMesic: true`.
 * Nevalidní rok/měsíc → prázdné pole (volající ukáže fallback).
 */
export function mesicMrizkaSKontextem(
  rok: number,
  mesic: number,
): BunkaMesice[] {
  if (!Number.isInteger(rok) || !Number.isInteger(mesic)) return [];
  if (mesic < 1 || mesic > 12) return [];
  if (rok < 1900 || rok > 2200) return [];
  const prvni = weekdayPondeliPrvni(ymd(rok, mesic, 1));
  const pocet = dnuVMesici(rok, mesic);
  let celkem = Math.ceil((prvni + pocet) / 7) * 7;
  if (celkem < 35) celkem = 35;
  const start = new Date(rok, mesic - 1, 1);
  start.setDate(1 - prvni);
  const bunky: BunkaMesice[] = [];
  for (let i = 0; i < celkem; i += 1) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const denYmd = ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    bunky.push({
      ymd: denYmd,
      mimoMesic: dt.getMonth() + 1 !== mesic || dt.getFullYear() !== rok,
    });
  }
  return bunky;
}

/**
 * Buňky měsíční mřížky (vždy Po–Ne, celé týdny): YMD včetně dnů
 * z vedlejších měsíců pro doplnění do 5x7 (35), u 6týdenních měsíců
 * 6x7 (42). Bez `null` — kontext (mimo-měsíc) dává
 * `mesicMrizkaSKontextem`. Nevalidní rok/měsíc → prázdné pole.
 */
export function mesicMrizka(rok: number, mesic: number): string[] {
  return mesicMrizkaSKontextem(rok, mesic).map((b) => b.ymd);
}

/**
 * Týdenní mřížka Po–Ne pro datum uvnitř týdne (YMD → 7 YMD).
 * Vždy plných 7 dnů, bez `null` (trailing/leading netřeba).
 * Nevalidní datum → prázdné pole (volající ukáže fallback).
 */
export function tydenMrizka(datumVTydnu: string): string[] {
  if (!jeYmd(datumVTydnu)) return [];
  const offset = weekdayPondeliPrvni(datumVTydnu);
  const zaklad = new Date(`${datumVTydnu}T12:00:00`);
  if (Number.isNaN(zaklad.getTime())) return [];
  zaklad.setDate(zaklad.getDate() - offset);
  const tyden: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dt = new Date(zaklad);
    dt.setDate(zaklad.getDate() + i);
    tyden.push(ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()));
  }
  return tyden;
}
/** Lidský název měsíce česky: `říjen 2026`. */
const MESIC_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});

export function nazevMesice(rok: number, mesic: number): string {
  return MESIC_FORMAT.format(new Date(rok, mesic - 1, 1));
}

/**
 * Dny pokryté výpravou (datum..datumDo včetně). Nevalidní / obrácený
 * rozsah → jen `datum` (fail-safe). Cap 62 dní proti patologickým datům.
 */
export function dnyVypravy(
  expedice: Pick<Expedition, "datum" | "datumDo">,
): string[] {
  const od = expedice.datum.slice(0, 10);
  if (!jeYmd(od)) return [];
  const rawDo = expedice.datumDo;
  const konec =
    rawDo === null || rawDo.length === 0 ? od : rawDo.slice(0, 10);
  if (!jeYmd(konec) || konec < od) return [od];
  const dny: string[] = [od];
  let kurzor = od;
  for (let i = 0; i < 62; i += 1) {
    if (kurzor >= konec) break;
    const dt = new Date(`${kurzor}T12:00:00`);
    dt.setDate(dt.getDate() + 1);
    const dalsi = ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    dny.push(dalsi);
    kurzor = dalsi;
  }
  return dny;
}

/**
 * Výskyty schůzky v daném měsíci (YMD, vzestupně).
 * - `jednorazova` → `[datum]`, jen když padne do měsíce.
 * - `tydenni` → každý den měsíce se stejným weekday jako `datum`,
 *   od `datum` dál — mínus `vynecheneVyskyty` (B4: stavy, kde uživatel
 *   zrušil jednorázově jeden výskyt).
 */
export function vyskytySchuzky(
  schuzka: Pick<ApiSchuzka, "datum" | "opakovani" | "vynecheneVyskyty">,
  rok: number,
  mesic: number,
): string[] {
  const start = schuzka.datum.slice(0, 10);
  if (!jeYmd(start)) return [];
  if (!Number.isInteger(rok) || !Number.isInteger(mesic)) return [];
  if (mesic < 1 || mesic > 12) return [];
  const vynechene = new Set(
    (schuzka.vynecheneVyskyty ?? []).filter(jeYmd),
  );
  if (schuzka.opakovani === "jednorazova") {
    if (vynechene.has(start)) return [];
    return start.slice(0, 7) === `${rok}-${String(mesic).padStart(2, "0")}`
      ? [start]
      : [];
  }
  if (schuzka.opakovani !== "tydenni") return [];
  const cilWeekday = weekdayPondeliPrvni(start);
  const vyskyty: string[] = [];
  const pocet = dnuVMesici(rok, mesic);
  for (let den = 1; den <= pocet; den += 1) {
    const denYmd = ymd(rok, mesic, den);
    if (denYmd < start) continue;
    if (vynechene.has(denYmd)) continue;
    if (weekdayPondeliPrvni(denYmd) === cilWeekday) vyskyty.push(denYmd);
  }
  return vyskyty;
}

/** Varianta dne podle typu událostí (jen typ, bez stavu dnes/vybráno). */
export type DenVarianta = "prazdny" | "vyprava" | "schuzka" | "oboji";

/** Pozice dne v pásu stejné výpravy (segmentovaná po řádcích mřížky). */
export type PoziceVPasu = "start" | "middle" | "end" | "single";

/**
 * Výpravy dne (typ `vyprava`, řazení z `udalostiProMesic` zachováno).
 */
export function vypravyDne(
  udalosti: ReadonlyArray<KalendarniUdalost>,
): KalendarniUdalost[] {
  return udalosti.filter((u) => u.typ === "vyprava");
}

/**
 * Schůzky dne (typ `schuzka`).
 */
export function schuzkyDne(
  udalosti: ReadonlyArray<KalendarniUdalost>,
): KalendarniUdalost[] {
  return udalosti.filter((u) => u.typ === "schuzka");
}

/**
 * Stejná výprava = stejné `id` (typ `vyprava` na obou stranách).
 * Odděluje různé výpravy ve stejném dni (stack) i různé dny.
 */
export function jeStejnaVyprava(
  a: Pick<KalendarniUdalost, "typ" | "id">,
  b: Pick<KalendarniUdalost, "typ" | "id">,
): boolean {
  return a.typ === "vyprava" && b.typ === "vyprava" && a.id === b.id;
}

/** Má den `datumYmd` v mapě událost výpravy `vypravaId`? */
function denMaVypravu(
  mapa: ReadonlyMap<string, ReadonlyArray<KalendarniUdalost>>,
  datumYmd: string,
  vypravaId: string,
): boolean {
  const denni = mapa.get(datumYmd);
  if (denni === undefined) return false;
  return denni.some((u) => u.typ === "vyprava" && u.id === vypravaId);
}

/**
 * Pozice dne v pásu výpravy `vypravaId`.
 *
 * Propojení = sousední dny v MŘÍŽCE (`mrizka` plných 35/42 YMD
 * z `mesicMrizka`, včetně mimo-dnů — proto pás navazuje přes hranu
 * měsíce) se stejným id výpravy. Segmentace po řádcích
 * (must-fix zalomení): levý soused se počítá jen ve stejném řádku
 * (`index % 7 !== 0`), pravý jen když není konec řádku
 * (`index % 7 !== 6`). Začátek řádku je tedy vždy zaoblený vlevo
 * i když je to střed výpravy, konec řádku vpravo.
 * Legacy `null` buňky (staré doplnění) pás vždy přerušují.
 *
 * Neznámý den / den bez výpravy → `null`.
 */
export function poziceVPasu(
  vypravaId: string,
  datumYmd: string,
  mrizka: ReadonlyArray<string | null>,
  mapa: ReadonlyMap<string, ReadonlyArray<KalendarniUdalost>>,
): PoziceVPasu | null {
  if (vypravaId.length === 0) return null;
  if (!denMaVypravu(mapa, datumYmd, vypravaId)) return null;
  const index = mrizka.indexOf(datumYmd);
  if (index === -1) return "single";
  let vlevo = false;
  let vpravo = false;
  if (index % 7 !== 0) {
    const soused = mrizka[index - 1];
    if (soused !== null && soused !== undefined) {
      vlevo = denMaVypravu(mapa, soused, vypravaId);
    }
  }
  if (index % 7 !== 6) {
    const soused = mrizka[index + 1];
    if (soused !== null && soused !== undefined) {
      vpravo = denMaVypravu(mapa, soused, vypravaId);
    }
  }
  if (vlevo && vpravo) return "middle";
  if (vlevo) return "end";
  if (vpravo) return "start";
  return "single";
}

/**
 * Pořadí dne výpravy v rámci viditelného měsíce: `{ poradi, celkem }`.
 * `poradi` = 1-based index data v seřazených dnech se stejným id,
 * `celkem` = počet takových dní. Přes wrap řádku se nečísluje znovu —
 * číslování je globální za výpravu (den X z Y). Neznámý den → `null`.
 */
export function poradiVypravy(
  vypravaId: string,
  datumYmd: string,
  mapa: ReadonlyMap<string, ReadonlyArray<KalendarniUdalost>>,
): { poradi: number; celkem: number } | null {
  if (vypravaId.length === 0) return null;
  const dny: string[] = [];
  for (const [den, denni] of mapa) {
    if (denni.some((u) => u.typ === "vyprava" && u.id === vypravaId)) {
      dny.push(den);
    }
  }
  dny.sort();
  const idx = dny.indexOf(datumYmd);
  if (idx === -1) return null;
  return { poradi: idx + 1, celkem: dny.length };
}
/**
 * Varianta dne z událostí dne. Čistá funkce pro UI (`KalendarMesic`).
 * Precedence typů: obojí > výprava / schůzka > prázdný.
 */
export function getDayVariant(
  udalosti: ReadonlyArray<KalendarniUdalost>,
): DenVarianta {
  let maVypravu = false;
  let maSchuzku = false;
  for (const u of udalosti) {
    if (u.typ === "vyprava") maVypravu = true;
    else if (u.typ === "schuzka") maSchuzku = true;
    if (maVypravu && maSchuzku) break;
  }
  if (maVypravu && maSchuzku) return "oboji";
  if (maVypravu) return "vyprava";
  if (maSchuzku) return "schuzka";
  return "prazdny";
}

/** České skloňování „akce": 1 akce, 2–4 akce, 5+ akcí. */
export function sklonujAkce(pocet: number): string {
  return pocet === 1 || (pocet >= 2 && pocet <= 4) ? "akce" : "akcí";
}

/**
 * Přístupný popisek dne pro `aria-label` tlačítka.
 * Formát: „12. — výprava a schůzka, 3 akce" / „5. — výprava, 1 akce"
 * / „7. — bez akce". Typ popisuje jen přítomné druhy, počet je celkový.
 * Nevalidní datum → „— bez akce" fallback (fail-safe, nikdy nepadá).
 *
 * Volitelný `kontext` (mřížka + mapa) připojí detail pásu:
 * název první výpravy + „den X z Y" (globálně za výpravu, přes wrap
 * řádku se nečísluje znovu) + počet schůzek. Bez kontextu se vrací
 * původní krátký formát (zpětná kompatibilita).
 */
export function popisekDne(
  datumYmd: string,
  udalosti: ReadonlyArray<KalendarniUdalost>,
  kontext?: {
    mrizka?: ReadonlyArray<string | null>;
    mapa?: ReadonlyMap<string, ReadonlyArray<KalendarniUdalost>>;
  },
): string {
  const shoda = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datumYmd);
  const cisloDne = shoda === null ? 0 : Number(shoda[3]);
  const zahlavi = Number.isInteger(cisloDne) && cisloDne >= 1 ? `${cisloDne}.` : "—";
  if (udalosti.length === 0) return `${zahlavi} — bez akce`;
  const varianta = getDayVariant(udalosti);
  const typPopis =
    varianta === "oboji"
      ? "výprava a schůzka"
      : varianta === "vyprava"
        ? "výprava"
        : "schůzka";
  const zaklad = `${zahlavi} — ${typPopis}, ${udalosti.length} ${sklonujAkce(udalosti.length)}`;
  if (kontext?.mapa === undefined) return zaklad;
  const detaily: string[] = [];
  const vypravy = vypravyDne(udalosti);
  if (vypravy.length > 0) {
    const viditelne = vypravy.slice(0, 2);
    for (const vyprava of viditelne) {
      const poradi = poradiVypravy(vyprava.id, datumYmd, kontext.mapa);
      detaily.push(
        poradi === null
          ? vyprava.nazev
          : `${vyprava.nazev}, den ${poradi.poradi} z ${poradi.celkem}`,
      );
    }
    if (vypravy.length > 2) {
      detaily.push(`dalších výprav ${vypravy.length - 2}`);
    }
  }
  const pocetSchuzek = schuzkyDne(udalosti).length;
  if (pocetSchuzek > 0) {
    detaily.push(
      pocetSchuzek === 1 ? "1 schůzka" : `${pocetSchuzek} schůzky`,
    );
  }
  if (detaily.length === 0) return zaklad;
  return `${zaklad}: ${detaily.join(", ")}`;
}

export interface UdalostiVstup {
  expedice: ReadonlyArray<
    Pick<Expedition, "id" | "nazev" | "datum" | "datumDo" | "sraz">
  >;
  schuzky: ReadonlyArray<
    Pick<
      ApiSchuzka,
      "id" | "nazev" | "datum" | "mistnost" | "opakovani" | "vynecheneVyskyty"
    >
  >;
}

/**
 * Sjednocení výprav + schůzek na dny `YYYY-MM-DD → události`.
 * Dny cílového měsíce + vedlejší dny viditelné v mřížce
 * (`mesicMrizka` 35/42), aby šedé mimo-dny nesly pás/tečku a pás
 * navazoval přes hranu měsíce; řazení v rámci dne: výpravy před
 * schůzkami, pak podle názvu (deterministický výpis).
 */
export function udalostiProMesic(
  vstup: UdalostiVstup,
  rok: number,
  mesic: number,
): Map<string, KalendarniUdalost[]> {
  const mapa = new Map<string, KalendarniUdalost[]>();
  const mrizka = mesicMrizka(rok, mesic);
  if (mrizka.length === 0) return mapa;
  const viditelne = new Set(mrizka);

  function pridej(udalost: KalendarniUdalost): void {
    if (!viditelne.has(udalost.datum)) return;
    const seznam = mapa.get(udalost.datum);
    if (seznam === undefined) mapa.set(udalost.datum, [udalost]);
    else seznam.push(udalost);
  }

  const sousedni = [
    mesic === 1 ? { rok: rok - 1, mesic: 12 } : { rok, mesic: mesic - 1 },
    { rok, mesic },
    mesic === 12 ? { rok: rok + 1, mesic: 1 } : { rok, mesic: mesic + 1 },
  ];

  for (const expedice of vstup.expedice) {
    if (typeof expedice.id !== "string" || expedice.id.length === 0) continue;
    if (typeof expedice.nazev !== "string" || expedice.nazev.length === 0)
      continue;
    for (const den of dnyVypravy({
      datum: expedice.datum,
      datumDo: expedice.datumDo ?? null,
    })) {
      pridej({
        typ: "vyprava",
        id: expedice.id,
        nazev: expedice.nazev,
        datum: den,
        detail: typeof expedice.sraz === "string" ? expedice.sraz : null,
      });
    }
  }

  for (const schuzka of vstup.schuzky) {
    if (typeof schuzka.id !== "string" || schuzka.id.length === 0) continue;
    if (typeof schuzka.nazev !== "string" || schuzka.nazev.length === 0)
      continue;
    for (const { rok: r, mesic: m } of sousedni) {
      for (const den of vyskytySchuzky(schuzka, r, m)) {
        pridej({
          typ: "schuzka",
          id: schuzka.id,
          nazev: schuzka.nazev,
          datum: den,
          detail: schuzka.mistnost,
        });
      }
    }
  }

  for (const seznam of mapa.values()) {
    seznam.sort((a, b) => {
      if (a.typ !== b.typ) return a.typ === "vyprava" ? -1 : 1;
      return a.nazev.localeCompare(b.nazev, "cs");
    });
  }
  return mapa;
}

/**
 * Sjednocení výprav + schůzek na dny daného týdne (Po–Ne).
 * Reuse `udalostiProMesic` po měsících, které týden překrývá
 * (typicky 1, přes hranu měsíce/roku 2) — proto týden přes
 * 30. 9. → 6. 10. neztratí ani výpravy (`dnyVypravy` přes hranici),
 * ani týdenní schůzky (`vyskytySchuzky` per-měsíc). Vrací jen dny
 * s událostmi (stejně jako `udalostiProMesic`).
 * Nevalidní kotva → prázdná mapa.
 */
export function udalostiProTyden(
  vstup: UdalostiVstup,
  datumVTydnu: string,
): Map<string, KalendarniUdalost[]> {
  const tyden = tydenMrizka(datumVTydnu);
  if (tyden.length === 0) return new Map();
  const mesice = new Map<string, { rok: number; mesic: number }>();
  for (const den of tyden) {
    const rok = Number(den.slice(0, 4));
    const mesic = Number(den.slice(5, 7));
    mesice.set(den.slice(0, 7), { rok, mesic });
  }
  const dnyTydne = new Set(tyden);
  const vysledek = new Map<string, KalendarniUdalost[]>();
  for (const { rok, mesic } of mesice.values()) {
    const mesicni = udalostiProMesic(vstup, rok, mesic);
    for (const [den, seznam] of mesicni) {
      if (dnyTydne.has(den) && !vysledek.has(den)) {
        vysledek.set(den, seznam);
      }
    }
  }
  return vysledek;
}
