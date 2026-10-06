import type { Role } from "../config/roles";

/** Mock člen pro UI vývoj — bez backendu. Jediný zdroj rolí: `role: Role[]` (viz roles.ts). */
export interface MockClen {
  id: string;
  jmeno: string;
  role: Role[];
}

/**
 * 14 členů pokrývajících všechny role: admin, vedení, rada, aktivní i základní.
 * Kontrakt (viz jeValidniKombinaceRole): báze právě jedna (clen XOR aktivni-clen),
 * nadstavba (clen-rady / vedeni) jen s aktivni-clen, admin se do exkluzivity nepočítá.
 * Admin výjimka c01: má ["aktivni-clen", "vedeni", "admin"] — admin je mimo bázi
 * i nadstavbu, validaci prochází díky aktivní bázi + admin příznaku.
 */
export const MOCK_CLENOVE: readonly MockClen[] = [
  { id: "c01", jmeno: "Anna Nováková", role: ["aktivni-clen", "vedeni", "admin"] },
  { id: "c02", jmeno: "Petr Svoboda", role: ["aktivni-clen", "vedeni"] },
  { id: "c03", jmeno: "Lucie Dvořáková", role: ["aktivni-clen", "vedeni", "clen-rady"] },
  { id: "c04", jmeno: "Jan Procházka", role: ["aktivni-clen", "clen-rady"] },
  { id: "c05", jmeno: "Eva Horáková", role: ["aktivni-clen", "clen-rady"] },
  { id: "c06", jmeno: "Tomáš Malý", role: ["aktivni-clen"] },
  { id: "c07", jmeno: "Klára Veselá", role: ["aktivni-clen"] },
  { id: "c08", jmeno: "Ondřej Němec", role: ["aktivni-clen"] },
  { id: "c09", jmeno: "Veronika Králová", role: ["aktivni-clen"] },
  { id: "c10", jmeno: "Martin Pokorný", role: ["aktivni-clen"] },
  { id: "c11", jmeno: "Jana Slavíková", role: ["clen"] },
  { id: "c12", jmeno: "Filip Černý", role: ["aktivni-clen"] },
  { id: "c13", jmeno: "Tereza Bílá", role: ["aktivni-clen", "clen-rady"] },
  { id: "c14", jmeno: "Jakub Sedláček", role: ["clen"] },
] as const;
