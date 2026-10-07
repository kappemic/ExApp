import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import type { Role } from "../config/roles";
import type { ApiErrorBody, ApiUser, AuthRole } from "../shared/api-types";
import {
  ADMIN_CODES_PATH,
  LOGIN_PATH,
  ME_PATH,
  REGISTER_PATH,
  VALIDACE,
  VALIDACNI_ZPRAVY,
  jeApiChyba,
  normalizujKod,
} from "../shared/api-types";

/**
 * useAuth — auth vrstva nad tenkým BFF (kontrakt dle src/shared/api-types.ts).
 *
 * Fetch-first s offline fallbackem:
 * - Je-li nastaveno `VITE_API_BASE_URL`, jde register / login / me /
 *   generujKod nejdřív na backend (`POST /api/register`, `POST /api/login`,
 *   `GET /api/me`, `POST /api/admin/codes`, `POST /api/logout`).
 *   Session drží httpOnly cookie (credentials: include) — zdrojem pravdy
 *   je server, localStorage je jen cache/offline záloha, ne zdroj pravdy.
 * - Když backend neběží (fetch selže na síti) nebo není nakonfigurován,
 *   padá vše zpět na lokální demo úložiště:
 *   - uživatelé → `exapp-demo-uzivatele` (vč. hesla — jen demo, server hashuje)
 *   - session → `exapp-demo-session` (userId, obdoba GET /me)
 *   - kódy → `exapp-demo-kody` (kod, createdAt, expiresAt = +10 min)
 * - API chyba (4xx/422) znamená „server je zdrojem pravdy" → zobrazí se
 *   a na demo se NEpadá (jinak by např. 401 u demo-účtu mátlo).
 * - Kódy nemají list endpoint: `kody` jsou lokální cache vytvořených kódů
 *   (server `poznamka` neukládá — vracíme tu z požadavku).
 */

export interface DemoKod {
  id: string;
  kod: string;
  createdAt: string;
  expiresAt: string;
  poznamka: string | null;
}

export interface RegistraceVstup {
  jmeno: string;
  prijmeni?: string;
  email: string;
  heslo: string;
  telefon?: string | null;
  discordNick?: string | null;
  kod: string;
}

export interface PrihlaseniVstup {
  email: string;
  heslo: string;
}

export type PoleRegistrace =
  | "jmeno"
  | "prijmeni"
  | "email"
  | "heslo"
  | "telefon"
  | "discordNick"
  | "kod";
export type PolePrihlaseni = "email" | "heslo";

export interface AuthVysledek<TPole extends string> {
  uspech: boolean;
  /** Česky, vhodné k přímému zobrazení (role="alert"). */
  chyba: string | null;
  chybyPoli: Partial<Record<TPole, string>>;
}

interface DemoUserRecord {
  id: string;
  jmeno: string;
  prijmeni?: string;
  email: string;
  telefon?: string | null;
  discordNick?: string | null;
  // WARNING: heslo v plaintextu — pouze demo bez backendu.
  // TODO: po příchodu backendu neukládat heslo vůbec (server bude hashovat, např. argon2/bcrypt).
  heslo: string;
  role: Role;
  authRole: AuthRole;
  createdAt: string;
  updatedAt: string;
}

const USERS_KEY = "exapp-demo-uzivatele";
const SESSION_KEY = "exapp-demo-session";
const CODES_KEY = "exapp-demo-kody";

/** Znaky kódu: bez 0/O/1/I — lidsky přepisovatelné (kontrakt api-types). */
const KOD_ZNAKY = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KOD_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DESET_MINUT_MS = 10 * 60 * 1000;

function bezpecneCti(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function bezpecnePis(key: string, hodnota: string): boolean {
  try {
    window.localStorage.setItem(key, hodnota);
    return true;
  } catch {
    // Privátní režim — stav držíme jen v paměti volajícího.
    return false;
  }
}

function noveId(): string {
  try {
    return window.crypto.randomUUID();
  } catch {
    return `demo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

function nahodnyKod(existujici: Set<string>): string {
  for (let pokus = 0; pokus < 12; pokus += 1) {
    let kod = "";
    try {
      const buf = new Uint32Array(VALIDACE.kodDelka);
      window.crypto.getRandomValues(buf);
      for (let i = 0; i < VALIDACE.kodDelka; i += 1) {
        kod += KOD_ZNAKY[buf[i] % KOD_ZNAKY.length];
      }
    } catch {
      for (let i = 0; i < VALIDACE.kodDelka; i += 1) {
        kod += KOD_ZNAKY[Math.floor(Math.random() * KOD_ZNAKY.length)];
      }
    }
    if (!existujici.has(kod)) return kod;
  }
  return `X${Date.now().toString(36).toUpperCase().replace(/[^A-Z2-9]/g, "K").slice(-7)}`;
}

function parseUzivatele(): DemoUserRecord[] {
  const raw = bezpecneCti(USERS_KEY);
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (z): z is DemoUserRecord =>
        typeof z === "object" &&
        z !== null &&
        typeof (z as DemoUserRecord).email === "string",
    );
  } catch {
    return [];
  }
}

function ctiKodyRaw(): DemoKod[] {
  const raw = bezpecneCti(CODES_KEY);
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const hranice = Date.now() - 24 * 60 * 60 * 1000;
    const vysledek: DemoKod[] = [];
    for (const zaznam of data) {
      if (typeof zaznam !== "object" || zaznam === null) continue;
      const kandidat = zaznam as {
        id?: unknown;
        kod?: unknown;
        createdAt?: unknown;
        expiresAt?: unknown;
        poznamka?: unknown;
      };
      if (
        typeof kandidat.id !== "string" ||
        typeof kandidat.kod !== "string" ||
        typeof kandidat.expiresAt !== "string" ||
        typeof kandidat.createdAt !== "string" ||
        !Number.isFinite(Date.parse(kandidat.createdAt)) ||
        Date.parse(kandidat.createdAt) <= hranice
      ) {
        continue;
      }
      // Migrace: staré záznamy mohou nést usedAt/usedBy — ignorují se.
      vysledek.push({
        id: kandidat.id,
        kod: kandidat.kod,
        createdAt: kandidat.createdAt,
        expiresAt: kandidat.expiresAt,
        poznamka:
          typeof kandidat.poznamka === "string" ? kandidat.poznamka : null,
      });
    }
    return vysledek;
  } catch {
    return [];
  }
}

function jePlatnyKod(kod: DemoKod, ted: number): boolean {
  return Date.parse(kod.expiresAt) > ted;
}

/**
 * Purge expirovaných kódů — maže je z úložiště,
 * ne jen schovává. Volá se při loadu, při generování a intervalem.
 */
function purgeExpirovanychKodu(): DemoKod[] {
  const ted = Date.now();
  const raw = ctiKodyRaw();
  const platne = raw.filter((k) => jePlatnyKod(k, ted));
  if (platne.length !== raw.length) {
    bezpecnePis(CODES_KEY, JSON.stringify(platne));
  }
  return platne;
}

/** Rozdělí legacy „Jméno Příjmení" na dvě části (první token = jméno, zbytek = příjmení). */
function rozdelCeleJmeno(cele: string): { jmeno: string; prijmeni?: string } {
  const casti = cele.trim().split(/\s+/).filter((c) => c.length > 0);
  if (casti.length <= 1) return { jmeno: cele.trim() };
  return { jmeno: casti[0], prijmeni: casti.slice(1).join(" ") };
}

function verejnyProfil(zaznam: DemoUserRecord): ApiUser {
  const ulozenePrijmeni = zaznam.prijmeni?.trim() ?? "";
  let jmeno = zaznam.jmeno;
  let prijmeni: string | undefined =
    ulozenePrijmeni.length > 0 ? ulozenePrijmeni : undefined;
  // Zpětná kompatibilita: staré záznamy nesou „Jméno Příjmení" v jednom poli.
  if (prijmeni === undefined && jmeno.trim().includes(" ")) {
    const rozdelene = rozdelCeleJmeno(jmeno);
    jmeno = rozdelene.jmeno;
    prijmeni = rozdelene.prijmeni;
  }
  return {
    id: zaznam.id as ApiUser["id"],
    email: zaznam.email,
    jmeno,
    prijmeni,
    telefon: zaznam.telefon ?? null,
    discordNick: zaznam.discordNick ?? null,
    role: zaznam.role,
    authRole: zaznam.authRole,
    stravaId: null,
    createdAt: zaznam.createdAt,
    updatedAt: zaznam.updatedAt,
  };
}

function validujJmeno(jmeno: string): string | null {
  const ciste = jmeno.trim();
  if (ciste.length === 0) return VALIDACNI_ZPRAVY.jmenoPovinne;
  if (ciste.length < VALIDACE.jmenoMinDelka) return VALIDACNI_ZPRAVY.jmenoKratke;
  if (ciste.length > VALIDACE.jmenoMaxDelka) return VALIDACNI_ZPRAVY.jmenoDlouhe;
  return null;
}

function validujPrijmeni(hodnota?: string | null): string | null {
  const ciste = (hodnota ?? "").trim();
  if (ciste.length === 0) return null;
  if (ciste.length < VALIDACE.prijmeniMinDelka)
    return VALIDACNI_ZPRAVY.prijmeniKratke;
  if (ciste.length > VALIDACE.prijmeniMaxDelka)
    return VALIDACNI_ZPRAVY.prijmeniDlouhe;
  return null;
}

function validujEmail(email: string): string | null {
  const cisty = email.trim();
  if (cisty.length === 0) return VALIDACNI_ZPRAVY.emailPovinny;
  if (!EMAIL_REGEX.test(cisty)) return VALIDACNI_ZPRAVY.emailNeplatny;
  return null;
}

function validujHeslo(heslo: string): string | null {
  if (heslo.length === 0) return VALIDACNI_ZPRAVY.hesloPovinne;
  if (heslo.length < VALIDACE.hesloMinDelka) return VALIDACNI_ZPRAVY.hesloKratke;
  if (heslo.length > VALIDACE.hesloMaxDelka) return VALIDACNI_ZPRAVY.hesloDlouhe;
  return null;
}

/** Telefon je nepovinný: prázdný = OK, jinak 6–32 znaků z +/číslic/mazer a běžných oddělovačů. */
function validujTelefon(hodnota?: string | null): string | null {
  const cisty = (hodnota ?? "").trim();
  if (cisty.length === 0) return null;
  if (cisty.length > VALIDACE.telefonMaxDelka)
    return VALIDACNI_ZPRAVY.telefonDlouhy;
  if (cisty.length < 6) return VALIDACNI_ZPRAVY.telefonNeplatny;
  if (!/^[+0-9][+0-9 /().-]*$/.test(cisty))
    return VALIDACNI_ZPRAVY.telefonNeplatny;
  return null;
}

function validujDiscordNick(hodnota?: string | null): string | null {
  const cisty = (hodnota ?? "").trim();
  if (cisty.length === 0) return null;
  if (cisty.length > VALIDACE.discordNickMaxDelka)
    return VALIDACNI_ZPRAVY.discordNickDlouhy;
  return null;
}

/** Prázdný nepovinný řetězec normalizuje na null (kontrakt api-types). */
function normalizujNepovinny(hodnota?: string | null): string | null {
  const cista = (hodnota ?? "").trim();
  return cista.length === 0 ? null : cista;
}

function validujTvarKodu(kod: string): string | null {
  const cisty = normalizujKod(kod);
  if (cisty.length === 0) return VALIDACNI_ZPRAVY.kodPovinny;
  if (cisty.length !== VALIDACE.kodDelka || !KOD_REGEX.test(cisty)) {
    return VALIDACNI_ZPRAVY.kodNeplatnyTvar;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Backend-first vrstva (tenký BFF). Žádný secret — jen VITE_API_BASE_URL. */
/* ------------------------------------------------------------------ */

/** Základ BFF z veřejného `VITE_API_BASE_URL`. Prázdný = offline/demo režim. */
function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

interface BackendOdpoved {
  status: number;
  telo: unknown;
}

/**
 * Jednotné volání BFF se session cookie. Vrací `null` pouze když backend
 * není nakonfigurován nebo je síťově nedostupný → volající padá na demo.
 * API odpověď (i chybová) znamená „server je zdrojem pravdy".
 */
async function volejBackend(
  cesta: string,
  metoda: "GET" | "POST",
  payload?: Record<string, unknown>,
): Promise<BackendOdpoved | null> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return null;
  try {
    const odpoved = await fetch(`${zaklad}${cesta}`, {
      method: metoda,
      credentials: "include",
      headers:
        payload === undefined
          ? { Accept: "application/json" }
          : {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    let telo: unknown = null;
    try {
      telo = await odpoved.json();
    } catch {
      telo = null;
    }
    return { status: odpoved.status, telo };
  } catch {
    return null;
  }
}

/** Validace uživatele z backendu na hranici (api-types: veřejný profil). */
function jeApiUser(hodnota: unknown): hodnota is ApiUser {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const kandidat = hodnota as Record<string, unknown>;
  return (
    typeof kandidat["id"] === "string" &&
    typeof kandidat["email"] === "string" &&
    typeof kandidat["jmeno"] === "string" &&
    typeof kandidat["role"] === "string" &&
    (kandidat["authRole"] === "USER" || kandidat["authRole"] === "ADMIN")
  );
}

/**
 * Vytáhne `ApiUser` z odpovědi: register/login vrací `{ user }`,
 * me vrací profil přímo. Jinak `null` (neočekávaný tvar).
 */
function ctiUsera(telo: unknown): ApiUser | null {
  if (typeof telo !== "object" || telo === null) return null;
  const kandidat = telo as Record<string, unknown>;
  if ("user" in kandidat) {
    const uzivatel = kandidat["user"];
    return jeApiUser(uzivatel) ? uzivatel : null;
  }
  return jeApiUser(telo) ? telo : null;
}

/** Validace vytvořeného kódu z backendu; `poznamka` doplníme z požadavku. */
function ctiKod(telo: unknown, poznamka: string | null): DemoKod | null {
  if (typeof telo !== "object" || telo === null) return null;
  const kandidat = telo as Record<string, unknown>;
  if (
    typeof kandidat["id"] !== "string" ||
    typeof kandidat["kod"] !== "string" ||
    typeof kandidat["createdAt"] !== "string" ||
    typeof kandidat["expiresAt"] !== "string"
  ) {
    return null;
  }
  return {
    id: kandidat["id"] as string,
    kod: kandidat["kod"] as string,
    createdAt: kandidat["createdAt"] as string,
    expiresAt: kandidat["expiresAt"] as string,
    poznamka,
  };
}

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

/** První česká hláška pro dané pole z `details` (VALIDATION_ERROR). */
function prvniHlaska(details: Record<string, string[]>, pole: string): string | null {
  const seznam = details[pole];
  if (seznam === undefined || seznam.length === 0) return null;
  const hlaska = seznam[0];
  return typeof hlaska === "string" ? hlaska : null;
}

function mapaChybyRegistrace(
  status: number,
  telo: unknown,
): AuthVysledek<PoleRegistrace> {
  if (jeApiChyba(telo)) {
    const chyba: ApiErrorBody = telo.error;
    if (chyba.code === "VALIDATION_ERROR") {
      const detaily = chyba.details ?? {};
      const chybyPoli: Partial<Record<PoleRegistrace, string>> = {};
      const pole: readonly PoleRegistrace[] = [
        "jmeno",
        "prijmeni",
        "email",
        "heslo",
        "telefon",
        "discordNick",
        "kod",
      ];
      for (const klic of pole) {
        const hlaska = prvniHlaska(detaily, klic);
        if (hlaska !== null) chybyPoli[klic] = hlaska;
      }
      return { uspech: false, chyba: chyba.message, chybyPoli };
    }
    if (chyba.code === "KOD_NEPLATNY" || chyba.code === "KOD_EXPIROVANY") {
      return {
        uspech: false,
        chyba: chyba.message,
        chybyPoli: { kod: chyba.message },
      };
    }
    if (chyba.code === "EMAIL_OBSAZEN") {
      return {
        uspech: false,
        chyba: chyba.message,
        chybyPoli: { email: chyba.message },
      };
    }
    return { uspech: false, chyba: chyba.message, chybyPoli: {} };
  }
  void status;
  return { uspech: false, chyba: OBECNA_CHYBA, chybyPoli: {} };
}

function mapaChybyPrihlaseni(
  status: number,
  telo: unknown,
): AuthVysledek<PolePrihlaseni> {
  if (jeApiChyba(telo)) {
    const chyba: ApiErrorBody = telo.error;
    if (chyba.code === "VALIDATION_ERROR") {
      const detaily = chyba.details ?? {};
      const chybyPoli: Partial<Record<PolePrihlaseni, string>> = {};
      const pole: readonly PolePrihlaseni[] = ["email", "heslo"];
      for (const klic of pole) {
        const hlaska = prvniHlaska(detaily, klic);
        if (hlaska !== null) chybyPoli[klic] = hlaska;
      }
      return { uspech: false, chyba: chyba.message, chybyPoli };
    }
    return { uspech: false, chyba: chyba.message, chybyPoli: {} };
  }
  void status;
  return { uspech: false, chyba: OBECNA_CHYBA, chybyPoli: {} };
}

/**
 * Lokální generování kódu pro offline/demo režim (původní chování).
 * S backendem se nevolá — tam kódy tvoří `POST /api/admin/codes`.
 */
function vytvorLokalniKod(
  poznamkaCista: string,
  authRole: AuthRole | null,
  maAdmina: boolean,
): DemoKod {
  if (maAdmina && authRole !== "ADMIN") {
    throw new Error("Generovat kódy může jen admin.");
  }
  const vsechny = purgeExpirovanychKodu();
  const ted = Date.now();
  const novy: DemoKod = {
    id: noveId(),
    kod: nahodnyKod(new Set(vsechny.map((k) => k.kod))),
    createdAt: new Date(ted).toISOString(),
    expiresAt: new Date(ted + DESET_MINUT_MS).toISOString(),
    poznamka: poznamkaCista.length === 0 ? null : poznamkaCista,
  };
  const next = [novy, ...vsechny];
  bezpecnePis(CODES_KEY, JSON.stringify(next));
  // Read-back verifikace: soukromý režim tiše spolkne zápis —
  // bez ní bychom ukázali fantomový kód, který nikde není.
  const overeno = ctiKodyRaw().some((k) => k.id === novy.id);
  if (!overeno) {
    throw new Error(
      "Kód se nepodařilo uložit (prohlížeč odmítl zápis, např. soukromý režim). Povol úložiště a zkus to znovu.",
    );
  }
  return novy;
}

interface AuthKontext {
  user: ApiUser | null;
  isLoading: boolean;
  prihlasen: boolean;
  isAdmin: boolean;
  /** True, dokud v systému není žádný ADMIN — probíhá prvotní nastavení. */
  jeBootstrap: boolean;
  kody: DemoKod[];
  register: (vstup: RegistraceVstup) => Promise<AuthVysledek<PoleRegistrace>>;
  login: (vstup: PrihlaseniVstup) => Promise<AuthVysledek<PolePrihlaseni>>;
  odhlasit: () => void;
  /**
   * Obdoba POST /api/admin/codes — expirace fixně +10 minut.
   * S backendem jde na server, bez spojení padá na lokální demo.
   * Zamítnutí (ne-admin) vyhazuje česky (konzumuje CodesPanel).
   */
  generujKod: (poznamka: string) => Promise<DemoKod>;
}

const AuthContext = createContext<AuthKontext | null>(null);

function maSystemAdmina(uzivatele: DemoUserRecord[]): boolean {
  return uzivatele.some((u) => u.authRole === "ADMIN");
}

/** Sdílený provider — jediný zdroj session pro celou aplikaci. */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<ApiUser | null>(null);
  /** Obdoba GET /me — při mountu načte session, do té doby skeleton. */
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [kody, setKody] = useState<DemoKod[]>([]);
  const [jeBootstrap, setJeBootstrap] = useState<boolean>(false);

  useEffect(() => {
    let zive = true;

    // Obdoba GET /api/me — s backendem je zdrojem pravdy cookie session,
    // bez spojení padáme na lokální demo session (cache, ne zdroj pravdy).
    void (async (): Promise<void> => {
      const odpoved = await volejBackend(ME_PATH, "GET");
      if (!zive) return;
      if (odpoved !== null) {
        // Bootstrap vlastní server (první kód i první admin bez session);
        // klientský banner proto neukazujeme — jeBootstrap drží server.
        const uzivatel = ctiUsera(odpoved.telo);
        setUser(odpoved.status === 200 ? uzivatel : null);
        setJeBootstrap(false);
        setKody(purgeExpirovanychKodu());
        setIsLoading(false);
        return;
      }
      const uzivatele = parseUzivatele();
      const sessionId = bezpecneCti(SESSION_KEY);
      const nalezen =
        sessionId === null
          ? undefined
          : uzivatele.find((u) => u.id === sessionId);
      setUser(nalezen === undefined ? null : verejnyProfil(nalezen));
      setJeBootstrap(!maSystemAdmina(uzivatele));
      setKody(purgeExpirovanychKodu());
      setIsLoading(false);
    })();

    const sync = (): void => {
      // S backendem je zdrojem pravdy cookie session (GET /me) — storage
      // event tu smí sáhnout jen na cache kódů, nikdy na uživatele.
      if (apiBase().length > 0) {
        setKody(purgeExpirovanychKodu());
        return;
      }
      const aktualni = parseUzivatele();
      const sid = bezpecneCti(SESSION_KEY);
      const zaznam =
        sid === null ? undefined : aktualni.find((u) => u.id === sid);
      setUser(zaznam === undefined ? null : verejnyProfil(zaznam));
      setJeBootstrap(!maSystemAdmina(aktualni));
      setKody(purgeExpirovanychKodu());
    };
    const timer = window.setInterval(() => {
      setKody(purgeExpirovanychKodu());
    }, 15000);
    window.addEventListener("storage", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const register = useCallback(
    async (vstup: RegistraceVstup): Promise<AuthVysledek<PoleRegistrace>> => {
      const chybyPoli: Partial<Record<PoleRegistrace, string>> = {};
      const chybaJmena = validujJmeno(vstup.jmeno);
      const chybaPrijmeni = validujPrijmeni(vstup.prijmeni);
      const chybaEmailu = validujEmail(vstup.email);
      const chybaHesla = validujHeslo(vstup.heslo);
      const chybaTelefonu = validujTelefon(vstup.telefon);
      const chybaDiscordu = validujDiscordNick(vstup.discordNick);
      const chybaTvaru = validujTvarKodu(vstup.kod);
      if (chybaJmena !== null) chybyPoli.jmeno = chybaJmena;
      if (chybaPrijmeni !== null) chybyPoli.prijmeni = chybaPrijmeni;
      if (chybaEmailu !== null) chybyPoli.email = chybaEmailu;
      if (chybaHesla !== null) chybyPoli.heslo = chybaHesla;
      if (chybaTelefonu !== null) chybyPoli.telefon = chybaTelefonu;
      if (chybaDiscordu !== null) chybyPoli.discordNick = chybaDiscordu;
      if (chybaTvaru !== null) chybyPoli.kod = chybaTvaru;
      if (Object.keys(chybyPoli).length > 0) {
        return {
          uspech: false,
          chyba: "Zkontroluj zvýrazněná pole.",
          chybyPoli,
        };
      }

      // Backend-first: server je zdrojem pravdy (i chybové odpovědi).
      // Jen síťový výpadek (null) padá na lokální demo níže.
      const payload: Record<string, unknown> = {
        jmeno: vstup.jmeno.trim(),
        email: vstup.email.trim().toLowerCase(),
        heslo: vstup.heslo,
        kod: normalizujKod(vstup.kod),
      };
      const prijmeni = normalizujNepovinny(vstup.prijmeni);
      const telefon = normalizujNepovinny(vstup.telefon);
      const discordNick = normalizujNepovinny(vstup.discordNick);
      if (prijmeni !== null) payload["prijmeni"] = prijmeni;
      if (telefon !== null) payload["telefon"] = telefon;
      if (discordNick !== null) payload["discordNick"] = discordNick;
      const backend = await volejBackend(REGISTER_PATH, "POST", payload);
      if (backend !== null) {
        const uzivatel = ctiUsera(backend.telo);
        if (
          (backend.status === 201 || backend.status === 200) &&
          uzivatel !== null
        ) {
          setUser(uzivatel);
          setJeBootstrap(false);
          return { uspech: true, chyba: null, chybyPoli: {} };
        }
        return mapaChybyRegistrace(backend.status, backend.telo);
      }

      const email = vstup.email.trim().toLowerCase();
      const kodCisty = normalizujKod(vstup.kod);
      const uzivatele = parseUzivatele();
      if (uzivatele.some((u) => u.email.toLowerCase() === email)) {
        return {
          uspech: false,
          chyba: "Tento e-mail je už obsazený. Zkus se přihlásit.",
          chybyPoli: { email: "Tento e-mail je už obsazený." },
        };
      }

      const vsechnyKody = ctiKodyRaw();
      const kod = vsechnyKody.find((k) => k.kod === kodCisty);
      if (kod === undefined) {
        return {
          uspech: false,
          chyba: "Kód je neplatný. Zkontroluj ho, nebo požádej vedoucí o nový.",
          chybyPoli: { kod: "Kód je neplatný." },
        };
      }
      // KOD_EXPIROVANY (410) — česky, vhodné k přímému zobrazení.
      if (Date.parse(kod.expiresAt) <= Date.now()) {
        return {
          uspech: false,
          chyba: "Kód vypršel (platí 10 minut). Požádej vedoucí o nový.",
          chybyPoli: { kod: "Kód vypršel." },
        };
      }

      // Bootstrap: pokud ještě neexistuje žádný ADMIN, první registrovaný
      // uživatel se stane adminem (role admin / authRole ADMIN).
      const jePrvniAdmin = !maSystemAdmina(uzivatele);
      const ted = new Date().toISOString();
      const novy: DemoUserRecord = {
        id: noveId(),
        jmeno: vstup.jmeno.trim(),
        prijmeni: normalizujNepovinny(vstup.prijmeni) ?? undefined,
        email,
        telefon: normalizujNepovinny(vstup.telefon),
        discordNick: normalizujNepovinny(vstup.discordNick),
        // WARNING: plaintext heslo — pouze demo (localStorage). Backend bude hashovat.
        heslo: vstup.heslo,
        role: jePrvniAdmin ? "admin" : "clen",
        authRole: jePrvniAdmin ? "ADMIN" : "USER",
        createdAt: ted,
        updatedAt: ted,
      };
      // Kód je opakovaně použitelný — mizí jen expirací (purge).
      const zbyvajici = vsechnyKody.filter((k) =>
        jePlatnyKod(k, Date.now()),
      );
      bezpecnePis(CODES_KEY, JSON.stringify(zbyvajici));
      bezpecnePis(USERS_KEY, JSON.stringify([...uzivatele, novy]));
      bezpecnePis(SESSION_KEY, novy.id);
      setKody(zbyvajici);
      setUser(verejnyProfil(novy));
      if (jePrvniAdmin) {
        setJeBootstrap(false);
      }
      return { uspech: true, chyba: null, chybyPoli: {} };
    },
    [],
  );

  const login = useCallback(
    async (vstup: PrihlaseniVstup): Promise<AuthVysledek<PolePrihlaseni>> => {
      const chybyPoli: Partial<Record<PolePrihlaseni, string>> = {};
      const chybaEmailu = validujEmail(vstup.email);
      const chybaHesla =
        vstup.heslo.length === 0 ? VALIDACNI_ZPRAVY.hesloPovinne : null;
      if (chybaEmailu !== null) chybyPoli.email = chybaEmailu;
      if (chybaHesla !== null) chybyPoli.heslo = chybaHesla;
      if (Object.keys(chybyPoli).length > 0) {
        return {
          uspech: false,
          chyba: "Zkontroluj zvýrazněná pole.",
          chybyPoli,
        };
      }

      // Backend-first: server je zdrojem pravdy. Pozor: demo-účty
      // z offline režimu v DB nejsou → 401 znamená přeregistrovat se.
      const odpoved = await volejBackend(LOGIN_PATH, "POST", {
        email: vstup.email.trim().toLowerCase(),
        heslo: vstup.heslo,
      });
      if (odpoved !== null) {
        const uzivatel = ctiUsera(odpoved.telo);
        if (odpoved.status === 200 && uzivatel !== null) {
          setUser(uzivatel);
          setJeBootstrap(false);
          return { uspech: true, chyba: null, chybyPoli: {} };
        }
        return mapaChybyPrihlaseni(odpoved.status, odpoved.telo);
      }

      const email = vstup.email.trim().toLowerCase();
      const zaznam = parseUzivatele().find(
        (u) => u.email.toLowerCase() === email,
      );
      // WARNING: porovnání plaintext hesel — pouze demo. Backend porovná hash na serveru.
      if (zaznam === undefined || zaznam.heslo !== vstup.heslo) {
        return {
          uspech: false,
          chyba: "Špatný e-mail nebo heslo.",
          chybyPoli: {},
        };
      }
      bezpecnePis(SESSION_KEY, zaznam.id);
      setUser(verejnyProfil(zaznam));
      return { uspech: true, chyba: null, chybyPoli: {} };
    },
    [],
  );

  const odhlasit = useCallback((): void => {
    // Serverovou cookie mažeme fire-and-forget; lokální stav čistíme hned.
    void volejBackend("/api/logout", "POST");
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Bez storage prostě zahodíme stav v paměti.
    }
    setUser(null);
  }, []);

  /** Obdoba POST /api/admin/codes — expirace fixně +10 minut. */
  const generujKod = useCallback(
    async (poznamka: string): Promise<DemoKod> => {
      const cista =
        poznamka.trim().length === 0
          ? null
          : poznamka.trim().slice(0, VALIDACE.poznamkaMaxDelka);
      // Backend-first: server je zdrojem pravdy (roli ověří na serveru).
      // Bootstrap prvního kódu bez session řeší server stejně jako demo.
      const odpoved = await volejBackend(
        ADMIN_CODES_PATH,
        "POST",
        cista === null ? {} : { poznamka: cista },
      );
      if (odpoved !== null) {
        if (odpoved.status === 201) {
          const kod = ctiKod(odpoved.telo, cista);
          if (kod === null) {
            throw new Error(
              "Server vrátil neočekávanou odpověď. Zkus to znovu.",
            );
          }
          // Kód je opakovaně použitelný — cache slouží jen k výpisu,
          // zdrojem pravdy je DB (list endpoint kontrakt nemá).
          const next = [kod, ...purgeExpirovanychKodu()];
          bezpecnePis(CODES_KEY, JSON.stringify(next));
          setKody(next);
          return kod;
        }
        if (odpoved.status === 401 || odpoved.status === 403) {
          throw new Error("Generovat kódy může jen admin.");
        }
        if (jeApiChyba(odpoved.telo)) {
          throw new Error(odpoved.telo.error.message);
        }
        throw new Error("Kód se nepodařilo vygenerovat. Zkus to znovu.");
      }
      // Offline/demo fallback: původní lokální generování.
      // Bootstrap: dokud neexistuje žádný admin, jde vygenerovat první kód
      // bez přihlášení; po vytvoření prvního admina už jen ADMIN.
      const novy = vytvorLokalniKod(
        cista ?? "",
        user?.authRole ?? null,
        maSystemAdmina(parseUzivatele()),
      );
      setKody((prev) => [novy, ...prev]);
      return novy;
    },
    [user],
  );

  const hodnota = useMemo<AuthKontext>(
    () => ({
      user,
      isLoading,
      prihlasen: user !== null,
      isAdmin: user?.authRole === "ADMIN",
      jeBootstrap,
      kody,
      register,
      login,
      odhlasit,
      generujKod,
    }),
    [user, isLoading, jeBootstrap, kody, register, login, odhlasit, generujKod],
  );

  return createElement(AuthContext.Provider, { value: hodnota }, children);
}

/** Čte sdílenou session z AuthProvidera. Musí být uvnitř providera. */
export function useAuth(): AuthKontext {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth musí být uvnitř <AuthProvider>.");
  }
  return ctx;
}

export type UseAuth = AuthKontext;
