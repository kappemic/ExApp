import { useId, useState, type FormEvent, type JSX } from "react";
import { OBLAST_FORMULARE, POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import { OBSAH_PANELU, PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import Ikona from "../Ikona";
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
  /** Nová schůzka podle návrhu popis nemá. */
  bezPopisu?: boolean;
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
  return maChybu ? `${POLE_FORMULARE} !border-akcent` : POLE_FORMULARE;
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
    bezPopisu = false,
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
        <p role="alert" className="mb-3.5 rounded-[10px] bg-[#fbede7] p-3 text-[13px] leading-[18px] text-[#7a3a1b]">
          {serverChyba}
        </p>
      )}

      <div className={OBSAH_PANELU}>
        <div>
          <label htmlFor={`${idPrefix}-nazev`} className={`block ${POPISEK_POLE}`}>
            Název
          </label>
          <input
            id={`${idPrefix}-nazev`}
            type="text"
            value={nazev}
            maxLength={VALIDACE.schuzkaNazevMaxDelka}
            onChange={(e) => setNazev(e.target.value)}
            aria-invalid={chybaPole("nazev") !== undefined}
            className={`mt-1.5 min-[90rem]:mt-[5px] ${tridyPole(chybaPole("nazev") !== undefined)}`}
          />
          {chybaPole("nazev") !== undefined && (
            <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-akcent">
              {chybaPole("nazev")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-datum`} className={`block ${POPISEK_POLE}`}>
              Den
            </label>
            <DatumVstup
              id={`${idPrefix}-datum`}
              value={datum}
              onChange={setDatum}
              ikona="chevron-down"
              ariaInvalid={chybaPole("datum") !== undefined}
              className={`mt-1.5 min-[90rem]:mt-[5px] ${tridyPole(chybaPole("datum") !== undefined)}`}
            />
            {chybaPole("datum") !== undefined && (
              <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-akcent">
                {chybaPole("datum")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${idPrefix}-cas`} className={`block ${POPISEK_POLE}`}>
              Čas
            </label>
            <CasVstup
              id={`${idPrefix}-cas`}
              value={cas}
              onChange={setCas}
              ikona="chevron-down"
              ariaInvalid={chybaPole("cas") !== undefined}
              className={`mt-1.5 min-[90rem]:mt-[5px] ${tridyPole(chybaPole("cas") !== undefined)}`}
            />
            {chybaPole("cas") !== undefined && (
              <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-akcent">
                {chybaPole("cas")}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-opakovani`} className={`block ${POPISEK_POLE}`}>
            Opakování
          </label>
          {/* Konec řady backend neukládá. OpakovaniSchuzky je jednorazova | tydenni. */}
          <VyberPole
            id={`${idPrefix}-opakovani`}
            value={opakovani}
            onChange={(dalsi) =>
              setOpakovani(dalsi === "tydenni" ? "tydenni" : "jednorazova")
            }
            ikona="repeat"
            className={`mt-1.5 min-[90rem]:mt-[5px] ${tridyPole(false)}`}
            volby={[
              { value: "jednorazova", popisek: "Jednorázově" },
              { value: "tydenni", popisek: "Každý týden" },
            ]}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-mistnost`} className={`block ${POPISEK_POLE}`}>
            Místo
          </label>
          <div className="relative mt-1.5">
          <input
            id={`${idPrefix}-mistnost`}
            type="text"
            value={mistnost}
            maxLength={VALIDACE.schuzkaMistnostMaxDelka}
            onChange={(e) => setMistnost(e.target.value)}
            aria-invalid={chybaPole("mistnost") !== undefined}
            className={`min-[90rem]:pr-9 ${tridyPole(chybaPole("mistnost") !== undefined)}`}
          />
            <Ikona nazev="map-pin" className="pointer-events-none absolute right-3 top-1/2 hidden size-3.5 -translate-y-1/2 text-ink-3 min-[90rem]:block" />
          </div>
          {chybaPole("mistnost") !== undefined && (
            <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-akcent">
              {chybaPole("mistnost")}
            </p>
          )}
        </div>

        {/* Návrh nové schůzky popis nemá; při úpravě zůstává, ať jde opravit. */}
        {bezPopisu ? null : (
        <div>
          <label htmlFor={`${idPrefix}-popis`} className={`block ${POPISEK_POLE}`}>
            Popis <span className="font-normal text-ink-3">(nepovinný)</span>
          </label>
          <textarea
            id={`${idPrefix}-popis`}
            value={popis}
            rows={3}
            maxLength={VALIDACE.schuzkaPopisMaxDelka}
            onChange={(e) => setPopis(e.target.value)}
            aria-invalid={chybaPole("popis") !== undefined}
            className={`mt-1.5 ${OBLAST_FORMULARE} ${chybaPole("popis") !== undefined ? "!border-akcent" : ""}`}
          />
          {chybaPole("popis") !== undefined && (
            <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-akcent">
              {chybaPole("popis")}
            </p>
          )}
          {poznamkaPopisu !== null && opakovani === "tydenni" && (
            <p className="mt-1.5 text-[12.5px] leading-[17px] text-mech">{poznamkaPopisu}</p>
          )}
        </div>
        )}
      </div>

      <div className={PATICKA_SHEETU}>
        <button
          type="button"
          onClick={onZrusit}
          title="Zavřít bez uložení"
          className={TLACITKO_PATICKY_ZRUSIT}
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={odesilaSe}
          title={odesilaSe ? "Ukládám…" : odeslatPopisek}
          className={TLACITKO_PATICKY_HLAVNI}
        >
          {odesilaSe ? "Ukládám…" : odeslatPopisek}
        </button>
      </div>
    </form>
  );
}
