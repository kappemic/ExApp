import { useEffect, useState, type JSX } from "react";
import SpodniSheet, { NADPIS_ODDILU_PANELU, PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import Ikona from "../Ikona";
import { formatCelyDatum } from "../../lib/expedition-utils";
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
  /** Datum výpravy YYYY-MM-DD, když ho volající zná. */
  datumVypravy?: string | null;
  onZavrit: () => void;
  onSparovano?: () => void;
}

function formatDatum(datum: string): string {
  const cas = Date.parse(datum);
  if (Number.isNaN(cas)) return datum;
  return new Date(cas).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
  });
}

export default function SparovatAktivituSheet({
  otevreno,
  expeditionId,
  nazevVypravy,
  datumVypravy = null,
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
    <SpodniSheet
      otevreno={otevreno}
      titulek="Spárovat aktivitu"
      podtitul={
        datumVypravy !== null && datumVypravy.length >= 10
          ? `${nazevVypravy} · ${formatCelyDatum(datumVypravy.slice(0, 10))}`
          : nazevVypravy
      }
      sirka={520}
      onZavrit={onZavrit}
    >
      <p className={NADPIS_ODDILU_PANELU}>Aktivity ze Stravy</p>

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
        <ul role="radiogroup" aria-label="Aktivity ze Stravy" className="mt-[18px] flex flex-col gap-[18px] min-[90rem]:mt-3.5 min-[90rem]:gap-3.5">
          {navrhy.map((navrh) => {
            const vybrana = vybranaId === navrh.id;
            return (
              <li key={navrh.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={vybrana}
                  onClick={() => setVybranaId(navrh.id)}
                  className={`bez-prejeti flex w-full items-center gap-2.5 rounded-[14px] border p-3.5 text-left transition-colors motion-reduce:transition-none min-[90rem]:rounded-[10px] min-[90rem]:px-[11px] min-[90rem]:py-2.5 ${
                    vybrana
                      ? "border-transparent bg-mlha min-[90rem]:border-smrk"
                      : "border-linka bg-papir hover:bg-povrch-2 min-[90rem]:border-transparent min-[90rem]:bg-povrch-2"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`hidden size-4 shrink-0 items-center justify-center rounded-full min-[90rem]:flex ${vybrana ? "bg-smrk" : "border border-pole"}`}
                  >
                    {vybrana ? <span className="size-1.5 rounded-full bg-povrch" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 min-[90rem]:gap-px">
                    <span className="text-sm font-semibold text-inkoust min-[90rem]:text-[12.5px]">{navrh.nazev}</span>
                    <span className="text-[12.5px] text-mech min-[90rem]:text-[11px] min-[90rem]:text-ink-3">
                      {formatDatum(navrh.datum)} · {formatKmNaDesetinu(navrh.km)} · {String(navrh.prevyseniM)} m
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {faze === "hotovo" && navrhy.length > 0 ? (
        <p className="mt-3.5 hidden gap-2 rounded-[10px] bg-akcent-100 p-[11px] text-[11px] leading-[15px] text-[#7a3a1b] min-[90rem]:flex">
          <Ikona nazev="info" className="size-[13px] text-akcent" />
          Započítá se všem účastníkům.
        </p>
      ) : null}

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
        <div className={PATICKA_SHEETU}>
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