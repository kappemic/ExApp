import type { JSX } from "react";
import { isoCasNaEvropsky } from "../../lib/evropsky-cas";
import { barvaVypravy, TRIDY_BARVY } from "../../lib/kalendar-barvy";
import {
  schuzkyDne,
  vypravyDne,
  type KalendarniUdalost,
  type PoziceVPasu,
} from "../../lib/kalendar";

export const DNY_V_TYDNU = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/** Kolik štítků (počítač) nebo proužků (telefon) se do buňky vejde, zbytek je „+N“. */
const MAX_STITKU = 3;

/**
 * Řádek zkratek dnů nad mřížkou. Telefon: 24 px, na střed.
 * Počítač: lišta 38 px v teplém odstínu, zkratky vlevo s prostrkáním.
 */
export function HlavickaDnu(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-7 min-[90rem]:h-[38px] min-[90rem]:border-b min-[90rem]:border-linka min-[90rem]:bg-[#fbf8ef]"
    >
      {DNY_V_TYDNU.map((den) => (
        <span
          key={den}
          className="flex h-6 items-center justify-center text-[11px] font-semibold uppercase text-ink-3 min-[90rem]:h-full min-[90rem]:justify-start min-[90rem]:px-3 min-[90rem]:text-[10.5px] min-[90rem]:font-bold min-[90rem]:tracking-[1.1px]"
        >
          {den}
        </span>
      ))}
    </div>
  );
}

function sklonujDny(pocet: number): string {
  if (pocet === 1) return "den";
  return pocet >= 2 && pocet <= 4 ? "dny" : "dní";
}

/** Okraje a zaoblení štítku podle pozice v pásu (pás navazuje přes sousední dny). */
function tvarStitku(pozice: PoziceVPasu): string {
  switch (pozice) {
    case "start":
      return "ml-2.5 rounded-l-md pr-2";
    case "middle":
      return "";
    case "end":
      return "mr-2.5 rounded-r-md";
    case "single":
      return "mx-2.5 rounded-md";
  }
}

function tvarProuzku(pozice: PoziceVPasu): string {
  switch (pozice) {
    case "start":
      return "rounded-l-[3px]";
    case "middle":
      return "";
    case "end":
      return "rounded-r-[3px]";
    case "single":
      return "mx-1 rounded-[3px]";
  }
}

/**
 * Buňka dne podle ExApp.pen, sdílená měsícem i týdnem.
 * Telefon: dlaždice 44 px, číslo a pod ním tečky (schůzka okrová, výprava
 * ve své barvě); vícedenní výpravy jsou tenké proužky, které navazují.
 * Vybraný den je olivový. Počítač (1440+): buňka 128 px, číslo vlevo
 * nahoře, pod ním štítky událostí s barevnou značkou; dnešek má teplý
 * podklad, terakotové číslo a tečku. Název události nese `aria-label`.
 */
export function DenKalendare({
  den,
  udalosti,
  pozicePro,
  vybrano,
  jeDnes,
  mimoMesic = false,
  zacatekRadku,
  label,
  onDen,
  datumVypravy,
  delkaVypravy,
}: {
  den: string;
  udalosti: ReadonlyArray<KalendarniUdalost>;
  /** Pozice dne v pásu dané výpravy. */
  pozicePro: (idVypravy: string) => PoziceVPasu;
  vybrano: boolean;
  jeDnes: boolean;
  mimoMesic?: boolean;
  /** Pondělí: název pásu se zopakuje i na začátku nového řádku. */
  zacatekRadku: boolean;
  label: string;
  onDen: (datum: string) => void;
  datumVypravy: (id: string) => string;
  /** Počet dní výpravy pro štítek „Beskydy · 3 dny“. */
  delkaVypravy?: (id: string) => number;
}): JSX.Element {
  // Stabilní pořadí: dřív začínající výprava nahoře, aby pásy nepřeskakovaly.
  const vypravy = [...vypravyDne(udalosti)].sort((a, b) => {
    const rozdil = datumVypravy(a.id).localeCompare(datumVypravy(b.id));
    return rozdil !== 0 ? rozdil : a.id.localeCompare(b.id);
  });
  const schuzky = schuzkyDne(udalosti);
  const cislo = Number(den.slice(8, 10));
  const pozice = new Map(vypravy.map((v) => [v.id, pozicePro(v.id)]));
  const maPas = vypravy.some((v) => pozice.get(v.id) !== "single");

  type Stitek = { klic: string; nazev: string; barva: keyof typeof TRIDY_BARVY; pozice: PoziceVPasu; popisek: boolean };
  const stitky: Stitek[] = [
    ...vypravy.map((v): Stitek => {
      const p = pozice.get(v.id) ?? "single";
      const delka = delkaVypravy?.(v.id) ?? 1;
      return {
        klic: `v-${v.id}`,
        nazev: delka > 1 ? `${v.nazev} · ${delka} ${sklonujDny(delka)}` : v.nazev,
        barva: barvaVypravy(v.id),
        pozice: p,
        popisek: p === "start" || p === "single" || zacatekRadku,
      };
    }),
    ...schuzky.map((s): Stitek => {
      const cas = isoCasNaEvropsky(s.cas ?? "");
      return {
        klic: `s-${s.id}`,
        nazev: cas.length > 0 ? `${cas} ${s.nazev}` : s.nazev,
        barva: "okr",
        pozice: "single",
        popisek: true,
      };
    }),
  ];
  const viditelne = stitky.slice(0, MAX_STITKU);
  const navic = stitky.length - viditelne.length;

  const barvaCisla = vybrano
    ? "text-papir font-bold"
    : jeDnes
      ? "text-akcent font-bold"
      : mimoMesic
        ? "text-[#b3b8a4] font-normal"
        : maPas
          ? "text-inkoust font-semibold"
          : "text-inkoust font-medium";

  const tecky = [
    ...vypravy.filter((v) => pozice.get(v.id) === "single").map((v) => TRIDY_BARVY[barvaVypravy(v.id)].tecka),
    ...schuzky.map(() => TRIDY_BARVY.okr.tecka),
  ].slice(0, 3);

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={vybrano}
      aria-current={jeDnes ? "date" : undefined}
      onClick={() => onDen(den)}
      className={`bez-prejeti relative flex min-h-11 min-w-0 flex-col tabular-nums transition-colors motion-reduce:transition-none [touch-action:pan-y] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk max-[90rem]:rounded-xl ${
        vybrano ? "max-[90rem]:bg-smrk" : "max-[90rem]:hover:bg-povrch-2"
      } min-[90rem]:h-32 min-[90rem]:gap-[5px] min-[90rem]:py-[9px] ${
        jeDnes
          ? "min-[90rem]:bg-[#f8e9df]"
          : vybrano
            ? "min-[90rem]:bg-povrch-2"
            : "min-[90rem]:bg-povrch min-[90rem]:hover:bg-povrch-2/60"
      }`}
    >
      {/* Telefon */}
      <span
        className={`flex h-full w-full flex-col items-center min-[90rem]:hidden ${
          maPas ? "justify-between gap-1 px-0.5 pb-[5px] pt-1" : "justify-center gap-[3px] py-1"
        }`}
      >
        <span className={`text-[13px] leading-none ${barvaCisla}`}>{cislo}</span>
        {maPas ? (
          <span aria-hidden="true" className="flex w-full flex-col gap-0.5">
            {vypravy.slice(0, MAX_STITKU).map((v) => (
              <span
                key={v.id}
                className={`block h-[5px] ${tvarProuzku(pozice.get(v.id) ?? "single")} ${
                  vybrano ? "bg-papir/70" : TRIDY_BARVY[barvaVypravy(v.id)].podklad
                }`}
              />
            ))}
          </span>
        ) : (
          <span aria-hidden="true" className="flex h-1 items-center gap-[3px]">
            {tecky.map((tecka, i) => (
              <span key={i} className={`block size-1 rounded-full ${vybrano ? "bg-papir" : tecka}`} />
            ))}
          </span>
        )}
      </span>

      {/* Počítač */}
      <span className="hidden h-5 shrink-0 items-center justify-between px-2.5 min-[90rem]:flex">
        <span className={`text-sm leading-none ${vybrano ? (jeDnes ? "text-akcent font-bold" : "text-inkoust font-semibold") : barvaCisla}`}>
          {cislo}
        </span>
        {jeDnes ? <span aria-hidden="true" className="block size-[5px] rounded-full bg-akcent" /> : null}
      </span>
      {viditelne.length > 0 ? (
        <span aria-hidden="true" className="hidden w-full min-w-0 flex-col gap-[5px] min-[90rem]:flex">
          {viditelne.map((s) => {
            const tridy = TRIDY_BARVY[s.barva];
            return (
              <span
                key={s.klic}
                className={`flex h-5 min-w-0 items-center gap-[5px] px-1.5 ${tvarStitku(s.pozice)} ${tridy.podklad}`}
              >
                {s.popisek ? (
                  <>
                    <span className={`block h-2.5 w-[3px] shrink-0 rounded-sm ${tridy.znacka}`} />
                    <span className={`min-w-0 truncate text-left text-[10.5px] font-semibold leading-none tracking-[0.1px] ${tridy.text}`}>
                      {s.nazev}
                    </span>
                  </>
                ) : null}
              </span>
            );
          })}
          {navic > 0 ? (
            <span className="px-2.5 text-left text-[10.5px] font-semibold leading-none text-mech">+{navic}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
