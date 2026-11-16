import { useEffect, useRef, useState, type JSX } from "react";
import { isoCasNaEvropsky } from "../../lib/evropsky-cas";
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
  /** Journal chrome. Omitted on any page that is not the trips journal. */
  denik?: boolean;
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
    denik = false,
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const potvrzeniRef = useRef(kPotvereni);
  potvrzeniRef.current = kPotvereni;
  const onZavritRef = useRef(onZavrit);
  onZavritRef.current = onZavrit;

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

  /* Focus na křížek, Tab uvnitř panelu, Escape zavře. Potvrzení mazání
     má vlastní past, takže tady klávesu pustíme dál. */
  useEffect(() => {
    const predchoziFocus: Element | null = document.activeElement;
    const navratPopisek: string | null =
      predchoziFocus instanceof HTMLElement
        ? predchoziFocus.getAttribute("aria-label")
        : null;
    krizekRef.current?.focus();
    const puvodniOverflow: string = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function naStiskKlavesy(udalost: KeyboardEvent): void {
      if (potvrzeniRef.current !== null) return;
      if (udalost.key === "Escape") {
        udalost.preventDefault();
        udalost.stopPropagation();
        onZavritRef.current();
        return;
      }
      if (udalost.key !== "Tab") return;
      const koren: HTMLDivElement | null = dialogRef.current;
      if (koren === null) return;
      const prvky: HTMLElement[] = Array.from(
        koren.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (prvky.length === 0) return;
      const prvni: HTMLElement = prvky[0];
      const posledni: HTMLElement = prvky[prvky.length - 1];
      if (udalost.shiftKey && document.activeElement === prvni) {
        udalost.preventDefault();
        posledni.focus();
      } else if (!udalost.shiftKey && document.activeElement === posledni) {
        udalost.preventDefault();
        prvni.focus();
      }
    }

    document.addEventListener("keydown", naStiskKlavesy, true);
    return () => {
      document.removeEventListener("keydown", naStiskKlavesy, true);
      document.body.style.overflow = puvodniOverflow;
      const navrat: HTMLElement | null =
        navratPopisek !== null
          ? document.querySelector<HTMLElement>(
              `button[aria-label="${CSS.escape(navratPopisek)}"]`,
            )
          : null;
      if (navrat !== null) navrat.focus();
      else if (predchoziFocus instanceof HTMLElement) predchoziFocus.focus();
    };
  }, []);

  return (
    <>
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-inkoust/50 lg:items-center lg:p-4${
        denik ? " nocturne nahled-modal" : ""
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Události dne ${formatCelyDatum(datum)}`}
        className="max-h-[100dvh] w-full overflow-y-auto rounded-t-3xl bg-papir p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-denik lg:max-h-[90vh] lg:max-w-lg lg:rounded-3xl lg:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-mech lg:text-xs">
              {udalosti.length === 0
                ? "Bez akce"
                : `${udalosti.length} ${udalosti.length === 1 ? "akce" : udalosti.length >= 2 && udalosti.length <= 4 ? "akce" : "akcí"}`}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight lg:text-xl">
              {formatCelyDatum(datum)}
            </h2>
          </div>
          <button
            ref={krizekRef}
            type="button"
            onClick={onZavrit}
            title="Zavřít detail dne"
            aria-label="Zavřít detail dne"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-mlha text-lg font-bold transition-colors motion-reduce:transition-none hover:bg-linka focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            ×
          </button>
        </div>

        {udalosti.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-mlha/60 px-3 py-4 text-center text-base text-inkoust/80">
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
                    className="rounded-lg border border-pole bg-papir p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col items-start gap-2">
                        <span className="rounded-full bg-smrk px-2.5 py-1 text-[13px] font-bold text-papir">
                          Výprava
                        </span>
                        <span className="text-lg font-bold break-words">
                          {expedice.nazev}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDetailVypravy(expedice)}
                        title={`Otevřít detail výpravy ${expedice.nazev}`}
                        aria-label={`Otevřít detail výpravy ${expedice.nazev}`}
                        className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </button>
                    </div>
                    {expedice.sraz.trim().length > 0 && (
                      <p className="mt-2 text-base text-inkoust/80 break-words">
                        Sraz: {expedice.sraz}
                      </p>
                    )}
                  </li>
                );
              }
              const schuzka = schuzkyPodleId.get(udalost.id);
              if (schuzka === undefined) return null;
              const mazeSe = mazeSeSchuzka === schuzka.id;
              const casText =
                schuzka.cas !== null && schuzka.cas !== undefined && schuzka.cas.length > 0
                  ? isoCasNaEvropsky(schuzka.cas)
                  : "";
              const mistnost = schuzka.mistnost?.trim() ?? "";
              const casAMistnost = [casText, mistnost].filter((cast) => cast.length > 0).join(" · ");
              return (
                <li
                  key={`schuzka-${udalost.id}-${udalost.datum}`}
                  className="rounded-lg border border-pole bg-papir p-4"
                >
                  <div className="flex items-center gap-1">
                    <span className="rounded-full bg-jantar px-2.5 py-1 text-[13px] font-bold text-papir">
                      Schůzka
                    </span>
                    {muzeSpravovat && (
                      <div className="flex shrink-0">
                        <button
                          type="button"
                          onClick={() => onUpravitSchuzku(schuzka)}
                          title={`Upravit schůzku ${schuzka.nazev}`}
                          aria-label={`Upravit schůzku ${schuzka.nazev}`}
                          className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={mazeSe}
                          onClick={(e) => {
                            spoustecRef.current = e.currentTarget;
                            // Weekly meetings default to the whole series.
                            // A one-off meeting leaves the range unset.
                            setRozsah(
                              schuzka.opakovani === "tydenni" ? "rada" : null,
                            );
                            setKPotvereni({
                              id: schuzka.id,
                              nazev: schuzka.nazev,
                            });
                          }}
                          title={mazeSe ? "Mažu…" : `Odebrat schůzku ${schuzka.nazev}`}
                          aria-label={mazeSe ? "Mažu…" : `Odebrat schůzku ${schuzka.nazev}`}
                          className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 [touch-action:manipulation]"
                        >
                          {mazeSe ? (
                            <span className="text-sm font-semibold">…</span>
                          ) : (
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                              <path d="M4 7h16" />
                              <path d="M9 7V5h6v2" />
                              <path d="M6 7l1 13h10l1-13" />
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="mt-1 block text-lg font-bold break-words">
                      {schuzka.nazev}
                    </span>
                    {casAMistnost.length > 0 && (
                      <p className="mt-2 text-base text-inkoust/80 break-words">{casAMistnost}</p>
                    )}
                    {schuzka.popis.trim().length > 0 && (
                      <p className="mt-2 text-base text-inkoust/80 break-words">
                        {schuzka.popis}
                      </p>
                    )}
                  </div>
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
            className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-okr px-4 py-2 text-sm font-semibold text-inkoust transition-colors motion-reduce:transition-none hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Schůzka
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
        trida={denik ? "nahled-ovladani" : undefined}
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