import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nahrajFotku = vi.hoisted(() => vi.fn());
const nastavNahledAlba = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/alba-api", async (puvodni) => ({
  ...(await puvodni<typeof import("../src/lib/alba-api")>()),
  nahrajFotku,
  nastavNahledAlba,
}));

import {
  ctiNahravani,
  nahrajDoAlba,
  popisekNahrat,
  poNahraniFotek,
  zavriNahravani,
  zkusNahratZnovu,
} from "../src/lib/nahravani-fotek";

function soubor(nazev: string): File {
  return new File(["x"], nazev, { type: "image/jpeg" });
}

function stavy(albumId: string): string[] {
  return (ctiNahravani(albumId)?.fotky ?? []).map((fotka) => fotka.stav);
}

async function dobehni(albumId: string): Promise<void> {
  await vi.waitFor(() => {
    expect(ctiNahravani(albumId)?.probiha).toBe(false);
  });
}

describe("nahrávání fotek na pozadí", () => {
  beforeEach(() => {
    nahrajFotku.mockReset();
    nastavNahledAlba.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const id of ["a", "b"]) zavriNahravani(id);
  });

  it("nahrává po jedné a každou hotovou hned ohlásí albu", async () => {
    const uvolni: (() => void)[] = [];
    nahrajFotku.mockImplementation(
      () =>
        new Promise((resolve) => {
          uvolni.push(() => resolve({ ok: true, data: "id" }));
        }),
    );
    const hlaseni: string[] = [];
    const odhlas = poNahraniFotek((id) => hlaseni.push(id));

    nahrajDoAlba("a", [soubor("1.jpg"), soubor("2.jpg")]);
    expect(stavy("a")).toEqual(["probiha", "ceka"]);

    uvolni[0]?.();
    await vi.waitFor(() => expect(stavy("a")).toEqual(["hotovo", "probiha"]));
    expect(hlaseni).toEqual(["a"]);
    expect(ctiNahravani("b")).toBeNull();

    uvolni[1]?.();
    await dobehni("a");
    odhlas();
    expect(hlaseni).toEqual(["a", "a"]);
  });

  it("po úspěchu se průběh sám schová", async () => {
    vi.useFakeTimers();
    nahrajFotku.mockResolvedValue({ ok: true, data: "id" });
    nahrajDoAlba("a", [soubor("1.jpg")]);
    await vi.advanceTimersByTimeAsync(100);
    expect(ctiNahravani("a")?.probiha).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ctiNahravani("a")).toBeNull();
  });

  it("chyba jedné fotky nezastaví další a jde zkusit znovu", async () => {
    nahrajFotku
      .mockResolvedValueOnce({ ok: false, chyba: "Soubor je moc velký." })
      .mockResolvedValue({ ok: true, data: "id" });
    nahrajDoAlba("a", [soubor("1.jpg"), soubor("2.jpg")]);
    await dobehni("a");
    expect(stavy("a")).toEqual(["chyba", "hotovo"]);
    expect(ctiNahravani("a")?.fotky[0]?.chyba).toBe("Soubor je moc velký.");

    zkusNahratZnovu("a");
    await dobehni("a");
    expect(stavy("a")).toEqual(["hotovo"]);
    expect(nahrajFotku).toHaveBeenCalledTimes(3);
  });

  it("další výběr za běhu se zařadí a běžící nahrávání nejde zavřít", async () => {
    let uvolni = (): void => undefined;
    nahrajFotku
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            uvolni = () => resolve({ ok: true, data: "id" });
          }),
      )
      .mockResolvedValue({ ok: true, data: "id" });
    nahrajDoAlba("a", [soubor("1.jpg")]);
    nahrajDoAlba("a", [soubor("2.jpg")]);
    zavriNahravani("a");
    expect(stavy("a")).toEqual(["probiha", "ceka"]);
    uvolni();
    await dobehni("a");
    expect(nahrajFotku).toHaveBeenCalledTimes(2);
  });

  it("první fotku nastaví jako náhled výpravy podle id ze serveru", async () => {
    nahrajFotku.mockResolvedValueOnce({ ok: true, data: "prvni" }).mockResolvedValue({ ok: true, data: "druha" });
    nastavNahledAlba.mockResolvedValue({ ok: true, data: null });
    nahrajDoAlba("a", [soubor("1.jpg"), soubor("2.jpg")], { prvniJakoNahledVypravy: "vyprava-1" });
    await dobehni("a");
    expect(nastavNahledAlba.mock.calls).toEqual([["vyprava-1", "prvni"]]);
  });

  it("popisek tlačítka skloňuje počet", () => {
    expect([0, 1, 3, 5].map(popisekNahrat)).toEqual([
      "Nahrát fotky",
      "Nahrát 1 fotku",
      "Nahrát 3 fotky",
      "Nahrát 5 fotek",
    ]);
  });
});
