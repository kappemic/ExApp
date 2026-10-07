import type { Role, RoleSet } from "../config/roles";

/** Mock člen pro UI vývoj — bez backendu. Jediný zdroj rolí: `role: RoleSet` (viz roles.ts).
 * Live-only rozhodnutí (Krok 6b): ostrá data členů se čtou ŽIVĚ z BFF
 * `GET /api/clenove` (jen ADMIN) a nikdy se nesnapshotují do Gitu —
 * obsahují osobní údaje (e-mail, telefon). Tento mock slouží jen pro UI prototyp. */
export interface MockClen {
  id: string;
  jmeno: string;
  prijmeni: string;
  email: string;
  telefon: string;
  discordNick: string;
  role: RoleSet;
}

/** Plné jméno pro zobrazení („Anna Nováková"). */
export function celeJmeno(clen: Pick<MockClen, "jmeno" | "prijmeni">): string {
  return `${clen.jmeno} ${clen.prijmeni}`;
}

/** Pomocník pro čitelné zadání rolí bez opakování importů. */
function r(...role: Role[]): RoleSet {
  return role;
}

/**
 * 14 členů pokrývajících všechny role: admin, vedení, rada, aktivní i základní.
 * Kontrakt (viz jeValidniKombinaceRole): báze právě jedna (clen XOR aktivni-clen),
 * nadstavba (clen-rady / vedeni) jen s aktivni-clen, admin se do exkluzivity nepočítá.
 * Admin výjimka c01: má ["aktivni-clen", "vedeni", "admin"] — admin je mimo bázi
 * i nadstavbu, validaci prochází díky aktivní bázi + admin příznaku.
 * Kontakty jsou fiktivní (example.cz), slouží jen pro UI prototyp kroku 4a.
 */
export const MOCK_CLENOVE: readonly MockClen[] = [
  { id: "c01", jmeno: "Anna", prijmeni: "Nováková", email: "anna.novakova@example.cz", telefon: "+420 601 111 001", discordNick: "anna.n", role: r("aktivni-clen", "vedeni", "admin") },
  { id: "c02", jmeno: "Petr", prijmeni: "Svoboda", email: "petr.svoboda@example.cz", telefon: "+420 602 111 002", discordNick: "petr.svb", role: r("aktivni-clen", "vedeni") },
  { id: "c03", jmeno: "Lucie", prijmeni: "Dvořáková", email: "lucie.dvorakova@example.cz", telefon: "+420 603 111 003", discordNick: "lucka.d", role: r("aktivni-clen", "vedeni", "clen-rady") },
  { id: "c04", jmeno: "Jan", prijmeni: "Procházka", email: "jan.prochazka@example.cz", telefon: "+420 604 111 004", discordNick: "honza.p", role: r("aktivni-clen", "clen-rady") },
  { id: "c05", jmeno: "Eva", prijmeni: "Horáková", email: "eva.horakova@example.cz", telefon: "+420 605 111 005", discordNick: "eva.h", role: r("aktivni-clen", "clen-rady") },
  { id: "c06", jmeno: "Tomáš", prijmeni: "Malý", email: "tomas.maly@example.cz", telefon: "+420 606 111 006", discordNick: "tom.maly", role: r("aktivni-clen") },
  { id: "c07", jmeno: "Klára", prijmeni: "Veselá", email: "klara.vesela@example.cz", telefon: "+420 607 111 007", discordNick: "klara.v", role: r("aktivni-clen") },
  { id: "c08", jmeno: "Ondřej", prijmeni: "Němec", email: "ondrej.nemec@example.cz", telefon: "+420 608 111 008", discordNick: "ondra.n", role: r("aktivni-clen") },
  { id: "c09", jmeno: "Veronika", prijmeni: "Králová", email: "veronika.kralova@example.cz", telefon: "+420 609 111 009", discordNick: "verca.k", role: r("aktivni-clen") },
  { id: "c10", jmeno: "Martin", prijmeni: "Pokorný", email: "martin.pokorny@example.cz", telefon: "+420 610 111 010", discordNick: "marty.p", role: r("aktivni-clen") },
  { id: "c11", jmeno: "Jana", prijmeni: "Slavíková", email: "jana.slavikova@example.cz", telefon: "+420 611 111 011", discordNick: "jana.s", role: r("clen") },
  { id: "c12", jmeno: "Filip", prijmeni: "Černý", email: "filip.cerny@example.cz", telefon: "+420 612 111 012", discordNick: "filip.c", role: r("aktivni-clen") },
  { id: "c13", jmeno: "Tereza", prijmeni: "Bílá", email: "tereza.bila@example.cz", telefon: "+420 613 111 013", discordNick: "tereza.b", role: r("aktivni-clen", "clen-rady") },
  { id: "c14", jmeno: "Jakub", prijmeni: "Sedláček", email: "jakub.sedlacek@example.cz", telefon: "+420 614 111 014", discordNick: "kubas", role: r("clen") },
];
