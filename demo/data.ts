import type { UserId } from "../src/shared/api-typy/spolecne.ts";
/**
 * Ukázková data pro `npm run dev:demo`. Nic z toho nejde do databáze ani do
 * produkčního sestavení: čte to jen Vite plugin `demo/plugin.ts`.
 * Jména, výpravy i písně jsou smyšlené (texty písní původní, ne převzaté).
 */
import type {
  ApiAlbum,
  ApiAlbumFotka,
  ApiExpedice,
  ApiFotka,
  ApiKonverzace,
  ApiSchuzka,
  ApiUcastnik,
  ApiUser,
  ApiZprava,
  ApiZpravaPriloha,
  UserListItem,
} from "../src/shared/api-types.ts";
import type { ApiZpevnikPisen, ApiZpevnikNavrh } from "../src/shared/zpevnik.ts";
import { parsujVlozeni, textZTela, type Blok, type TeloPisne } from "../src/shared/zpevnik.ts";
import { SKUPINA_ROLE, type PravoSkupiny } from "../src/lib/skupiny-pristup.ts";

/* ---------------------------------------------------------------- */
/* Pomocné                                                          */
/* ---------------------------------------------------------------- */

function den(posun: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + posun);
  return d.toISOString().slice(0, 10);
}

function cas(posunDni: number, hodina: number, minuta = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + posunDni);
  d.setHours(hodina, minuta, 0, 0);
  return d.toISOString();
}

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

/* ---------------------------------------------------------------- */
/* Uživatelé                                                        */
/* ---------------------------------------------------------------- */

type Osoba = {
  jmeno: string;
  prijmeni: string;
  clenstvi: "clen" | "aktivni_clen";
  funkce: "vedeni" | "rada" | null;
  isAdmin?: boolean;
  isSuperadmin?: boolean;
  trida: string;
  telefon?: string;
  discord?: string;
  barva?: string;
};

const OSOBY: Osoba[] = [
  { jmeno: "Michal", prijmeni: "Kappel", clenstvi: "aktivni_clen", funkce: "rada", isAdmin: true, isSuperadmin: true, trida: "2.B", telefon: "+420775522274", discord: "kaplick", barva: "zelená" },
  { jmeno: "Tereza", prijmeni: "Vlčková", clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: true, trida: "3.A", telefon: "+420731448902", discord: "terka.v", barva: "oranžová" },
  { jmeno: "Zdeněk", prijmeni: "Hruška", clenstvi: "aktivni_clen", funkce: "rada", trida: "3.C", telefon: "+420604118220", discord: "zdenda" },
  { jmeno: "Adam", prijmeni: "Hněvkovský", clenstvi: "aktivni_clen", funkce: null, trida: "2.A", discord: "adamh" },
  { jmeno: "Aleš", prijmeni: "Farkaš", clenstvi: "aktivni_clen", funkce: null, trida: "4.B" },
  { jmeno: "Kristýna", prijmeni: "Malá", clenstvi: "aktivni_clen", funkce: "vedeni", trida: "4.A", telefon: "+420722901133", barva: "modrá" },
  { jmeno: "Ondřej", prijmeni: "Sýkora", clenstvi: "aktivni_clen", funkce: null, trida: "1.B" },
  { jmeno: "Barbora", prijmeni: "Nováková", clenstvi: "clen", funkce: null, trida: "1.A" },
  { jmeno: "Jakub", prijmeni: "Dvořák", clenstvi: "aktivni_clen", funkce: null, trida: "3.B", discord: "kubad" },
  { jmeno: "Eliška", prijmeni: "Procházková", clenstvi: "clen", funkce: null, trida: "2.C" },
  { jmeno: "Matěj", prijmeni: "Kučera", clenstvi: "aktivni_clen", funkce: "rada", trida: "4.C" },
  { jmeno: "Anna", prijmeni: "Veselá", clenstvi: "clen", funkce: null, trida: "1.C" },
  { jmeno: "Vojtěch", prijmeni: "Horák", clenstvi: "aktivni_clen", funkce: null, trida: "2.B" },
  { jmeno: "Natálie", prijmeni: "Černá", clenstvi: "clen", funkce: null, trida: "3.A" },
  { jmeno: "Filip", prijmeni: "Pokorný", clenstvi: "aktivni_clen", funkce: null, trida: "4.B" },
  { jmeno: "Klára", prijmeni: "Benešová", clenstvi: "clen", funkce: null, trida: "1.B" },
  { jmeno: "Lukáš", prijmeni: "Marek", clenstvi: "aktivni_clen", funkce: null, trida: "2.A" },
  { jmeno: "Sofie", prijmeni: "Říhová", clenstvi: "clen", funkce: null, trida: "1.A" },
];

function bezDiakritiky(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function roleZ(o: Osoba): ApiUser["role"] {
  if (o.isAdmin) return "admin";
  if (o.funkce === "vedeni") return "vedeni";
  if (o.funkce === "rada") return "clen-rady";
  return o.clenstvi === "aktivni_clen" ? "aktivni-clen" : "clen";
}

export const UZIVATELE: ApiUser[] = OSOBY.map((o, i) => ({
  id: uuid(i + 1) as UserId,
  email: `${bezDiakritiky(o.jmeno)}.${bezDiakritiky(o.prijmeni)}@demo.exapp.cz`,
  jmeno: o.jmeno,
  prijmeni: o.prijmeni,
  telefon: o.telefon ?? null,
  discordNick: o.discord ?? null,
  role: roleZ(o),
  authRole: o.isSuperadmin ? "SUPERADMIN" : o.isAdmin ? "ADMIN" : "USER",
  clenstvi: o.clenstvi,
  funkce: o.funkce,
  isAdmin: o.isAdmin === true,
  isSuperadmin: o.isSuperadmin === true,
  skola: "SSPŠ",
  trida: o.trida,
  stravaId: null,
  avatarUrl: null,
  bio: "",
  oblibenaBarva: o.barva ?? "",
  narozeniny: i % 3 === 0 ? `200${7 + (i % 3)}-0${1 + (i % 9)}-1${i % 9}` : null,
  createdAt: cas(-400 + i * 9, 10),
  updatedAt: cas(-20, 10),
}));

export const JA: ApiUser = UZIVATELE[0];

export function seznamUzivatelu(): UserListItem[] {
  return UZIVATELE.map((u) => ({
    id: u.id,
    jmeno: `${u.jmeno} ${u.prijmeni ?? ""}`.trim(),
    krestniJmeno: u.jmeno,
    prijmeni: u.prijmeni ?? "",
    email: u.email,
    role: u.role,
    clenstvi: u.clenstvi,
    funkce: u.funkce,
    isAdmin: u.isAdmin,
    isSuperadmin: u.isSuperadmin,
    skola: u.skola ?? "",
    trida: u.trida ?? "",
    discordNick: u.discordNick ?? null,
    telefon: u.telefon ?? null,
    avatarUrl: null,
    oblibenaBarva: u.oblibenaBarva ?? "",
    narozeniny: u.narozeniny ?? null,
    pocetFotek: 0,
  }));
}

function celeJmeno(index: number): string {
  const u = UZIVATELE[index];
  return `${u.jmeno} ${u.prijmeni ?? ""}`.trim();
}

/* ---------------------------------------------------------------- */
/* Výpravy                                                          */
/* ---------------------------------------------------------------- */

type Plan = {
  id: string;
  nazev: string;
  od: number;
  dni?: number;
  sraz: string;
  popis: string;
  kapacita: number;
  prihlaseno: number;
  uzavrena?: boolean;
  km?: number;
  prevyseni?: number;
  organizator: number;
  trasa?: string;
};

const PLANY: Plan[] = [
  { id: "demo-podyji", nazev: "Podyjí – vinice a vyhlídky", od: 16, sraz: "Znojmo, vlakové nádraží, 9:30", popis: "Poklidná trasa nad Dyjí s výhledy na hrad Hardegg. Zhruba 14 km, většinou po rovině, na konci ochutnávka moštu.", kapacita: 15, prihlaseno: 9, organizator: 1, trasa: "https://mapy.com/" },
  { id: "demo-palava", nazev: "Pálava – Děvín", od: 16, sraz: "Mikulov, náměstí, 13:00", popis: "Odpolední výstup na Děvín a návrat přes zříceninu Sirotčí hrádek.", kapacita: 12, prihlaseno: 8, organizator: 2 },
  { id: "demo-beskydy", nazev: "Beskydy – Lysá hora", od: 22, dni: 3, sraz: "Frýdek-Místek, nádraží, 7:15", popis: "Třídenní přechod hřebene s noclehy na chatě. Bereme spacák a čelovku.", kapacita: 14, prihlaseno: 13, organizator: 5 },
  { id: "demo-viden", nazev: "Vídeň – adventní trhy", od: 22, dni: 2, sraz: "Brno, hlavní nádraží, 6:40", popis: "Kulturní výprava s procházkou po vnitřním městě a večerními trhy.", kapacita: 20, prihlaseno: 11, organizator: 1 },
  { id: "demo-jeseniky", nazev: "Jeseníky – zimní tábor", od: 22, dni: 4, sraz: "Šumperk, nádraží, 16:00", popis: "Zimní tábor na chatě pod Pradědem: běžky, sáňky a večerní hry.", kapacita: 12, prihlaseno: 6, organizator: 10 },
  { id: "demo-rip", nazev: "Vánoční výšlap na Říp", od: 30, sraz: "Roudnice nad Labem, 8:00", popis: "Tradiční předvánoční výšlap s čajem nahoře.", kapacita: 0, prihlaseno: 17, organizator: 0 },
  { id: "demo-silvestr", nazev: "Silvestrovský výšlap", od: 42, sraz: "Praha, hlavní nádraží, 9:00", popis: "Poslední výprava roku, krátká trasa a oběd v hospodě.", kapacita: 18, prihlaseno: 4, organizator: 1 },
  { id: "demo-krivoklat", nazev: "Advent na Křivoklátě", od: 55, sraz: "Beroun, nádraží, 8:30", popis: "Hrad, adventní program a cesta údolím Berounky.", kapacita: 20, prihlaseno: 8, organizator: 5 },
  { id: "demo-sumava-zima", nazev: "Šumava na sněžnicích", od: 70, dni: 2, sraz: "Klatovy, nádraží, 7:00", popis: "Dva dny na sněžnicích kolem Prášil, nocleh v penzionu.", kapacita: 10, prihlaseno: 3, organizator: 2 },
  { id: "demo-brdy", nazev: "Brdy – Padrťské rybníky", od: -1, dni: 3, sraz: "Rožmitál pod Třemšínem, 8:00", popis: "Právě probíhající výprava po Brdech.", kapacita: 14, prihlaseno: 12, organizator: 1 },
  { id: "demo-sumava-podzim", nazev: "Podzimní Šumava – Tříjezerní slať", od: -28, dni: 3, sraz: "Praha, hlavní nádraží, 7:40", popis: "Rašeliniště a lesy kolem Tříjezerní slati.", kapacita: 18, prihlaseno: 6, organizator: 5 },
  { id: "demo-prachov", nazev: "Český ráj – Prachovské skály", od: -21, sraz: "Turnov, autobusové nádraží, 9:00", popis: "Skalní město a vyhlídky.", kapacita: 16, prihlaseno: 9, organizator: 2 },
  { id: "demo-snezka", nazev: "Krkonoše – Sněžka na podzim", od: -14, dni: 3, sraz: "Praha, hlavní nádraží, 6:20", popis: "Výstup na Sněžku a hřebenovka.", kapacita: 14, prihlaseno: 9, organizator: 10 },
  { id: "demo-krivoklatsko", nazev: "Křivoklátsko – údolím Berounky", od: -61, sraz: "Křivoklát, nádraží, 8:00", popis: "Podzimní procházka údolím.", kapacita: 16, prihlaseno: 10, uzavrena: true, km: 18.6, prevyseni: 540, organizator: 1 },
  { id: "demo-stredohori", nazev: "13 vrcholů Českého středohoří", od: -34, dni: 2, sraz: "Lovosice, nádraží, 6:30", popis: "Dvoudenní výzva přes třináct kopců.", kapacita: 16, prihlaseno: 12, uzavrena: true, km: 42.3, prevyseni: 2150, organizator: 2 },
  { id: "demo-sazava", nazev: "Sázava – Posázavská stezka", od: -54, sraz: "Týnec nad Sázavou, 8:30", popis: "Stezka podél řeky.", kapacita: 18, prihlaseno: 14, uzavrena: true, km: 21, prevyseni: 380, organizator: 5 },
  { id: "demo-palava-podzim", nazev: "Pálava – stepí a vinicemi", od: -80, sraz: "Dolní Věstonice, 9:00", popis: "Stepní hřebeny Pálavy.", kapacita: 14, prihlaseno: 11, uzavrena: true, km: 16.4, prevyseni: 610, organizator: 1 },
  { id: "demo-kokorin", nazev: "Kokořínsko – pískovcové skály", od: -102, sraz: "Mělník, 8:15", popis: "Skalní útvary a hrad Kokořín.", kapacita: 16, prihlaseno: 13, uzavrena: true, km: 19.2, prevyseni: 420, organizator: 10 },
  { id: "demo-blanik", nazev: "Velký Blaník", od: -130, sraz: "Louňovice pod Blaníkem, 9:00", popis: "Pověsti a rozhledna.", kapacita: 0, prihlaseno: 15, uzavrena: true, km: 11.8, prevyseni: 300, organizator: 2 },
];

/** Kódování polyline (Google), přesnost 5 desetinných míst. */
function zakodujPolyline(body: Array<[number, number]>): string {
  let vystup = "";
  let predLat = 0;
  let predLng = 0;
  const zakoduj = (hodnota: number): string => {
    let v = hodnota < 0 ? ~(hodnota << 1) : hodnota << 1;
    let r = "";
    while (v >= 0x20) {
      r += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return r + String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of body) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    vystup += zakoduj(la - predLat) + zakoduj(ln - predLng);
    predLat = la;
    predLng = ln;
  }
  return vystup;
}

/** Vymyšlená trasa: náhodná procházka kolem bodu v Česku, délka podle km. */
function trasaDemo(seed: number, km: number): string {
  let x = Math.sin(seed * 12.9898) * 43758.5453;
  const nahoda = (): number => {
    x = Math.sin(x) * 43758.5453;
    return x - Math.floor(x);
  };
  let lat = 49.4 + nahoda() * 1.3;
  let lng = 13.4 + nahoda() * 3.8;
  let smer = nahoda() * Math.PI * 2;
  const kroky = Math.max(12, Math.round(km * 2));
  const body: Array<[number, number]> = [[lat, lng]];
  for (let i = 0; i < kroky; i += 1) {
    smer += (nahoda() - 0.5) * 0.9;
    lat += Math.cos(smer) * 0.0045;
    lng += Math.sin(smer) * 0.0068;
    body.push([lat, lng]);
  }
  return zakodujPolyline(body);
}

export const VYPRAVY: ApiExpedice[] = PLANY.map((p, pi) => {
  const datum = den(p.od);
  const datumDo = p.dni !== undefined && p.dni > 1 ? den(p.od + p.dni - 1) : null;
  const plno = p.kapacita > 0 && p.prihlaseno / p.kapacita >= 0.85;
  return {
    id: p.id,
    nazev: p.nazev,
    datum,
    datumDo,
    sraz: p.sraz,
    popis: p.popis,
    trasaOdkaz: p.trasa ?? "",
    kapacita: { prihlaseno: p.prihlaseno, celkem: p.kapacita },
    km: p.km ?? null,
    prevyseniM: p.prevyseni ?? null,
    trasaPolyline: p.uzavrena && p.km !== undefined ? trasaDemo(pi + 1, p.km) : null,
    stravaActivityId: null,
    nahledFotkaId: p.uzavrena ? `${p.id}-f1` : null,
    organizatorId: UZIVATELE[p.organizator].id,
    stav: p.uzavrena ? "proběhlá" : plno ? "skoro plno" : "volno",
  };
});

export const UCASTNICI = new Map<string, ApiUcastnik[]>(
  PLANY.map((p, pi) => {
    const pocet = Math.min(p.prihlaseno, UZIVATELE.length);
    const seznam: ApiUcastnik[] = [];
    for (let i = 0; i < pocet; i += 1) {
      const index = (pi * 3 + i) % UZIVATELE.length;
      if (seznam.some((u) => u.userId === UZIVATELE[index].id)) continue;
      seznam.push({
        id: `${p.id}-u${i}`,
        expeditionId: p.id,
        userId: UZIVATELE[index].id,
        clenId: null,
        jmeno: celeJmeno(index),
        status: p.uzavrena ? (i % 7 === 6 ? "omluven" : "ucastnil_se") : "prihlasen",
        createdAt: cas(p.od - 20 + i, 18, 10),
        avatarUrl: null,
      });
    }
    return [p.id, seznam];
  }),
);

export const FOTKY_VYPRAV = new Map<string, ApiFotka[]>(
  PLANY.filter((p) => p.uzavrena).map((p) => {
    const fotky: ApiFotka[] = Array.from({ length: 6 + (p.id.length % 5) }, (_, i) => ({
      id: `${p.id}-f${i + 1}`,
      expeditionId: p.id,
      url: "",
      popis: "",
      createdAt: cas(p.od + 1, 16, i * 3),
      jeNahled: i === 0,
      sirka: i % 3 === 1 ? 900 : 1600,
      vyska: i % 3 === 1 ? 1200 : 1067,
    }));
    return [p.id, fotky];
  }),
);

/* ---------------------------------------------------------------- */
/* Schůzky                                                          */
/* ---------------------------------------------------------------- */

function nejblizsiPondeli(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const posun = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + posun - 21);
  return d.toISOString().slice(0, 10);
}

export const SCHUZKY: ApiSchuzka[] = [
  { id: "demo-schuzka-pondeli", nazev: "Pravidelná schůzka", datum: nejblizsiPondeli(), cas: "16:20", mistnost: "klubovna 216", popis: "Plánování dalších výprav a hry.", opakovani: "tydenni" },
  { id: "demo-schuzka-rada", nazev: "Porada rady", datum: den(3), cas: "15:00", mistnost: "kabinet 104", popis: "Rozpočet a zimní tábor.", opakovani: "jednorazova" },
  { id: "demo-schuzka-mapy", nazev: "Workshop: čtení map", datum: den(9), cas: "16:00", mistnost: "učebna 12", popis: "Buzola, vrstevnice a orientace v terénu.", opakovani: "jednorazova" },
  { id: "demo-schuzka-promitani", nazev: "Promítání fotek z podzimu", datum: den(-5), cas: "17:00", mistnost: "aula", popis: "", opakovani: "jednorazova" },
];

/* ---------------------------------------------------------------- */
/* Alba                                                             */
/* ---------------------------------------------------------------- */

export const ALBA: ApiAlbum[] = [
  ...PLANY.filter((p) => p.uzavrena).map((p) => ({
    id: p.id,
    nazev: p.nazev,
    druh: "vyprava" as const,
    expeditionId: p.id,
    pocetFotek: FOTKY_VYPRAV.get(p.id)?.length ?? 0,
    nahledFotkaId: `${p.id}-f1`,
  })),
  { id: "demo-podyji", nazev: "Podyjí – vinice a vyhlídky", druh: "vyprava", expeditionId: "demo-podyji", pocetFotek: 0, nahledFotkaId: null },
  { id: "album-ruzne", nazev: "Různé", druh: "vlastni", expeditionId: null, pocetFotek: 8, nahledFotkaId: "album-ruzne-f1" },
  { id: "album-klubovna", nazev: "Klubovna a schůzky", druh: "vlastni", expeditionId: null, pocetFotek: 5, nahledFotkaId: "album-klubovna-f1" },
  { id: "kos", nazev: "Koš", druh: "kos", expeditionId: null, pocetFotek: 2, nahledFotkaId: null },
];

export function fotkyAlba(id: string): ApiAlbumFotka[] {
  const album = ALBA.find((a) => a.id === id);
  if (album === undefined) return [];
  if (album.druh === "vyprava" && album.expeditionId !== null) {
    return (FOTKY_VYPRAV.get(album.expeditionId) ?? []).map((f) => ({
      id: f.id,
      url: "",
      createdAt: f.createdAt,
      jeNahled: f.jeNahled,
      expeditionId: f.expeditionId,
      albumId: null,
      sirka: f.sirka,
      vyska: f.vyska,
    }));
  }
  return Array.from({ length: album.pocetFotek }, (_, i) => ({
    id: `${album.id}-f${i + 1}`,
    url: "",
    createdAt: cas(-30 + i, 12),
    jeNahled: i === 0,
    expeditionId: null,
    albumId: album.id === "kos" ? "album-ruzne" : album.id,
    smazanoAt: album.id === "kos" ? cas(-2, 10) : null,
    sirka: i % 2 === 0 ? 1600 : 1000,
    vyska: i % 2 === 0 ? 1067 : 1300,
  }));
}

/* ---------------------------------------------------------------- */
/* Zpěvník (smyšlené písně)                                         */
/* ---------------------------------------------------------------- */

const SLOKY: Array<[string, string, string]> = [
  ["Vlak do Pasek", "Klub", "G        D\nRáno jedem vlakem k Paskám,\nEmi        C\nbatohy a hrnek s kávou.\nG         D\nKdo se ptá, kam vede trať,\nC      D       G\nten ji jednou pozná sám."],
  ["Za humny", "Tereza Vlčková", "Ami       G\nZa humny je cesta bílá,\nF        E\nkudy chodí mlha s námi.\nAmi      G\nKaždý krok je trochu míle,\nF     E      Ami\nkterou nesem v kapsách sami."],
  ["Čaj u ohně", "Klub", "D        A\nVečer sedíme kolem ohně,\nG         D\nčaj je sladký, noc je dlouhá.\nD       A\nNěkdo ladí starou kytaru,\nG     A      D\nkterou nikdo nehraje rád."],
  ["Hřebenovka", "Zdeněk Hruška", "C        G\nPo hřebeni až k rozhledně,\nAmi      F\nvítr fouká do zad.\nC        G\nKdo jde první, čeká dole,\nF     G      C\nkdo jde poslední, má hlad."],
  ["Píseň o mapě", "Klub", "E        A\nMapa v dešti zmokla celá,\nE         H\nvrstevnice tečou dál.\nE        A\nKompas ukazuje k jihu,\nE    H     E\nnikdo jiný směr nezná."],
  ["Jarní tábor", "Kristýna Malá", "G        C\nV březnu ještě sníh je v lese,\nG         D\nale slunce svítí víc.\nG        C\nStan je mokrý, boty taky,\nG     D      G\nvíc už nechci, nic a nic."],
  ["Most přes Sázavu", "Klub", "Dmi      C\nStarý most a voda pod ním,\nB         A\nkamení a tichý proud.\nDmi      C\nPřes zábradlí koukáme dolů,\nB    A     Dmi\nkam až může loďka plout."],
  ["Noční pochod", "Matěj Kučera", "A        E\nČelovky a hvězdy nad námi,\nFismi    D\nkroky tiše do tmy jdou.\nA        E\nSova houká, někdo zívá,\nD     E      A\nráno přijde s rosou svou."],
  ["Hospoda U Lípy", "Klub", "C        F\nU lípy je teplá polévka,\nC         G\nknedlík a pivo pro dospělé.\nC        F\nMy si dáme malinovku,\nC     G      C\nlepší den být nemůže."],
  ["Déšť na stanu", "Adam Hněvkovský", "G        Emi\nDéšť bubnuje do plachty,\nC         D\nspacák hřeje, venku tma.\nG        Emi\nZítra půjdem zase dále,\nC     D      G\ndneska spíme, dobrou noc."],
  ["Kopec za školou", "Klub", "D        G\nZa školou je malý kopec,\nD         A\nkaždý pátek běžíme.\nD        G\nNahoře je lavička,\nD    A     D\nkde si všechno řekneme."],
  ["Sněžnice", "Klub", "Emi      C\nSněžnice a bílá pláň,\nG         D\nstopy vedou do kopce.\nEmi      C\nKdo se bořil, ten se směje,\nG     D      Emi\nkdo ne, ten ať nekecá."],
  ["Lodičky", "Barbora Nováková", "F        C\nPapírové lodičky\nB         F\npouštíme po proudu.\nF        C\nKaždá nese jedno přání,\nB    C     F\nvšechna se nám splní snad."],
  ["Poslední vlak", "Klub", "Ami      Dmi\nPoslední vlak jede v devět,\nG         C\nkdo zaspí, ten jde pěšky.\nAmi      Dmi\nNádraží je prázdné, tiché,\nE     E7     Ami\njen my zpíváme si s chutí."],
  ["Rozhledna", "Ondřej Sýkora", "C        Ami\nSto schodů až do nebe,\nF         G\nkaždý schod je trochu výš.\nC        Ami\nNahoře je vidět všechno,\nF     G      C\ni to, co jsi nečekal."],
  ["Ranní mlha", "Klub", "G        D\nRanní mlha nad rybníkem,\nEmi       C\nkachny ještě spí.\nG        D\nMy už balíme a jdeme,\nC     D      G\nkam nás cesta zavolá."],
  ["Klubovna 216", "Klub", "D        A\nV pondělí ve čtyři dvacet\nHmi       G\nklubovna se otvírá.\nD        A\nMapy, plány, čaj a sušenky,\nG     A      D\nto je naše zahrada."],
  ["Píseň pro Terezu", "Zdeněk Hruška", "E        Cismi\nTereza vede výpravu,\nA         H\nví, kde je správný směr.\nE        Cismi\nKdyž se ztratíme v lese,\nA     H      E\nvolá: tudy, ne tamhle!"],
  ["Na kole k moři", "Klub", "C        G\nJednou dojedem na kole k moři,\nAmi       F\ni když to je daleko.\nC        G\nZatím jezdíme kolem školy,\nF     G      C\naspoň trénujeme."],
  ["Kamínky", "Natálie Černá", "Ami      F\nSbírám kamínky po cestě,\nC         G\nkaždý jiný, každý můj.\nAmi      F\nAž jich bude plná kapsa,\nC     G      Ami\nvysypu je za tvůj dům."],
  ["Starý kompas", "Klub", "D        G\nDěda měl starý kompas,\nA         D\nstrelka se vždy točila.\nD        G\nTeď ho nosím na výpravy,\nA     A7     D\ncestu najde sama."],
  ["Večerníček u stanu", "Klub", "G        C\nKdyž se stmívá u stanu,\nD         G\nvyprávíme pohádky.\nG        C\nO drakovi z Lysé hory,\nD     D7     G\nkterý chtěl jít na zmrzku."],
  ["Hvězdná noc", "Jakub Dvořák", "C        F\nLeží s námi celá louka,\nG         C\nnad hlavou je Mléčná dráha.\nC        F\nPočítáme padající hvězdy,\nG     G7     C\nkaždá má své přání."],
  ["Batoh", "Klub", "Emi      D\nBatoh těžký jako kámen,\nC         H7\nco v něm vlastně nesu já?\nEmi      D\nTři svetry a čtyři buchty,\nC     H7     Emi\na kytaru bez strun."],
];

/**
 * Dlouhá ukázka na ladění detailu písně. Akordy jsou v hranatých závorkách před
 * slabikou, prázdný řádek dělí sloky, „R:“ na prvním řádku znamená refrén.
 */
const DLOUHA_PISEN = `[G] [D/F#] [Em7] [Cadd9]

[G]Ve čtyři ráno [D/F#]budík zvoní, [Em7]venku je tma a [Cadd9]déšť,
[G]ponožky schnou nám [D/F#]na topení, [C]jednu jsi ztratil [D]včera už [Dsus4]též.
[G]Na nádraží [D/F#]v bufetu svítí, [Em7]paní nám nalije [Cadd9]čaj,
[Am7]kdo zaspal, ten ať [D7]dobíhá vlakem, [G]my už jedem [C]za tratí v [G]kraj.

[G]Za Berounem [D/F#]mlha se trhá, [Em7]průvodčí počítá [Cadd9]nás,
[G]dvacet a jeden, [D/F#]dvacet a jeden, [C]někdo se schoval [D]zas a [Dsus4]zas.
[G]Mapu jsme nechali [D/F#]ležet v klubovně, [Em7]kompas má Zdeněk, ten [Cadd9]spí,
[Am7]cestu nám poradí [D7]pes u hájovny, [G]ten jediný to [C]vážně [G]ví.

R:
[G]Čtyřicet [D]kilometrů [Em]pod nohama [C]máme,
[G]čtyřicet [D]důvodů [C]zůstat [D]stát,
[G]ale když [D]jednou už [Em]batohy [C]zvedáme,
[Am]tak se to [D]musí [G]dochodit a [C]dozpí[G]vat.

[G]Po žluté značce [D/F#]do kopce vzhůru, [Em7]kořeny, bláto a [Cadd9]kámen,
[G]Tereza vpředu [D/F#]udává tempo, [C]vzadu už slyšet je [D]první [Dsus4]amen.
[G]Puchýř na patě, [D/F#]druhý na prstu, [Em7]třetí si teprve [Cadd9]hledá,
[Am7]a kdo řekl včera, že [D7]trasa je rovná, [G]ten dneska radši [C]moc [G]nemluví a nezvedá hlavu od země, aby ho nikdo nepoznal.

[G]U lomu stojíme, [D/F#]svačina v trávě, [Em7]rohlíky, paštika, [Cadd9]sýr,
[G]někdo má řízek a [D/F#]nechce se dělit, [C]tím končí na dnešek [D]klid a [Dsus4]mír.
[G]Adam nám ukáže [D/F#]zkamenělinu, [Em7]trilobit, říká, je [Cadd9]to,
[Am7]Natálka tvrdí, že [D7]šlápl na sušenku, [G]a že ji hledá [C]všude [G]možně.

R:
[G]Čtyřicet [D]kilometrů [Em]pod nohama [C]máme,
[G]čtyřicet [D]důvodů [C]zůstat [D]stát,
[G]ale když [D]jednou už [Em]batohy [C]zvedáme,
[Am]tak se to [D]musí [G]dochodit a [C]dozpí[G]vat.

[Em]A když se v poledne [Hm7]zatáhne nebe
[C]a první kapky už [G]ťukají do plachty,
[Em]vytáhnem pláštěnky, [Hm7]co kdysi držely,
[Am7]dneska jsou z nich spíš jen [Dsus4]záclony a [D7]krajky.
Mluvené: Tak kdo měl na starosti počasí?
(ticho, někdo dupe v kaluži)

[G]K večeru konečně [D/F#]komín a světla, [Em7]v chalupě voní to [Cadd9]zelím,
[G]boty jdou do řady, [D/F#]promočené všechny, [C]s nikým se o kamna [D]dneska [Dsus4]nedělím.
[G]Kytara obíhá [D/F#]od ruky k ruce, [Em7]struna je prasklá, no [Cadd9]co,
[Am7]na pěti strunách to [D7]zní skoro stejně, [G]jen trochu víc jako [C]vítr a [G]mlýnské kolo.

[G]Ráno se probudíš, [D/F#]nohy jak z olova, [Em7]venku je azuro, [Cadd9]sníh,
[G]někdo už na plotně [D/F#]smaží nám vajíčka, [C]ze stropu visí [D]deset mokrých [Dsus4]knih.
[G]Deník má skvrny a [D/F#]rozpité písmo, [Em7]přesto tam napíšem [Cadd9]dál:
[Am7]ušli jsme kus cesty, [D7]kterou si vymyslel [G]ten, kdo se celou [C]dobu [G]smál.

R:
[A]Čtyřicet [E]kilometrů [F#m]pod nohama [D]máme,
[A]čtyřicet [E]důvodů [D]zůstat [E]stát,
[A]ale když [E]jednou už [F#m]batohy [D]zvedáme,
[Hm]tak se to [E]musí [A]dochodit a [D]dozpí[A]vat.

[D]Tak se to [E]musí, [C#m7]tak se to [F#m]musí,
[Hm7]dochodit, [E7sus4]dojet, [E7]dobelhat,
[A] [E/G#] [F#m7] [Dadd9]
[A]a pak jít [Amaj7]spát.`;

function radekZeZavorek(radek: string): Blok["radky"][number] {
  const [uvod = "", ...zbytek] = radek.split(/\[([^\]]+)\]/);
  const slabiky: Blok["radky"][number]["slabiky"] = uvod.length > 0 ? [{ text: uvod }] : [];
  for (let i = 0; i < zbytek.length; i += 2) {
    slabiky.push({ text: zbytek[i + 1] ?? "", akord: zbytek[i] });
  }
  return { slabiky };
}

const TELO_DLOUHE: TeloPisne = {
  bloky: DLOUHA_PISEN.split("\n\n").map((odstavec): Blok => {
    const radky = odstavec.split("\n");
    const refren = radky[0] === "R:";
    return { typ: refren ? "refren" : "sloka", radky: (refren ? radky.slice(1) : radky).map(radekZeZavorek) };
  }),
};

/** Tentýž text po průchodu formulářem, jak ho uloží skutečné vložení písně. */
const DLOUHA_VLOZENA = parsujVlozeni(textZTela(TELO_DLOUHE));

export const PISNE: ApiZpevnikPisen[] = [
  {
    id: "pisen-dlouha",
    nazev: "Čtyřicet kilometrů",
    autor: "Klub",
    telo: TELO_DLOUHE,
    schvalenoAt: cas(-4, 12),
  },
  {
    id: "pisen-dlouha-vlozena",
    nazev: "Čtyřicet kilometrů (vložený text)",
    autor: "Klub",
    telo: DLOUHA_VLOZENA.ok ? DLOUHA_VLOZENA.telo : { bloky: [] },
    schvalenoAt: cas(-3, 12),
  },
  ...SLOKY.map(([nazev, autor, text], i) => {
    const vysledek = parsujVlozeni(text);
    return {
      id: `pisen-${i + 1}`,
      nazev,
      autor,
      telo: vysledek.ok ? vysledek.telo : { bloky: [] },
      schvalenoAt: cas(-200 + i * 5, 12),
    };
  }),
];

export const NAVRHY: ApiZpevnikNavrh[] = [
  ["Lesní cesta", "Eliška Procházková", "G        D\nLesní cestou jdeme spolu,\nC         G\nlistí šustí pod nohama."],
  ["Řeka", "Vojtěch Horák", "Ami      G\nŘeka teče, my jdem s ní,\nF         E\naž k moři jednou dojdem."],
  ["Kamarádi", "Klára Benešová", "C        G\nKamarádi z výprav,\nF         C\npůjdem spolu dál."],
].map(([nazev, autor, text], i) => {
  const vysledek = parsujVlozeni(text);
  return {
    id: `navrh-${i + 1}`,
    nazev,
    autor,
    telo: vysledek.ok ? vysledek.telo : { bloky: [] },
    problem: null,
    nahledUrl: null,
    navrhovatelId: UZIVATELE[7 + i * 2]?.id ?? null,
    createdAt: cas(-3 + i, 18),
    updatedAt: cas(-3 + i, 18),
  };
});

/* ---------------------------------------------------------------- */
/* Zprávy a konverzace                                              */
/* ---------------------------------------------------------------- */

function zprava(id: string, autor: number, channel: ApiZprava["channel"], text: string, kdy: string, expeditionId: string | null = null, prilohy: ApiZpravaPriloha[] = []): ApiZprava {
  return {
    id,
    expeditionId,
    autorId: UZIVATELE[autor].id,
    authorName: celeJmeno(autor),
    authorAvatarUrl: null,
    channel,
    text,
    prilohy,
    createdAt: kdy,
  };
}

/** Příloha k ukázkové zprávě; id nese příponu, podle ní demo server vrátí obsah. */
function priloha(id: string, nazev: string, kB: number): ApiZpravaPriloha {
  const jeObrazek = /\.(jpe?g|png)$/i.test(nazev);
  return { id, nazev, bajty: kB * 1024, contentType: jeObrazek ? "image/jpeg" : "application/octet-stream", jeObrazek };
}

export const ZPRAVY = new Map<string, ApiZprava[]>([
  [
    "general",
    [
      zprava("g1", 1, "general", "Ahoj všichni, v pondělí probereme zimní tábor.", cas(-2, 18, 4)),
      zprava("g2", 3, "general", "Můžu přinést mapy Jeseníků.", cas(-2, 18, 20)),
      zprava("g3", 0, "general", "Super, přidávám to do kalendáře.", cas(-2, 19, 2)),
      zprava("g4", 1, "general", "Sraz v 7:40 na hlaváku, kdo jde z Florence?", cas(0, 7, 52)),
      zprava("g4a", 1, "general", "Parkovat se dá tady: https://mapy.com/cs/turisticka?x=15.7385&y=50.7361&z=14&source=coor&id=15.7385%2C50.7361", cas(0, 7, 53)),
      zprava("g5", 3, "general", "Já. Vezmu lékárničku a náhradní ponožky.", cas(0, 7, 55)),
      zprava("g6", 0, "general", "Přidávám to do kalendáře, ať to nikdo nezmešká.", cas(0, 8, 3)),
      zprava("g7", 2, "general", "Kolik je vlastně místa v autě?", cas(0, 8, 10)),
      zprava("g8", 1, "general", "Tři, počítám i s batohem.", cas(0, 8, 12)),
      zprava("g9", 0, "general", "Super, beru spacák navíc.", cas(0, 8, 14)),
      zprava("g10", 2, "general", "https://www.google.com/maps/place/Sn%C4%9B%C5%BEka/@50.7360,15.7400,15z", cas(0, 8, 20)),
      zprava("g11", 0, "general", "Trasu máme tady, ať se každý podívá: https://www.strava.com/routes/3210000", cas(0, 8, 22)),
      zprava("g12", 3, "general", "Fotky z minula a program:", cas(0, 8, 30), null, [
        priloha("chat-f1", "IMG_2041.jpg", 2310),
        priloha("chat-f2", "IMG_2042.jpg", 1980),
        priloha("chat-f3", "IMG_2043.jpg", 2640),
        priloha("chat-f4", "IMG_2044.jpg", 2120),
        priloha("chat-f5", "IMG_2045.jpg", 2280),
        priloha("chat-f6", "IMG_2046.jpg", 1890),
        priloha("chat-s1", "Program zimní tábor 2026 – finální verze.pdf", 412),
      ]),
      zprava("g13", 0, "general", "", cas(0, 8, 41), null, [priloha("chat-f7", "parkoviste.jpg", 1440)]),
      zprava("g14", 0, "general", "Tady je GPX a rozpočet.", cas(0, 8, 42), null, [
        priloha("chat-s2", "krkonose-den1.gpx", 88),
        priloha("chat-s3", "Rozpočet.xlsx", 24),
      ]),
    ],
  ],
  [
    "dulezite",
    [
      zprava("d1", 1, "dulezite", "Přihlášky na zimní tábor končí v pátek. Platba do 15. prosince.", cas(-4, 9)),
      zprava("d2", 0, "dulezite", "Nová pravidla pro fotky: nahrávejte je do alba výpravy do týdne.", cas(-1, 20)),
    ],
  ],
  [
    "skupina:6f1d2a10-0000-4000-8000-000000000001",
    [
      zprava("v1", 5, "skupina", "Zápis z porady je v dokumentech.", cas(-1, 16)),
      zprava("v2", 1, "skupina", "Díky, projdu to večer.", cas(-1, 17)),
    ],
  ],
  [
    "skupina:6f1d2a10-0000-4000-8000-000000000002",
    [
      zprava("dg1", 8, "skupina", "Kdo má klíče od klubovny?", cas(0, 12, 4)),
    ],
  ],
  [
    "expedice:demo-brdy",
    [
      zprava("b1", 4, "expedice", "Jsme na první chatě, všichni v pořádku.", cas(0, 19), "demo-brdy"),
      zprava("b2", 2, "expedice", "Zítra vyrážíme v 8:00.", cas(0, 20), "demo-brdy"),
    ],
  ],
  [
    "expedice:demo-podyji",
    [
      zprava("p1", 1, "expedice", "Jedeme vlakem z Brna, kdo se přidá?", cas(-1, 18, 22), "demo-podyji"),
      zprava("p2", 2, "expedice", "Beru termosku s punčem, ale jen na konec trasy.", cas(0, 7, 41), "demo-podyji"),
    ],
  ],
  [
    `soukrome:${UZIVATELE[0].id}:${UZIVATELE[1].id}`,
    [
      zprava("s1", 1, "soukrome", "Můžeš mi poslat trasu na zítra?", cas(0, 9, 14)),
    ],
  ],
  [
    `soukrome:${UZIVATELE[0].id}:${UZIVATELE[2].id}`,
    [
      zprava("s2", 2, "soukrome", "Beru auto, tři volná místa.", cas(0, 8, 41)),
    ],
  ],
]);

export const SKUPINY: Array<{ id: string; nazev: string; prava: PravoSkupiny[] }> = [
  { id: "6f1d2a10-0000-4000-8000-000000000001", nazev: "Vedení klubu", prava: prava(["vedeni", "admin"]) },
  { id: "6f1d2a10-0000-4000-8000-000000000002", nazev: "Digitál", prava: prava(["aktivni-clen", "clen-rady", "vedeni", "admin"]) },
];

function prava(role: readonly string[]): PravoSkupiny[] {
  return SKUPINA_ROLE.map((r) => ({ role: r, cist: role.includes(r), psat: role.includes(r) }));
}

export function konverzace(): ApiKonverzace[] {
  const posledni = (klic: string): ApiZprava | null => {
    const seznam = ZPRAVY.get(klic) ?? [];
    return seznam[seznam.length - 1] ?? null;
  };
  return [
    { key: "dulezite", expeditionId: null, channel: "dulezite", nazev: "Důležité", muzeCist: true, muzePsat: true, lastMessage: posledni("dulezite"), unreadCount: 1 },
    { key: "general", expeditionId: null, channel: "general", nazev: "Obecný", muzeCist: true, muzePsat: true, lastMessage: posledni("general"), unreadCount: 2 },
    ...SKUPINY.map((skupina): ApiKonverzace => ({
      key: `skupina:${skupina.id}`,
      expeditionId: null,
      channel: "skupina",
      nazev: skupina.nazev,
      muzeCist: true,
      muzePsat: true,
      lastMessage: posledni(`skupina:${skupina.id}`),
      unreadCount: skupina.nazev === "Digitál" ? 1 : 0,
    })),
    { key: "expedice:demo-brdy", expeditionId: "demo-brdy", channel: "expedice", nazev: "Brdy – Padrťské rybníky", lastMessage: posledni("expedice:demo-brdy"), unreadCount: 0 },
    { key: "expedice:demo-podyji", expeditionId: "demo-podyji", channel: "expedice", nazev: "Podyjí – vinice a vyhlídky", lastMessage: posledni("expedice:demo-podyji"), unreadCount: 0 },
    {
      key: `soukrome:${UZIVATELE[0].id}:${UZIVATELE[1].id}`,
      expeditionId: null,
      channel: "soukrome",
      partnerId: UZIVATELE[1].id,
      partnerJmeno: celeJmeno(1),
      lastMessage: posledni(`soukrome:${UZIVATELE[0].id}:${UZIVATELE[1].id}`),
      unreadCount: 1,
    },
    {
      key: `soukrome:${UZIVATELE[0].id}:${UZIVATELE[2].id}`,
      expeditionId: null,
      channel: "soukrome",
      partnerId: UZIVATELE[2].id,
      partnerJmeno: celeJmeno(2),
      lastMessage: posledni(`soukrome:${UZIVATELE[0].id}:${UZIVATELE[2].id}`),
      unreadCount: 0,
    },
  ];
}

/* ---------------------------------------------------------------- */
/* Žebříček                                                         */
/* ---------------------------------------------------------------- */

export function zebricek(): Array<{ userId: string; jmeno: string; vypravy: number; km: number; clenOd?: number }> {
  const souhrn = new Map<string, { vypravy: number; km: number }>();
  for (const v of VYPRAVY.filter((x) => x.stav === "proběhlá")) {
    for (const u of UCASTNICI.get(v.id) ?? []) {
      if (u.userId === null || u.status !== "ucastnil_se") continue;
      const aktualni = souhrn.get(u.userId) ?? { vypravy: 0, km: 0 };
      souhrn.set(u.userId, { vypravy: aktualni.vypravy + 1, km: aktualni.km + (v.km ?? 0) });
    }
  }
  return [...souhrn.entries()]
    .map(([userId, s]) => {
      const u = UZIVATELE.find((x) => x.id === userId);
      return { userId, jmeno: u === undefined ? "?" : `${u.jmeno} ${u.prijmeni ?? ""}`.trim(), vypravy: s.vypravy, km: Math.round(s.km * 10) / 10, ...(u?.createdAt ? { clenOd: new Date(u.createdAt).getFullYear() } : {}) };
    })
    .sort((a, b) => b.vypravy - a.vypravy || b.km - a.km || a.jmeno.localeCompare(b.jmeno, "cs"));
}

export const KODY = [
  { code: "EXAPP-4K2M", expiresAt: cas(6, 23) },
  { code: "EXAPP-9QZP", expiresAt: cas(2, 23) },
];
