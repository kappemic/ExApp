import { useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from "react";
import {
  nactiFotkyAlba,
  nahrajFotku,
  nastavNahledAlba,
  popisekPoctuFotek,
  type ApiAlbum,
} from "../../lib/alba-api";
import {
  kratkyNazevSouboru,
  type PolozkaStavuFotek,
} from "../../lib/fotky-operace-stav";
import Ikona from "../Ikona";
import VyberPole from "../VyberPole";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import FotkyStavPanel from "./FotkyStavPanel";

/** Hodnota volby „Nové album“ ve výběru alba. */
const NOVE_ALBUM = "__nove";

interface NahratFotkyProps {
  /** Náhled alba výpravy smí měnit jen admin. */
  isAdmin: boolean;
  alba: readonly ApiAlbum[];
  vybraneId: string;
  onVyber: (albumId: string) => void;
  onNahrano: () => void;
  /** Založení alba přímo z výběru (telefon nemá vlastní tlačítko). */
  onNoveAlbum?: () => void;
  onZrusit: () => void;
}

/**
 * Upload sheet body: pick files, choose album, confirm with footer actions.
 */
export default function NahratFotky({
  isAdmin,
  alba,
  vybraneId,
  onVyber,
  onNahrano,
  onNoveAlbum,
  onZrusit,
}: NahratFotkyProps): JSX.Element {
  const vstupRef = useRef<HTMLInputElement>(null);
  const [vybraneSoubory, setVybraneSoubory] = useState<readonly File[]>([]);
  const [odesila, setOdesila] = useState<boolean>(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [operacePolozky, setOperacePolozky] = useState<readonly PolozkaStavuFotek[]>([]);
  const [jakoNahled, setJakoNahled] = useState(false);
  const bezAlb = alba.length === 0;
  const album = alba.find((polozka) => polozka.id === vybraneId) ?? null;
  const expeditionId = album?.druh === "vyprava" ? album.expeditionId : null;

  const nahledy = useMemo(
    () => vybraneSoubory.map((soubor) => URL.createObjectURL(soubor)),
    [vybraneSoubory],
  );
  useEffect(
    () => () => {
      for (const url of nahledy) URL.revokeObjectURL(url);
    },
    [nahledy],
  );

  /** Nahrané fotky pozná podle rozdílu proti albu před nahráním, API jejich ID nevrací. */
  async function pouzijPrvniJakoNahled(pred: ReadonlySet<string>): Promise<string | null> {
    if (expeditionId === null) return null;
    const po = await nactiFotkyAlba(vybraneId);
    if (!po.ok) return po.chyba;
    const nove = po.data.filter((fotka) => !pred.has(fotka.id));
    const prvni = nove[0];
    if (prvni === undefined) return null;
    const vysledek = await nastavNahledAlba(expeditionId, prvni.id);
    return vysledek.ok ? null : vysledek.chyba;
  }

  async function odeslatSoubory(seznam: readonly File[]): Promise<void> {
    if (seznam.length === 0) {
      setChyba("Vyber aspoň jednu fotku.");
      return;
    }
    if (vybraneId.length === 0) {
      setChyba("Vyber album, do kterého se fotky nahrají.");
      return;
    }
    setOdesila(true);
    setChyba(null);
    const radky: PolozkaStavuFotek[] = seznam.map((soubor, index) => ({
      id: `${index}-${soubor.name}`,
      popisek: kratkyNazevSouboru(soubor.name),
      stav: "ceka",
    }));
    setOperacePolozky(radky);
    const chceNahled = jakoNahled && isAdmin && expeditionId !== null;
    const predNahranim = chceNahled ? await nactiFotkyAlba(vybraneId) : null;

    let nahrano = 0;
    for (let index = 0; index < seznam.length; index += 1) {
      const soubor = seznam[index];
      setOperacePolozky((prev) =>
        prev.map((radek, i) => (i === index ? { ...radek, stav: "probiha" } : radek)),
      );
      const vysledek = await nahrajFotku(vybraneId, soubor);
      if (!vysledek.ok) {
        setOperacePolozky((prev) =>
          prev.map((radek, i) =>
            i === index ? { ...radek, stav: "chyba", chyba: vysledek.chyba } : radek,
          ),
        );
        setOdesila(false);
        setChyba(
          nahrano === 0
            ? vysledek.chyba
            : `Nahráno ${nahrano} z ${seznam.length}. ${vysledek.chyba}`,
        );
        if (nahrano > 0) onNahrano();
        return;
      }
      nahrano += 1;
      setOperacePolozky((prev) =>
        prev.map((radek, i) => (i === index ? { ...radek, stav: "hotovo" } : radek)),
      );
    }
    if (vstupRef.current !== null) vstupRef.current.value = "";
    const chybaNahledu =
      predNahranim !== null && predNahranim.ok
        ? await pouzijPrvniJakoNahled(new Set(predNahranim.data.map((fotka) => fotka.id)))
        : null;
    setVybraneSoubory([]);
    setOdesila(false);
    onNahrano();
    if (chybaNahledu !== null) {
      setChyba(`Fotky jsou nahrané. ${chybaNahledu}`);
      return;
    }
    onZrusit();
    window.setTimeout(() => {
      setOperacePolozky([]);
    }, 400);
  }

  function prijmiSoubory(soubory: FileList | null): void {
    const seznam =
      soubory === null ? [] : Array.from(soubory).filter((soubor) => soubor.type.startsWith("image/"));
    if (seznam.length > 0) setVybraneSoubory((predchozi) => [...predchozi, ...seznam]);
    setChyba(null);
  }

  function naPretazeni(udalost: DragEvent<HTMLLabelElement>): void {
    udalost.preventDefault();
    if (odesila || bezAlb) return;
    prijmiSoubory(udalost.dataTransfer.files);
  }

  const pocet = vybraneSoubory.length;
  const popisekOdeslat =
    pocet === 0
      ? "Nahrát fotky"
      : pocet === 1
        ? "Nahrát 1 fotku"
        : pocet < 5
          ? `Nahrát ${pocet} fotky`
          : `Nahrát ${pocet} fotek`;

  return (
    <div>
      <div className="flex flex-col gap-[18px] min-[90rem]:gap-3.5">
      <label
        htmlFor="fotky-soubory"
        onDragOver={(udalost) => {
          udalost.preventDefault();
        }}
        onDrop={naPretazeni}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-linka bg-papir p-6 text-center min-[90rem]:h-32 min-[90rem]:gap-[5px] min-[90rem]:rounded-xl min-[90rem]:border-pole min-[90rem]:bg-pole-podklad min-[90rem]:p-0 ${
          odesila || bezAlb ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <Ikona nazev="image" className="size-7 text-ink-3 min-[90rem]:hidden" />
        <Ikona nazev="image-plus" className="hidden size-5 text-ink-3 min-[90rem]:block" />
        <span className="text-sm font-semibold text-inkoust min-[90rem]:hidden">Vyber fotky z telefonu</span>
        <span className="hidden text-[12.5px] font-medium text-mech min-[90rem]:block">Přetáhni fotky nebo vyber z počítače</span>
        <span className="text-[12.5px] text-ink-3 min-[90rem]:text-[10.5px] min-[90rem]:text-ink-4">JPG nebo PNG, max. 8 MB na fotku</span>
        <input
          ref={vstupRef}
          id="fotky-soubory"
          name="soubor"
          type="file"
          accept="image/jpeg,image/png,image/*"
          multiple
          disabled={odesila || bezAlb}
          onChange={(udalost) => {
            prijmiSoubory(udalost.target.files);
            udalost.target.value = "";
          }}
          className="sr-only"
        />
      </label>

      {nahledy.length > 0 ? (
        <ul className="hidden flex-wrap gap-2 min-[90rem]:flex" aria-label="Vybrané fotky">
          {nahledy.map((url, index) => (
            <li key={url}>
              <button
                type="button"
                disabled={odesila}
                onClick={() => setVybraneSoubory((predchozi) => predchozi.filter((_, i) => i !== index))}
                aria-label={`Odebrat fotku ${vybraneSoubory[index]?.name ?? ""}`}
                className="group relative block size-16 overflow-hidden rounded-[9px] border border-black/10"
              >
                <img src={url} alt="" className="size-full object-cover" />
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-inkoust/55 text-papir opacity-0 transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Ikona nazev="x" className="size-4" />
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              disabled={odesila}
              onClick={() => vstupRef.current?.click()}
              aria-label="Přidat další fotky"
              className="flex size-16 items-center justify-center rounded-[9px] border border-linka bg-povrch-2 text-ink-3 hover:text-inkoust"
            >
              <Ikona nazev="plus" className="size-4" />
            </button>
          </li>
        </ul>
      ) : null}

      <div className="min-w-0 min-[90rem]:flex min-[90rem]:items-center min-[90rem]:gap-2.5">
        <label htmlFor="fotky-album" className={`block ${POPISEK_POLE}`}>
          Album
        </label>
        <div className="mt-1.5 min-w-0 min-[90rem]:mt-0 min-[90rem]:flex-1">
          <VyberPole
            id="fotky-album"
            value={vybraneId}
            disabled={odesila || (bezAlb && onNoveAlbum === undefined)}
            onChange={(hodnota) => {
              if (hodnota === NOVE_ALBUM) onNoveAlbum?.();
              else onVyber(hodnota);
            }}
            prazdnyPopisek={bezAlb ? "Žádné album" : "Vyber album"}
            className={`${POLE_FORMULARE} min-[90rem]:!h-[38px] min-[90rem]:!rounded-[9px] min-[90rem]:!border-transparent min-[90rem]:!bg-povrch-2 min-[90rem]:!px-[11px] min-[90rem]:!text-xs min-[90rem]:font-medium`}
            volby={[
              ...(onNoveAlbum !== undefined ? [{ value: NOVE_ALBUM, popisek: "+ Nové album" }] : []),
              ...alba.map((polozka) => ({ value: polozka.id, popisek: polozka.nazev })),
            ]}
          />
        </div>
      </div>

      {isAdmin && expeditionId !== null ? (
        <label className="hidden cursor-pointer items-center gap-[9px] text-[11.5px] text-mech min-[90rem]:flex">
          <input
            type="checkbox"
            checked={jakoNahled}
            disabled={odesila}
            onChange={(udalost) => setJakoNahled(udalost.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-povrch peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-smrk ${
              jakoNahled ? "bg-smrk" : "border border-pole"
            }`}
          >
            {jakoNahled ? <Ikona nazev="check" className="size-[11px]" tloustka={3} /> : null}
          </span>
          Použít první fotku jako náhled alba
        </label>
      ) : null}

      {pocet > 0 ? (
        <p role="status" className="text-[12.5px] text-mech min-[90rem]:sr-only">
          Vybráno: {popisekPoctuFotek(pocet)}.
        </p>
      ) : null}

      {chyba !== null ? (
        <p role="alert" className="text-[13px] font-semibold text-akcent">
          {chyba}
        </p>
      ) : null}

      <FotkyStavPanel
        rezim="nahravani"
        polozky={operacePolozky}
        viditelny={operacePolozky.length > 0}
        probiha={odesila}
      />

      </div>
      <div className={PATICKA_SHEETU} role="group" aria-label="Akce nahrání">
        <button type="button" disabled={odesila} onClick={onZrusit} className={TLACITKO_PATICKY_ZRUSIT}>
          Zrušit
        </button>
        <button
          type="button"
          disabled={odesila || pocet === 0 || bezAlb}
          onClick={() => {
            void odeslatSoubory(vybraneSoubory);
          }}
          className={TLACITKO_PATICKY_HLAVNI}
        >
          {odesila ? "Nahrávám…" : popisekOdeslat}
        </button>
      </div>
    </div>
  );
}