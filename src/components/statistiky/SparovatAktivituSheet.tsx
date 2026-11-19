import { useEffect, useState, type JSX } from "react";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import Ikona from "../Ikona";
import { formatKmNaDesetinu } from "../../lib/format-cisla";
import {
  druhStravaChyby,
  jeStravaNedostupnaVetev,
  muzeOpakovatStravaChybu,
  nactiNeparovaneAktivity,
  sparujAktivitu,
  type NeparovanaAktivita,
} from "../../lib/strava-api";
import type { ApiErrorCode } from "../../shared/api-types";

export interface SparovatAktivituSheetProps {
  otevreno: boolean;
  expeditionId: string;
  nazevVypravy: string;
  onZavrit: () => void;
  onSparovano?: () => void;
}

function formatDatum(datum: string): string {
  const cas = Date.parse(datum);
  if (Number.isNaN(cas)) return datum;
  return new Date(cas).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export default function SparovatAktivituSheet({
  otevreno,
  expeditionId,
  nazevVypravy,
  onZavrit,
  onSparovano,
}: SparovatAktivituSheetProps): JSX.Element {
  const [faze, setFaze] = useState<"nacitani" | "hotovo" | "chyba">("nacitani");
  const [navrhy, setNavrhy] = useState<NeparovanaAktivita[]>([]);
  const [chyba, setChyba] = useState<string | null>(null);
  const [kodChyby, setKodChyby] = useState<ApiErrorCode | null>(null);
  const [potvrzujeSe, setPotvrzujeSe] = useState<string | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [vybranaId, setVybranaId] = useState<string | null>(null);

  useEffect(() => {
    if (!otevreno) return;
    let zije = true;
    void (async (): Promise<void> => {
      setFaze("nacitani");
      setChyba(null);
      setKodChyby(null);
      setZprava(null);
      const vysledek = await nactiNeparovaneAktivity({ page: 1, per_page: 30 });
      if (!zije) return;
      if (!vysledek.ok) {
        setFaze("chyba");
        setChyba(vysledek.chyba);
        setKodChyby(vysledek.kod ?? null);
        return;
      }
      setNavrhy(vysledek.data.aktivity);
      setVybranaId(vysledek.data.aktivity[0]?.id ?? null);
      setFaze("hotovo");
    })();
    return () => {
      zije = false;
    };
  }, [otevreno, expeditionId]);

  async function potvrdit(aktivita: NeparovanaAktivita): Promise<void> {
    setPotvrzujeSe(aktivita.id);
    setChyba(null);
    setZprava(null);
    const vysledek = await sparujAktivitu(expeditionId, aktivita.id);
    setPotvrzujeSe(null);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      setKodChyby(vysledek.kod ?? null);
      return;
    }
    setZprava(
      `Spárováno: ${formatKmNaDesetinu(aktivita.km)} · +${String(aktivita.prevyseniM)} m.`,
    );
    onSparovano?.();
    window.setTimeout(() => onZavrit(), 900);
  }

  function obsahChyby(text: string, kod: ApiErrorCode | null): JSX.Element {
    const druh = druhStravaChyby(kod === null ? undefined : kod);
    if (jeStravaNedostupnaVetev(kod === null ? undefined : kod)) {
      return (
        <p role="alert" className="text-sm text-inkoust">
          {text}{" "}
          <a href="/profil?tab=strava" className="font-semibold underline underline-offset-2">
            Propoj Stravu v profilu
          </a>
          .
        </p>
      );
    }
    if (druh === "neprihlasen") {
      return (
        <p role="alert" className="text-sm text-inkoust">
          {text}{" "}
          <a href="/login" className="font-semibold underline underline-offset-2">
            Přihlas se
          </a>
          .
        </p>
      );
    }
    return <p role="alert" className="text-sm text-inkoust">{text}</p>;
  }

  return (
    <SpodniSheet otevreno={otevreno} titulek="Spárovat aktivitu" onZavrit={onZavrit}>
      <p className="text-sm leading-relaxed text-mech">{nazevVypravy}</p>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-mech">Aktivity ze Stravy</p>

      {faze === "nacitani" && (
        <p role="status" className="mt-3 text-sm text-mech">
          Hledám nepárované aktivity…
        </p>
      )}

      {faze === "chyba" && chyba !== null && (
        <div className="mt-3">{obsahChyby(chyba, kodChyby)}</div>
      )}

      {faze === "hotovo" && navrhy.length === 0 && (
        <p role="status" className="mt-3 text-sm text-mech">
          Žádná nepárovaná aktivita — propoj Stravu v profilu, nebo zkus obnovit později.
        </p>
      )}

      {faze === "hotovo" && navrhy.length > 0 && (
        <ul role="radiogroup" aria-label="Aktivity ze Stravy" className="mt-2.5 flex flex-col gap-2">
          {navrhy.map((navrh) => {
            const vybrana = vybranaId === navrh.id;
            return (
              <li key={navrh.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={vybrana}
                  onClick={() => setVybranaId(navrh.id)}
                  className={`nahled-press flex w-full items-center gap-3 rounded-[14px] border p-3.5 text-left transition-colors motion-reduce:transition-none ${
                    vybrana ? "border-smrk/30 bg-mlha" : "border-linka bg-povrch hover:bg-povrch-2"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-inkoust">{navrh.nazev}</span>
                    <span className="mt-1 block text-[12.5px] tabular-nums text-mech">
                      {formatDatum(navrh.datum)} · {formatKmNaDesetinu(navrh.km)} · +{String(navrh.prevyseniM)} m
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${vybrana ? "border-smrk bg-smrk text-papir" : "border-pole"}`}
                  >
                    {vybrana ? <Ikona nazev="check" className="size-3" tloustka={3} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {zprava !== null && (
        <p role="status" className="mt-3 text-sm font-semibold text-inkoust">
          {zprava}
        </p>
      )}

      {chyba !== null && faze === "hotovo" && (
        <div className="mt-3">
          {obsahChyby(chyba, kodChyby)}
          {muzeOpakovatStravaChybu(kodChyby ?? undefined) && (
            <button
              type="button"
              onClick={() => {
                setFaze("nacitani");
                void nactiNeparovaneAktivity({ page: 1, per_page: 30 }).then((vysledek) => {
                  if (!vysledek.ok) {
                    setFaze("chyba");
                    setChyba(vysledek.chyba);
                    return;
                  }
                  setNavrhy(vysledek.data.aktivity);
                  setFaze("hotovo");
                  setChyba(null);
                });
              }}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-pole bg-povrch px-4 text-sm font-semibold text-inkoust"
            >
              Zkusit znovu
            </button>
          )}
        </div>
      )}
      {faze === "hotovo" && navrhy.length > 0 ? (
        <div className={`${PATICKA_SHEETU} mt-4`}>
          <button type="button" onClick={onZavrit} className={TLACITKO_PATICKY_ZRUSIT}>
            Zrušit
          </button>
          <button
            type="button"
            disabled={potvrzujeSe !== null || vybranaId === null}
            onClick={() => {
              const navrh = navrhy.find((n) => n.id === vybranaId);
              if (navrh !== undefined) void potvrdit(navrh);
            }}
            className={TLACITKO_PATICKY_HLAVNI}
          >
            {potvrzujeSe !== null ? "Páruji…" : "Spárovat"}
          </button>
        </div>
      ) : null}
    </SpodniSheet>
  );
}