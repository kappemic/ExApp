import { useEffect, useRef, type DragEvent, type JSX, type ReactNode } from "react";
import { popisekPoctuFotek } from "../../lib/alba-api";
import { snizenyPohyb } from "../../lib/pohyb";
import Ikona from "../Ikona";
import NahledSouboru from "./NahledSouboru";

interface PoleFotekProps {
  id: string;
  soubory: readonly File[];
  disabled: boolean;
  /** Přijímané typy souborů (atribut `accept`). */
  accept: string;
  /** Popis pole pro čtečku. Bez něj se čte text prázdné plochy. */
  popisek?: string;
  /** Podklad, okraj a rohy plochy. */
  className: string;
  /** Rozměry a mezery prázdné plochy. */
  tridaPrazdne: string;
  /** Obsah plochy, dokud v ní není žádná fotka. */
  children: ReactNode;
  onPridat: (soubory: File[]) => void;
  onOdebrat: (index: number) => void;
  /** Tlačítko „Odebrat vše“, když je vybraných víc. */
  onOdebratVse?: () => void;
  /** Už uložené fotky, ukazují se před novými. */
  ulozene?: readonly { id: string; url: string }[];
  onSmazatUlozenou?: (id: string) => void;
}

const DLAZDICE = "relative aspect-square overflow-hidden rounded-[9px] border border-black/10 bg-povrch-2";

/** Výběr fotek: prázdná plocha s výzvou, po první fotce jsou v ní místo výzvy náhledy. */
export default function PoleFotek({
  id,
  soubory,
  disabled,
  accept,
  popisek,
  className,
  tridaPrazdne,
  children,
  onPridat,
  onOdebrat,
  onOdebratVse,
  ulozene = [],
  onSmazatUlozenou,
}: PoleFotekProps): JSX.Element {
  const prazdne = soubory.length === 0 && ulozene.length === 0;
  const mrizkaRef = useRef<HTMLUListElement>(null);
  const predchoziPocet = useRef(soubory.length);

  // Nově přidané jsou na konci, mřížka k nim doroluje.
  useEffect(() => {
    const pribylo = predchoziPocet.current > 0 && soubory.length > predchoziPocet.current;
    predchoziPocet.current = soubory.length;
    const mrizka = mrizkaRef.current;
    if (!pribylo || mrizka === null) return;
    mrizka.scrollTo({ top: mrizka.scrollHeight, behavior: snizenyPohyb() ? "auto" : "smooth" });
  }, [soubory.length]);

  function naPretazeni(udalost: DragEvent<HTMLDivElement>): void {
    udalost.preventDefault();
    if (!disabled) onPridat(Array.from(udalost.dataTransfer.files));
  }

  return (
    <div
      onDragOver={(udalost) => {
        udalost.preventDefault();
      }}
      onDrop={naPretazeni}
      className={`relative overflow-hidden has-[input:focus-visible]:border-smrk has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-smrk/25 ${className} ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <input
        id={id}
        name="soubor"
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        aria-label={prazdne ? popisek : "Přidat další fotky"}
        onChange={(udalost) => {
          const vybrane = Array.from(udalost.target.files ?? []);
          udalost.target.value = "";
          onPridat(vybrane);
        }}
        className="sr-only"
      />
      {prazdne ? (
        <label
          htmlFor={id}
          className={`flex cursor-pointer flex-col items-center justify-center text-center ${tridaPrazdne}`}
        >
          {children}
        </label>
      ) : (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3 pl-3.5 pr-1">
            <p className="text-[13px] font-semibold text-inkoust">
              {popisekPoctuFotek(soubory.length + ulozene.length)}
            </p>
            {onOdebratVse !== undefined && soubory.length > 1 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onOdebratVse}
                className="bez-prejeti inline-flex min-h-11 items-center rounded-xl px-2.5 text-[13px] font-medium text-mech hover:text-inkoust focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
              >
                Odebrat vše
              </button>
            ) : null}
          </div>
          <ul
            ref={mrizkaRef}
            aria-label="Vybrané fotky"
            className="posuvnik grid max-h-[min(19rem,30dvh)] grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 overflow-y-auto px-2.5 pb-2.5 min-[90rem]:max-h-[min(19rem,42dvh)]"
          >
            {ulozene.map((fotka) => (
              <li key={fotka.id} className={DLAZDICE}>
                <img src={fotka.url} alt="" className="size-full object-cover" />
                {onSmazatUlozenou !== undefined ? (
                  <TlacitkoOdebrat
                    popisek="Odebrat snímek"
                    disabled={disabled}
                    onClick={() => {
                      onSmazatUlozenou(fotka.id);
                    }}
                  />
                ) : null}
              </li>
            ))}
            {soubory.map((soubor, index) => (
              <li key={klicSouboru(soubor)} className={DLAZDICE}>
                <NahledSouboru soubor={soubor} />
                <TlacitkoOdebrat
                  popisek={`Odebrat fotku ${soubor.name}`}
                  disabled={disabled}
                  onClick={() => {
                    onOdebrat(index);
                  }}
                />
              </li>
            ))}
          </ul>
          <label
            htmlFor={id}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border-t border-linka bg-povrch text-[13.5px] font-semibold text-inkoust hover:bg-povrch-2 min-[90rem]:text-[12.5px]"
          >
            <Ikona nazev="plus" className="size-4 text-mech" />
            Přidat další
          </label>
        </>
      )}
    </div>
  );
}

const klice = new WeakMap<File, number>();
let posledniKlic = 0;

/** Stálý klíč souboru, dva soubory se stejným názvem se tak nespletou. */
function klicSouboru(soubor: File): number {
  const stary = klice.get(soubor);
  if (stary !== undefined) return stary;
  posledniKlic += 1;
  klice.set(soubor, posledniKlic);
  return posledniKlic;
}

function TlacitkoOdebrat({
  popisek,
  disabled,
  onClick,
}: {
  popisek: string;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={popisek}
      className="bez-prejeti group absolute right-0 top-0 flex size-11 items-start justify-end p-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk"
    >
      <span
        aria-hidden="true"
        className="flex size-[22px] items-center justify-center rounded-full bg-inkoust/75 text-papir group-hover:bg-inkoust"
      >
        <Ikona nazev="x" className="size-3" tloustka={2.5} />
      </span>
    </button>
  );
}
