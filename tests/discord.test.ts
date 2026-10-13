/**
 * tests/discord.test.ts — Krok Discord: server-only webhook (TDD RED → GREEN).
 *
 * Hranice bez reálného HTTP a bez secretu v Gitu:
 * - `sestavEmbedNovaVyprava` — čistý tvar embedu (title/description/color/
 *   fields datum + sraz + odkaz), vše ořezané a ne-prázdné.
 * - `jePlatnyDiscordWebhookUrl` — allowlist prefixů
 *   `https://discord.com/api/webhooks/` a `https://discordapp.com/api/webhooks/`,
 *   vše ostatní (http, cizí host, prázdné) se odmítne před odesláním.
 * - `posliDiscordEmbed` — chybějící/neplatná URL = no-op (fetch se vůbec
 *   nevolá, promise se vyřeší); fetch chyba i timeout se spolknou
 *   (request aplikace nikdy neblokují, funkce nikdy nevyhodí).
 * - Timeout konstanta + zapojený AbortSignal.
 * - Server-only env: modul čte jen `DISCORD_WEBHOOK_URL`, nikdy `VITE_` klíč.
 * Strict TS, žádný zakázaný typ.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_FETCH_TIMEOUT_MS,
  ctiDiscordWebhookUrl,
  jePlatnyDiscordWebhookUrl,
  posliDiscordEmbed,
  sestavEmbedNovaVyprava,
  type DiscordEmbed,
  type NovaVypravaProDiscord,
} from "../server/src/discord";

const UKAZKOVA_VYPRAVA: NovaVypravaProDiscord = {
  nazev: "Šumava — Modrava",
  datum: "2026-10-18",
  sraz: "Praha, Hlavní nádraží 7:30",
  popis: "Jednodenní okruh kolem Modravy.",
  odkaz: "https://exapp.example.cz/vypravy/sumava-modrava",
};

const PLATNY_WEBHOOK =
  "https://discord.com/api/webhooks/1234567890/abcDEFghiJKLmnoPQRstuVWXyz";

function jeZaznam(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

type FetchVstup = string | URL | Request;

function dejTextTela(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  return "";
}

describe("sestavEmbedNovaVyprava (čistý tvar embedu)", () => {
  it("title nese název výpravy", () => {
    const embed = sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA);
    expect(embed.title).toContain("Šumava — Modrava");
  });

  it("description je ne-prázdný text (z popisu)", () => {
    const embed = sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA);
    expect(embed.description).toContain("Modravy");
    expect(embed.description.trim().length).toBeGreaterThan(0);
  });

  it("description má fallback i bez popisu", () => {
    const embed = sestavEmbedNovaVyprava({
      nazev: "Brdy",
      datum: "2026-10-19",
      sraz: "Zličín 8:00",
    });
    expect(embed.description.trim().length).toBeGreaterThan(0);
  });

  it("color je číslo (zelená značka nové výpravy)", () => {
    const embed = sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA);
    expect(typeof embed.color).toBe("number");
    expect(embed.color).toBe(0x22c55e);
  });

  it("fields nesou datum + sraz + odkaz", () => {
    const embed = sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA);
    const podleJmena = new Map(embed.fields.map((pole) => [pole.name, pole.value]));
    expect(podleJmena.get("Datum")).toBe("2026-10-18");
    expect(podleJmena.get("Sraz")).toBe("Praha, Hlavní nádraží 7:30");
    expect(podleJmena.get("Odkaz")).toBe(
      "https://exapp.example.cz/vypravy/sumava-modrava",
    );
  });

  it("chybějící odkaz má pomlčku (Discord nesmí dostat prázdné value)", () => {
    const embed = sestavEmbedNovaVyprava({
      nazev: "Brdy",
      datum: "2026-10-19",
      sraz: "Zličín 8:00",
    });
    const odkaz = embed.fields.find((pole) => pole.name === "Odkaz");
    expect(odkaz?.value.trim().length).toBeGreaterThan(0);
  });

  it("ořeže mezery kolem vstupů", () => {
    const embed = sestavEmbedNovaVyprava({
      nazev: "  Brdy  ",
      datum: "  2026-10-19  ",
      sraz: "  Zličín 8:00  ",
    });
    expect(embed.title).toContain("Brdy");
    expect(embed.title).not.toContain("  Brdy  ");
    const podleJmena = new Map(embed.fields.map((pole) => [pole.name, pole.value]));
    expect(podleJmena.get("Datum")).toBe("2026-10-19");
    expect(podleJmena.get("Sraz")).toBe("Zličín 8:00");
  });
});

describe("jePlatnyDiscordWebhookUrl (allowlist před odesláním)", () => {
  it("projde discord.com prefix", () => {
    expect(jePlatnyDiscordWebhookUrl(PLATNY_WEBHOOK)).toBe(true);
  });

  it("projde discordapp.com prefix (starší doména)", () => {
    expect(
      jePlatnyDiscordWebhookUrl(
        "https://discordapp.com/api/webhooks/123456/token-hodnota",
      ),
    ).toBe(true);
  });

  it("odmítne http (jen https)", () => {
    expect(
      jePlatnyDiscordWebhookUrl(
        "http://discord.com/api/webhooks/123456/token-hodnota",
      ),
    ).toBe(false);
  });

  it("odmítne cizího hosta", () => {
    expect(jePlatnyDiscordWebhookUrl("https://evil.example.cz/webhook")).toBe(false);
    expect(
      jePlatnyDiscordWebhookUrl("https://discord.com.evil.cz/api/webhooks/x"),
    ).toBe(false);
  });

  it("odmítne prázdné a mezery", () => {
    expect(jePlatnyDiscordWebhookUrl("")).toBe(false);
    expect(jePlatnyDiscordWebhookUrl("   ")).toBe(false);
  });

  it("odmítne holou doménu bez cesty webhooku", () => {
    expect(jePlatnyDiscordWebhookUrl("https://discord.com/")).toBe(false);
  });

  it("ořeže mezery kolem platné URL", () => {
    expect(jePlatnyDiscordWebhookUrl(`  ${PLATNY_WEBHOOK}  `)).toBe(true);
  });
});

describe("ctiDiscordWebhookUrl (jen serverové env)", () => {
  const ZALOHA = process.env["DISCORD_WEBHOOK_URL"];

  afterEach(() => {
    if (ZALOHA === undefined) delete process.env["DISCORD_WEBHOOK_URL"];
    else process.env["DISCORD_WEBHOOK_URL"] = ZALOHA;
  });

  it("bez nastavení vrací prázdný řetězec", () => {
    delete process.env["DISCORD_WEBHOOK_URL"];
    expect(ctiDiscordWebhookUrl()).toBe("");
  });

  it("ořeže mezery", () => {
    process.env["DISCORD_WEBHOOK_URL"] = `  ${PLATNY_WEBHOOK}  `;
    expect(ctiDiscordWebhookUrl()).toBe(PLATNY_WEBHOOK);
  });
});

describe("posliDiscordEmbed (mock fetch, nikdy neblokuje request)", () => {
  const ZALOHA_URL = process.env["DISCORD_WEBHOOK_URL"];
  const puvodniFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = puvodniFetch;
    if (ZALOHA_URL === undefined) delete process.env["DISCORD_WEBHOOK_URL"];
    else process.env["DISCORD_WEBHOOK_URL"] = ZALOHA_URL;
    vi.unstubAllGlobals();
  });

  function nastavFetchUspesny(): {
    volani: () => Array<readonly [FetchVstup, RequestInit | undefined]>;
  } {
    const zaznamenana: Array<readonly [FetchVstup, RequestInit | undefined]> = [];
    const nahrada = async (
      vstup: FetchVstup,
      init?: RequestInit,
    ): Promise<Response> => {
      zaznamenana.push([vstup, init] as const);
      return new Response("{}", { status: 204 });
    };
    vi.stubGlobal("fetch", nahrada);
    return { volani: () => zaznamenana };
  }

  it("chybějící URL = no-op (fetch se vůbec nevolá, bez výjimky)", async () => {
    delete process.env["DISCORD_WEBHOOK_URL"];
    const { volani } = nastavFetchUspesny();
    const embed: DiscordEmbed = sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA);
    await expect(posliDiscordEmbed(embed)).resolves.toBeUndefined();
    expect(volani()).toHaveLength(0);
  });

  it("neplatná URL se odmítne před odesláním (fetch se nevolá)", async () => {
    process.env["DISCORD_WEBHOOK_URL"] = "https://evil.example.cz/ukradni-data";
    const { volani } = nastavFetchUspesny();
    await expect(
      posliDiscordEmbed(sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA)),
    ).resolves.toBeUndefined();
    expect(volani()).toHaveLength(0);
  });

  it("platná URL pošle POST s embeds polem a JSON hlavičkou", async () => {
    process.env["DISCORD_WEBHOOK_URL"] = PLATNY_WEBHOOK;
    const { volani } = nastavFetchUspesny();
    const embed: DiscordEmbed = sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA);
    await posliDiscordEmbed(embed);

    expect(volani()).toHaveLength(1);
    const prvni = volani()[0];
    expect(prvni).toBeDefined();
    if (prvni === undefined) return;
    const [cil, init] = prvni;
    expect(String(cil)).toBe(PLATNY_WEBHOOK);
    expect(init?.method).toBe("POST");
    const hlavicky = new Headers(init?.headers);
    expect(hlavicky.get("content-type")).toContain("application/json");

    const teloText = dejTextTela(init?.body);
    expect(teloText.length).toBeGreaterThan(0);
    const telo: unknown = JSON.parse(teloText) as unknown;
    expect(jeZaznam(telo)).toBe(true);
    if (!jeZaznam(telo)) return;
    const pole: unknown = telo["embeds"];
    expect(Array.isArray(pole)).toBe(true);
    if (!Array.isArray(pole)) return;
    const prvniEmbed: unknown = pole[0];
    expect(jeZaznam(prvniEmbed)).toBe(true);
    if (!jeZaznam(prvniEmbed)) return;
    expect(prvniEmbed["title"]).toBe(embed.title);
    expect(prvniEmbed["description"]).toBe(embed.description);
    expect(prvniEmbed["color"]).toBe(embed.color);
  });

  it("odmítnutý Discord (5xx) se spolkne — promise se vyřeší", async () => {
    process.env["DISCORD_WEBHOOK_URL"] = PLATNY_WEBHOOK;
    const nahrada = async (): Promise<Response> =>
      new Response("chyba", { status: 500 });
    vi.stubGlobal("fetch", nahrada);
    await expect(
      posliDiscordEmbed(sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA)),
    ).resolves.toBeUndefined();
  });

  it("padlý fetch (síť) se spolkne — request aplikace nepadne", async () => {
    process.env["DISCORD_WEBHOOK_URL"] = PLATNY_WEBHOOK;
    const nahrada = async (): Promise<Response> => {
      throw new Error("síť nedostupná");
    };
    vi.stubGlobal("fetch", nahrada);
    await expect(
      posliDiscordEmbed(sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA)),
    ).resolves.toBeUndefined();
  });

  it("požadavek nese AbortSignal (timeout obrana)", async () => {
    process.env["DISCORD_WEBHOOK_URL"] = PLATNY_WEBHOOK;
    const { volani } = nastavFetchUspesny();
    await posliDiscordEmbed(sestavEmbedNovaVyprava(UKAZKOVA_VYPRAVA));
    const prvni = volani()[0];
    expect(prvni).toBeDefined();
    if (prvni === undefined) return;
    const signal: unknown = prvni[1]?.signal;
    expect(signal instanceof AbortSignal).toBe(true);
  });
});

describe("DISCORD_FETCH_TIMEOUT_MS (žádné visící volání)", () => {
  it("je kladný a nejvýš 10 s", () => {
    expect(DISCORD_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DISCORD_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("server-only tajemství (nikdy do bundlu)", () => {
  it("modul čte DISCORD_WEBHOOK_URL a nezná VITE_ klíč", () => {
    const obsah = readFileSync("server/src/discord.ts", "utf8");
    expect(obsah).toContain("DISCORD_WEBHOOK_URL");
    // Jehlu skládáme, aby její literál nikdy neležel ve zdrojácích
    // (repo-wide grep hlídá 0 výskytů v klientském bundlu).
    const zakazanyKlic = ["VITE", "_DISCORD"].join("");
    expect(obsah).not.toContain(zakazanyKlic);
    expect(obsah).not.toContain("VITE_");
  });
});
