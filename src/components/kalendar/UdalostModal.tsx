import { useEffect, useRef, useState, type JSX } from "react";
import { formatCelyDatum } from "../../lib/expedition-utils";
import type { KalendarniUdalost } from "../../lib/kalendar";
import type { Expedition } from "../../lib/mock-expeditions";
import type { RozsahMazaniSchuzky } from "../../shared/api-types";
import type { ApiSchuzka } from "../../shared/api-types";
import ConfirmDialog from "./ConfirmDialog";

interface UdalostModalProps {
  /** Den YMD, ke kterému se modal vztahuje. */
  datum: string;
  udalosti: KalendarniUdalost[];
  expedicePodleId: Map<string, Expedition>;
  schuzkyPodleId: Map<string, ApiSchuzka>;
  muzeSpravovat: boolean;
  mazeSeSchuzka: string | null;
  chybaMazani?: string | null;
  onZavrit: () => void;
  onDetailVypravy: (expedice: Expedition) => void;
  onUpravitSchuzku: (schuzka: ApiSchuzka) => void;
  onSmazatSchuzku: (
    id: string,
    rozsah: RozsahMazaniSchuzky | null,
    datum?: string,
  ) => void;
  onNovaSchuzka: (datum: string) => void;
}

function opakovaniPopisek(schuzka: ApiSchuzka): string {
  return schuzka.opakovani === "tydenni" ? "Týdenní" : "Jednorázová";
}

/** Rozpracované mazání — snapshot pro stabilní text confirmu během mazání. */
interface KeSmazani {
  id: string;
  nazev: string;
}

/**
 * UdalostModal — unifikovaný detail dne (Fáze 3, PRD 2.4).
 * Jeden pop-up pro výpravy i schůzky: výprava → proklik na ExpeditionModal,
 * schůzka → inline detail + Upravit / Odebrat (dual-guard).
 */
export default function UdalostModal(props: UdalostModalProps): JSX.Element {
  const {
    datum,
    udalosti,
    expedicePodleId,
    schuzkyPodleId,
    muzeSpravovat,
    mazeSeSchuzka,
    chybaMazani,
    onZavrit,
    onDetailVypravy,
    onUpravitSchuzku,
    onSmazatSchuzku,
    onNovaSchuzka,
  } = props;

  /*
   * KROK 2 — žádné destruktivní bez potvrzení: „Odebrat" jen otevře
   * ConfirmDialog, samotné `onSmazatSchuzku` (logika ve VypravyPage) se volá
   * až z jeho „Ano, odebrat". Po úspěšném smazání se confirm sám zavře.
   * B4 — volba rozsahu: default `rada` pro tydenní schůzky (maže celou řadu),
   * pro jednorázové schůzky se radio group nepřipojuje (smaže se jediná instance).
   */
  const [kPotvereni, setKPotvereni] = useState<KeSmazani | null>(null);
  // Rozsah se nastavuje explicitně v onClick dle mazané schůzky (níže) —
  // žádný default z mapy (první schůzka v mapě nemusí být ta mazaná).
  const [rozsah, setRozsah] = useState<RozsahMazaniSchuzky | null>(null);
  const spoustecRef = useRef<HTMLButtonElement | null>(null);
  const krizekRef = useRef<HTMLButtonElement>(null);

  /*
   * NENALEZENO („už je smazaná") se sem propíše jako `chybaMazani === null`
   * + řádek mizí z `schuzkyPodleId` → confirm se zavře. Ostatní chyby
   * nechají `chybaMazani` jako text → confirm zůstane otevřený i s hláškou.
   */
  const mazaloSeRef = useRef<boolean>(false);
  useEffect(() => {
    if (kPotvereni === null) return;
    if (schuzkyPodleId.has(kPotvereni.id)) return;
    mazaloSeRef.current = false;
    setKPotvereni(null);
    spoustecRef.current = null;
    krizekRef.current?.focus();
  }, [kPotvereni, schuzkyPodleId]);

  /*
   * B4 vyskyt: řada v `schuzkyPodleId` zůstává (přibude jen výjimka),
   * takže horní efekt nezavře. Po úspěchu (mazání doběhlo bez chyby)
   * confirm zavřít taky — při chybě zůstane otevřený i s hláškou.
   */
  useEffect(() => {
    if (kPotvereni === null) return;
    if (mazeSeSchuzka !== null) {
      mazaloSeRef.current = true;
      return;
    }
    if (!mazaloSeRef.current) return;
    mazaloSeRef.current = false;
    if (chybaMazani !== null && chybaMazani !== undefined) return;
    setKPotvereni(null);
    spoustecRef.current = null;
  }, [mazeSeSchuzka, chybaMazani, kPotvereni]);

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Události dne ${formatCelyDatum(datum)}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border-2 border-inkoust bg-papir p-5 shadow-denik sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-mech">
              {udalosti.length === 0
                ? "Bez akce"
                : `${udalosti.length} ${udalosti.length === 1 ? "akce" : udalosti.length >= 2 && udalosti.length <= 4 ? "akce" : "akcí"}`}
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">
              {formatCelyDatum(datum)}
            </h2>
          </div>
          <button
            ref={krizekRef}
            type="button"
            onClick={onZavrit}
            title="Zavřít detail dne"
            aria-label="Zavřít detail dne"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-white/60 text-lg font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            ×
          </button>
        </div>

        {udalosti.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-linka px-3 py-4 text-center text-sm text-inkoust/70">
            V tenhle den není nic naplánovaného.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {udalosti.map((udalost) => {
              if (udalost.typ === "vyprava") {
                const expedice = expedicePodleId.get(udalost.id);
                if (expedice === undefined) return null;
                return (
                  <li
                    key={`vyprava-${udalost.id}`}
                    className="rounded-md border-2 border-inkoust bg-white/60 p-3 shadow-denik"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-smrk px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-papir">
                        Výprava
                      </span>
                      <span className="text-sm font-bold break-words">
                        {expedice.nazev}
                      </span>
                    </div>
                    {expedice.sraz.trim().length > 0 && (
                      <p className="mt-1 text-sm text-inkoust/75 break-words">
                        Sraz: {expedice.sraz}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onDetailVypravy(expedice)}
                      title={`Otevřít detail výpravy ${expedice.nazev}`}
                      className="mt-2 inline-flex min-h-[44px] items-center rounded-md border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
                    >
                      Detail výpravy →
                    </button>
                  </li>
                );
              }
              const schuzka = schuzkyPodleId.get(udalost.id);
              if (schuzka === undefined) return null;
              const mazeSe = mazeSeSchuzka === schuzka.id;
              return (
                <li
                  key={`schuzka-${udalost.id}-${udalost.datum}`}
                  className="rounded-md border-2 border-inkoust bg-white/60 p-3 shadow-denik"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-jantar px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-papir">
                      Schůzka
                    </span>
                    <span className="text-sm font-bold break-words">
                      {schuzka.nazev}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-inkoust/75 break-words">
                    {opakovaniPopisek(schuzka)}
                    {schuzka.mistnost !== null &&
                      schuzka.mistnost.trim().length > 0 &&
                      ` · ${schuzka.mistnost}`}
                  </p>
                  {schuzka.popis.trim().length > 0 && (
                    <p className="mt-1 text-sm text-inkoust/75 break-words">
                      {schuzka.popis}
                    </p>
                  )}
                  {muzeSpravovat && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onUpravitSchuzku(schuzka)}
                        title={`Upravit schůzku ${schuzka.nazev}`}
                        className="inline-flex min-h-[44px] items-center rounded-md border-2 border-inkoust bg-papir px-4 py-2 text-sm font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
                      >
                        Upravit
                      </button>
                      <button
                        type="button"
                        disabled={mazeSe}
                        onClick={(e) => {
                          spoustecRef.current = e.currentTarget;
                          // Pro týdenní schůzky zvolíme výchozí rozsah "rada",
                          // pro jednorázové necháme null (radio group se nezobrazí).
                          setRozsah(
                            schuzka.opakovani === "tydenni" ? "rada" : null,
                          );
                          setKPotvereni({
                            id: schuzka.id,
                            nazev: schuzka.nazev,
                          });
                        }}
                        title={mazeSe ? "Mažu…" : `Odebrat schůzku ${schuzka.nazev}`}
                        className="inline-flex min-h-[44px] items-center rounded-md border-2 border-red-800 bg-white/60 px-4 py-2 text-sm font-bold text-red-900 shadow-denik transition-colors motion-reduce:transition-none hover:bg-red-50 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 [touch-action:manipulation]"
                      >
                        {mazeSe ? "Mažu…" : "Odebrat"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {muzeSpravovat && (
          <button
            type="button"
            onClick={() => onNovaSchuzka(datum)}
            title={`Naplánovat schůzku na ${formatCelyDatum(datum)}`}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-inkoust bg-smrk px-5 py-2 text-sm font-bold text-papir shadow-denik transition-colors motion-reduce:transition-none hover:bg-inkoust focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            <span aria-hidden="true">＋</span> Nová schůzka v tento den
          </button>
        )}
      </div>
    </div>
    {kPotvereni !== null && (
      <ConfirmDialog
        otevreno
        nadpis="Odebrat schůzku?"
        popis={`Opravdu odebrat schůzku „${kPotvereni.nazev}“ ze dne ${formatCelyDatum(datum)}? Tahle akce nejde vzít zpět.`}
        potvrditPopisek="Ano, odebrat"
        zrusitPopisek="Ponechat"
        probiha={mazeSeSchuzka === kPotvereni.id}
        probihaPopisek="Mažu…"
        rozsah={rozsah}
        onZmenaRozsahu={(novy: RozsahMazaniSchuzky) => setRozsah(novy)}
        chyba={chybaMazani ?? null}
        navratElement={spoustecRef.current}
        onPotvrdit={() =>
          onSmazatSchuzku(
            kPotvereni.id,
            rozsah ?? "rada",
            rozsah === "vyskyt" ? datum : undefined,
          )
        }
        onZrusit={() => {
          setKPotvereni(null);
          spoustecRef.current = null;
        }}
      />
    )}
    </>
  );
}