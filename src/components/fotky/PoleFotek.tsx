import type { DragEvent, JSX, ReactNode } from "react";
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
  ulozene = [],
  onSmazatUlozenou,
}: PoleFotekProps): JSX.Element {
  const prazdne = soubory.length === 0 && ulozene.length === 0;

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
        <ul
          aria-label="Vybrané fotky"
          className="posuvnik grid max-h-[min(19rem,42dvh)] grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 overflow-y-auto p-2.5"
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
          <li>
            <label
              htmlFor={id}
              title="Přidat další fotky"
              className="flex aspect-square cursor-pointer items-center justify-center rounded-[9px] border border-dashed border-pole bg-povrch text-ink-3 hover:text-inkoust"
            >
              <Ikona nazev="plus" className="size-5" />
            </label>
          </li>
        </ul>
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
