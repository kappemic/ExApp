import { useEffect, useState, type JSX } from "react";
import Ikona from "../Ikona";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import { formatCelyDatum } from "../../lib/expedition-utils";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import {
  ulozAktivituRucne,
  type RucniAktivitaVysledek,
} from "../../lib/expedice-aktivita";
import type { ApiAktivita } from "../../shared/api-types";

export interface RucniZapisSheetProps {
  otevreno: boolean;
  aktivity: readonly ApiAktivita[];
  onZavrit: () => void;
  onUlozeno?: () => void;
}

type Krok = "vyber" | "formular";

function nazevAktivity(aktivita: ApiAktivita): string {
  const nazev = (aktivita.nazev ?? "").trim();
  if (nazev.length > 0) return nazev;
  return aktivita.expeditionId;
}

function prvniChybaPole(vysledek: Extract<RucniAktivitaVysledek, { ok: false }>): string | null {
  const details = vysledek.details;
  if (details === undefined) return null;
  for (const pole of ["km", "prevyseniM"]) {
    const hlasky = details[pole];
    if (hlasky !== undefined && hlasky.length > 0) return hlasky[0] ?? null;
  }
  return null;
}

export default function RucniZapisSheet({
  otevreno,
  aktivity,
  onZavrit,
  onUlozeno,
}: RucniZapisSheetProps): JSX.Element {
  const [krok, setKrok] = useState<Krok>("vyber");
  const [vybrana, setVybrana] = useState<ApiAktivita | null>(null);
  const [km, setKm] = useState<string>("");
  const [prevyseni, setPrevyseni] = useState<string>("");
  const [ukladaSe, setUkladaSe] = useState<boolean>(false);
  const [chyba, setChyba] = useState<string | null>(null);

  useEffect(() => {
    if (!otevreno) return;
    setKrok("vyber");
    setVybrana(null);
    setKm("");
    setPrevyseni("");
    setChyba(null);
  }, [otevreno]);

  function zavrit(): void {
    onZavrit();
  }

  async function ulozit(): Promise<void> {
    if (vybrana === null) return;
    setUkladaSe(true);
    setChyba(null);
    const kmCislo = Number(km.trim().replace(",", "."));
    const prevyseniCislo =
      prevyseni.trim().length === 0 ? 0 : Number(prevyseni.trim().replace(",", "."));
    const vysledek = await ulozAktivituRucne(vybrana.expeditionId, {
      km: kmCislo,
      prevyseniM: Number.isFinite(prevyseniCislo) ? Math.round(prevyseniCislo) : 0,
    });
    setUkladaSe(false);
    if (!vysledek.ok) {
      setChyba(prvniChybaPole(vysledek) ?? vysledek.chyba);
      return;
    }
    onUlozeno?.();
    zavrit();
  }

  const podtitul =
    krok === "vyber" || vybrana === null
      ? "Vyber proběhlou výpravu, ke které zapíšeš kilometry."
      : nazevAktivity(vybrana);

  return (
    <SpodniSheet otevreno={otevreno} titulek="Ruční zápis" podtitul={podtitul} sirka={480} onZavrit={zavrit}>
      {krok === "vyber" && (
        <>
          {aktivity.length === 0 ? (
            <p role="status" className="text-[13.5px] text-mech">
              Zatím nemáš žádnou absolvovanou výpravu v datech.
            </p>
          ) : (
            <ul className="posuvnik flex max-h-72 flex-col gap-2 overflow-y-auto">
              {aktivity.map((aktivita) => (
                <li key={aktivita.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVybrana(aktivita);
                      setKrok("formular");
                    }}
                    className="bez-prejeti flex min-h-11 w-full flex-col items-start gap-1 rounded-[14px] border border-linka bg-papir p-3.5 text-left hover:bg-povrch-2 min-[90rem]:gap-px min-[90rem]:rounded-[10px] min-[90rem]:border-transparent min-[90rem]:bg-povrch-2 min-[90rem]:px-[11px] min-[90rem]:py-2.5"
                  >
                    <span className="text-sm font-semibold text-inkoust min-[90rem]:text-[12.5px]">{nazevAktivity(aktivita)}</span>
                    {typeof aktivita.datum === "string" && aktivita.datum.length > 0 && (
                      <span className="text-[12.5px] text-mech min-[90rem]:text-[11px] min-[90rem]:text-ink-3">{formatCelyDatum(aktivita.datum.slice(0, 10))}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {krok === "formular" && vybrana !== null && (
        <>
          <div className="flex flex-col gap-[18px] min-[90rem]:grid min-[90rem]:grid-cols-2 min-[90rem]:gap-3">
            <label className={`block ${POPISEK_POLE}`}>
              Kilometry
              <input
                type="text"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="např. 12,5"
                className={`mt-1.5 font-normal min-[90rem]:mt-[5px] ${POLE_FORMULARE}`}
              />
            </label>
            <label className={`block ${POPISEK_POLE}`}>
              Převýšení (m)
              <input
                type="text"
                inputMode="numeric"
                value={prevyseni}
                onChange={(e) => setPrevyseni(e.target.value)}
                placeholder="např. 350"
                className={`mt-1.5 font-normal min-[90rem]:mt-[5px] ${POLE_FORMULARE}`}
              />
            </label>
          </div>
          <p className="mt-3.5 hidden gap-2 rounded-[10px] bg-povrch-2 p-[11px] text-[11px] leading-[15px] text-mech min-[90rem]:flex">
            <Ikona nazev="info" className="size-[13px] text-ink-3" />
            Bez data a odkazu — jen když Strava chybí.
          </p>
          {chyba !== null && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-akcent">
              {chyba}
            </p>
          )}
          <div className={PATICKA_SHEETU}>
            <button
              type="button"
              onClick={() => {
                setKrok("vyber");
                setVybrana(null);
              }}
              className={TLACITKO_PATICKY_ZRUSIT}
            >
              Zpět
            </button>
            <button
              type="button"
              disabled={ukladaSe || km.trim().length === 0}
              onClick={() => void ulozit()}
              className={TLACITKO_PATICKY_HLAVNI}
            >
              {ukladaSe ? "Ukládám…" : "Uložit"}
            </button>
          </div>
        </>
      )}
    </SpodniSheet>
  );
}