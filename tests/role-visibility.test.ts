/**
 * tests/role-visibility.test.ts — Krok 18: matice viditelnosti rolí.
 *
 * Co vidí která role (člen vs aktivní člen vs vedoucí/admin):
 * výpravy (čtení), Upravit, fotky, členové/kódy, statistiky,
 * přihlásit/odhlásit, odpojit Stravu.
 *
 * Čistá logika bez DB/HTTP — zdroj pravdy ROLE_DOC.md §5 + dodatek 3D §5
 * (dual-guard výpravy, fotky jen ADMIN, kódy+členové jen ADMIN).
 * Seed účty (maily) viz docs/testovaci-ucty.md, hesla jen z env.
 */

import { describe, expect, it } from "vitest";
import { viditelnostProProfil } from "../src/config/role-viditelnost";
import type { ClenskyProfil } from "../src/config/roles";

/** 3 seed profily dle docs/testovaci-ucty.md (bez mailů/hesel — jen trio). */
const VEDOUCI: ClenskyProfil = {
  clenstvi: "aktivni_clen",
  funkce: "vedeni",
  isAdmin: true,
};
const AKTIVNI_CLEN: ClenskyProfil = {
  clenstvi: "aktivni_clen",
  funkce: null,
  isAdmin: false,
};
const BEZNY_CLEN: ClenskyProfil = {
  clenstvi: "clen",
  funkce: null,
  isAdmin: false,
};

describe("role-visibility — čtení výprav vidí všechny role", () => {
  it("vedoucí, aktivní i běžný člen čtou výpravy", () => {
    expect(viditelnostProProfil(VEDOUCI).muzeCistVypravy).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).muzeCistVypravy).toBe(true);
    expect(viditelnostProProfil(BEZNY_CLEN).muzeCistVypravy).toBe(true);
  });
});

describe("role-visibility — správa výprav (dual-guard)", () => {
  it("vedoucí/admin smí spravovat výpravy", () => {
    expect(viditelnostProProfil(VEDOUCI).muzeSpravovatVypravy).toBe(true);
  });

  it("aktivní člen smí spravovat výpravy (smiNaVypravy)", () => {
    expect(viditelnostProProfil(AKTIVNI_CLEN).muzeSpravovatVypravy).toBe(true);
  });

  it("běžný člen nesmí spravovat výpravy", () => {
    expect(viditelnostProProfil(BEZNY_CLEN).muzeSpravovatVypravy).toBe(false);
  });

  it("tlačítko Upravit kopíruje právo spravovat výpravy", () => {
    expect(viditelnostProProfil(VEDOUCI).vidiUpravit).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).vidiUpravit).toBe(true);
    expect(viditelnostProProfil(BEZNY_CLEN).vidiUpravit).toBe(false);
  });
});

describe("role-visibility — fotky, členové a kódy jen pro admina", () => {
  it("jen vedoucí/admin spravuje fotky", () => {
    expect(viditelnostProProfil(VEDOUCI).muzeSpravovatFotky).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).muzeSpravovatFotky).toBe(false);
    expect(viditelnostProProfil(BEZNY_CLEN).muzeSpravovatFotky).toBe(false);
  });

  it("jen vedoucí/admin spravuje členy a kódy", () => {
    expect(viditelnostProProfil(VEDOUCI).muzeSpravovatClenyKody).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).muzeSpravovatClenyKody).toBe(false);
    expect(viditelnostProProfil(BEZNY_CLEN).muzeSpravovatClenyKody).toBe(false);
  });
});

describe("role-visibility — společné akce všech přihlášených", () => {
  it("statistiky vidí všechny tři role", () => {
    expect(viditelnostProProfil(VEDOUCI).vidiStatistiky).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).vidiStatistiky).toBe(true);
    expect(viditelnostProProfil(BEZNY_CLEN).vidiStatistiky).toBe(true);
  });

  it("přihlásit/odhlásit na výpravu smí všechny tři role", () => {
    expect(viditelnostProProfil(VEDOUCI).muzeSePrihlasitNaVypravu).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).muzeSePrihlasitNaVypravu).toBe(true);
    expect(viditelnostProProfil(BEZNY_CLEN).muzeSePrihlasitNaVypravu).toBe(true);
  });

  it("odpojit vlastní Stravu smí všechny tři role", () => {
    expect(viditelnostProProfil(VEDOUCI).muzeOdpojitStravu).toBe(true);
    expect(viditelnostProProfil(AKTIVNI_CLEN).muzeOdpojitStravu).toBe(true);
    expect(viditelnostProProfil(BEZNY_CLEN).muzeOdpojitStravu).toBe(true);
  });
});
