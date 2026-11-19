import { useEffect, useState, type JSX } from "react";
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

  const titulek = krok === "vyber" ? "Ruční zápis" : "Kilometry k výpravě";

  return (
    <SpodniSheet otevreno={otevreno} titulek={titulek} onZavrit={zavrit}>
      {krok === "vyber" && (
        <>
          <p className="text-sm leading-relaxed text-mech">
            Vyber proběhlou výpravu, ke které chceš zapsat kilometry ručně.
          </p>
          {aktivity.length === 0 ? (
            <p role="status" className="mt-3 text-sm text-mech">
              Zatím nemáš žádnou absolvovanou výpravu v datech.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {aktivity.map((aktivita) => (
                <li key={aktivita.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVybrana(aktivita);
                      setKrok("formular");
                    }}
                    className="nahled-press flex min-h-11 w-full flex-col items-start rounded-[14px] border border-linka bg-povrch px-3.5 py-2.5 text-left"
                  >
                    <span className="text-sm font-semibold text-inkoust">{nazevAktivity(aktivita)}</span>
                    {typeof aktivita.datum === "string" && aktivita.datum.length > 0 && (
                      <span className="mt-0.5 text-xs text-mech">{aktivita.datum}</span>
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
          <p className="text-sm font-semibold text-inkoust">{nazevAktivity(vybrana)}</p>
          <p className="mt-1 text-xs text-mech">Doplň kilometry a převýšení z této výpravy.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-inkoust">
              Kilometry
              <input
                type="text"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="např. 12,5"
                className="min-h-11 rounded-xl border border-pole bg-papir px-3 text-base font-normal text-inkoust"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-inkoust">
              Převýšení (m)
              <input
                type="text"
                inputMode="numeric"
                value={prevyseni}
                onChange={(e) => setPrevyseni(e.target.value)}
                placeholder="např. 350"
                className="min-h-11 rounded-xl border border-pole bg-papir px-3 text-base font-normal text-inkoust"
              />
            </label>
          </div>
          <div className={`${PATICKA_SHEETU} mt-4`}>
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
          {chyba !== null && (
            <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
              {chyba}
            </p>
          )}
        </>
      )}
    </SpodniSheet>
  );
}