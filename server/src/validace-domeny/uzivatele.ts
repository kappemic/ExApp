/**
 * Admin user and role patch validation.
 */

import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
} from "../../../src/shared/api-types";
import {
  chybaKombinace3D,
  isKnownRole,
  type ClenskyProfil,
  type Clenstvi,
  type Funkce,
  type Role,
} from "../../../src/config/roles";
import type { ChybyPoli, VysledekValidace } from "./spolecne";
import { ctiString, overSkolaTrida, pridej, jeRecord } from "./spolecne";




/* PATCH /api/users/:id — úprava primární role (jen ADMIN).              */
/* `role` je jedna hodnota z roles.ts (DB users.role CHECK kopíruje     */
/* stejných 5 hodnot). Kombinace se neřeší — jedna hodnota je vždy      */
/* validní, stačí isKnownRole.                                          */
/* ------------------------------------------------------------------ */

export interface CistaUpravaRoleUzivatele {
  role: Role;
}

/**
 * Validace PATCH /api/users/:id — tělo musí nést právě `role`.
 * Neznámá / chybějící role → chyby.role = [česká hláška] (422).
 */
export function validujUpravuRoleUzivatele(
  telo: unknown,
): VysledekValidace<CistaUpravaRoleUzivatele> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const raw: unknown = ctiString(telo, "role");
  if (typeof raw !== "string" || !isKnownRole(raw)) {
    pridej(
      chyby,
      "role",
      "Vyber platnou roli: admin, člen, aktivní člen, člen rady, nebo vedení.",
    );
    return { uspech: false, data: null, chybyPoli: chyby };
  }
  return { uspech: true, data: { role: raw }, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
/* PATCH /api/users/:id — nové parciální 3D trio (aditivní).             */
/* Přijímá `clenstvi?/funkce?/isAdmin?/isSuperadmin?/skola?/trida?`      */
/* (parciální) NEBO samotné staré `{ role }`                             */
/* (přes `validujUpravuRoleUzivatele`).                                  */
/* Kombinace obojího → uspech:false (route složí 422).                  */
/* Pravidlo 3D: `clen` + funkce → chyba (`chybaKombinace3D`).            */
/* ------------------------------------------------------------------ */

const CLENSTVI_HODNOTY: readonly Clenstvi[] = ["clen", "aktivni_clen"];
const FUNKCE_HODNOTY: readonly Exclude<Funkce, null>[] = ["vedeni", "rada"];

export interface CistaUpravaUzivatele {
  clenstvi?: Clenstvi;
  funkce?: Funkce;
  isAdmin?: boolean;
  isSuperadmin?: boolean;
  skola?: string;
  trida?: string;
  role?: Role;
}

/**
 * Validace PATCH /api/users/:id — nové trio, nebo staré `{ role }`.
 * Staré `{ role }` prochází přes `validujUpravuRoleUzivatele`
 * (kontrakt se neláme); obojí najednou → 422 tvar chyb.
 */
export function validujUpravuUzivatele(
  telo: unknown,
): VysledekValidace<CistaUpravaUzivatele> {
  const chyby: ChybyPoli = {};
  if (!jeRecord(telo)) {
    return {
      uspech: false,
      data: null,
      chybyPoli: { telo: ["Požadavek musí být JSON objekt."] },
    };
  }
  const maRoli = Object.hasOwn(telo, "role");
  const maNove =
    Object.hasOwn(telo, "clenstvi") ||
    Object.hasOwn(telo, "funkce") ||
    Object.hasOwn(telo, "isAdmin") ||
    Object.hasOwn(telo, "isSuperadmin") ||
    Object.hasOwn(telo, "skola") ||
    Object.hasOwn(telo, "trida");

  if (maRoli && maNove) {
    pridej(
      chyby,
      "role",
      "Zadej buď starou roli, nebo nové pole (členství / funkce / admin / hlavní admin / škola / třída) — ne obojí.",
    );
    return { uspech: false, data: null, chybyPoli: chyby };
  }

  if (maRoli && !maNove) {
    const stare = validujUpravuRoleUzivatele(telo);
    if (!stare.uspech || stare.data === null) {
      return { uspech: false, data: null, chybyPoli: stare.chybyPoli };
    }
    return { uspech: true, data: { role: stare.data.role }, chybyPoli: {} };
  }

  const data: CistaUpravaUzivatele = {};

  if (Object.hasOwn(telo, "clenstvi")) {
    const raw: unknown = ctiString(telo, "clenstvi");
    if (
      typeof raw !== "string" ||
      !(CLENSTVI_HODNOTY as readonly string[]).includes(raw)
    ) {
      pridej(chyby, "clenstvi", "Vyber platné členství: člen, nebo aktivní člen.");
    } else {
      data.clenstvi = raw as Clenstvi;
    }
  }

  if (Object.hasOwn(telo, "funkce")) {
    const raw: unknown = ctiString(telo, "funkce");
    if (raw === null) {
      data.funkce = null;
    } else if (
      typeof raw !== "string" ||
      !(FUNKCE_HODNOTY as readonly string[]).includes(raw)
    ) {
      pridej(chyby, "funkce", "Vyber platnou funkci: vedení, rada, nebo bez funkce.");
    } else {
      data.funkce = raw as Exclude<Funkce, null>;
    }
  }

  if (Object.hasOwn(telo, "isAdmin")) {
    const raw: unknown = ctiString(telo, "isAdmin");
    if (typeof raw !== "boolean") {
      pridej(chyby, "isAdmin", "Příznak admin musí být true, nebo false.");
    } else {
      data.isAdmin = raw;
    }
  }

  if (Object.hasOwn(telo, "isSuperadmin")) {
    const raw: unknown = ctiString(telo, "isSuperadmin");
    if (typeof raw !== "boolean") {
      pridej(chyby, "isSuperadmin", "Příznak hlavní admin musí být true, nebo false.");
    } else {
      data.isSuperadmin = raw;
    }
  }

  if (Object.hasOwn(telo, "skola")) {
    const cista = overSkolaTrida(
      chyby,
      "skola",
      ctiString(telo, "skola"),
      VALIDACE.skolaMaxDelka,
      VALIDACNI_ZPRAVY.skolaDlouha,
    );
    if (cista !== null) data.skola = cista;
  }

  if (Object.hasOwn(telo, "trida")) {
    const cista = overSkolaTrida(
      chyby,
      "trida",
      ctiString(telo, "trida"),
      VALIDACE.tridaMaxDelka,
      VALIDACNI_ZPRAVY.tridaDlouha,
    );
    if (cista !== null) data.trida = cista;
  }

  if (Object.keys(chyby).length > 0) {
    return { uspech: false, data: null, chybyPoli: chyby };
  }

  if (data.clenstvi !== undefined && data.funkce !== undefined) {
    const profil: ClenskyProfil = {
      clenstvi: data.clenstvi,
      funkce: data.funkce,
      isAdmin: data.isAdmin ?? false,
    };
    const chyba3D: string | null = chybaKombinace3D(profil);
    if (chyba3D !== null) {
      pridej(chyby, "funkce", chyba3D);
      return { uspech: false, data: null, chybyPoli: chyby };
    }
  }

  return { uspech: true, data, chybyPoli: {} };
}

/* ------------------------------------------------------------------ */
