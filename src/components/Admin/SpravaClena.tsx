import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type ReactNode } from "react";
import type { Clenstvi, Funkce } from "../../config/roles";
import { useAuth } from "../../hooks/useAuth";
import { smazClena, ulozProfilClena } from "../../lib/admin-clenove";
import { nactiSkolyTridy } from "../../lib/skoly-tridy";
import {
  POLE_UDAJU,
  chybyZeServeru,
  formularZClena,
  zkontrolujFormular,
  zmenyFormulare,
  type ChybyFormulare,
  type FormularClena,
  type PoleUdaju,
} from "../../lib/sprava-clena";
import { VALIDACE, type UserListItem } from "../../shared/api-types";
import DatumVstup from "../DatumVstup";
import { POLE_FORMULARE, POPISEK_POLE } from "../formular-tridy";
import Ikona from "../Ikona";
import ConfirmDialog from "../kalendar/ConfirmDialog";
import Prepinac from "../Prepinac";
import TelefonPole from "../profil/TelefonPole";
import { tridaZalozky } from "../ProfilKusy";
import SpodniSheet, {
  NADPIS_ODDILU_PANELU,
  OBSAH_PANELU,
  PATICKA_SHEETU,
  TLACITKO_PATICKY_HLAVNI,
  TLACITKO_PATICKY_ZRUSIT,
} from "../shell/SpodniSheet";
import VstupSNabidkou from "../VstupSNabidkou";

type Zalozka = "role" | "udaje";

/** Hodnosti podle ExApp.pen („Modal · Správa člena“). */
const HODNOSTI: readonly { nazev: string; popis: string; clenstvi: Clenstvi; funkce: Funkce }[] = [
  { nazev: "Člen", popis: "Základní přístup, vidí výpravy a hlásí se.", clenstvi: "clen", funkce: null },
  { nazev: "Aktivní člen", popis: "Může zakládat výpravy, být v radě a vedení.", clenstvi: "aktivni_clen", funkce: null },
  { nazev: "Člen rady", popis: "Vidí seznam členů a docházku ostatních.", clenstvi: "aktivni_clen", funkce: "rada" },
  { nazev: "Vedení", popis: "Schvaluje písně a uzavírá výpravy.", clenstvi: "aktivni_clen", funkce: "vedeni" },
];

const KARTA_RADKU =
  "rounded-[14px] bg-papir min-[90rem]:rounded-[10px] min-[90rem]:bg-povrch-2";

interface SpravaClenaProps {
  /** `null` = panel je zavřený. */
  clen: UserListItem | null;
  onZavrit: () => void;
  onUlozeno: (clen: UserListItem) => void;
  onSmazano: (id: string) => void;
}

/**
 * Správa cizího účtu (jen hlavní admin): hodnost, oprávnění, osobní údaje
 * a smazání. Na telefonu spodní panel, na počítači okno.
 */
export default function SpravaClena({ clen, onZavrit, onUlozeno, onSmazano }: SpravaClenaProps): JSX.Element {
  const zamceno = useRef(false);
  return (
    <SpodniSheet
      otevreno={clen !== null}
      titulek="Správa člena"
      podtitul={clen === null ? null : <span className="break-words">{`${clen.jmeno} · ${clen.email}`}</span>}
      sirka={560}
      onZavrit={() => {
        if (!zamceno.current) onZavrit();
      }}
    >
      {clen !== null ? (
        <FormularSpravy
          key={clen.id}
          clen={clen}
          onZavrit={onZavrit}
          onUlozeno={onUlozeno}
          onSmazano={onSmazano}
          onZamek={(probiha) => {
            zamceno.current = probiha;
          }}
        />
      ) : null}
    </SpodniSheet>
  );
}

function FormularSpravy({
  clen,
  onZavrit,
  onUlozeno,
  onSmazano,
  onZamek,
}: Omit<SpravaClenaProps, "clen"> & {
  clen: UserListItem;
  /** Během ukládání a mazání panel nejde zavřít. */
  onZamek: (probiha: boolean) => void;
}): JSX.Element {
  const { user } = useAuth();
  const idPrefix = useId();
  const [zalozka, setZalozka] = useState<Zalozka>("role");
  const [form, setForm] = useState<FormularClena>(() => formularZClena(clen));
  const [chyby, setChyby] = useState<ChybyFormulare>({});
  const [chyba, setChyba] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [potvrzeni, setPotvrzeni] = useState(false);
  const [mazu, setMazu] = useState(false);
  const [chybaMazani, setChybaMazani] = useState<string | null>(null);
  const [skoly, setSkoly] = useState<string[]>([]);
  const [tridy, setTridy] = useState<string[]>([]);
  const odstranitRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const zaostrit = useRef<PoleUdaju | null>(null);

  const vlastniUcet = user !== null && user.id === clen.id;
  const zmeny = zmenyFormulare(clen, form);
  const maZmeny = Object.keys(zmeny).length > 0;
  const meniPrava =
    zmeny.clenstvi !== undefined ||
    zmeny.funkce !== undefined ||
    zmeny.isAdmin !== undefined ||
    zmeny.isSuperadmin !== undefined;

  useEffect(() => {
    let zive = true;
    void nactiSkolyTridy().then((vysledek) => {
      if (!zive || !vysledek.ok) return;
      setSkoly(vysledek.data.skoly);
      setTridy(vysledek.data.tridy);
    });
    return () => {
      zive = false;
    };
  }, []);

  // Pole s chybou může být v druhé záložce, zaostří se až po jejím vykreslení.
  useEffect(() => {
    const pole = zaostrit.current;
    if (pole === null) return;
    zaostrit.current = null;
    formRef.current?.querySelector<HTMLElement>(`[id="${idPrefix}-${pole}"]`)?.focus();
  }, [chyby, idPrefix]);

  function nastav(zmena: Partial<FormularClena>): void {
    setForm((predchozi) => ({ ...predchozi, ...zmena }));
    setChyba(null);
    setChyby((predchozi) => {
      const dalsi = { ...predchozi };
      for (const klic of Object.keys(zmena)) delete dalsi[klic as PoleUdaju];
      if ("clenstvi" in zmena) delete dalsi.hodnost;
      return dalsi;
    });
  }

  function ukazChyby(nove: ChybyFormulare): void {
    const prvni = POLE_UDAJU.find((pole) => nove[pole] !== undefined);
    if (nove.hodnost !== undefined) setZalozka("role");
    else if (prvni !== undefined) {
      setZalozka("udaje");
      zaostrit.current = prvni;
    }
    setChyby(nove);
  }

  async function naUlozit(udalost: FormEvent<HTMLFormElement>): Promise<void> {
    udalost.preventDefault();
    if (ukladam || !maZmeny) return;
    setChyba(null);
    const lokalni = zkontrolujFormular(clen, form);
    if (Object.keys(lokalni).length > 0) {
      ukazChyby(lokalni);
      return;
    }
    setUkladam(true);
    onZamek(true);
    const vysledek = await ulozProfilClena(clen.id, zmeny);
    setUkladam(false);
    onZamek(false);
    if (!vysledek.ok) {
      setChyba(vysledek.chyba);
      ukazChyby(chybyZeServeru(vysledek.chybyPoli));
      return;
    }
    if (vlastniUcet && meniPrava) {
      // Vlastní práva drží session, po změně se musí načíst znovu.
      window.location.reload();
      return;
    }
    onUlozeno(vysledek.data);
    onZavrit();
  }

  async function naSmazat(): Promise<void> {
    if (mazu) return;
    setMazu(true);
    onZamek(true);
    setChybaMazani(null);
    const vysledek = await smazClena(clen.id);
    setMazu(false);
    onZamek(false);
    if (!vysledek.ok) {
      setChybaMazani(vysledek.chyba);
      return;
    }
    setPotvrzeni(false);
    onSmazano(clen.id);
  }

  function pole(klic: PoleUdaju, popisek: string, vstup: ReactNode, siroke = false): JSX.Element {
    return (
      <div className={`flex min-w-0 flex-col gap-1.5 min-[90rem]:gap-[5px] ${siroke ? "col-span-full" : ""}`}>
        <label htmlFor={`${idPrefix}-${klic}`} className={POPISEK_POLE}>
          {popisek}
        </label>
        {vstup}
        {chyby[klic] !== undefined ? (
          <p id={`${idPrefix}-${klic}-chyba`} role="alert" className="text-[12.5px] font-semibold text-akcent">
            {chyby[klic]}
          </p>
        ) : null}
      </div>
    );
  }

  function vlastnosti(klic: PoleUdaju) {
    const neplatny = chyby[klic] !== undefined;
    return {
      id: `${idPrefix}-${klic}`,
      disabled: ukladam,
      neplatny,
      popisChyby: neplatny ? `${idPrefix}-${klic}-chyba` : undefined,
      trida: `${POLE_FORMULARE} disabled:opacity-60 ${neplatny ? "!border-akcent" : ""}`,
    };
  }

  function textovePole(
    klic: "jmeno" | "prijmeni" | "discordNick",
    popisek: string,
    maxDelka: number,
    bezKorektur = false,
  ): JSX.Element {
    const v = vlastnosti(klic);
    return pole(
      klic,
      popisek,
      <input
        id={v.id}
        type="text"
        autoComplete="off"
        autoCapitalize={bezKorektur ? "none" : "words"}
        autoCorrect="off"
        spellCheck={false}
        value={form[klic]}
        disabled={v.disabled}
        maxLength={maxDelka}
        onChange={(e) => nastav({ [klic]: e.target.value })}
        aria-invalid={v.neplatny}
        aria-describedby={v.popisChyby}
        className={v.trida}
      />,
    );
  }

  function poleSNabidkou(klic: "skola" | "trida", popisek: string, nabidky: readonly string[], maxDelka: number): JSX.Element {
    const v = vlastnosti(klic);
    return pole(
      klic,
      popisek,
      <VstupSNabidkou
        id={v.id}
        value={form[klic]}
        onChange={(hodnota) => nastav({ [klic]: hodnota })}
        nabidky={nabidky}
        disabled={v.disabled}
        maxLength={maxDelka}
        placeholder="Nevyplněno"
        neplatny={v.neplatny}
        popisId={v.popisChyby}
        className={v.trida}
      />,
    );
  }

  const telefon = vlastnosti("telefon");
  const narozeniny = vlastnosti("narozeniny");

  return (
    <>
      <form ref={formRef} noValidate aria-busy={ukladam} className={OBSAH_PANELU} onSubmit={(e) => void naUlozit(e)}>
        <div role="tablist" aria-label="Části správy člena" className="flex items-center gap-0.5 rounded-xl bg-povrch-2 p-1">
          {(
            [
              ["role", "Role a práva"],
              ["udaje", "Údaje a účet"],
            ] as const
          ).map(([id, popisek]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${idPrefix}-zalozka-${id}`}
              aria-selected={zalozka === id}
              aria-controls={`${idPrefix}-panel`}
              onClick={() => setZalozka(id)}
              className={`${tridaZalozky(zalozka === id)} min-h-11 flex-1 min-[90rem]:min-h-0`}
            >
              {popisek}
            </button>
          ))}
        </div>

        <div
          id={`${idPrefix}-panel`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-zalozka-${zalozka}`}
          className={OBSAH_PANELU}
        >
          {zalozka === "role" ? (
            <>
              <p id={`${idPrefix}-hodnost`} className={NADPIS_ODDILU_PANELU}>
                Hodnost
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${idPrefix}-hodnost`}
                className="-mt-2 flex flex-col gap-2.5 min-[90rem]:-mt-1 min-[90rem]:gap-2"
              >
                {HODNOSTI.map((hodnost) => {
                  const vybrana = hodnost.clenstvi === form.clenstvi && hodnost.funkce === form.funkce;
                  return (
                    <label
                      key={hodnost.nazev}
                      className={`relative flex cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-2.5 transition-colors motion-reduce:transition-none min-[90rem]:rounded-[10px] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-smrk ${
                        vybrana
                          ? "border-smrk bg-mlha"
                          : "border-transparent bg-papir hover:bg-povrch-2 min-[90rem]:bg-povrch-2 min-[90rem]:hover:bg-linka/70"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${idPrefix}-hodnost`}
                        checked={vybrana}
                        disabled={ukladam}
                        onChange={() => nastav({ clenstvi: hodnost.clenstvi, funkce: hodnost.funkce })}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex size-[18px] shrink-0 items-center justify-center rounded-full ${
                          vybrana ? "bg-smrk" : "border-[1.5px] border-pole"
                        }`}
                      >
                        {vybrana ? <span className="size-1.5 rounded-full bg-povrch" /> : null}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-inkoust min-[90rem]:text-[13px]">{hodnost.nazev}</span>
                        <span className="text-[12.5px] leading-[17px] text-mech min-[90rem]:text-[11.5px] min-[90rem]:leading-4">
                          {hodnost.popis}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {chyby.hodnost !== undefined ? (
                <p role="alert" className="text-[12.5px] font-semibold text-akcent">
                  {chyby.hodnost}
                </p>
              ) : null}

              <p className={NADPIS_ODDILU_PANELU}>Oprávnění</p>
              <div className={`-mt-2 divide-y divide-linka min-[90rem]:-mt-1 ${KARTA_RADKU}`}>
                <RadekPrepinace
                  popisek="Admin"
                  popis={
                    form.isSuperadmin
                      ? "Zapnuto, hlavní admin je vždycky i admin."
                      : "Spravuje výpravy, fotky a pozvánkové kódy."
                  }
                  zapnuto={form.isAdmin || form.isSuperadmin}
                  disabled={ukladam || form.isSuperadmin}
                  onZmena={(isAdmin) => nastav({ isAdmin })}
                />
                <RadekPrepinace
                  popisek="Hlavní admin"
                  popis="Navíc upravuje a maže účty ostatních."
                  zapnuto={form.isSuperadmin}
                  disabled={ukladam}
                  onZmena={(isSuperadmin) => nastav(isSuperadmin ? { isSuperadmin, isAdmin: true } : { isSuperadmin })}
                />
              </div>
              {vlastniUcet && zmeny.isSuperadmin === false ? (
                <p role="status" className="flex gap-2.5 rounded-[10px] bg-[#fbede7] p-3 text-[12.5px] leading-[18px] text-[#7a3a1b]">
                  <Ikona nazev="triangle-alert" className="mt-px size-[15px] shrink-0 text-akcent" />
                  Odebíráš hlavního admina sobě. Po uložení už členy neupravíš.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3.5 min-[23rem]:grid-cols-2 min-[90rem]:gap-3">
                {textovePole("jmeno", "Jméno", VALIDACE.jmenoMaxDelka)}
                {textovePole("prijmeni", "Příjmení", VALIDACE.prijmeniMaxDelka)}
                {pole(
                  "telefon",
                  "Telefon",
                  <TelefonPole
                    id={telefon.id}
                    hodnota={form.telefon}
                    kodZeme={form.kodZeme}
                    onZmena={(hodnota, kodZeme) => nastav({ telefon: hodnota, kodZeme })}
                    vstupTrida={telefon.trida}
                    disabled={telefon.disabled}
                    neplatny={telefon.neplatny}
                    popisChybyId={telefon.popisChyby}
                  />,
                  true,
                )}
                {textovePole("discordNick", "Discord nick", VALIDACE.discordNickMaxDelka, true)}
                {pole(
                  "narozeniny",
                  "Datum narození",
                  <DatumVstup
                    id={narozeniny.id}
                    value={form.narozeniny}
                    onChange={(hodnota) => nastav({ narozeniny: hodnota })}
                    disabled={narozeniny.disabled}
                    min="1900-01-01"
                    className={narozeniny.trida}
                    ariaInvalid={narozeniny.neplatny}
                    ariaDescribedBy={narozeniny.popisChyby}
                  />,
                )}
                {poleSNabidkou("skola", "Škola", skoly, VALIDACE.skolaMaxDelka)}
                {poleSNabidkou("trida", "Třída", tridy, VALIDACE.tridaMaxDelka)}
              </div>
              <p className="flex gap-2 text-[12.5px] leading-[17px] text-mech min-[90rem]:text-[11.5px]">
                <Ikona nazev="info" className="mt-px size-[15px] shrink-0 text-ink-3" />
                E-mail a heslo si každý mění sám v Profilu.
              </p>
              <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[#fbede7] p-3 min-[90rem]:rounded-[10px]">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-semibold text-[#7a3a1b] min-[90rem]:text-[13px]">Odstranit účet</p>
                  <p className="text-[12.5px] leading-[17px] text-[#7a3a1b] min-[90rem]:text-[11.5px] min-[90rem]:leading-4">
                    {vlastniUcet ? "Vlastní účet odsud smazat nejde." : "Přihlášení zmizí a nejde to vrátit."}
                  </p>
                </div>
                {vlastniUcet ? null : (
                  <button
                    ref={odstranitRef}
                    type="button"
                    disabled={ukladam}
                    onClick={() => {
                      setChybaMazani(null);
                      setPotvrzeni(true);
                    }}
                    className="nahled-press inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-akcent px-3.5 text-[13.5px] font-semibold text-papir hover:opacity-90 disabled:opacity-60 min-[90rem]:h-9 min-[90rem]:rounded-[9px] min-[90rem]:text-[12.5px]"
                  >
                    <Ikona nazev="trash-2" className="size-[15px]" />
                    Odstranit
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {chyba !== null ? (
          <p role="alert" className="rounded-[10px] bg-[#fbede7] p-3 text-[13px] leading-[18px] text-[#7a3a1b]">
            {chyba}
          </p>
        ) : null}

        <div className={`${PATICKA_SHEETU} -mt-[18px] min-[90rem]:!mt-1.5`}>
          <button type="button" onClick={onZavrit} disabled={ukladam} className={TLACITKO_PATICKY_ZRUSIT}>
            Zrušit
          </button>
          <button type="submit" disabled={ukladam || !maZmeny} className={TLACITKO_PATICKY_HLAVNI}>
            {ukladam ? "Ukládám…" : "Uložit změny"}
          </button>
        </div>
      </form>
      <ConfirmDialog
        otevreno={potvrzeni}
        nadpis="Odstranit účet?"
        popis={`Účet ${clen.jmeno} zmizí i s přihlášením. Vrátit to nejde.`}
        potvrditPopisek="Odstranit účet"
        probiha={mazu}
        chyba={chybaMazani}
        navratElement={odstranitRef.current}
        onPotvrdit={() => void naSmazat()}
        onZrusit={() => setPotvrzeni(false)}
      />
    </>
  );
}

function RadekPrepinace({
  popisek,
  popis,
  zapnuto,
  disabled,
  onZmena,
}: {
  popisek: string;
  popis: string;
  zapnuto: boolean;
  disabled: boolean;
  onZmena: (zapnuto: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-inkoust min-[90rem]:text-[13px]">{popisek}</span>
        <span className="text-[12.5px] leading-[17px] text-mech min-[90rem]:text-[11.5px] min-[90rem]:leading-4">{popis}</span>
      </span>
      <Prepinac popisek={popisek} zapnuto={zapnuto} disabled={disabled} onZmena={onZmena} />
    </div>
  );
}
