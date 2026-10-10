import { useEffect, useId, useState, type FormEvent, type JSX } from "react";
import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type UpravitExpediciRequest,
  type VytvoritExpediciRequest,
} from "../../shared/api-types";

/**
 * ExpeditionForm — deníkový admin formulář výpravy (Krok 4).
 * Mobile-first, všechna pole 44px+, chyby česky s role="alert".
 * Validace zrcadlí server (server/src/validace.ts) + kontrakt VALIDACE.
 */

export type PoleExpedice = "nazev" | "datum" | "datumDo" | "sraz" | "popis" | "trasaOdkaz" | "kapacitaCelkem";

export type ChybyExpedice = Partial<Record<PoleExpedice, string>>;

export interface HodnotyExpedice {
  nazev: string;
  datum: string;
  /** Konec od–do; null = jednodenní. */
  datumDo: string | null;
  sraz: string;
  popis: string;
  trasaOdkaz: string;
  kapacitaCelkem: number;
}

export interface ExpeditionFormVychozi {
  nazev: string;
  datum: string;
  datumDo: string | null;
  sraz: string;
  popis: string;
  trasaOdkaz: string;
  kapacitaCelkem: number;
}

interface ExpeditionFormProps {
  /** Nadpis dialogu (h2) — „Nová výprava" / „Upravit výpravu". */
  nadpis: string;
  /** Popisek primárního tlačítka. */
  odeslatPopisek: string;
  vychozi?: ExpeditionFormVychozi | null;
  odesilaSe: boolean;
  /** Obecná serverová chyba (ne-validace) — role="alert". */
  serverChyba: string | null;
  /** Pole → hláška z 422 details (server je zdrojem pravdy). */
  serverChybyPoli: ChybyExpedice;
  onSubmit: (payload: VytvoritExpediciRequest | UpravitExpediciRequest) => void;
  onZrusit: () => void;
}

const DATUM_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Dnešek v lokálním YYYY-MM-DD — hranice minulosti (stejně jako server). */
function dnesYmd(): string {
  const ted = new Date();
  const rok = ted.getFullYear();
  const mesic = String(ted.getMonth() + 1).padStart(2, "0");
  const den = String(ted.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

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
  ) {
    return false;
  }
  if (mesic < 1 || mesic > 12 || den < 1 || den > 31) return false;
  const overeni = new Date(Date.UTC(rok, mesic - 1, den));
  return (
    overeni.getUTCFullYear() === rok &&
    overeni.getUTCMonth() === mesic - 1 &&
    overeni.getUTCDate() === den
  );
}

function validujKlientsky(
  nazev: string,
  datum: string,
  datumDo: string,
  sraz: string,
  popis: string,
  trasaOdkaz: string,
  kapacitaText: string,
): { chyby: ChybyExpedice; hodnoty: HodnotyExpedice | null } {
  const chyby: ChybyExpedice = {};
  const cistyNazev = nazev.trim();
  if (cistyNazev.length === 0) {
    chyby.nazev = VALIDACNI_ZPRAVY.expediceNazevPovinny;
  } else if (cistyNazev.length < VALIDACE.expediceNazevMinDelka) {
    chyby.nazev = VALIDACNI_ZPRAVY.expediceNazevKratky;
  } else if (cistyNazev.length > VALIDACE.expediceNazevMaxDelka) {
    chyby.nazev = VALIDACNI_ZPRAVY.expediceNazevDlouhy;
  }

  const cisteDatum = datum.trim();
  if (cisteDatum.length === 0) {
    chyby.datum = VALIDACNI_ZPRAVY.expediceDatumPovinne;
  } else if (!DATUM_REGEX.test(cisteDatum) || !jeRealneDatum(cisteDatum)) {
    chyby.datum = VALIDACNI_ZPRAVY.expediceDatumNeplatne;
  } else if (cisteDatum < dnesYmd()) {
    chyby.datum = VALIDACNI_ZPRAVY.expediceDatumMinulost;
  }

  // Nepovinný konec od–do; prázdné = jednodenní (null).
  const cisteDatumDo = datumDo.trim();
  let normalizovaneDo: string | null = null;
  if (cisteDatumDo.length > 0) {
    if (!DATUM_REGEX.test(cisteDatumDo) || !jeRealneDatum(cisteDatumDo)) {
      chyby.datumDo = VALIDACNI_ZPRAVY.expediceDatumDoNeplatne;
    } else if (chyby.datum === undefined && cisteDatumDo < cisteDatum) {
      chyby.datumDo = VALIDACNI_ZPRAVY.expediceDatumDoPredZacatkem;
    } else if (chyby.datumDo === undefined) {
      normalizovaneDo = cisteDatumDo;
    }
  }

  const cistySraz = sraz.trim();
  if (cistySraz.length === 0) {
    chyby.sraz = VALIDACNI_ZPRAVY.expediceSrazPovinny;
  } else if (cistySraz.length < VALIDACE.expediceSrazMinDelka) {
    chyby.sraz = VALIDACNI_ZPRAVY.expediceSrazKratky;
  } else if (cistySraz.length > VALIDACE.expediceSrazMaxDelka) {
    chyby.sraz = VALIDACNI_ZPRAVY.expediceSrazDlouhy;
  }

  const cistyPopis = popis.trim();
  if (cistyPopis.length > VALIDACE.expedicePopisMaxDelka) {
    chyby.popis = VALIDACNI_ZPRAVY.expedicePopisDlouhy;
  }

  const cistyOdkaz = trasaOdkaz.trim();
  let normalizovanyOdkaz = "";
  if (cistyOdkaz.length > 0) {
    if (cistyOdkaz.length > VALIDACE.expediceTrasaOdkazMaxDelka) {
      chyby.trasaOdkaz = VALIDACNI_ZPRAVY.expediceTrasaOdkazDlouhy;
    } else {
      let parsed: URL | null = null;
      try {
        parsed = new URL(cistyOdkaz);
      } catch {
        parsed = null;
      }
      if (parsed === null || parsed.protocol !== "https:") {
        chyby.trasaOdkaz = VALIDACNI_ZPRAVY.expediceTrasaOdkazNeplatny;
      } else {
        normalizovanyOdkaz = parsed.toString();
      }
    }
  }

  const cistaKapacita = kapacitaText.trim();
  // Prázdné = bez omezení (normalizuje se na 0, stejně jako server).
  let kapacita: number | null = cistaKapacita.length === 0 ? 0 : null;
  if (kapacita === null && /^\d+$/.test(cistaKapacita)) {
    const parsed = Number.parseInt(cistaKapacita, 10);
    if (
      Number.isInteger(parsed) &&
      parsed >= VALIDACE.expediceKapacitaMin &&
      parsed <= VALIDACE.expediceKapacitaMax
    ) {
      kapacita = parsed;
    }
  }
  if (kapacita === null) {
    chyby.kapacitaCelkem = VALIDACNI_ZPRAVY.expediceKapacitaNeplatna;
  }

  if (
    chyby.nazev !== undefined ||
    chyby.datum !== undefined ||
    chyby.datumDo !== undefined ||
    chyby.sraz !== undefined ||
    chyby.popis !== undefined ||
    chyby.trasaOdkaz !== undefined ||
    chyby.kapacitaCelkem !== undefined ||
    kapacita === null
  ) {
    return { chyby, hodnoty: null };
  }
  return {
    chyby,
    hodnoty: {
      nazev: cistyNazev,
      datum: cisteDatum,
      datumDo: normalizovaneDo,
      sraz: cistySraz,
      popis: cistyPopis,
      trasaOdkaz: normalizovanyOdkaz,
      kapacitaCelkem: kapacita,
    },
  };
}

const VSTUP_TRIDY =
  "min-h-[44px] w-full rounded-md border-2 border-inkoust bg-white/80 px-3 py-2 text-base text-inkoust placeholder:text-inkoust/40";

export default function ExpeditionForm({
  nadpis,
  odeslatPopisek,
  vychozi = null,
  odesilaSe,
  serverChyba,
  serverChybyPoli,
  onSubmit,
  onZrusit,
}: ExpeditionFormProps): JSX.Element {
  const [nazev, setNazev] = useState<string>(vychozi?.nazev ?? "");
  const [datum, setDatum] = useState<string>(vychozi?.datum ?? "");
  const [datumDo, setDatumDo] = useState<string>(vychozi?.datumDo ?? "");
  const [sraz, setSraz] = useState<string>(vychozi?.sraz ?? "");
  const [popis, setPopis] = useState<string>(vychozi?.popis ?? "");
  const [trasaOdkaz, setTrasaOdkaz] = useState<string>(vychozi?.trasaOdkaz ?? "");
  const [kapacita, setKapacita] = useState<string>(
    vychozi?.kapacitaCelkem !== undefined ? String(vychozi.kapacitaCelkem) : "",
  );
  const [chyby, setChyby] = useState<ChybyExpedice>({});
  const [odeslano, setOdeslano] = useState<boolean>(false);
  const zaklad = useId();

  // Serverové 422 detaily (zdroj pravdy) přimícháme k lokálním chybám.
  useEffect(() => {
    setChyby((prev) => {
      const next: ChybyExpedice = { ...prev };
      const pole: readonly PoleExpedice[] = [
        "nazev",
        "datum",
        "datumDo",
        "sraz",
        "popis",
        "trasaOdkaz",
        "kapacitaCelkem",
      ];
      for (const klic of pole) {
        const hlaska = serverChybyPoli[klic];
        if (hlaska !== undefined) next[klic] = hlaska;
      }
      return next;
    });
  }, [serverChybyPoli]);

  function idPro(pole: PoleExpedice): string {
    return `${zaklad}-${pole}`;
  }

  function chybaPro(pole: PoleExpedice): string {
    return `${zaklad}-${pole}-chyba`;
  }

  function napovedaPro(pole: PoleExpedice): string {
    return `${zaklad}-${pole}-napoveda`;
  }

  function odesli(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setOdeslano(true);
    const vysledek = validujKlientsky(nazev, datum, datumDo, sraz, popis, trasaOdkaz, kapacita);
    setChyby({ ...vysledek.chyby, ...serverChybyPoli });
    if (vysledek.hodnoty === null) return;
    const payload: VytvoritExpediciRequest = {
      nazev: vysledek.hodnoty.nazev,
      datum: vysledek.hodnoty.datum,
      datumDo: vysledek.hodnoty.datumDo,
      sraz: vysledek.hodnoty.sraz,
      popis: vysledek.hodnoty.popis,
      trasaOdkaz: vysledek.hodnoty.trasaOdkaz,
      kapacitaCelkem: vysledek.hodnoty.kapacitaCelkem,
    };
    onSubmit(payload);
  }

  function zmenPole(
    pole: PoleExpedice,
    hodnota: string,
    nastav: (v: string) => void,
  ): void {
    nastav(hodnota);
    // Průběžně maž chybu pole, jakmile uživatel opravuje (jen po 1. odeslání).
    if (odeslano) {
      const vysledek = validujKlientsky(
        pole === "nazev" ? hodnota : nazev,
        pole === "datum" ? hodnota : datum,
        pole === "datumDo" ? hodnota : datumDo,
        pole === "sraz" ? hodnota : sraz,
        pole === "popis" ? hodnota : popis,
        pole === "trasaOdkaz" ? hodnota : trasaOdkaz,
        pole === "kapacitaCelkem" ? hodnota : kapacita,
      );
      setChyby((prev) => {
        const next: ChybyExpedice = { ...prev };
        if (vysledek.chyby[pole] === undefined) {
          delete next[pole];
        } else {
          next[pole] = vysledek.chyby[pole];
        }
        return next;
      });
    }
  }

  const poleChybi = (pole: PoleExpedice): boolean => chyby[pole] !== undefined;

  return (
    <form onSubmit={odesli} noValidate aria-label={nadpis}>
      {serverChyba !== null && (
        <p
          role="alert"
          className="mb-4 rounded-md border-2 border-inkoust bg-jantar/15 px-3 py-2 text-sm font-semibold"
        >
          {serverChyba}
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor={idPro("nazev")} className="mb-1 block text-sm font-bold">
            Název výpravy <span aria-hidden="true">*</span>
          </label>
          <input
            id={idPro("nazev")}
            type="text"
            autoComplete="off"
            autoFocus
            maxLength={VALIDACE.expediceNazevMaxDelka}
            value={nazev}
            disabled={odesilaSe}
            onChange={(e) => zmenPole("nazev", e.target.value, setNazev)}
            aria-invalid={poleChybi("nazev")}
            aria-describedby={poleChybi("nazev") ? chybaPro("nazev") : undefined}
            placeholder="Např. Podzimní Šumava"
            className={`${VSTUP_TRIDY} ${poleChybi("nazev") ? "border-red-800" : ""}`}
          />
          {chyby.nazev !== undefined && (
            <p id={chybaPro("nazev")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
              {chyby.nazev}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={idPro("datum")} className="mb-1 block text-sm font-bold">
              Datum od <span aria-hidden="true">*</span>
            </label>
            <input
              id={idPro("datum")}
              type="date"
              value={datum}
              disabled={odesilaSe}
              onChange={(e) => zmenPole("datum", e.target.value, setDatum)}
              aria-invalid={poleChybi("datum")}
              aria-describedby={poleChybi("datum") ? chybaPro("datum") : undefined}
              className={`${VSTUP_TRIDY} ${poleChybi("datum") ? "border-red-800" : ""}`}
            />
            {chyby.datum !== undefined && (
              <p id={chybaPro("datum")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
                {chyby.datum}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={idPro("datumDo")} className="mb-1 block text-sm font-bold">
              Datum do{" "}
              <span className="font-normal text-inkoust/60">(nepovinné)</span>
            </label>
            <input
              id={idPro("datumDo")}
              type="date"
              value={datumDo}
              min={datum.trim().length > 0 ? datum.trim() : undefined}
              disabled={odesilaSe}
              onChange={(e) => zmenPole("datumDo", e.target.value, setDatumDo)}
              aria-invalid={poleChybi("datumDo")}
              aria-describedby={poleChybi("datumDo") ? chybaPro("datumDo") : undefined}
              className={`${VSTUP_TRIDY} ${poleChybi("datumDo") ? "border-red-800" : ""}`}
            />
            {chyby.datumDo !== undefined && (
              <p id={chybaPro("datumDo")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
                {chyby.datumDo}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor={idPro("kapacitaCelkem")} className="mb-1 block text-sm font-bold">
              Kapacita{" "}
              <span className="font-normal text-inkoust/60">(nepovinná)</span>
            </label>
            <input
              id={idPro("kapacitaCelkem")}
              type="number"
              inputMode="numeric"
              min={VALIDACE.expediceKapacitaMin}
              max={VALIDACE.expediceKapacitaMax}
              step={1}
              value={kapacita}
              disabled={odesilaSe}
              onChange={(e) => zmenPole("kapacitaCelkem", e.target.value, setKapacita)}
              aria-invalid={poleChybi("kapacitaCelkem")}
              aria-describedby={
                poleChybi("kapacitaCelkem")
                  ? chybaPro("kapacitaCelkem")
                  : napovedaPro("kapacitaCelkem")
              }
              placeholder="Bez omezení…"
              className={`${VSTUP_TRIDY} ${poleChybi("kapacitaCelkem") ? "border-red-800" : ""}`}
            />
            {chyby.kapacitaCelkem !== undefined ? (
              <p id={chybaPro("kapacitaCelkem")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
                {chyby.kapacitaCelkem}
              </p>
            ) : (
              <p id={napovedaPro("kapacitaCelkem")} className="mt-1 text-xs text-inkoust/60">
                Prázdné nebo 0 = bez omezení míst.
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={idPro("sraz")} className="mb-1 block text-sm font-bold">
            Sraz (místo a čas) <span aria-hidden="true">*</span>
          </label>
          <input
            id={idPro("sraz")}
            type="text"
            autoComplete="off"
            maxLength={VALIDACE.expediceSrazMaxDelka}
            value={sraz}
            disabled={odesilaSe}
            onChange={(e) => zmenPole("sraz", e.target.value, setSraz)}
            aria-invalid={poleChybi("sraz")}
            aria-describedby={poleChybi("sraz") ? chybaPro("sraz") : undefined}
            placeholder="Např. Praha hl. n., 7:40"
            className={`${VSTUP_TRIDY} ${poleChybi("sraz") ? "border-red-800" : ""}`}
          />
          {chyby.sraz !== undefined && (
            <p id={chybaPro("sraz")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
              {chyby.sraz}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={idPro("popis")} className="mb-1 block text-sm font-bold">
            Popis <span className="font-normal text-inkoust/60">(nepovinný)</span>
          </label>
          <textarea
            id={idPro("popis")}
            rows={4}
            maxLength={VALIDACE.expedicePopisMaxDelka}
            value={popis}
            disabled={odesilaSe}
            onChange={(e) => zmenPole("popis", e.target.value, setPopis)}
            aria-invalid={poleChybi("popis")}
            aria-describedby={poleChybi("popis") ? chybaPro("popis") : undefined}
            placeholder="Trasa, náročnost, co s sebou…"
            className={`${VSTUP_TRIDY} min-h-[88px] resize-y py-2 ${poleChybi("popis") ? "border-red-800" : ""}`}
          />
          {chyby.popis !== undefined && (
            <p id={chybaPro("popis")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
              {chyby.popis}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={idPro("trasaOdkaz")} className="mb-1 block text-sm font-bold">
            Odkaz na trasu{" "}
            <span className="font-normal text-inkoust/60">(nepovinný, mapy.com)</span>
          </label>
          <input
            id={idPro("trasaOdkaz")}
            type="url"
            inputMode="url"
            autoComplete="off"
            maxLength={VALIDACE.expediceTrasaOdkazMaxDelka}
            value={trasaOdkaz}
            disabled={odesilaSe}
            onChange={(e) => zmenPole("trasaOdkaz", e.target.value, setTrasaOdkaz)}
            aria-invalid={poleChybi("trasaOdkaz")}
            aria-describedby={
              poleChybi("trasaOdkaz")
                ? chybaPro("trasaOdkaz")
                : napovedaPro("trasaOdkaz")
            }
            placeholder="Např. https://mapy.com/…"
            className={`${VSTUP_TRIDY} ${poleChybi("trasaOdkaz") ? "border-red-800" : ""}`}
          />
          {chyby.trasaOdkaz !== undefined ? (
            <p id={chybaPro("trasaOdkaz")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
              {chyby.trasaOdkaz}
            </p>
          ) : (
            <p id={napovedaPro("trasaOdkaz")} className="mt-1 text-xs text-inkoust/60">
              Vlož odkaz na naplánovanou cestu (mapy.com). Začíná https://.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onZrusit}
          disabled={odesilaSe}
          title={odesilaSe ? "Ukládání probíhá…" : "Zrušit úpravy"}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-white/60 px-4 py-2 text-sm font-bold text-inkoust transition-colors hover:bg-linka/60 disabled:opacity-60"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={odesilaSe}
          title={odesilaSe ? "Ukládání probíhá…" : odeslatPopisek}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border-2 border-inkoust bg-smrk px-4 py-2 text-sm font-bold text-papir transition-colors hover:bg-inkoust disabled:opacity-60"
        >
          {odesilaSe ? "Ukládám…" : odeslatPopisek}
        </button>
      </div>
    </form>
  );
}
