import { useEffect, useState, type ChangeEvent, type JSX, type ReactNode } from "react";
import { overSouborAvataru, urlAvataruProZobrazeni } from "../lib/storage/avatar";
import Ikona from "./Ikona";

/** Nahraje novou fotku, vrací českou chybu nebo null. */
export type ZmenaAvataru = (soubor: File) => Promise<string | null>;

/**
 * Kruh s fotkou nebo iniciálami. S `onZmenit` je to zároveň výběr souboru:
 * na počítači se při najetí ukáže tužka, na telefonu malý odznak.
 */
function AvatarProfilu({
  inicialy,
  url,
  trida,
  onZmenit,
}: {
  inicialy: string;
  url: string | null | undefined;
  trida: string;
  onZmenit?: ZmenaAvataru;
}): JSX.Element {
  const [rozbity, setRozbity] = useState(false);
  const [nahrava, setNahrava] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const fotka = rozbity ? null : urlAvataruProZobrazeni(url);

  useEffect(() => {
    setRozbity(false);
  }, [url]);

  async function naSoubor(udalost: ChangeEvent<HTMLInputElement>): Promise<void> {
    const soubor = udalost.target.files?.[0];
    udalost.target.value = "";
    if (soubor === undefined || onZmenit === undefined) return;
    const neplatny = overSouborAvataru(soubor);
    if (neplatny !== null) {
      setChyba(neplatny);
      return;
    }
    setChyba(null);
    setNahrava(true);
    setChyba(await onZmenit(soubor));
    setNahrava(false);
  }

  const kruh = (
    <span aria-hidden="true" className={`relative flex items-center justify-center overflow-hidden rounded-full ${trida}`}>
      {fotka !== null ? (
        <img src={fotka} alt="" onError={() => setRozbity(true)} className="size-full object-cover" />
      ) : (
        inicialy
      )}
      {onZmenit !== undefined ? (
        <span
          className={`absolute inset-0 flex items-center justify-center bg-inkoust/55 text-povrch transition-opacity duration-150 motion-reduce:transition-none ${
            nahrava ? "opacity-100" : "opacity-0 min-[90rem]:group-hover:opacity-100 min-[90rem]:group-focus-within:opacity-100"
          }`}
        >
          <Ikona nazev={nahrava ? "upload" : "pen-line"} className={`size-5 ${nahrava ? "motion-safe:animate-pulse" : ""}`} />
        </span>
      ) : null}
    </span>
  );
  if (onZmenit === undefined) return kruh;
  return (
    <div className="flex flex-col items-center gap-2">
      <label className="group relative inline-flex cursor-pointer rounded-full focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-smrk">
        {kruh}
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-papir bg-smrk text-povrch min-[90rem]:hidden"
        >
          <Ikona nazev="pen-line" className="size-3" />
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={nahrava}
          aria-label="Změnit profilovou fotku"
          onChange={(udalost) => void naSoubor(udalost)}
          className="sr-only"
        />
      </label>
      {chyba !== null ? (
        <p role="alert" className="max-w-[240px] text-center text-[12.5px] font-semibold text-akcent">
          {chyba}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sdílené kusy obrazovek Profil a Člen podle ExApp.pen:
 * avatar uprostřed se štítkem role, dlaždice čísel, řádek údaje jen ke čtení.
 */
export function IdentitaProfilu({
  inicialy,
  url,
  onZmenitAvatar,
  jmeno,
  podtitul,
  stitek,
  barva = "bg-smrk",
  nadpis: Nadpis = "h2",
}: {
  inicialy: string;
  url?: string | null;
  onZmenitAvatar?: ZmenaAvataru;
  jmeno: string;
  podtitul?: string;
  stitek?: ReactNode;
  /** Barva kruhu, u cizího člena podle jména. */
  barva?: string;
  nadpis?: "h1" | "h2";
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 pb-1 pt-2 text-center">
      <AvatarProfilu
        inicialy={inicialy}
        url={url}
        onZmenit={onZmenitAvatar}
        trida={`size-[72px] text-[15px] font-semibold text-povrch ${barva}`}
      />
      <Nadpis className="break-words font-display text-[22px] font-bold text-inkoust">
        {jmeno}
      </Nadpis>
      {podtitul !== undefined && podtitul.length > 0 && (
        <p className="max-w-full break-all text-[13px] text-ink-3">{podtitul}</p>
      )}
      {stitek !== undefined && (
        <span className="inline-flex h-[26px] items-center rounded-[13px] bg-mlha px-2.5 text-xs font-semibold text-smrk">
          {stitek}
        </span>
      )}
    </div>
  );
}

export function DlazdiceStatu({
  popisek,
  hodnota,
}: {
  popisek: string;
  hodnota: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-linka bg-povrch p-3.5 shadow-jemny">
      <span className="font-display text-xl font-bold text-inkoust">{hodnota}</span>
      <span className="text-xs text-ink-3">{popisek}</span>
    </div>
  );
}

export function RadekUdaje({ popisek, hodnota }: { popisek: string; hodnota: string }): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-4 px-3.5 py-3">
      <span className="shrink-0 text-[13px] text-ink-3">{popisek}</span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold text-inkoust">
        {hodnota.trim().length > 0 ? hodnota : "—"}
      </span>
    </li>
  );
}

/** Karta s údaji jen ke čtení (okraj 4 px kolem řádků jako v návrhu). */
export const KARTA_UDAJU =
  "m-0 list-none divide-y divide-linka rounded-2xl border border-linka bg-povrch p-1";

/** Levá karta profilu na počítači („Profile Card“): avatar, štítky, čísla. */
export function ProfilovaKarta({
  inicialy,
  url,
  onZmenitAvatar,
  barva = "bg-mlha text-smrk",
  jmeno,
  email,
  stitky,
  cisla,
  children,
}: {
  inicialy: string;
  url?: string | null;
  onZmenitAvatar?: ZmenaAvataru;
  barva?: string;
  jmeno: string;
  email: string;
  stitky: ReadonlyArray<{ text: string; ton: "okr" | "neutralni" | "smrk" }>;
  cisla: ReadonlyArray<{ popisek: string; hodnota: string }>;
  children?: ReactNode;
}): JSX.Element {
  const TON = { okr: "bg-okr-100 text-okr", neutralni: "bg-povrch-2 text-mech", smrk: "bg-mlha text-smrk" } as const;
  return (
    <aside className="flex flex-col gap-[18px] rounded-2xl border border-linka bg-povrch p-5 shadow-denik">
      <AvatarProfilu
        inicialy={inicialy}
        url={url}
        onZmenit={onZmenitAvatar}
        trida={`size-[76px] font-display text-[26px] font-bold tracking-[-0.5px] ${barva}`}
      />
      <div className="flex w-fit max-w-full flex-col items-center gap-[5px] text-center">
        <p className="font-display text-xl font-bold tracking-[-0.4px] text-inkoust">{jmeno}</p>
        <p className="max-w-full break-all text-[12.5px] text-ink-3">{email}</p>
        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
          {stitky.map((stitek) => (
            <span key={stitek.text} className={`rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold ${TON[stitek.ton]}`}>
              {stitek.text}
            </span>
          ))}
        </div>
      </div>
      <span aria-hidden="true" className="h-px bg-linka" />
      {cisla.map((cislo) => (
        <div key={cislo.popisek} className="flex items-center justify-between">
          <span className="text-[13px] text-mech">{cislo.popisek}</span>
          <span className="font-display text-base font-bold text-inkoust">{cislo.hodnota}</span>
        </div>
      ))}
      {children}
    </aside>
  );
}

/** Přepínač záložek na počítači (Oznámení / Účet / Statistiky, Přehled / Výpravy). */
export const ZALOZKY_DRAHA = "inline-flex w-fit items-center gap-0.5 rounded-xl bg-povrch-2 p-1";
export function tridaZalozky(aktivni: boolean): string {
  return `bez-prejeti rounded-[9px] px-3.5 py-[7px] text-[13.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk ${
    aktivni ? "bg-povrch font-semibold text-inkoust" : "font-medium text-mech hover:text-inkoust"
  }`;
}
