import { describe, expect, it } from "vitest";
import {
  fotkyZeZprav,
  nactiFotkyVlakna,
  seskupDavkyChatFotek,
  seskupRadkyVlakna,
} from "../src/lib/chat-fotky";
import type { ApiZprava } from "../src/shared/api-types";

function zprava(cast: Partial<ApiZprava> & Pick<ApiZprava, "id" | "prilohy">): ApiZprava {
  return {
    expeditionId: "vyprava",
    autorId: "u1",
    authorName: "Anna",
    channel: "expedice",
    text: "",
    createdAt: "2026-10-19T12:00:00.000Z",
    ...cast,
  };
}

describe("fotkyZeZprav", () => {
  it("keeps only real image attachments", () => {
    const fotky = fotkyZeZprav([
      zprava({
        id: "optimistic-1",
        prilohy: [{ id: "p1", nazev: "a.png", bajty: 1, contentType: "image/png", jeObrazek: true }],
      }),
      zprava({
        id: "z1",
        prilohy: [
          { id: "optimistic-p", nazev: "b.png", bajty: 1, contentType: "image/png", jeObrazek: true },
          { id: "p2", nazev: "cesta.png", bajty: 2, contentType: "image/png", jeObrazek: true },
          { id: "p3", nazev: "plan.pdf", bajty: 3, contentType: "application/pdf", jeObrazek: false },
        ],
      }),
    ]);
    expect(fotky).toEqual([
      { id: "p2", nazev: "cesta.png", createdAt: "2026-10-19T12:00:00.000Z", autor: "Anna" },
    ]);
  });
});

describe("seskupRadkyVlakna", () => {
  it("spojí fotky z jedné zprávy i sérii bez textu do tří minut", () => {
    const radky = seskupRadkyVlakna([
      zprava({
        id: "z1",
        autorId: "a",
        createdAt: "2026-10-19T12:00:00.000Z",
        prilohy: [
          { id: "p1", nazev: "1.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true },
          { id: "p2", nazev: "2.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true },
        ],
      }),
      zprava({
        id: "z2",
        autorId: "a",
        createdAt: "2026-10-19T12:02:00.000Z",
        prilohy: [{ id: "p3", nazev: "3.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true }],
      }),
      zprava({
        id: "z3",
        autorId: "a",
        text: "text přeruší dávku",
        createdAt: "2026-10-19T12:02:30.000Z",
        prilohy: [{ id: "p4", nazev: "4.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true }],
      }),
      zprava({
        id: "z4",
        autorId: "b",
        createdAt: "2026-10-19T12:03:00.000Z",
        prilohy: [{ id: "p5", nazev: "5.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true }],
      }),
    ]);
    expect(radky.map((radek) => (radek.druh === "davka" ? radek.zpravy.map((z) => z.id) : radek.zprava.id))).toEqual([
      ["z1", "z2"],
      "z3",
      ["z4"],
    ]);
  });
});

describe("seskupDavkyChatFotek", () => {
  it("drží sérii pohromadě a oddělí pozdější fotku", () => {
    const davky = seskupDavkyChatFotek([
      { id: "p1", nazev: "1.jpg", createdAt: "2026-10-19T12:00:00.000Z", autor: "Anna" },
      { id: "p2", nazev: "2.jpg", createdAt: "2026-10-19T12:00:00.000Z", autor: "Anna" },
      { id: "p3", nazev: "3.jpg", createdAt: "2026-10-19T12:10:00.000Z", autor: "Anna" },
    ]);
    expect(davky.map((davka) => davka.fotky.map((fotka) => fotka.id))).toEqual([["p1", "p2"], ["p3"]]);
  });
});

describe("nactiFotkyVlakna", () => {
  it("walks cursors until the thread ends", async () => {
    const vysledek = await nactiFotkyVlakna(async (cursor) => {
      if (cursor === undefined) {
        return {
          ok: true,
          data: {
            nextCursor: "dalsi",
            zpravy: [
              zprava({
                id: "z1",
                prilohy: [{ id: "p1", nazev: "1.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true }],
              }),
            ],
          },
        };
      }
      return {
        ok: true,
        data: {
          nextCursor: null,
          zpravy: [
            zprava({
              id: "z2",
              prilohy: [{ id: "p2", nazev: "2.jpg", bajty: 1, contentType: "image/jpeg", jeObrazek: true }],
            }),
          ],
        },
      };
    });
    expect(vysledek.ok).toBe(true);
    if (!vysledek.ok) return;
    expect(vysledek.fotky.map((fotka) => fotka.id)).toEqual(["p1", "p2"]);
  });
});
