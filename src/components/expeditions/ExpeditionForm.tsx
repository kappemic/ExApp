import { useEffect, useId, useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import {
  VALIDACE,
  VALIDACNI_ZPRAVY,
  type UpravitExpediciRequest,
  type VytvoritExpediciRequest,
} from "../../shared/api-types";
import DatumVstup from "../DatumVstup";

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

export interface SnimkyCestyVyber {
  tam: File[];
  zpet: File[];
}

export interface UlozenySnimekCesty {
  id: string;
  url: string;
}

const SNIMKU_NA_SMER = 8;
const SNIMEK_MAX_BAJTU = 8 * 1024 * 1024;

function pridejSnimky(
  stavajici: readonly File[],
  nove: readonly File[],
  uzObsazeno: number,
): { soubory: File[]; chyba: string | null } {
  const soubory: File[] = [...stavajici];
  let chyba: string | null = null;
  for (const soubor of nove) {
    const typ = soubor.type;
    const pripona = soubor.name.split(".").pop()?.toLowerCase() ?? "";
    const obrazek =
      typ === "image/jpeg" ||
      typ === "image/png" ||
      typ === "image/webp" ||
      pripona === "jpg" ||
      pripona === "jpeg" ||
      pripona === "png" ||
      pripona === "webp";
    if (!obrazek) {
      if (chyba === null) chyba = "Snímek musí být JPG, PNG nebo WebP.";
      continue;
    }
    if (soubor.size > SNIMEK_MAX_BAJTU) {
      if (chyba === null) chyba = "Snímek může mít nejvýš 8 MB.";
      continue;
    }
    if (uzObsazeno + soubory.length >= SNIMKU_NA_SMER) {
      if (chyba === null) chyba = "Na jeden směr jde nahrát nejvýš 8 snímků.";
      continue;
    }
    soubory.push(soubor);
  }
  return { soubory, chyba };
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
  onSubmit: (
    payload: VytvoritExpediciRequest | UpravitExpediciRequest,
    snimky: SnimkyCestyVyber,
  ) => void;
  /** Screenshots already stored for this expedition (edit). */
  ulozeneTam?: readonly UlozenySnimekCesty[];
  ulozeneZpet?: readonly UlozenySnimekCesty[];
  onSmazatSnimek?: (id: string) => void;
  onZrusit: () => void;
  /**
   * Úprava historie: při true se klientská kontrola minulosti data přeskočí
   * (tvar/reálnost zůstává). Default false — tvorba minulost dál blokuje.
   */
  povolitMinulost?: boolean;
  /** Krok 16: id pro externí sticky footer (form="..."). */
  id?: string;
  /**
   * Krok 16: skrýt interní akce Zrušit/Uložit — Upravit je renderuje
   * jako sticky footer na úplném spodku (za Strava + docházkou).
   */
  skrytAkce?: boolean;
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
  povolitMinulost = false,
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
  } else if (!povolitMinulost && cisteDatum < dnesYmd()) {
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
  "min-h-[44px] w-full rounded-xl border border-pole bg-papir px-3 py-2 text-base text-inkoust placeholder:text-inkoust/40";

function VyberSnimku({
  id,
  nadpis,
  napoveda,
  soubory,
  ulozene,
  disabled,
  onVyber,
  onOdebrat,
  onSmazatUlozeny,
}: {
  id: string;
  nadpis: string;
  napoveda: string;
  soubory: readonly File[];
  ulozene: readonly UlozenySnimekCesty[];
  disabled: boolean;
  onVyber: (udalost: ChangeEvent<HTMLInputElement>) => void;
  onOdebrat: (index: number) => void;
  onSmazatUlozeny?: (id: string) => void;
}): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-inkoust">
        {nadpis} <span className="font-normal text-inkoust/60">(nepovinné)</span>
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={disabled}
        onChange={onVyber}
        className="block w-full min-h-[44px] text-base file:mr-3 file:min-h-[44px] file:rounded-xl file:border-0 file:bg-mlha file:px-3 file:text-base file:font-bold"
      />
      <p className="mt-1 text-base leading-relaxed text-inkoust/70 lg:text-sm">{napoveda}</p>
      {(ulozene.length > 0 || soubory.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {ulozene.map((snimek) => (
            <li key={snimek.id} className="relative">
              <img src={snimek.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
              {onSmazatUlozeny !== undefined && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSmazatUlozeny(snimek.id)}
                  aria-label="Odebrat snímek"
                  className="absolute -top-2 -right-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-papir shadow-razitko text-sm font-bold"
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {soubory.map((soubor, index) => (
            <li key={`${soubor.name}-${soubor.size}-${index}`} className="flex max-w-full items-center gap-1 rounded-full border border-inkoust/30 bg-papir py-0.5 pr-1 pl-2.5">
              <span className="max-w-full truncate text-base font-semibold">{soubor.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOdebrat(index)}
                aria-label={`Odebrat ${soubor.name}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-base"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ExpeditionForm({
  nadpis,
  odeslatPopisek,
  vychozi = null,
  odesilaSe,
  serverChyba,
  serverChybyPoli,
  onSubmit,
  onZrusit,
  ulozeneTam = [],
  ulozeneZpet = [],
  onSmazatSnimek,
  povolitMinulost = false,
  id,
  skrytAkce = false,
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
  const [snimkyTam, setSnimkyTam] = useState<File[]>([]);
  const [snimkyZpet, setSnimkyZpet] = useState<File[]>([]);
  const [chybaSnimku, setChybaSnimku] = useState<string | null>(null);
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
    const vysledek = validujKlientsky(nazev, datum, datumDo, sraz, popis, trasaOdkaz, kapacita, povolitMinulost);
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
    onSubmit(payload, { tam: snimkyTam, zpet: snimkyZpet });
  }

  function pridejSoubory(smer: "tam" | "zpet", udalost: ChangeEvent<HTMLInputElement>): void {
    const seznam = udalost.target.files;
    udalost.target.value = "";
    if (seznam === null || seznam.length === 0) return;
    const stavajici = smer === "tam" ? snimkyTam : snimkyZpet;
    const obsazeno = smer === "tam" ? ulozeneTam.length : ulozeneZpet.length;
    const vysledek = pridejSnimky(stavajici, Array.from(seznam), obsazeno);
    if (smer === "tam") setSnimkyTam(vysledek.soubory);
    else setSnimkyZpet(vysledek.soubory);
    setChybaSnimku(vysledek.chyba);
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
        povolitMinulost,
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
    <form
      id={id}
      onSubmit={odesli}
      noValidate
      aria-label={nadpis}
      className={skrytAkce ? undefined : "flex min-h-0 flex-1 flex-col lg:block"}
    >
      {!skrytAkce && (
        <h2 className="shrink-0 px-5 pt-6 text-2xl font-bold text-inkoust sm:text-3xl lg:px-0 lg:pb-5 lg:pt-0">
          {nadpis}
        </h2>
      )}
      {serverChyba !== null && (
        <p
          role="alert"
          className={`mb-4 rounded-2xl bg-jantar/10 px-3 py-2 text-sm font-semibold ${
            skrytAkce ? "" : "mx-5 mt-5 lg:mx-0 lg:mt-0"
          }`}
        >
          {serverChyba}
        </p>
      )}

      <div
        className={
          skrytAkce
            ? "space-y-4"
            : "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-5 pb-4 pt-5 [touch-action:pan-y] lg:block lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-0 lg:[touch-action:auto]"
        }
      >
        <div>
          <label htmlFor={idPro("nazev")} className="mb-1.5 block text-sm font-semibold text-inkoust">
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label htmlFor={idPro("datum")} className="mb-1.5 block text-sm font-semibold text-inkoust">
              Datum od <span aria-hidden="true">*</span>
            </label>
            <DatumVstup
              id={idPro("datum")}
              value={datum}
              disabled={odesilaSe}
              onChange={(iso) => zmenPole("datum", iso, setDatum)}
              ariaInvalid={poleChybi("datum")}
              ariaDescribedBy={poleChybi("datum") ? chybaPro("datum") : undefined}
              className={`${VSTUP_TRIDY} ${poleChybi("datum") ? "border-red-800" : ""}`}
            />
            {chyby.datum !== undefined && (
              <p id={chybaPro("datum")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
                {chyby.datum}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={idPro("datumDo")} className="mb-1.5 block text-sm font-semibold text-inkoust">
              Datum do{" "}
              <span className="font-normal text-inkoust/60">(nepovinné)</span>
            </label>
            <DatumVstup
              id={idPro("datumDo")}
              value={datumDo}
              min={datum.trim().length > 0 ? datum.trim() : undefined}
              disabled={odesilaSe}
              onChange={(iso) => zmenPole("datumDo", iso, setDatumDo)}
              ariaInvalid={poleChybi("datumDo")}
              ariaDescribedBy={poleChybi("datumDo") ? chybaPro("datumDo") : undefined}
              className={`${VSTUP_TRIDY} ${poleChybi("datumDo") ? "border-red-800" : ""}`}
            />
            {chyby.datumDo !== undefined && (
              <p id={chybaPro("datumDo")} role="alert" className="mt-1 text-sm font-semibold text-red-800">
                {chyby.datumDo}
              </p>
            )}
          </div>

          <div className="lg:col-span-2">
            <label htmlFor={idPro("kapacitaCelkem")} className="mb-1.5 block text-sm font-semibold text-inkoust">
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
              <p id={napovedaPro("kapacitaCelkem")} className="mt-1 text-base leading-relaxed text-inkoust/70 lg:text-sm">
                Prázdné nebo 0 = bez omezení míst.
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={idPro("sraz")} className="mb-1.5 block text-sm font-semibold text-inkoust">
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
          <label htmlFor={idPro("popis")} className="mb-1.5 block text-sm font-semibold text-inkoust">
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
          <label htmlFor={idPro("trasaOdkaz")} className="mb-1.5 block text-sm font-semibold text-inkoust">
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
            <p id={napovedaPro("trasaOdkaz")} className="mt-1 text-base leading-relaxed text-inkoust/70 lg:text-sm">
              Vlož odkaz na naplánovanou cestu (mapy.com). Začíná https://.
            </p>
          )}
        </div>

        <VyberSnimku
          id={`${zaklad}-cesta-tam`}
          nadpis="Cesta tam"
          napoveda="Snímky cesty na místo. Nemusíš nic nahrát. Nejvýš 8 obrázků, každý do 8 MB."
          soubory={snimkyTam}
          ulozene={ulozeneTam}
          disabled={odesilaSe}
          onVyber={(e) => pridejSoubory("tam", e)}
          onOdebrat={(index) => setSnimkyTam((prev) => prev.filter((_, i) => i !== index))}
          onSmazatUlozeny={onSmazatSnimek}
        />
        <VyberSnimku
          id={`${zaklad}-cesta-zpet`}
          nadpis="Cesta zpátky"
          napoveda="Snímky cesty zpátky. Nemusíš nic nahrát. Nejvýš 8 obrázků, každý do 8 MB."
          soubory={snimkyZpet}
          ulozene={ulozeneZpet}
          disabled={odesilaSe}
          onVyber={(e) => pridejSoubory("zpet", e)}
          onOdebrat={(index) => setSnimkyZpet((prev) => prev.filter((_, i) => i !== index))}
          onSmazatUlozeny={onSmazatSnimek}
        />
        {chybaSnimku !== null && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {chybaSnimku}
          </p>
        )}
      </div>

      {!skrytAkce && (
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-linka bg-papir px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mt-6 lg:flex-row lg:justify-end lg:border-0 lg:bg-transparent lg:px-0 lg:pb-3">
          <button
            type="button"
            onClick={onZrusit}
            disabled={odesilaSe}
            title={odesilaSe ? "Ukládání probíhá…" : "Zrušit úpravy"}
            className="nahled-press inline-flex min-h-[48px] min-w-[44px] items-center justify-center rounded-xl bg-mlha px-6 py-2 text-base font-semibold text-inkoust hover:bg-linka focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={odesilaSe}
            title={odesilaSe ? "Ukládání probíhá…" : odeslatPopisek}
            className="nahled-press inline-flex min-h-[48px] min-w-[44px] items-center justify-center rounded-xl bg-okr px-6 py-2 text-base font-semibold text-inkoust hover:bg-okr-tmavy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60"
          >
            {odesilaSe ? "Ukládám…" : odeslatPopisek}
          </button>
        </div>
      )}
    </form>
  );
}
