/**
 * tests/neprectena-tecka.test.ts — Fáze 5, Krok 3: tečka nepřečtené diskuze.
 * Bez DB, bez HTTP, bez jsdom (repo nemá testing-library):
 * zdroj-kontrakt nad 7 soubory + čistá pravidla viditelnosti.
 * Pokrývá zadání: 8–10px červená tečka, aria-label="Nepřečtené zprávy",
 * role="status", kontrast + ne jen barvou, mimo tap-target, 360px,
 * 3 místa synchronně (karta / modal Diskuze / nástěnka),
 * DiskuzeBox visible (IntersectionObserver) + onSend → markAsRead,
 * zhasnutí eventem bez reloadu, čtečka hlásí.
 * Strict TypeScript, žádný `any`, česky.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ADRESAR_TESTU: string = dirname(fileURLToPath(import.meta.url));

function ctiZdroj(relativniCesta: string): string {
  return readFileSync(join(ADRESAR_TESTU, "..", relativniCesta), "utf8");
}

function bezAny(zdroj: string): void {
  expect(zdroj).not.toMatch(/:\s*any\b/);
  expect(zdroj).not.toContain(["as", "any"].join(" "));
}

const TECKA = "src/components/chat/NeprectenaTecka.tsx";
const KARTA = "src/components/expeditions/ExpeditionCard.tsx";
const SEZNAM = "src/components/expeditions/ExpeditionList.tsx";
const STRANKA = "src/pages/VypravyNahledPage.tsx";
const MODAL = "src/components/expeditions/ExpeditionModal.tsx";
const NASTENKA = "src/pages/ChatPage.tsx";
const BOX = "src/components/chat/DiskuzeBox.tsx";

describe("Dot komponenta — velikost, kontrast, čtečka", () => {
  const zdroj: string = ctiZdroj(TECKA);

  it("má role=status a aria-label Nepřečtené zprávy", () => {
    expect(zdroj).toContain('role="status"');
    expect(zdroj).toContain("Nepřečtené zprávy");
    expect(zdroj).toContain("aria-label");
  });

  it("má 8–10 px (h-2 w-2 / h-2.5 w-2.5) podle velikosti", () => {
    expect(zdroj).toContain("h-2 w-2");
    expect(zdroj).toContain("h-2.5 w-2.5");
  });

  it("je červená s dostatečným kontrastem a bílým kroužkem (ne jen barvou)", () => {
    // M1 token-kontrakt: bílý kroužek VŽDY ring-2 ring-papir, nikdy
    // shadow-arbitrary. Mrtvý title (pointer-events-none) je odstraněn.
    expect(zdroj).toContain("bg-red-800");
    expect(zdroj).toContain("ring-2");
    expect(zdroj).toContain("ring-papir");
    expect(zdroj).toContain("border");
    expect(zdroj).not.toContain("shadow-[0_0_0_2px_");
    expect(zdroj).not.toContain("title=");
  });

  it("nezasahuje do tap-targetu a drží mobil (pointer-events-none + shrink-0)", () => {
    expect(zdroj).toContain("pointer-events-none");
    expect(zdroj).toContain("shrink-0");
  });

  it("respektuje reduced-motion a vrací null při viditelna=false", () => {
    expect(zdroj).toContain("motion-reduce:animate-none");
    expect(zdroj).toContain("if (!viditelna) return null");
  });

  it("nese kontext výpravy pro čtečku a nemá zakázaný typ", () => {
    expect(zdroj).toContain("nazevVypravy");
    bezAny(zdroj);
  });
});

describe("Karta + seznam — tečka mimo tap-target", () => {
  it("ExpeditionCard přijímá neprecteno a renderuje tečku vedle názvu", () => {
    const zdroj: string = ctiZdroj(KARTA);
    expect(zdroj).toContain("neprecteno");
    expect(zdroj).toContain("NeprectenaTecka");
    expect(zdroj).toContain("nazevVypravy={expedice.nazev}");
    // Tap-target Detailu zůstává 44px, tečka je mimo něj (pt-1.5 u názvu).
    expect(zdroj).toContain("min-h-[44px]");
    expect(zdroj).toContain("pt-1.5");
    // Mrtvý obal aria-hidden="false" je odstraněn (no-op, matoucí).
    expect(zdroj).not.toContain('aria-hidden="false"');
    bezAny(zdroj);
  });

  it("ExpeditionList předává mapu unread na karty (chybí klíč = přečteno)", () => {
    const zdroj: string = ctiZdroj(SEZNAM);
    expect(zdroj).toContain("neprectene?: ReadonlyMap<string, boolean>");
    expect(zdroj).toContain("neprectene?.get(exp.id) === true");
    expect(zdroj).toContain("neprecteno={");
    bezAny(zdroj);
  });
});

describe("3 místa synchronně — jedna mapa, jeden event", () => {
  it("VypravyPage čte jednu mapu hookem a dává ji všem 3 sekcím", () => {
    const zdroj: string = ctiZdroj(STRANKA);
    expect(zdroj).toContain("useUnreadExpeditions(idsVypravProUnread)");
    const pocetPredani: number =
      zdroj.split("neprectene={neprecteneMapa}").length - 1;
    expect(pocetPredani).toBe(3);
    bezAny(zdroj);
  });

  it("ExpeditionModal svítí na záložce Diskuze + textem (ne jen barvou)", () => {
    const zdroj: string = ctiZdroj(MODAL);
    // Step 3: jediný poller žije ve VypravyPage — modal bere tečku propsem.
    expect(zdroj).not.toContain("useUnreadExpeditions(");
    expect(zdroj).toContain("neprectenaDiskuze");
    expect(zdroj).toContain("NeprectenaTecka");
    expect(zdroj).toContain("Nové zprávy v diskuzi");
    expect(zdroj).toContain("text-red-800");
    bezAny(zdroj);
  });

  it("VypravyPage předává sdílenou mapu unread i do modalu", () => {
    const zdroj: string = ctiZdroj(STRANKA);
    expect(zdroj).toContain("neprectenaDiskuze={neprecteneMapa.get(vybrana.id) === true}");
    bezAny(zdroj);
  });

  it("Nástěnka svítí badge z unreadCount konverzace (Step 3, 360px safe)", () => {
    /* Badge jde z GET /api/diskuze/konverzace (žádný per-výprava polling) —
       tečku kreslí řádek seznamu, stránka badge po read zhasíná. */
    const seznam: string = ctiZdroj("src/components/chat/ConversationList.tsx");
    expect(seznam).toContain("NeprectenaTecka");
    expect(seznam).toContain("unreadCount");
    expect(seznam).toContain("min-w-0");
    expect(seznam).toContain("truncate");
    bezAny(seznam);
    const zdroj: string = ctiZdroj(NASTENKA);
    expect(zdroj).toContain("unreadCount");
    expect(zdroj).toContain("onPrecteno");
    expect(zdroj).toContain("pocetNeprectenych");
    bezAny(zdroj);
  });
});

describe("DiskuzeBox trigger — visible + onSend", () => {
  const zdroj: string = ctiZdroj(BOX);

  it("volá oznacVlaknoJakoPrectene (žádný vlastní fetch)", () => {
    expect(zdroj).toContain("oznacVlaknoJakoPrectene");
    expect(zdroj).not.toContain("fetch(");
  });

  it("visible přes IntersectionObserver s prahem a guardem přihlášení", () => {
    expect(zdroj).toContain("IntersectionObserver");
    expect(zdroj).toContain("threshold: 0.35");
    expect(zdroj).toContain("isIntersecting");
    expect(zdroj).toContain("if (!prihlasen) return");
  });

  it("značí jen jednou na vlákno a po odeslání vlastní zprávy", () => {
    expect(zdroj).toContain("oznacenoRef");
    expect(zdroj).toContain("void oznacVlaknoJakoPrectene(idVypravy)");
    // Fallback bez observeru (starý prohlížeč) vlákno přečte hned.
    expect(zdroj).toContain('typeof IntersectionObserver === "undefined"');
  });

  it("obal má ref pro observer, composer drží 44px + touch-action", () => {
    expect(zdroj).toContain("obalRef");
    expect(zdroj).toContain("ref={obalRef}");
    expect(zdroj).toContain("min-h-[44px]");
    expect(zdroj).toContain("[touch-action:manipulation]");
    bezAny(zdroj);
  });

  it("vlákno má jedinou pravdu pro název (M2: aria-label, bez aria-labelledby)", () => {
    expect(zdroj).toContain("aria-label={popisVlakna}");
    expect(zdroj).not.toContain("aria-labelledby");
  });
});

describe("česky, strict, bez reloadu", () => {
  it("tečka i test jsou česky a hook zhasíná eventem", () => {
    const tecka: string = ctiZdroj(TECKA);
    expect(tecka).toContain("nepřečtené");
    const hook: string = ctiZdroj("src/hooks/useUnreadExpeditions.ts");
    expect(hook).toContain("exapp:discussion-read");
    const box: string = ctiZdroj(BOX);
    expect(box).toContain("oznacVlaknoJakoPrectene");
  });

  it("žádný ze 7 souborů neobsahuje any", () => {
    for (const cesta of [TECKA, KARTA, SEZNAM, STRANKA, MODAL, NASTENKA, BOX]) {
      bezAny(ctiZdroj(cesta));
    }
  });
});
