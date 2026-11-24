import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from "react";
import {
  cilovaVyskaRadku,
  slozRadkyFotek,
  FOTKY_RADEK_ZLOM_PX,
  type DlazdiceRadku,
} from "../../lib/fotky-radky";
import { pomerZRozmeru } from "../../lib/fotky-rozmery";

/** Rows kept eager so the first screen is not deferred. One more row on desktop. */
const VIDITELNE_RADKY_MOBIL = 4;
const VIDITELNE_RADKY_DESKTOP = 5;

/** Řady alba: počítač střídá 2 fotky (300 px) a 3 fotky (220 px), tablet má tři, telefon dvě. */
function radkyAlba(
  fotky: readonly { id: string }[],
  sirka: number,
): Array<{ dlazdice: DlazdiceRadku[] }> {
  if (sirka <= 0) return [];
  const pocitac = sirka >= 900;
  const mezera = pocitac ? 14 : 8;
  const vzor = pocitac ? [{ pocet: 2, vyska: 300 }, { pocet: 3, vyska: 220 }] : sirka >= 600
      ? [{ pocet: 3, vyska: 180 }]
      : [{ pocet: 2, vyska: 152 }];
  const vysledek: Array<{ dlazdice: DlazdiceRadku[] }> = [];
  for (let od = 0, rada = 0; od < fotky.length; rada += 1) {
    const { pocet, vyska } = vzor[rada % vzor.length] ?? { pocet: 2, vyska: 152 };
    const kus = fotky.slice(od, od + pocet);
    const sloupcu = pocitac ? kus.length : pocet;
    const sirkaDlazdice = Math.floor((sirka - mezera * (sloupcu - 1)) / sloupcu);
    vysledek.push({ dlazdice: kus.map((fotka) => ({ id: fotka.id, sirka: sirkaDlazdice, vyska })) });
    od += pocet;
  }
  return vysledek;
}

interface FotkyRadkovaMrizkaProps<
  T extends { id: string; sirka?: number | null; vyska?: number | null },
> {
  fotky: readonly T[];
  className?: string;
  /**
   * Vzhled podle ExApp.pen (album): mezery 8 / 14 px, rohy 14 px, řady po dvou a třech.
   * Bez něj zůstanou dlaždice od kraje ke kraji s 2px mezerou.
   */
  karty?: boolean;
  render: (
    fotka: T,
    rozmer: DlazdiceRadku,
    nahlasRozmer: (sirka: number, vyska: number) => void,
  ) => JSX.Element;
}

/**
 * Edge-to-edge photo rows. Tiles keep the measured aspect ratio,
 * sit 2px apart, and carry no frame of their own.
 */
export default function FotkyRadkovaMrizka<
  T extends { id: string; sirka?: number | null; vyska?: number | null },
>({
  fotky,
  className = "",
  karty = false,
  render,
}: FotkyRadkovaMrizkaProps<T>): JSX.Element {
  const obalRef = useRef<HTMLDivElement>(null);
  const [sirka, setSirka] = useState(0);
  const [pomery, setPomery] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const prvek = obalRef.current;
    if (prvek === null) return;
    const nastav = (hodnota: number): void => {
      const cela = Math.floor(hodnota);
      setSirka((predchozi) => (predchozi === cela ? predchozi : cela));
    };
    nastav(prvek.getBoundingClientRect().width);
    const mereni = new ResizeObserver((zaznamy) => {
      nastav(zaznamy[0]?.contentRect.width ?? 0);
    });
    mereni.observe(prvek);
    return () => {
      mereni.disconnect();
    };
  }, []);

  const nahlasRozmer = useCallback((id: string, prirozenaSirka: number, prirozenaVyska: number) => {
    if (prirozenaSirka <= 0 || prirozenaVyska <= 0) return;
    const pomer = prirozenaSirka / prirozenaVyska;
    setPomery((predchozi) => {
      const stary = predchozi[id];
      if (stary !== undefined && Math.abs(stary - pomer) < 0.01) return predchozi;
      return { ...predchozi, [id]: pomer };
    });
  }, []);

  const radky = useMemo(
    () =>
      slozRadkyFotek(
        fotky.map((fotka) => ({
          id: fotka.id,
          pomer: pomery[fotka.id] ?? pomerZRozmeru(fotka.sirka, fotka.vyska),
        })),
        sirka,
        cilovaVyskaRadku(sirka),
      ),
    [fotky, pomery, sirka],
  );
  // Album podle ExApp.pen: pevné řady bez ohledu na poměr stran.
  const radkyKaret = useMemo(() => (karty ? radkyAlba(fotky, sirka) : []), [fotky, karty, sirka]);

  const podleId = useMemo(() => {
    const mapa = new Map<string, T>();
    for (const fotka of fotky) mapa.set(fotka.id, fotka);
    return mapa;
  }, [fotky]);

  const viditelneRadky = sirka >= FOTKY_RADEK_ZLOM_PX ? VIDITELNE_RADKY_DESKTOP : VIDITELNE_RADKY_MOBIL;

  return (
    <div ref={obalRef} className={`min-w-0 ${className.length > 0 ? className : "w-full"}`}>
      <ul className={`m-0 flex list-none flex-wrap p-0 ${karty ? (sirka >= 900 ? "gap-[14px]" : "gap-2") : "gap-[2px]"}`}>
        {(karty ? radkyKaret : radky).map((radek, indexRadku) =>
          radek.dlazdice.map((dlazdice) => {
            const fotka = podleId.get(dlazdice.id);
            if (fotka === undefined) return null;
            const odlozit = indexRadku >= viditelneRadky;
            const styl: CSSProperties = {
              width: dlazdice.sirka,
              height: dlazdice.vyska,
            };
            if (odlozit) {
              styl.contentVisibility = "auto";
              styl.containIntrinsicSize = `auto ${dlazdice.sirka}px auto ${dlazdice.vyska}px`;
            }
            return (
              <li
                key={dlazdice.id}
                className={`relative shrink-0 overflow-hidden ${karty ? "rounded-[14px] after:pointer-events-none after:absolute after:inset-0 after:rounded-[14px] after:border after:border-black/[0.08]" : ""}`}
                style={styl}
              >
                {render(fotka, dlazdice, (prirozenaSirka, prirozenaVyska) => {
                  nahlasRozmer(dlazdice.id, prirozenaSirka, prirozenaVyska);
                })}
              </li>
            );
          }),
        )}
      </ul>
    </div>
  );
}
