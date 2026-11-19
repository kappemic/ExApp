import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import SpodniSheet from "../shell/SpodniSheet";
import { isoCasNaEvropsky } from "../../lib/evropsky-cas";
import { formatCelyDatum } from "../../lib/expedition-utils";
import { vyskytySchuzky } from "../../lib/kalendar";
import type { RozsahMazaniSchuzky } from "../../shared/api-types";
import type { ApiSchuzka } from "../../shared/api-types";
import ConfirmDialog from "./ConfirmDialog";

interface SchuzkaDetailSheetProps {
  schuzka: ApiSchuzka;
  /** Selected calendar day YMD for this occurrence. */
  datumVyskytu: string;
  otevreno: boolean;
  rok: number;
  mesic: number;
  muzeSpravovat: boolean;
  mazeSeSchuzka: string | null;
  chybaMazani?: string | null;
  onZavrit: () => void;
  onUpravit: (schuzka: ApiSchuzka) => void;
  onSmazatSchuzku: (
    id: string,
    rozsah: RozsahMazaniSchuzky | null,
    datum?: string,
  ) => void;
}

interface KeSmazani {
  id: string;
  nazev: string;
}

/**
 * Meeting detail sheet (pen DmIC6). Day events stay inline under the calendar;
 * this sheet is only for a single schůzka.
 */
export default function UdalostModal(props: SchuzkaDetailSheetProps): JSX.Element {
  const {
    schuzka,
    datumVyskytu,
    otevreno,
    rok,
    mesic,
    muzeSpravovat,
    mazeSeSchuzka,
    chybaMazani,
    onZavrit,
    onUpravit,
    onSmazatSchuzku,
  } = props;

  const [kPotvereni, setKPotvereni] = useState<KeSmazani | null>(null);
  const [rozsah, setRozsah] = useState<RozsahMazaniSchuzky | null>(null);
  const spoustecRef = useRef<HTMLButtonElement | null>(null);
  const mazaloSeRef = useRef<boolean>(false);

  useEffect(() => {
    if (kPotvereni === null) return;
    if (kPotvereni.id === schuzka.id && mazeSeSchuzka === null && mazaloSeRef.current) {
      mazaloSeRef.current = false;
      if (chybaMazani !== null && chybaMazani !== undefined) return;
      setKPotvereni(null);
      spoustecRef.current = null;
    }
  }, [kPotvereni, mazeSeSchuzka, chybaMazani, schuzka.id]);

  useEffect(() => {
    if (!otevreno) {
      setKPotvereni(null);
      spoustecRef.current = null;
    }
  }, [otevreno]);

  const casText =
    schuzka.cas !== null && schuzka.cas !== undefined && schuzka.cas.length > 0
      ? isoCasNaEvropsky(schuzka.cas)
      : "Celý den";
  const mistnost = schuzka.mistnost?.trim() ?? "";
  const podtitul = [casText, mistnost.length > 0 ? mistnost : null]
    .filter((cast): cast is string => cast !== null && cast.length > 0)
    .join(" · ");

  const opakovaniText =
    schuzka.opakovani === "tydenni" ? "Každý týden" : "Jednorázově";

  const dalsiTerminy = useMemo(() => {
    if (schuzka.opakovani !== "tydenni") return [];
    const vynech = new Set(schuzka.vynecheneVyskyty ?? []);
    const vyskyty: string[] = [];
    for (let m = mesic; m <= mesic + 2; m += 1) {
      const rokProMesic = m > 12 ? rok + Math.floor((m - 1) / 12) : rok;
      const mesicNorm = ((m - 1) % 12) + 1;
      for (const ymd of vyskytySchuzky(schuzka, rokProMesic, mesicNorm)) {
        if (vynech.has(ymd) || ymd === datumVyskytu) continue;
        if (ymd >= datumVyskytu && !vyskyty.includes(ymd)) vyskyty.push(ymd);
      }
    }
    return vyskyty.slice(0, 8);
  }, [schuzka, rok, mesic, datumVyskytu]);

  return (
    <>
      <SpodniSheet otevreno={otevreno} titulek={schuzka.nazev} onZavrit={onZavrit}>
        <div className="space-y-4 pb-2">
          <p className="text-sm text-mech">{podtitul}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            <dt className="text-mech">Kdy</dt>
            <dd className="m-0 font-medium text-inkoust">
              {formatCelyDatum(datumVyskytu)}
              {casText !== "Celý den" ? ` · ${casText}` : null}
            </dd>
            <dt className="text-mech">Opakování</dt>
            <dd className="m-0 font-medium text-inkoust">{opakovaniText}</dd>
            <dt className="text-mech">Místo</dt>
            <dd className="m-0 font-medium text-inkoust">
              {mistnost.length > 0 ? mistnost : "Venku"}
            </dd>
          </dl>
          {schuzka.popis.trim().length > 0 ? (
            <p className="rounded-2xl border border-linka bg-papir px-4 py-3 text-sm text-inkoust">
              {schuzka.popis}
            </p>
          ) : null}
          {dalsiTerminy.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-mech">
                Další termíny
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {dalsiTerminy.map((ymd) => (
                  <li key={ymd}>
                    <span className="inline-flex min-h-9 items-center rounded-full border border-pole bg-papir px-3 text-xs font-semibold tabular-nums text-inkoust">
                      {formatCelyDatum(ymd)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {muzeSpravovat ? (
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <button
                type="button"
                ref={spoustecRef}
                disabled={mazeSeSchuzka === schuzka.id}
                onClick={() => {
                  setRozsah(schuzka.opakovani === "tydenni" ? "rada" : null);
                  setKPotvereni({ id: schuzka.id, nazev: schuzka.nazev });
                }}
                title={mazeSeSchuzka === schuzka.id ? "Mažu…" : `Zrušit termín schůzky ${schuzka.nazev}`}
                aria-label={mazeSeSchuzka === schuzka.id ? "Mažu…" : `Zrušit termín schůzky ${schuzka.nazev}`}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-red-800/40 bg-papir px-4 text-sm font-semibold text-red-900 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60"
              >
                {mazeSeSchuzka === schuzka.id ? "Mažu…" : "Zrušit termín"}
              </button>
              <button
                type="button"
                onClick={() => onUpravit(schuzka)}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-smrk px-4 text-sm font-semibold text-papir hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk"
              >
                Upravit
              </button>
            </div>
          ) : null}
        </div>
      </SpodniSheet>
      {kPotvereni !== null ? (
        <ConfirmDialog
          otevreno
          nadpis="Odebrat schůzku?"
          popis={`Opravdu odebrat schůzku „${kPotvereni.nazev}“ ze dne ${formatCelyDatum(datumVyskytu)}? Tahle akce nejde vzít zpět.`}
          potvrditPopisek="Ano, odebrat"
          zrusitPopisek="Ponechat"
          probiha={mazeSeSchuzka === kPotvereni.id}
          probihaPopisek="Mažu…"
          rozsah={rozsah}
          onZmenaRozsahu={(novy: RozsahMazaniSchuzky) => setRozsah(novy)}
          chyba={chybaMazani ?? null}
          navratElement={spoustecRef.current}
          onPotvrdit={() => {
            mazaloSeRef.current = true;
            const datum = datumVyskytu;
            onSmazatSchuzku(
              kPotvereni.id,
              rozsah ?? "rada",
              rozsah === "vyskyt" ? datum : undefined,
            );
          }}
          onZrusit={() => {
            setKPotvereni(null);
            spoustecRef.current = null;
          }}
        />
      ) : null}
    </>
  );
}