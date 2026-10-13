import { useId, useState, type FormEvent, type JSX } from "react";
import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type OpakovaniSchuzky,
  type UpravitSchuzkuRequest,
  type VytvoritSchuzkuRequest,
} from "../../shared/api-types";
import type { ChybySchuzky } from "../../lib/schuzky-api";

export interface SchuzkaFormVychozi {
  nazev: string;
  datum: string;
  mistnost: string | null;
  popis: string;
  opakovani: OpakovaniSchuzky;
}

interface SchuzkaFormProps {
  nadpis: string;
  odeslatPopisek: string;
  vychozi?: SchuzkaFormVychozi | null;
  odesilaSe: boolean;
  serverChyba: string | null;
  serverChybyPoli: ChybySchuzky;
  onSubmit: (payload: VytvoritSchuzkuRequest | UpravitSchuzkuRequest) => void;
  onZrusit: () => void;
}

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function jeRealneDatum(hodnota: string): boolean {
  const casti = hodnota.split("-").map(Number);
  const rok = casti[0];
  const mesic = casti[1];
  const den = casti[2];
  if (
    rok === undefined ||
    mesic === undefined ||
    den === undefined ||
    !Number.isInteger(rok) ||
    !Number.isInteger(mesic) ||
    !Number.isInteger(den)
  )
    return false;
  if (mesic < 1 || mesic > 12 || den < 1 || den > 31) return false;
  const overeni = new Date(Date.UTC(rok, mesic - 1, den));
  return (
    overeni.getUTCFullYear() === rok &&
    overeni.getUTCMonth() === mesic - 1 &&
    overeni.getUTCDate() === den
  );
}

function tridyPole(maChybu: boolean): string {
  const zaklad =
    "min-h-[44px] w-full rounded-md border-2 bg-white/80 px-3 py-2 text-base text-inkoust placeholder:text-inkoust/40 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk";
  return maChybu ? `${zaklad} border-red-800` : `${zaklad} border-linka`;
}

/**
 * SchuzkaForm — deníkový formulář schůzky (Fáze 3).
 * Mobile-first, pole 44px+, chyby česky s role="alert".
 * Minulost data je povolena (opakovaná schůzka mohla začít dřív).
 */
export default function SchuzkaForm(props: SchuzkaFormProps): JSX.Element {
  const {
    nadpis,
    odeslatPopisek,
    vychozi = null,
    odesilaSe,
    serverChyba,
    serverChybyPoli,
    onSubmit,
    onZrusit,
  } = props;
  const idPrefix = useId();
  const [nazev, setNazev] = useState<string>(vychozi?.nazev ?? "");
  const [datum, setDatum] = useState<string>(vychozi?.datum ?? "");
  const [mistnost, setMistnost] = useState<string>(vychozi?.mistnost ?? "");
  const [popis, setPopis] = useState<string>(vychozi?.popis ?? "");
  const [opakovani, setOpakovani] = useState<OpakovaniSchuzky>(
    vychozi?.opakovani ?? "jednorazova",
  );
  const [klientskeChyby, setKlientskeChyby] = useState<ChybySchuzky>({});

  function chybaPole(pole: keyof ChybySchuzky): string | undefined {
    return klientskeChyby[pole] ?? serverChybyPoli[pole];
  }

  function naOdeslat(e: FormEvent): void {
    e.preventDefault();
    const chyby: ChybySchuzky = {};
    const cistyNazev = nazev.trim();
    if (cistyNazev.length === 0) {
      chyby.nazev = VALIDACNI_ZPRAVY.schuzkaNazevPovinny;
    } else if (cistyNazev.length < VALIDACE.schuzkaNazevMinDelka) {
      chyby.nazev = VALIDACNI_ZPRAVY.schuzkaNazevKratky;
    } else if (cistyNazev.length > VALIDACE.schuzkaNazevMaxDelka) {
      chyby.nazev = VALIDACNI_ZPRAVY.schuzkaNazevDlouhy;
    }
    const cisteDatum = datum.trim();
    if (cisteDatum.length === 0) {
      chyby.datum = VALIDACNI_ZPRAVY.schuzkaDatumPovinne;
    } else if (!DATUM_REGEX.test(cisteDatum) || !jeRealneDatum(cisteDatum)) {
      chyby.datum = VALIDACNI_ZPRAVY.schuzkaDatumNeplatne;
    }
    const cistaMistnost = mistnost.trim();
    if (cistaMistnost.length > VALIDACE.schuzkaMistnostMaxDelka) {
      chyby.mistnost = VALIDACNI_ZPRAVY.schuzkaMistnostDlouha;
    }
    const cistyPopis = popis.trim();
    if (cistyPopis.length > VALIDACE.schuzkaPopisMaxDelka) {
      chyby.popis = VALIDACNI_ZPRAVY.schuzkaPopisDlouhy;
    }
    setKlientskeChyby(chyby);
    if (Object.keys(chyby).length > 0) return;
    onSubmit({
      nazev: cistyNazev,
      datum: cisteDatum,
      mistnost: cistaMistnost.length === 0 ? null : cistaMistnost,
      popis: cistyPopis,
      opakovani,
    });
  }

  return (
    <form onSubmit={naOdeslat} noValidate aria-label={nadpis}>
      <h2 className="text-xl font-bold tracking-tight">{nadpis}</h2>
      {serverChyba !== null && (
        <p role="alert" className="mt-3 rounded-md border-2 border-red-800 bg-red-50 px-3 py-2 text-sm font-bold text-red-900">
          {serverChyba}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor={`${idPrefix}-nazev`} className="text-sm font-bold">
            Název schůzky
          </label>
          <input
            id={`${idPrefix}-nazev`}
            type="text"
            value={nazev}
            maxLength={VALIDACE.schuzkaNazevMaxDelka}
            onChange={(e) => setNazev(e.target.value)}
            aria-invalid={chybaPole("nazev") !== undefined}
            className={`mt-1 ${tridyPole(chybaPole("nazev") !== undefined)}`}
          />
          {chybaPole("nazev") !== undefined && (
            <p role="alert" className="mt-1 text-sm font-bold text-red-900">
              {chybaPole("nazev")}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-datum`} className="text-sm font-bold">
              Datum (první výskyt)
            </label>
            <input
              id={`${idPrefix}-datum`}
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              aria-invalid={chybaPole("datum") !== undefined}
              className={`mt-1 ${tridyPole(chybaPole("datum") !== undefined)}`}
            />
            {chybaPole("datum") !== undefined && (
              <p role="alert" className="mt-1 text-sm font-bold text-red-900">
                {chybaPole("datum")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-opakovani`} className="text-sm font-bold">
              Opakování
            </label>
            <select
              id={`${idPrefix}-opakovani`}
              value={opakovani}
              onChange={(e) =>
                setOpakovani(
                  e.target.value === "tydenni" ? "tydenni" : "jednorazova",
                )
              }
              className={`mt-1 ${tridyPole(false)}`}
            >
              <option value="jednorazova">Jednorázová</option>
              <option value="tydenni">Týdenní (stejný den v týdnu)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-mistnost`} className="text-sm font-bold">
            Třída{" "}
            <span className="font-medium text-mech">(nepovinné)</span>
          </label>
          <input
            id={`${idPrefix}-mistnost`}
            type="text"
            value={mistnost}
            maxLength={VALIDACE.schuzkaMistnostMaxDelka}
            onChange={(e) => setMistnost(e.target.value)}
            aria-invalid={chybaPole("mistnost") !== undefined}
            className={`mt-1 ${tridyPole(chybaPole("mistnost") !== undefined)}`}
          />
          {chybaPole("mistnost") !== undefined && (
            <p role="alert" className="mt-1 text-sm font-bold text-red-900">
              {chybaPole("mistnost")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-popis`} className="text-sm font-bold">
            Popis <span className="font-medium text-mech">(nepovinný)</span>
          </label>
          <textarea
            id={`${idPrefix}-popis`}
            value={popis}
            rows={3}
            maxLength={VALIDACE.schuzkaPopisMaxDelka}
            onChange={(e) => setPopis(e.target.value)}
            aria-invalid={chybaPole("popis") !== undefined}
            className={`mt-1 ${tridyPole(chybaPole("popis") !== undefined)}`}
          />
          {chybaPole("popis") !== undefined && (
            <p role="alert" className="mt-1 text-sm font-bold text-red-900">
              {chybaPole("popis")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onZrusit}
          title="Zavřít bez uložení"
          className="min-h-[44px] rounded-md border-2 border-inkoust bg-white/60 px-5 py-2 text-sm font-bold shadow-denik transition-colors motion-reduce:transition-none hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={odesilaSe}
          title={odesilaSe ? "Ukládám…" : odeslatPopisek}
          className="min-h-[44px] rounded-md border-2 border-inkoust bg-smrk px-5 py-2 text-sm font-bold text-papir shadow-denik transition-colors motion-reduce:transition-none hover:bg-inkoust focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 [touch-action:manipulation]"
        >
          {odesilaSe ? "Ukládám…" : odeslatPopisek}
        </button>
      </div>
    </form>
  );
}
