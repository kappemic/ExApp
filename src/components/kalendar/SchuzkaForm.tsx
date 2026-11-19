import { useId, useState, type FormEvent, type JSX } from "react";
import { OBLAST_FORMULARE, POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import { PATICKA_SHEETU } from "../shell/SpodniSheet";
import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type OpakovaniSchuzky,
  type UpravitSchuzkuRequest,
  type VytvoritSchuzkuRequest,
} from "../../shared/api-types";
import type { ChybySchuzky } from "../../lib/schuzky-api";
import CasVstup from "../CasVstup";
import DatumVstup from "../DatumVstup";
import VyberPole from "../VyberPole";

export interface SchuzkaFormVychozi {
  nazev: string;
  datum: string;
  cas: string | null;
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
  /** Shown under the description when a weekly occurrence is being edited. */
  poznamkaPopisu?: string | null;
  /** SpodniSheet already shows the title — hide the duplicate h2. */
  bezNadpisu?: boolean;
}

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CAS_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  return maChybu ? `${POLE_FORMULARE} !border-red-800` : POLE_FORMULARE;
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
    poznamkaPopisu = null,
    bezNadpisu = false,
  } = props;
  const idPrefix = useId();
  const [nazev, setNazev] = useState<string>(vychozi?.nazev ?? "");
  const [datum, setDatum] = useState<string>(vychozi?.datum ?? "");
  const [cas, setCas] = useState<string>(vychozi?.cas ?? "");
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
    const cistyCas = cas.trim();
    if (cistyCas.length > 0 && !CAS_REGEX.test(cistyCas)) {
      chyby.cas = VALIDACNI_ZPRAVY.schuzkaCasNeplatny;
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
      cas: cistyCas.length === 0 ? null : cistyCas,
      mistnost: cistaMistnost.length === 0 ? null : cistaMistnost,
      popis: cistyPopis,
      opakovani,
    });
  }

  return (
    <form onSubmit={naOdeslat} noValidate aria-label={nadpis}>
      {bezNadpisu ? null : (
        <h2 className="text-xl font-bold tracking-tight">{nadpis}</h2>
      )}
      {serverChyba !== null && (
        <p role="alert" className="mt-3 rounded-2xl border border-red-800/40 bg-red-50 px-3 py-2 text-sm font-bold text-red-900">
          {serverChyba}
        </p>
      )}

      <div className="mt-1 space-y-3.5">
        <div>
          <label htmlFor={`${idPrefix}-nazev`} className={POPISEK_POLE}>
            Název
          </label>
          <input
            id={`${idPrefix}-nazev`}
            type="text"
            value={nazev}
            maxLength={VALIDACE.schuzkaNazevMaxDelka}
            onChange={(e) => setNazev(e.target.value)}
            aria-invalid={chybaPole("nazev") !== undefined}
            className={`mt-1.5 ${tridyPole(chybaPole("nazev") !== undefined)}`}
          />
          {chybaPole("nazev") !== undefined && (
            <p role="alert" className="mt-1 text-sm font-bold text-red-900">
              {chybaPole("nazev")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-datum`} className={POPISEK_POLE}>
              Den
            </label>
            <DatumVstup
              id={`${idPrefix}-datum`}
              value={datum}
              onChange={setDatum}
              ariaInvalid={chybaPole("datum") !== undefined}
              className={`mt-1.5 ${tridyPole(chybaPole("datum") !== undefined)}`}
            />
            {chybaPole("datum") !== undefined && (
              <p role="alert" className="mt-1 text-sm font-bold text-red-900">
                {chybaPole("datum")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-cas`} className={POPISEK_POLE}>
              Čas
            </label>
            <CasVstup
              id={`${idPrefix}-cas`}
              value={cas}
              onChange={setCas}
              ariaInvalid={chybaPole("cas") !== undefined}
              className={`mt-1.5 ${tridyPole(chybaPole("cas") !== undefined)}`}
            />
            {chybaPole("cas") !== undefined && (
              <p role="alert" className="mt-1 text-sm font-bold text-red-900">
                {chybaPole("cas")}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-opakovani`} className={POPISEK_POLE}>
            Opakování
          </label>
          {/* No series end date. OpakovaniSchuzky stays jednorazova | tydenni. */}
          <VyberPole
            id={`${idPrefix}-opakovani`}
            value={opakovani}
            onChange={(dalsi) =>
              setOpakovani(dalsi === "tydenni" ? "tydenni" : "jednorazova")
            }
            className={`mt-1.5 ${tridyPole(false)}`}
            volby={[
              { value: "jednorazova", popisek: "Jednorázově" },
              { value: "tydenni", popisek: "Každý týden" },
            ]}
          />
          {opakovani === "tydenni" ? (
            <p className="mt-1 text-sm text-mech" aria-hidden="true">
              Každý týden do 15. 12. — ukázka z návrhu, systém neukládá datum konce.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-mistnost`} className={POPISEK_POLE}>
            Místo{" "}
            <span className="font-normal text-ink-3">(nepovinné)</span>
          </label>
          <input
            id={`${idPrefix}-mistnost`}
            type="text"
            value={mistnost}
            maxLength={VALIDACE.schuzkaMistnostMaxDelka}
            onChange={(e) => setMistnost(e.target.value)}
            aria-invalid={chybaPole("mistnost") !== undefined}
            className={`mt-1.5 ${tridyPole(chybaPole("mistnost") !== undefined)}`}
          />
          {chybaPole("mistnost") !== undefined && (
            <p role="alert" className="mt-1 text-sm font-bold text-red-900">
              {chybaPole("mistnost")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-popis`} className={POPISEK_POLE}>
            Popis <span className="font-normal text-ink-3">(nepovinný)</span>
          </label>
          <textarea
            id={`${idPrefix}-popis`}
            value={popis}
            rows={3}
            maxLength={VALIDACE.schuzkaPopisMaxDelka}
            onChange={(e) => setPopis(e.target.value)}
            aria-invalid={chybaPole("popis") !== undefined}
            className={`mt-1.5 ${OBLAST_FORMULARE} ${chybaPole("popis") !== undefined ? "!border-red-800" : ""}`}
          />
          {chybaPole("popis") !== undefined && (
            <p role="alert" className="mt-1 text-sm font-bold text-red-900">
              {chybaPole("popis")}
            </p>
          )}
          {poznamkaPopisu !== null && opakovani === "tydenni" && (
            <p className="mt-1 text-sm text-mech">{poznamkaPopisu}</p>
          )}
        </div>
      </div>

      <div className={`${PATICKA_SHEETU} mt-5`}>
        <button
          type="button"
          onClick={onZrusit}
          title="Zavřít bez uložení"
          className="min-h-11 flex-1 whitespace-nowrap rounded-xl border border-linka bg-povrch px-4 py-2 text-base font-semibold sm:flex-none transition-colors motion-reduce:transition-none hover:bg-mlha focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={odesilaSe}
          title={odesilaSe ? "Ukládám…" : odeslatPopisek}
          className="min-h-11 flex-1 whitespace-nowrap rounded-xl bg-smrk px-4 py-2 sm:flex-none text-base font-semibold text-papir transition-colors motion-reduce:transition-none hover:brightness-95 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60 [touch-action:manipulation]"
        >
          {odesilaSe ? "Ukládám…" : odeslatPopisek}
        </button>
      </div>
    </form>
  );
}
