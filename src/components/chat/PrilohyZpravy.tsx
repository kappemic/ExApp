import type { JSX } from "react";
import { formatVelikostiPrilohy, nahledOptimisticke, urlPrilohyZpravy } from "../../lib/prilohy-zpravy";
import type { ApiZpravaPriloha } from "../../shared/api-types";
import Ikona from "../Ikona";
import PostupnaFotka from "../fotky/PostupnaFotka";
import ZnackaSouboru from "./ZnackaSouboru";

export interface PrilohaVeZprave {
  priloha: ApiZpravaPriloha;
  /** Ještě se nahrává, nemá adresu na serveru. */
  optimisticka: boolean;
}

/** V mozaice jsou nejvýš čtyři fotky, zbytek schová „+N“ na poslední. */
const MAX_V_MOZAICE = 4;

function tridaDlazdice(poradi: number, pocet: number): string {
  if (pocet === 1) return "";
  // Tři fotky: první přes celou výšku vlevo, dvě pod sebou vpravo.
  if (pocet === 3 && poradi === 0) return "row-span-2 h-full";
  return pocet === 3 ? "aspect-square" : "aspect-square";
}

function Mozaika({
  fotky,
  onOtevriObrazek,
}: {
  fotky: readonly PrilohaVeZprave[];
  onOtevriObrazek?: (prilohaId: string) => void;
}): JSX.Element {
  const videt = fotky.slice(0, MAX_V_MOZAICE);
  const navic = fotky.length - videt.length;
  const pocet = videt.length;
  return (
    <ul
      className={`m-0 grid w-full list-none gap-[3px] overflow-hidden rounded-xl p-0 ${
        pocet === 1 ? "grid-cols-1" : "grid-cols-2"
      }`}
    >
      {videt.map(({ priloha, optimisticka }, poradi) => {
        const mistni = optimisticka ? nahledOptimisticke(priloha.id) : null;
        const skryte = poradi === videt.length - 1 && navic > 0;
        const trida = pocet === 1 ? "block max-h-[320px] min-h-[120px] w-full object-cover" : "block size-full object-cover";
        const obrazek =
          optimisticka && mistni === null ? (
            <span className="flex size-full min-h-[120px] items-center justify-center bg-povrch-2 text-ink-3">
              <Ikona nazev="image" className="size-6" />
            </span>
          ) : mistni !== null ? (
            <img src={mistni} alt={priloha.nazev} className={`${trida} opacity-70`} />
          ) : (
            <PostupnaFotka src={urlPrilohyZpravy(priloha.id)} alt={pocet > 1 ? "" : priloha.nazev} className={trida} />
          );
        const obal = `relative block w-full overflow-hidden bg-povrch-2 ${tridaDlazdice(poradi, pocet)}`;
        const obsah = (
          <>
            {obrazek}
            {skryte ? (
              <span className="absolute inset-0 flex items-center justify-center bg-inkoust/60 font-display text-xl font-bold text-povrch">
                +{navic}
              </span>
            ) : null}
          </>
        );
        const radek = pocet === 3 && poradi === 0 ? "row-span-2 min-w-0" : "min-w-0";
        if (optimisticka) {
          return (
            <li key={priloha.id} className={radek}>
              <span className={obal}>{obsah}</span>
            </li>
          );
        }
        const popisek = skryte
          ? `Otevřít fotku ${poradi + 1} z ${fotky.length}, dalších ${navic}`
          : `Otevřít fotku ${poradi + 1} z ${fotky.length}, ${priloha.nazev}`;
        const fokus = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-povrch [touch-action:manipulation]";
        return (
          <li key={priloha.id} className={radek}>
            {onOtevriObrazek !== undefined ? (
              <button type="button" onClick={() => onOtevriObrazek(priloha.id)} aria-label={popisek} className={`bez-prejeti ${obal} ${fokus}`}>
                {obsah}
              </button>
            ) : (
              <a href={urlPrilohyZpravy(priloha.id)} target="_blank" rel="noopener noreferrer" aria-label={popisek} className={`${obal} ${fokus}`}>
                {obsah}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Soubor({ priloha, optimisticka }: PrilohaVeZprave): JSX.Element {
  const obsah = (
    <>
      <ZnackaSouboru nazev={priloha.nazev} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span title={priloha.nazev} className="truncate text-[13px] font-semibold leading-[17px] text-inkoust">
          {priloha.nazev}
        </span>
        <span className="text-[11.5px] text-ink-3">{optimisticka ? "Nahrávám…" : formatVelikostiPrilohy(priloha.bajty)}</span>
      </span>
      {optimisticka ? null : (
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-ink-3 group-hover:bg-povrch-2 group-hover:text-inkoust">
          <Ikona nazev="download" className="size-4" />
        </span>
      )}
    </>
  );
  const trida = "flex min-h-[56px] w-full min-w-0 items-center gap-2.5 rounded-xl border border-linka bg-povrch p-2 pr-1.5 text-left";
  if (optimisticka) return <span className={`${trida} opacity-70`}>{obsah}</span>;
  return (
    <a
      href={urlPrilohyZpravy(priloha.id)}
      download={priloha.nazev}
      aria-label={`Stáhnout ${priloha.nazev}`}
      className={`bez-prejeti group no-underline ${trida} hover:bg-zahlavi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]`}
    >
      {obsah}
    </a>
  );
}

/** Přílohy zprávy: fotky v mozaice, soubory jako karty se značkou typu. */
export default function PrilohyZpravy({
  prilohy,
  onOtevriObrazek,
}: {
  prilohy: readonly PrilohaVeZprave[];
  onOtevriObrazek?: (prilohaId: string) => void;
}): JSX.Element | null {
  if (prilohy.length === 0) return null;
  const jeFotka = ({ priloha, optimisticka }: PrilohaVeZprave): boolean =>
    priloha.jeObrazek || (optimisticka && nahledOptimisticke(priloha.id) !== null);
  const fotky = prilohy.filter(jeFotka);
  const soubory = prilohy.filter((polozka) => !jeFotka(polozka));
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {fotky.length > 0 ? <Mozaika fotky={fotky} onOtevriObrazek={onOtevriObrazek} /> : null}
      {soubory.length > 0 ? (
        <ul className="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0">
          {soubory.map((polozka) => (
            <li key={polozka.priloha.id} className="min-w-0">
              <Soubor {...polozka} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
