/**
 * Heatmapa tras celého klubu — klubové statistiky.
 *
 * Design kontrakt (frontend-ui-engineering + mobile-native + break-ui):
 * - Barvy podle ExApp.pen: terakota #a8461c (vybraná trasa), šalvějová
 *   #7e9370 (ostatní trasy).
 * - Mobile-first: mapa 320px vysoká na mobilu, 420px na sm+; všechna
 *   tlačítka min 44×44px, `touch-action: manipulation`; samotná mapa
 *   `pan-x pan-y` (gesta Leafletu), hover jen `(hover:hover)`.
 * - Leaflet je lazy `import("leaflet")` — PWA první paint bez mapového
 *   bundlu; dlaždice OSM bez API klíče + povinná atribuce.
 * - Stavy: načítání → skeleton; offline/chyba → fallback hláška + retry;
 *   0 tras → prázdný stav „Mapa je zatím čistá" (stejná kopie jako placeholder);
 *   data → mapa + legenda + souhrn. Nikdy nevyhazuje, nikdy prázdná obrazovka.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import {
  dekodujPolyline,
  slucHranice,
  spocitejHranice,
  type Hranice,
  type Souradnice,
} from "../../lib/polyline";
import type { ZebrickyTrasa } from "../../shared/api-types";
import type { Map as LeafletMapa } from "leaflet";
import Ikona, { type NazevIkony } from "../Ikona";
import { snizenyPohyb as snizenyPohybUzivatele } from "../../lib/pohyb";
import { isoNaEvropske } from "../../lib/evropske-datum";
import { formatKmZaokrouhlene } from "../../lib/format-cisla";

export interface Trasa {
  id: string;
  nazev: string;
  datum: string;
  body: Souradnice[];
  hranice: Hranice;
  km: number | null;
}

export function polylajnaNaTrasu(vstup: {
  id: string;
  nazev: string;
  datum: string;
  km: number | null;
  trasaPolyline: string | null;
}): Trasa | null {
  if (typeof vstup.trasaPolyline !== "string") return null;
  if (vstup.trasaPolyline.trim().length === 0) return null;
  const body = dekodujPolyline(vstup.trasaPolyline);
  if (body.length < 2) return null;
  const hranice = spocitejHranice(body);
  if (hranice === null) return null;
  const nazev = vstup.nazev.length > 0 ? vstup.nazev : vstup.id;
  return {
    id: vstup.id,
    nazev,
    datum: vstup.datum,
    body,
    hranice,
    km: vstup.km,
  };
}

const PRAZDNO_NADPIS = "Mapa je zatím čistá";
const PRAZDNO_TEXT =
  "Trasy výprav se vykreslí, jakmile k nim přidáme trasu ze Stravy nebo z GPS.";

// Výchozí pohled na ČR, když není co obkreslit (Praha, z≈7).
const VYCHOZI_STRED: [number, number] = [49.8175, 15.472962];
const VYCHOZI_ZOOM = 7;

// Deníkové tokeny pro Leaflet canvas — Leaflet neumí číst CSS `var()`,
// proto hex kopie jediného zdroje pravdy z `src/index.css` (`@theme`).
// Nesmí se objevit žádný jiný inline hex: jantar = běžná trasa,
// smrk = trasa, kterou si čtenář vybral. Legenda používá stejné hex.
const BARVA_VYBRANA = "#a8461c"; // = --color-akcent, první trasa a vybraná
const BARVA_OSTATNI = "#7e9370"; // = --color-salvej, ostatní trasy

interface StylCary {
  color: string;
  weight: number;
  opacity: number;
}

interface CaryVrstva {
  bringToFront?: () => unknown;
  setStyle: (styl: StylCary) => unknown;
  getTooltip?: () => { getElement: () => HTMLElement | undefined } | undefined;
}

function popisekTrasy(trasa: Trasa): string {
  const evropske = isoNaEvropske(trasa.datum);
  const datum = evropske.length > 0 ? evropske : trasa.datum;
  return datum.length > 0 ? `${trasa.nazev} · ${datum}` : trasa.nazev;
}

function obarviPopisek(cara: CaryVrstva, vybrana: boolean): void {
  const ramecek = cara.getTooltip?.()?.getElement?.();
  if (ramecek === undefined) return;
  ramecek.style.borderColor = vybrana ? BARVA_VYBRANA : BARVA_OSTATNI;
  ramecek.style.width = "max-content";
  ramecek.style.maxWidth = "min(28rem, calc(100vw - 2.5rem))";
  ramecek.style.whiteSpace = "nowrap";
  ramecek.style.overflow = "hidden";
  const text = ramecek.firstElementChild;
  if (text instanceof HTMLElement) {
    text.style.display = "block";
    text.style.maxWidth = "100%";
    text.style.overflow = "hidden";
    text.style.whiteSpace = "nowrap";
    text.style.textOverflow = "ellipsis";
  }
}

function stylCary(jeAktivni: boolean): StylCary {
  return jeAktivni
    ? { color: BARVA_VYBRANA, weight: 5, opacity: 0.95 }
    : { color: BARVA_OSTATNI, weight: 4, opacity: 1 };
}

function jeOfflineProhlizec(): boolean {
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return navigator.onLine === false;
  }
  return false;
}

/** Výška mapy: telefon 220 px, tablet 320 px, počítač 420 px. */
const VYSKA_MAPY = "h-[220px] sm:h-[320px] min-[90rem]:h-[420px]";
const STAV_MAPY =
  "flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl bg-povrch-2 px-6 py-8 text-center min-[90rem]:min-h-[420px]";

/** Stavy kolem mapy: načítání, bez sítě, bez tras. Data drží StatistikyKlub. */
export default function Heatmapa({
  trasy,
  stav,
  vybranaId = null,
  onVybrat,
  onZnovu,
}: {
  trasy: readonly ZebrickyTrasa[];
  stav: "nacitani" | "offline" | "hotovo";
  /** Trasa vybraná v seznamu výprav. */
  vybranaId?: string | null;
  onVybrat?: (id: string) => void;
  onZnovu: () => void;
}): JSX.Element {
  const nakreslene = useMemo(
    () => trasy.map((trasa) => polylajnaNaTrasu(trasa)).filter((trasa): trasa is Trasa => trasa !== null),
    [trasy],
  );
  const kmCelkem = Math.round(nakreslene.reduce((soucet, trasa) => soucet + (trasa.km ?? 0), 0) * 10) / 10;

  // Při změně období zůstane stará mapa, dokud nedorazí nová data.
  if (stav === "nacitani" && nakreslene.length === 0) {
    return (
      <div
        aria-busy="true"
        aria-label="Načítám mapu tras"
        className={`${VYSKA_MAPY} animate-pulse rounded-xl bg-povrch-2 motion-reduce:animate-none`}
      />
    );
  }

  if (stav === "offline" || (stav !== "nacitani" && jeOfflineProhlizec() && nakreslene.length === 0)) {
    return (
      <div role="alert" className={STAV_MAPY}>
        <p className="text-[13px] font-semibold text-inkoust">Mapa je offline</p>
        <p className="max-w-sm text-xs text-ink-3">
          Jsi offline nebo server neodpovídá. Mapa se vykreslí po připojení.
        </p>
        <button
          type="button"
          onClick={onZnovu}
          className="nahled-press mt-1 inline-flex min-h-[44px] min-w-[44px] items-center rounded-[9px] border border-linka bg-povrch px-3 text-xs font-semibold text-mech"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (nakreslene.length === 0) {
    return (
      <div role="status" className={STAV_MAPY}>
        <p className="text-[13px] font-semibold text-inkoust">{PRAZDNO_NADPIS}</p>
        <p className="max-w-sm text-xs text-ink-3">{PRAZDNO_TEXT}</p>
      </div>
    );
  }

  return <HeatmapaMapa trasy={nakreslene} kmCelkem={kmCelkem} vybranaId={vybranaId} onVybrat={onVybrat} />;
}

/**
 * Prezentace: Leaflet mapa líně přes `import("leaflet")`.
 * Dlaždice OSM (bez klíče), polylines jantar, vybraná smrk, fitBounds.
 */
export function HeatmapaMapa({
  trasy,
  kmCelkem,
  vybranaId = null,
  onVybrat,
  popisekMapy = "Heatmapa výprav klubu",
}: {
  trasy: Trasa[];
  kmCelkem: number;
  vybranaId?: string | null;
  onVybrat?: (id: string) => void;
  popisekMapy?: string;
}): JSX.Element {
  const kontejnerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<LeafletMapa | null>(null);
  const vychoziPohledRef = useRef<(plynule: boolean) => void>(() => undefined);
  const [oddaleno, setOddaleno] = useState<boolean>(true);
  const caryRef = useRef<Map<string, CaryVrstva>>(new Map());
  const [chybaMapy, setChybaMapy] = useState<boolean>(false);
  const onVybratRef = useRef(onVybrat);
  onVybratRef.current = onVybrat;
  // Návrh má jednu trasu terakotovou: vybranou, jinak nejnovější.
  const aktivniId: string | null = vybranaId !== null && trasy.some((t) => t.id === vybranaId) ? vybranaId : (trasy[0]?.id ?? null);
  const vybrana = vybranaId === null ? undefined : trasy.find((t) => t.id === vybranaId);

  // Aktuální výběr pro async tvorbu mapy — čtení `ref.current` v efektu
  // nevyžaduje dep, takže výběr mapu nikdy nepřestavuje.
  const aktivniIdRef = useRef<string | null>(aktivniId);
  aktivniIdRef.current = aktivniId;

  // Tvorba mapy: běží jen při změně obsahu `trasy`, nikdy při výběru.
  useEffect(() => {
    const el = kontejnerRef.current;
    if (el === null || trasy.length === 0) return;
    let zruseno = false;
    let mapa: LeafletMapa | null = null;
    caryRef.current.clear();

    void (async (): Promise<void> => {
      try {
        await import("leaflet/dist/leaflet.css");
        const L = await import("leaflet");
        if (zruseno || kontejnerRef.current === null) return;

        const snizenyPohyb =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const instance = L.map(kontejnerRef.current, {
          center: VYCHOZI_STRED,
          zoom: VYCHOZI_ZOOM,
          zoomControl: false,
          attributionControl: true,
          keyboard: true,
          scrollWheelZoom: false,
          // Na dotyku jeden prst posouvá stránku; mapa se hýbe až po přiblížení.
          dragging: !L.Browser.mobile,
          fadeAnimation: !snizenyPohyb,
          zoomAnimation: !snizenyPohyb,
        });
        mapa = instance;
        mapaRef.current = instance;

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(instance);

        for (const trasa of trasy) {
          const cara = L.polyline(
            trasa.body.map((b) => [b.lat, b.lng] as [number, number]),
            {
              ...stylCary(trasa.id === aktivniIdRef.current),
              lineJoin: "round",
              lineCap: "round",
            },
          );
          // XSS obrana: název trasy je uživatelský vstup — přes
          // `textContent` se nikdy nepropíše jako HTML.
          const popisek = document.createElement("div");
          popisek.textContent = popisekTrasy(trasa);
          popisek.style.whiteSpace = "nowrap";
          popisek.style.overflow = "hidden";
          popisek.style.textOverflow = "ellipsis";
          cara.bindTooltip(popisek, { sticky: true });
          cara.on("tooltipopen", () => {
            obarviPopisek(cara, trasa.id === aktivniIdRef.current);
          });
          cara.on("click", () => onVybratRef.current?.(trasa.id));
          cara.addTo(instance);
          caryRef.current.set(trasa.id, cara);
        }

        const hranice = slucHranice(trasy.map((t) => t.hranice));
        if (hranice !== null) {
          const vychozi = (plynule: boolean): void => {
            instance.fitBounds(
              [
                [hranice.jih, hranice.zapad],
                [hranice.sever, hranice.vychod],
              ],
              { padding: [24, 24], animate: plynule && !snizenyPohyb },
            );
          };
          vychoziPohledRef.current = vychozi;
          vychozi(false);
        }
        const zaklad = instance.getZoom();
        instance.on("zoomend", () => {
          const priblizeno = instance.getZoom() > zaklad;
          setOddaleno(!priblizeno);
          if (!L.Browser.mobile) return;
          if (priblizeno) instance.dragging.enable();
          else instance.dragging.disable();
        });
        // Kolečko přibližuje až po kliknutí do mapy, jinak by zastavilo posuv stránky.
        instance.on("click", () => instance.scrollWheelZoom.enable());
        instance.on("mouseout", () => instance.scrollWheelZoom.disable());
      } catch {
        if (!zruseno) setChybaMapy(true);
      }
    })();

    return () => {
      zruseno = true;
      mapa?.remove();
      mapaRef.current = null;
      caryRef.current.clear();
    };
  }, [trasy]);

  // Zvýraznění výběru bez remountu: jen `setStyle` nad živými křivkami.
  useEffect(() => {
    for (const [id, cara] of caryRef.current) {
      const jeVybrana = id === aktivniId;
      cara.setStyle(stylCary(jeVybrana));
      if (jeVybrana) cara.bringToFront?.();
      obarviPopisek(cara, jeVybrana);
    }
  }, [aktivniId]);

  // Vybraná trasa se na mapě ukáže celá.
  useEffect(() => {
    if (vybranaId === null) return;
    const trasa = trasy.find((t) => t.id === vybranaId);
    const mapa = mapaRef.current;
    if (trasa === undefined || mapa === null) return;
    const hranice: [[number, number], [number, number]] = [
      [trasa.hranice.jih, trasa.hranice.zapad],
      [trasa.hranice.sever, trasa.hranice.vychod],
    ];
    if (snizenyPohybUzivatele()) mapa.fitBounds(hranice, { padding: [32, 32], maxZoom: 13, animate: false });
    else mapa.flyToBounds(hranice, { padding: [32, 32], maxZoom: 13, duration: 0.7 });
  }, [vybranaId, trasy]);

  if (chybaMapy) {
    return (
      <div
        role="alert"
        className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-povrch-2 px-6 py-8 text-center min-[90rem]:min-h-[420px]"
      >
        <h2 className="font-sans text-[13px] font-semibold tracking-normal">
          Mapu se nepovedlo načíst
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-xs text-ink-3">
          Mapový balíček se nestáhl (typicky offline PWA). Zkontroluj připojení
          a zkus to znovu.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="nahled-press mt-3 min-h-[44px] min-w-[44px] rounded-[9px] border border-linka bg-povrch px-3 text-xs font-semibold text-mech"
        >
          Načíst znovu
        </button>
      </div>
    );
  }

  const pocet = trasy.length;
  const popisPoctu =
    pocet === 1 ? "1 trasa" : pocet >= 2 && pocet <= 4 ? `${pocet} trasy` : `${pocet} tras`;

  const nejdelsi = trasy.reduce((max, t) => Math.max(max, t.km ?? 0), 0);

  return (
    <section aria-label={popisekMapy} className="flex flex-col gap-2.5 text-left">
      <div className="relative">
        <div
          ref={kontejnerRef}
          role="application"
          aria-label={`Interaktivní mapa: ${popisPoctu}, celkem ${formatKmZaokrouhlene(kmCelkem)}`}
          className={`heatmapa-plocha ${VYSKA_MAPY} w-full rounded-xl bg-povrch-2`}
        />
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <OvladaciTlacitko ikona="plus" popisek="Přiblížit mapu" onClick={() => mapaRef.current?.zoomIn()} />
          <OvladaciTlacitko ikona="minus" popisek="Oddálit mapu" onClick={() => mapaRef.current?.zoomOut()} />
          {oddaleno ? null : (
            <OvladaciTlacitko ikona="scan" popisek="Zobrazit všechny trasy" onClick={() => vychoziPohledRef.current(true)} />
          )}
        </div>
      </div>
      <p role="status" className="text-xs text-mech">
        {vybrana !== undefined
          ? `${popisekTrasy(vybrana)}${vybrana.km !== null ? ` · ${formatKmZaokrouhlene(vybrana.km)}` : ""}`
          : `${popisPoctu}${nejdelsi > 0 ? `, nejdelší ${formatKmZaokrouhlene(nejdelsi)}` : ""}`}
      </p>
    </section>
  );
}

/** Tlačítko nad mapou: 30 px jako v modálech, dotyková plocha 44 px. */
function OvladaciTlacitko({
  ikona,
  popisek,
  onClick,
}: {
  ikona: NazevIkony;
  popisek: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={popisek}
      title={popisek}
      onClick={onClick}
      className="bez-prejeti relative inline-flex size-[30px] items-center justify-center rounded-[9px] border border-linka bg-povrch text-mech shadow-jemny before:absolute before:-inset-x-2 before:-inset-y-[3px] before:content-[''] hover:bg-povrch-2 hover:text-inkoust min-h-[30px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
    >
      <Ikona nazev={ikona} className="size-[15px]" />
    </button>
  );
}
