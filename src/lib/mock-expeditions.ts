/**
 * Statická mock data pro demo seznam výprav (Krok 1).
 * Žádný fetch, žádné DB, žádné API – pouze hardcoded pole.
 */

export type ExpeditionStatus = "volno" | "skoro plno" | "proběhlá";

export interface ExpeditionCapacity {
  prihlaseno: number;
  celkem: number;
}

export interface Expedition {
  id: string;
  nazev: string;
  /** Datum ve formátu ISO (YYYY-MM-DD). */
  datum: string;
  /** Konec vícedenní výpravy (od–do); null = jednodenní. */
  datumDo: string | null;
  /** Místo a čas srazu. */
  sraz: string;
  popis: string;
  /** Odkaz na naplánovanou trasu (mapy.com) — "" = bez odkazu. */
  trasaOdkaz: string;
  kapacita: ExpeditionCapacity;
  stav: ExpeditionStatus;
}

export const mockExpeditions: Expedition[] = [
  {
    id: "sumava-trijezerska-slat",
    nazev: "Podzimní Šumava – Tříjezerní slať",
    datum: "2026-10-17",
    sraz: "Praha hl. n., 7:40",
    popis:
      "Lehký okruh slatěmi a lesy kolem Modravy. Vhodné i pro nováčky, svačina z vlastních zásob.",
    kapacita: { prihlaseno: 8, celkem: 18 },
    stav: "volno",
    trasaOdkaz: "",
    datumDo: null,
  },
  {
    id: "cesky-raj-prachov",
    nazev: "Český ráj – Prachovské skály",
    datum: "2026-10-24",
    sraz: "Turnov, aut. nádraží, 9:00",
    popis:
      "Smyčka mezi skalními vyhlídkami s výstupem na Přivýšinu. Návrat vlakem přes Jičín.",
    kapacita: { prihlaseno: 14, celkem: 16 },
    stav: "skoro plno",
    trasaOdkaz: "",
    datumDo: null,
  },
  {
    id: "brdy-tok",
    nazev: "Brdy – výšlap na Tok",
    datum: "2026-11-07",
    sraz: "Příbram, aut. nádraží, 8:15",
    popis:
      "Nejvyšší vrchol Brd po hřebeni přes Klobouček. Delší trasa, pevné boty nutné.",
    kapacita: { prihlaseno: 5, celkem: 20 },
    stav: "volno",
    trasaOdkaz: "",
    datumDo: null,
  },
  {
    id: "krkonose-snezka",
    nazev: "Krkonoše – Sněžka přes Obří důl",
    datum: "2026-11-21",
    sraz: "Pec pod Sněžkou, parkoviště, 7:30",
    popis:
      "Náročná celodenní túra Obřím dolem na Sněžku a zpět přes Růžohorky. Jen pro zdatné.",
    kapacita: { prihlaseno: 11, celkem: 12 },
    stav: "skoro plno",
    trasaOdkaz: "",
    datumDo: null,
  },
  {
    id: "podyji-vyhlidky",
    nazev: "Podyjí – vinice a vyhlídky",
    datum: "2026-12-05",
    sraz: "Znojmo, vlakové nádraží, 9:30",
    popis:
      "Poklidná trasa nad Dyjí s výhledy na hrad Hardegg. Zakončení na punči ve Znojmě.",
    kapacita: { prihlaseno: 3, celkem: 15 },
    stav: "volno",
    trasaOdkaz: "",
    datumDo: null,
  },
  {
    id: "krivoklatsko-berounka",
    nazev: "Křivoklátsko – údolím Berounky",
    datum: "2026-09-19",
    sraz: "Křivoklát, nádraží, 9:00",
    popis:
      "Už proběhlo: podzimní procházka údolím řeky s opékáním u ležení pod hradem.",
    kapacita: { prihlaseno: 16, celkem: 16 },
    stav: "proběhlá",
    trasaOdkaz: "",
    datumDo: null,
  },
  {
    id: "adrspach-broumovsko",
    nazev: "Adršpašské skály a Broumovsko",
    datum: "2026-09-05",
    sraz: "Adršpach, parkoviště, 9:00",
    popis:
      "Už proběhlo: víkend mezi skalními městy, přespání na faře v Teplicích nad Metují.",
    kapacita: { prihlaseno: 12, celkem: 14 },
    stav: "proběhlá",
    trasaOdkaz: "",
    datumDo: null,
  },
];
