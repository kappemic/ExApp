/**
 * Album photo list client — contract-shaped JSON must parse via nactiFotkyAlba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAlbumFotka } from "../src/shared/api-types";
import { nactiFotkyAlba } from "../src/lib/alba-api";

const API_ZAKLAD = "https://api.test";
const ALBUM_ID = "11111111-1111-4111-8111-111111111111";

function odpovedJson(telo: unknown, status: number): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fotkaKontrakt(partial?: Partial<ApiAlbumFotka>): ApiAlbumFotka {
  return {
    id: "f1",
    url: "https://cdn.example/f1.jpg",
    createdAt: "2026-10-01T10:00:00.000Z",
    jeNahled: true,
    expeditionId: null,
    albumId: ALBUM_ID,
    ...partial,
  };
}

beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("nactiFotkyAlba — parsování kontraktu", () => {
  it("přijme plný ApiAlbumFotka z odpovědi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => odpovedJson({ fotky: [fotkaKontrakt()] }, 200)),
    );
    const vysledek = await nactiFotkyAlba(ALBUM_ID);
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data).toHaveLength(1);
      expect(vysledek.data[0]).toEqual(fotkaKontrakt());
    }
  });

  it("doplní null pro chybějící expeditionId a albumId", async () => {
    const bezVazeb = {
      id: "f2",
      url: "https://cdn.example/f2.jpg",
      createdAt: "2026-10-02T10:00:00.000Z",
      jeNahled: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => odpovedJson({ fotky: [bezVazeb] }, 200)),
    );
    const vysledek = await nactiFotkyAlba(ALBUM_ID);
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data[0]).toMatchObject({
        expeditionId: null,
        albumId: null,
        jeNahled: false,
      });
    }
  });

  it("vynechá položku bez url nebo jeNahled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        odpovedJson(
          {
            fotky: [
              { id: "x", createdAt: "2026-01-01T00:00:00.000Z", jeNahled: true },
              { id: "y", url: "https://a/b.jpg", createdAt: "2026-01-01T00:00:00.000Z" },
              fotkaKontrakt({ id: "ok" }),
            ],
          },
          200,
        ),
      ),
    );
    const vysledek = await nactiFotkyAlba(ALBUM_ID);
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.data.map((f) => f.id)).toEqual(["ok"]);
    }
  });
});
