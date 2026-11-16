/**
 * tests/zprava-prilohy.test.ts — chat attachment validation.
 * Pure helpers only: no network, no secrets, no database.
 */
import { EventEmitter } from "node:events";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { VALIDACE } from "../src/shared/api-types";
import {
  ctiSuroveTelo,
  hlavickaContentDisposition,
  jeKlicChatPrilohy,
  jeNahledObrazku,
  klicChatPrilohy,
  rozdelPrilohyMultipart,
  rozpoznejNazevPrilohy,
  zkontrolujTextZpravy,
} from "../server/src/zprava-prilohy";

const UUID = "11111111-1111-4111-8111-111111111111";

function multipart(
  text: string,
  soubory: { nazev: string; bajty: Buffer; hlavickaNazvu?: string }[],
): { telo: Buffer; typ: string } {
  const hranice = "----exapp-priloha";
  const kusy: Buffer[] = [
    Buffer.from(
      `--${hranice}\r\nContent-Disposition: form-data; name="text"\r\n\r\n${text}\r\n`,
      "utf8",
    ),
  ];
  for (const soubor of soubory) {
    const disposition =
      soubor.hlavickaNazvu ??
      `Content-Disposition: form-data; name="soubor"; filename="${soubor.nazev}"`;
    kusy.push(
      Buffer.from(
        `--${hranice}\r\n${disposition}\r\nContent-Type: application/octet-stream\r\n\r\n`,
        "utf8",
      ),
    );
    kusy.push(soubor.bajty);
    kusy.push(Buffer.from("\r\n", "utf8"));
  }
  kusy.push(Buffer.from(`--${hranice}--\r\n`, "utf8"));
  return {
    telo: Buffer.concat(kusy),
    typ: `multipart/form-data; boundary=${hranice}`,
  };
}

describe("velikost přílohy", () => {
  it("odmítne soubor větší než 10 MB", () => {
    const telo = multipart("", [
      { nazev: "trasa.pdf", bajty: Buffer.alloc(VALIDACE.prilohaMaxBajtu + 1) },
    ]);
    const vysledek = rozdelPrilohyMultipart(telo.telo, telo.typ);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.duvod).toBe("velikost");
  });

  it("čtečka surového těla skončí, jakmile tělo překročí strop", async () => {
    const req = new EventEmitter();
    (req as EventEmitter & { destroy: () => void }).destroy = () => undefined;
    const slib = ctiSuroveTelo(req as unknown as Request, 4);
    req.emit("data", Buffer.alloc(5));
    await expect(slib).rejects.toThrow("velikost");
  });
});

describe("přípona přílohy", () => {
  it("odmítne html, svg, js, exe a cokoli mimo seznam", () => {
    for (const nazev of ["stranka.html", "ikona.svg", "skript.js", "setup.exe", "poznamky.pdf.exe", "soubor.bin"]) {
      const telo = multipart("ahoj", [{ nazev, bajty: Buffer.from("x") }]);
      const vysledek = rozdelPrilohyMultipart(telo.telo, telo.typ);
      expect(vysledek.ok, nazev).toBe(false);
      if (!vysledek.ok) expect(vysledek.duvod, nazev).toBe("format");
    }
  });

  it("vezme příponu z basename, i když je v cestě jiná", () => {
    const telo = multipart("ahoj", [
      { nazev: "bezpecne.pdf/evil.html", bajty: Buffer.from("x") },
    ]);
    const vysledek = rozdelPrilohyMultipart(telo.telo, telo.typ);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.duvod).toBe("format");
  });
});

describe("zobrazovací název", () => {
  it("odstraní cestu a ořízne na 120 znaků", () => {
    const windows = rozpoznejNazevPrilohy("C:\\Users\\evil\\..\\tajne\\poznamky.pdf");
    expect(windows).toEqual({ ok: true, nazev: "poznamky.pdf", pripona: "pdf" });
    const unix = rozpoznejNazevPrilohy("../../etc/passwd.pdf");
    expect(unix).toEqual({ ok: true, nazev: "passwd.pdf", pripona: "pdf" });
    const dlouhy = rozpoznejNazevPrilohy(`${"a".repeat(200)}.txt`);
    expect(dlouhy.ok).toBe(true);
    if (dlouhy.ok) expect(dlouhy.nazev).toHaveLength(120);
  });

  it("parser uloží jen basename, klíč neskládá z jména souboru", () => {
    const telo = multipart("", [
      { nazev: "C:\\Users\\evil\\..\\tajne\\poznamky.pdf", bajty: Buffer.from("%PDF") },
    ]);
    const vysledek = rozdelPrilohyMultipart(telo.telo, telo.typ);
    expect(vysledek.ok).toBe(true);
    if (!vysledek.ok) return;
    expect(vysledek.soubory[0]?.nazev).toBe("poznamky.pdf");
    const klic = klicChatPrilohy("pdf", UUID);
    expect(klic).toBe(`chat-prilohy/${UUID}.pdf`);
    expect(klic).not.toContain("poznamky");
    expect(klic).not.toContain("..");
    if (klic !== null) expect(jeKlicChatPrilohy(klic)).toBe(true);
    expect(jeKlicChatPrilohy(`chat-prilohy/${UUID}.webp`)).toBe(true);
    expect(jeKlicChatPrilohy(`chat-prilohy/${UUID}.jpg`)).toBe(true);
    expect(jeKlicChatPrilohy(`chat-prilohy/${UUID}.nahled.webp`)).toBe(false);
  });
});

describe("text a stažení", () => {
  it("prázdný text projde jen se souborem", () => {
    expect(zkontrolujTextZpravy("", 0).ok).toBe(false);
    expect(zkontrolujTextZpravy("   ", 0).ok).toBe(false);
    expect(zkontrolujTextZpravy("", 1)).toEqual({ ok: true, text: "" });
    expect(zkontrolujTextZpravy("a".repeat(1000), 0).ok).toBe(true);
    expect(zkontrolujTextZpravy("a".repeat(1001), 1).ok).toBe(false);
  });

  it("náhled jen u png jpeg webp gif a hlavička neobsahuje konec řádku", () => {
    expect(jeNahledObrazku("image/png")).toBe(true);
    expect(jeNahledObrazku("image/jpeg")).toBe(true);
    expect(jeNahledObrazku("image/webp")).toBe(true);
    expect(jeNahledObrazku("image/gif")).toBe(true);
    expect(jeNahledObrazku("image/heic")).toBe(false);
    expect(jeNahledObrazku("image/svg+xml")).toBe(false);
    expect(jeNahledObrazku("text/html")).toBe(false);
    const obrazek = hlavickaContentDisposition("fotka.png", true);
    const dokument = hlavickaContentDisposition("trasa.pdf\r\nX-Evil: 1", false);
    expect(obrazek.startsWith("inline;")).toBe(true);
    expect(dokument.startsWith("attachment;")).toBe(true);
    expect(dokument).not.toMatch(/[\r\n]/);
    expect(dokument).toContain("filename*=UTF-8''");
    expect(hlavickaContentDisposition("../../secret.pdf", false)).toContain('filename="secret.pdf"');
  });
});
