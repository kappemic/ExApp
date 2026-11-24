/**
 * Správa člena: co formulář pošle, co odmítne a co přijme server.
 */
import { describe, expect, it } from "vitest";
import {
  chybyZeServeru,
  formularZClena,
  zkontrolujFormular,
  zmenyFormulare,
} from "../src/lib/sprava-clena";
import { validujUpravuUzivatele } from "../server/src/validace";
import type { UserId, UserListItem } from "../src/shared/api-types";

const clen: UserListItem = {
  id: "11111111-1111-4111-8111-111111111111" as UserId,
  jmeno: "Anna Marie Nová",
  krestniJmeno: "Anna Marie",
  prijmeni: "Nová",
  email: "anna@example.cz",
  role: "aktivni-clen",
  clenstvi: "aktivni_clen",
  funkce: null,
  isAdmin: false,
  isSuperadmin: false,
  skola: "SSPŠ",
  trida: "2.A",
  discordNick: "anna",
  telefon: "+420777111222",
  narozeniny: "2008-05-04",
  pocetFotek: 0,
};

describe("změny formuláře", () => {
  it("nezměněný formulář nic neposílá", () => {
    expect(zmenyFormulare(clen, formularZClena(clen))).toEqual({});
  });

  it("víceslovné křestní jméno se nerozpadne", () => {
    expect(formularZClena(clen)).toMatchObject({ jmeno: "Anna Marie", prijmeni: "Nová" });
  });

  it("bez rozděleného jména ze serveru vezme první slovo jako jméno", () => {
    const { krestniJmeno: _k, prijmeni: _p, ...stary } = clen;
    expect(formularZClena(stary)).toMatchObject({ jmeno: "Anna", prijmeni: "Marie Nová" });
  });

  it("vyprázdněná nepovinná pole se opravdu smažou", () => {
    const form = { ...formularZClena(clen), skola: "", trida: " ", discordNick: "", telefon: "", narozeniny: "" };
    expect(zmenyFormulare(clen, form)).toEqual({
      skola: "",
      trida: "",
      discordNick: null,
      telefon: null,
      narozeniny: null,
    });
  });

  it("telefon jde v E.164 a jiný zápis stejného čísla není změna", () => {
    const form = formularZClena(clen);
    expect(zmenyFormulare(clen, { ...form, telefon: "777111222" })).toEqual({});
    expect(zmenyFormulare(clen, { ...form, telefon: "604 118 220" })).toEqual({ telefon: "+420604118220" });
  });

  it("hodnost posílá členství i funkci, hlavní admin zapne i admina", () => {
    const form = formularZClena(clen);
    expect(zmenyFormulare(clen, { ...form, funkce: "rada" })).toEqual({ clenstvi: "aktivni_clen", funkce: "rada" });
    expect(zmenyFormulare(clen, { ...form, isSuperadmin: true })).toEqual({ isAdmin: true, isSuperadmin: true });
  });
});

describe("kontrola formuláře", () => {
  it("hlásí jméno, příjmení, telefon i datum", () => {
    const form = { ...formularZClena(clen), jmeno: "A", prijmeni: "", telefon: "123", narozeniny: "1850-01-01" };
    expect(Object.keys(zkontrolujFormular(clen, form)).sort()).toEqual(["jmeno", "narozeniny", "prijmeni", "telefon"]);
  });

  it("stará neplatná hodnota neblokuje změnu role", () => {
    const stary: UserListItem = { ...clen, telefon: "12", krestniJmeno: "A" };
    const form = { ...formularZClena(stary), funkce: "vedeni" as const };
    expect(zkontrolujFormular(stary, form)).toEqual({});
  });

  it("chyby ze serveru padnou ke správným polím", () => {
    expect(chybyZeServeru({ funkce: "x", telefon: "y", nezname: "z" })).toEqual({ hodnost: "x", telefon: "y" });
  });
});

describe("PATCH users, osobní údaje", () => {
  it("přijme údaje a normalizuje je", () => {
    const vysledek = validujUpravuUzivatele({
      jmeno: "  Anna ",
      prijmeni: "Nová",
      telefon: "604 118 220",
      discordNick: "",
      narozeniny: null,
      skola: "",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({
      jmeno: "Anna",
      prijmeni: "Nová",
      telefon: "+420604118220",
      discordNick: null,
      narozeniny: null,
      skola: "",
    });
  });

  it("odmítne neplatné hodnoty", () => {
    const vysledek = validujUpravuUzivatele({ jmeno: "", telefon: "123", narozeniny: "2008-13-40" });
    expect(Object.keys(vysledek.chybyPoli).sort()).toEqual(["jmeno", "narozeniny", "telefon"]);
  });

  it("e-mail a heslo cizímu účtu nezmění", () => {
    const vysledek = validujUpravuUzivatele({ email: "utok@example.cz", heslo: "tajneheslo", passwordHash: "x" });
    expect(vysledek.data).toEqual({});
  });

  it("údaje spolu se starou rolí neprojdou", () => {
    expect(validujUpravuUzivatele({ role: "clen", jmeno: "Anna" }).uspech).toBe(false);
  });
});
