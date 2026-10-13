/**
 * server/src/discord.ts — Discord webhook (jen server).
 *
 * Odeslání embedu o nové výpravě přes příchozí webhook Discordu.
 * Čisté funkce bez DB:
 * - `sestavEmbedNovaVyprava` — složí embed (title / description / color /
 *   fields datum + sraz + odkaz), vše ořezané a nikdy prázdné.
 * - `posliDiscordEmbed` — fire-and-forget POST s timeoutem; chyby se
 *   spolknou, aby nikdy neblokovaly request aplikace (funkce nikdy
 *   nevyhodí výjimku, jen se tiše vrátí).
 *
 * Tajemství: `DISCORD_WEBHOOK_URL` žije jen v serverovém env
 * (`.env.local`, nikdy do commitu, nikdy do prohlížečového bundlu).
 * Před odesláním prochází allowlistem prefixů — cizí host, http i
 * prázdná hodnota se odmítnou ještě před fetch (žádný request ven).
 */

export const DISCORD_FETCH_TIMEOUT_MS = 5_000;

/** Zelená značka nové výpravy. */
export const DISCORD_BARVA_NOVA_VYPRAVA = 0x22c55e;

const PREDPONY_WEBHOOKU: readonly string[] = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

const MAX_DELKA_TITULKU = 256;
const MAX_DELKA_POPISU = 4096;
const MAX_DELKA_POLE = 1024;

/** Pole embedu (Discord-ish tvar: jméno / hodnota / volitelně vedle sebe). */
export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Minimální embed pro webhook (jen pole, která opravdu posíláme). */
export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: DiscordEmbedField[];
}

/** Vstup pro embed o nové výpravě (z řádku `expeditions`). */
export interface NovaVypravaProDiscord {
  nazev: string;
  datum: string;
  sraz: string;
  popis?: string;
  odkaz?: string;
}

/**
 * Allowlist webhook URL: jen https prefixy Discordu. Ořeže mezery;
 * vše ostatní (http, cizí host, holá doména, prázdné) → false.
 */
export function jePlatnyDiscordWebhookUrl(hodnota: string): boolean {
  const cista = hodnota.trim();
  if (cista.length === 0) return false;
  const maPredponu = PREDPONY_WEBHOOKU.some((predpona) =>
    cista.startsWith(predpona),
  );
  if (!maPredponu) return false;
  try {
    const rozbor = new URL(cista);
    return rozbor.protocol === "https:";
  } catch {
    return false;
  }
}

/** Serverové env (ořezané); chybí-li, vrací prázdný řetězec. */
export function ctiDiscordWebhookUrl(): string {
  return (process.env["DISCORD_WEBHOOK_URL"] ?? "").trim();
}

function orizni(text: string, max: number): string {
  const cisty = text.trim().replace(/\s+/g, " ");
  if (cisty.length <= max) return cisty;
  return cisty.slice(0, max).trimEnd();
}

function neprazdny(text: string, nahrada: string): string {
  const cisty = text.trim();
  return cisty.length > 0 ? cisty : nahrada;
}

/**
 * Složí embed o nové výpravě. Vstupy ořeže; chybějící popis nahradí
 * pozvánkou, chybějící odkaz pomlčkou (Discord nesmí dostat prázdné value).
 */
export function sestavEmbedNovaVyprava(
  vstup: NovaVypravaProDiscord,
): DiscordEmbed {
  const nazev = neprazdny(vstup.nazev, "Nová výprava");
  const datum = neprazdny(vstup.datum, "—");
  const sraz = neprazdny(vstup.sraz, "—");
  const odkaz = neprazdny(vstup.odkaz ?? "", "—");
  const popisVstup = (vstup.popis ?? "").trim();
  const popis =
    popisVstup.length > 0
      ? orizni(popisVstup, MAX_DELKA_POPISU)
      : `Nová výprava „${nazev}“ — přihlas se v aplikaci.`;
  return {
    title: orizni(`Nová výprava: ${nazev}`, MAX_DELKA_TITULKU),
    description: popis,
    color: DISCORD_BARVA_NOVA_VYPRAVA,
    fields: [
      { name: "Datum", value: orizni(datum, MAX_DELKA_POLE), inline: true },
      { name: "Sraz", value: orizni(sraz, MAX_DELKA_POLE), inline: true },
      { name: "Odkaz", value: orizni(odkaz, MAX_DELKA_POLE) },
    ],
  };
}

/**
 * Pošle embed na webhook (fire-and-forget). Bez nastavené či neplatné URL
 * je to no-op (žádný fetch). Timeout hlídá AbortController; síťovou chybu
 * i odmítnutí Discordu spolkne — volající request tím nikdy nepadne.
 * Druhý parametr je jen pro testy; produkce čte serverové env.
 */
export async function posliDiscordEmbed(
  embed: DiscordEmbed,
  webhookUrl?: string,
): Promise<void> {
  const cil = (webhookUrl ?? ctiDiscordWebhookUrl()).trim();
  if (!jePlatnyDiscordWebhookUrl(cil)) return;
  const rizeni = new AbortController();
  const casovac = setTimeout(() => rizeni.abort(), DISCORD_FETCH_TIMEOUT_MS);
  try {
    await fetch(cil, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: rizeni.signal,
    });
  } catch {
    return;
  } finally {
    clearTimeout(casovac);
  }
}
