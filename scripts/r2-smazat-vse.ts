/**
 * scripts/r2-smazat-vse.ts — empties the photo bucket on Cloudflare R2.
 *
 * Without a flag it only lists: object count and size per top-level folder
 * (vypravy/, alba/, avatary/, …). With `--smazat` it deletes every object
 * one by one through the server's signed DELETE. Deletion is permanent.
 *
 * R2 keys come from .env.local (same names as the server). The script never
 * prints keys, URLs or object names, only folders and counts.
 *
 *   npx tsx scripts/r2-smazat-vse.ts            # list only
 *   npx tsx scripts/r2-smazat-vse.ts --smazat   # delete everything
 */
import dotenv from "dotenv";
import { createHash, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { ctiR2Nastaveni, smazObjektR2, type R2Nastaveni } from "../server/src/r2-fotky";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(klic: string | Buffer, data: string): Buffer {
  return createHmac("sha256", klic).update(data, "utf8").digest();
}

/** RFC 3986 encoding required by SigV4 for query values. */
function koduj(hodnota: string): string {
  return encodeURIComponent(hodnota).replace(
    /[!'()*]/g,
    (znak) => `%${znak.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function dekodujXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

interface ObjektR2 {
  klic: string;
  velikost: number;
}

/** One signed ListObjectsV2 page. */
async function strankaSeznamu(
  nastaveni: R2Nastaveni,
  pokracovani: string | null,
): Promise<{ objekty: ObjektR2[]; dalsi: string | null }> {
  const host = `${nastaveni.accountId}.r2.cloudflarestorage.com`;
  const cesta = `/${nastaveni.bucket}`;
  const parametry: [string, string][] = [["list-type", "2"], ["max-keys", "1000"]];
  if (pokracovani !== null) parametry.push(["continuation-token", pokracovani]);
  const dotaz = parametry
    .map(([k, v]) => [koduj(k), koduj(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const datum = amzDate.slice(0, 8);
  const hashTela = sha256Hex("");
  const kanonicky = [
    "GET",
    cesta,
    dotaz,
    `host:${host}\nx-amz-content-sha256:${hashTela}\nx-amz-date:${amzDate}\n`,
    "host;x-amz-content-sha256;x-amz-date",
    hashTela,
  ].join("\n");
  const scope = `${datum}/auto/s3/aws4_request`;
  const kPodpisu = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(kanonicky)].join("\n");
  const kSign = hmac(
    hmac(hmac(hmac(`AWS4${nastaveni.secretAccessKey}`, datum), "auto"), "s3"),
    "aws4_request",
  );
  const podpis = createHmac("sha256", kSign).update(kPodpisu, "utf8").digest("hex");
  const odpoved = await fetch(`https://${host}${cesta}?${dotaz}`, {
    headers: {
      "x-amz-content-sha256": hashTela,
      "x-amz-date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${nastaveni.accessKeyId}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${podpis}`,
    },
  });
  const xml = await odpoved.text();
  if (!odpoved.ok) {
    const kod = /<Code>([^<]*)<\/Code>/.exec(xml)?.[1] ?? "neznámý";
    throw new Error(`Výpis R2 selhal: HTTP ${String(odpoved.status)} (${kod}).`);
  }
  const objekty: ObjektR2[] = [];
  for (const blok of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const telo = blok[1] ?? "";
    const klic = /<Key>([\s\S]*?)<\/Key>/.exec(telo)?.[1];
    const velikost = Number(/<Size>(\d+)<\/Size>/.exec(telo)?.[1] ?? "0");
    if (klic !== undefined) objekty.push({ klic: dekodujXml(klic), velikost });
  }
  const zkraceno = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const dalsi = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objekty, dalsi: zkraceno && dalsi !== undefined ? dekodujXml(dalsi) : null };
}

async function vsechnyObjekty(nastaveni: R2Nastaveni): Promise<ObjektR2[]> {
  const vse: ObjektR2[] = [];
  let pokracovani: string | null = null;
  do {
    const stranka = await strankaSeznamu(nastaveni, pokracovani);
    vse.push(...stranka.objekty);
    pokracovani = stranka.dalsi;
  } while (pokracovani !== null);
  return vse;
}

function vypisSouhrn(objekty: ObjektR2[]): void {
  const slozky = new Map<string, { pocet: number; bajty: number }>();
  for (const objekt of objekty) {
    const lomitko = objekt.klic.indexOf("/");
    const slozka = lomitko === -1 ? "(kořen)" : `${objekt.klic.slice(0, lomitko)}/`;
    const zaznam = slozky.get(slozka) ?? { pocet: 0, bajty: 0 };
    zaznam.pocet += 1;
    zaznam.bajty += objekt.velikost;
    slozky.set(slozka, zaznam);
  }
  const mb = (bajty: number): string => (bajty / 1024 / 1024).toFixed(1);
  for (const [slozka, { pocet, bajty }] of [...slozky].sort()) {
    console.log(`  ${slozka.padEnd(14)} ${String(pocet).padStart(6)} objektů  ${mb(bajty)} MB`);
  }
  const celkem = objekty.reduce((soucet, objekt) => soucet + objekt.velikost, 0);
  console.log(`  ${"celkem".padEnd(14)} ${String(objekty.length).padStart(6)} objektů  ${mb(celkem)} MB`);
}

async function main(): Promise<void> {
  const nastaveni = ctiR2Nastaveni(process.env);
  if (nastaveni === null) {
    throw new Error("R2 není nastavené. Chybí některá z proměnných R2_* v .env.local.");
  }
  const smazat = process.argv.includes("--smazat");
  const objekty = await vsechnyObjekty(nastaveni);
  console.log(`Bucket obsahuje ${String(objekty.length)} objektů:`);
  vypisSouhrn(objekty);
  if (!smazat) {
    console.log("Jen výpis, nic se nesmazalo. Mazání: přidej --smazat.");
    return;
  }
  let smazano = 0;
  let chyb = 0;
  for (const objekt of objekty) {
    try {
      await smazObjektR2(nastaveni, objekt.klic);
      smazano += 1;
    } catch {
      chyb += 1;
    }
    if ((smazano + chyb) % 100 === 0) {
      console.log(`  … ${String(smazano + chyb)} / ${String(objekty.length)}`);
    }
  }
  const zbyva = (await vsechnyObjekty(nastaveni)).length;
  console.log(
    `Smazáno ${String(smazano)}, chyb ${String(chyb)}. V bucketu zbývá ${String(zbyva)} objektů.`,
  );
  if (chyb > 0) process.exitCode = 1;
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "Mazání R2 selhalo.";
  console.error(zprava);
  process.exitCode = 1;
});
