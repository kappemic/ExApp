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

/* Album jako v Google Fotkách: řady na celou šířku, fotky v původním poměru a úzké mezery. */
const ALBUM_MEZERA_PX = 4;
const ALBUM_RADEK_TELEFON_PX = 180;
const ALBUM_RADEK_TABLET_PX = 220;
const ALBUM_RADEK_POCITAC_PX = 260;
const ALBUM_POCITAC_PX = 900;

function vyskaRadkuAlba(sirka: number): number {
  if (sirka >= ALBUM_POCITAC_PX) return ALBUM_RADEK_POCITAC_PX;
  return sirka >= FOTKY_RADEK_ZLOM_PX ? ALBUM_RADEK_TABLET_PX : ALBUM_RADEK_TELEFON_PX;
}

interface FotkyRadkovaMrizkaProps<
  T extends { id: string; sirka?: number | null; vyska?: number | null },
> {
  fotky: readonly T[];
  className?: string;
  /**
   * Stěna alba: vyšší řady, mezery 4 px a zaoblený jen vnější obrys.
   * Bez něj zůstanou dlaždice od kraje ke kraji s 2px mezerou.
   */
  album?: boolean;
  render: (
    fotka: T,
    rozmer: DlazdiceRadku,
    nahlasRozmer: (sirka: number, vyska: number) => void,
  ) => JSX.Element;
}

/**
 * Justified photo rows. Tiles keep the measured aspect ratio
 * and carry no frame of their own.
 */
export default function FotkyRadkovaMrizka<
  T extends { id: string; sirka?: number | null; vyska?: number | null },
>({
  fotky,
  className = "",
  album = false,
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
        album ? vyskaRadkuAlba(sirka) : cilovaVyskaRadku(sirka),
        album ? ALBUM_MEZERA_PX : undefined,
      ),
    [fotky, album, pomery, sirka],
  );

  const podleId = useMemo(() => {
    const mapa = new Map<string, T>();
    for (const fotka of fotky) mapa.set(fotka.id, fotka);
    return mapa;
  }, [fotky]);

  const viditelneRadky = sirka >= FOTKY_RADEK_ZLOM_PX ? VIDITELNE_RADKY_DESKTOP : VIDITELNE_RADKY_MOBIL;

  return (
    <div ref={obalRef} className={`min-w-0 ${className.length > 0 ? className : "w-full"}`}>
      <ul className={`m-0 flex list-none flex-wrap p-0 ${album ? "gap-1 overflow-hidden rounded-2xl" : "gap-[2px]"}`}>
        {radky.map((radek, indexRadku) =>
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
                className="relative shrink-0 overflow-hidden"
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
