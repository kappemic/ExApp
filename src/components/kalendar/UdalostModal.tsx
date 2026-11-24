import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import Ikona, { type NazevIkony } from "../Ikona";
import SpodniSheet, {
  NADPIS_ODDILU_PANELU,
  OBSAH_PANELU,
  PATICKA_SHEETU,
  TLACITKO_PATICKY_HLAVNI,
  TLACITKO_PATICKY_ODEBRAT,
} from "../shell/SpodniSheet";
import { nactiCleny } from "../../lib/admin-clenove";
import { casKZobrazeni } from "../../lib/evropsky-cas";
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

const KAZDY_DEN = [
  "Každou neděli",
  "Každé pondělí",
  "Každé úterý",
  "Každou středu",
  "Každý čtvrtek",
  "Každý pátek",
  "Každou sobotu",
] as const;

const denVTydnu = new Intl.DateTimeFormat("cs-CZ", { weekday: "long" });

function velke(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function kratkyDen(ymd: string): string {
  return `${Number(ymd.slice(8, 10))}. ${Number(ymd.slice(5, 7))}.`;
}

function pocetClenuText(pocet: number): string {
  if (pocet === 1) return "1 člen";
  return pocet >= 2 && pocet <= 4 ? `${pocet} členové` : `${pocet} členů`;
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
      ? casKZobrazeni(schuzka.cas)
      : "Celý den";
  const mistnost = schuzka.mistnost?.trim() ?? "";
  const den = new Date(`${datumVyskytu}T12:00:00`);
  const kdyRadku = `${velke(denVTydnu.format(den))} ${formatCelyDatum(datumVyskytu)}`;
  const opakuje = schuzka.opakovani === "tydenni";
  const podtitul = [
    `${opakuje ? (KAZDY_DEN[den.getDay()] ?? "Každý týden") : kdyRadku}${casText === "Celý den" ? "" : ` ${casText}`}`,
    mistnost.length > 0 ? mistnost.charAt(0).toLowerCase() + mistnost.slice(1) : null,
  ]
    .filter((cast): cast is string => cast !== null && cast.length > 0)
    .join(" · ");

  const [pocetClenu, setPocetClenu] = useState<number | null>(null);
  useEffect(() => {
    if (!otevreno) return;
    let zive = true;
    void (async (): Promise<void> => {
      const vysledek = await nactiCleny();
      if (zive && vysledek.ok) setPocetClenu(vysledek.data.length);
    })();
    return () => {
      zive = false;
    };
  }, [otevreno]);

  const radky: readonly { ikona: NazevIkony; popisek: string; hodnota: string }[] = [
    {
      ikona: "calendar",
      popisek: "Kdy",
      hodnota: `${kdyRadku}, ${casText === "Celý den" ? "celý den" : casText}`,
    },
    { ikona: "repeat", popisek: "Opakování", hodnota: opakuje ? "Každý týden" : "Jednorázově" },
    { ikona: "map-pin", popisek: "Místo", hodnota: mistnost.length > 0 ? mistnost : "Venku" },
    {
      ikona: "users",
      popisek: "Kdo",
      hodnota: pocetClenu === null ? "Celý klub" : `Celý klub · ${pocetClenuText(pocetClenu)}`,
    },
  ];

  const dalsiTerminy = useMemo(() => {
    if (schuzka.opakovani !== "tydenni") return [];
    const vynech = new Set(schuzka.vynecheneVyskyty ?? []);
    const vyskyty: string[] = [];
    for (let m = mesic; m <= mesic + 2; m += 1) {
      const rokProMesic = m > 12 ? rok + Math.floor((m - 1) / 12) : rok;
      const mesicNorm = ((m - 1) % 12) + 1;
      for (const ymd of vyskytySchuzky(schuzka, rokProMesic, mesicNorm)) {
        if (vynech.has(ymd)) continue;
        if (ymd >= datumVyskytu && !vyskyty.includes(ymd)) vyskyty.push(ymd);
      }
    }
    return vyskyty.slice(0, 4);
  }, [schuzka, rok, mesic, datumVyskytu]);

  return (
    <>
      <SpodniSheet otevreno={otevreno} titulek={schuzka.nazev} podtitul={podtitul} onZavrit={onZavrit}>
        <div className={OBSAH_PANELU}>
          <dl className="flex flex-col gap-3 rounded-[14px] bg-papir p-3.5 min-[90rem]:gap-3.5 min-[90rem]:bg-transparent min-[90rem]:p-0">
            {radky.map((radek) => (
              <div key={radek.popisek} className="flex items-center gap-2.5">
                <span aria-hidden="true" className="hidden size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-povrch-2 text-mech min-[90rem]:flex">
                  <Ikona nazev={radek.ikona} className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 min-[90rem]:gap-0">
                  <dt className="text-[11.5px] font-semibold text-ink-3 min-[90rem]:text-[10.5px] min-[90rem]:font-medium">{radek.popisek}</dt>
                  <dd className="m-0 text-sm text-inkoust min-[90rem]:text-[12.5px] min-[90rem]:font-semibold">{radek.hodnota}</dd>
                </div>
              </div>
            ))}
          </dl>
          {schuzka.popis.trim().length > 0 ? (
            <p className="whitespace-pre-line text-[13.5px] leading-5 text-mech min-[90rem]:text-[12.5px] min-[90rem]:leading-[18px]">
              {schuzka.popis}
            </p>
          ) : null}
          {dalsiTerminy.length > 1 ? (
            <>
              <span aria-hidden="true" className="hidden h-px bg-linka min-[90rem]:block" />
              <p className={NADPIS_ODDILU_PANELU}>Další termíny</p>
              <ul className="flex flex-wrap gap-2 min-[90rem]:gap-1.5">
                {dalsiTerminy.map((ymd) => (
                  <li
                    key={ymd}
                    className={`flex h-9 items-center rounded-[10px] px-2.5 text-[12.5px] font-semibold min-[90rem]:h-auto min-[90rem]:rounded-full min-[90rem]:py-[5px] min-[90rem]:text-[11.5px] ${
                      ymd === datumVyskytu
                        ? "bg-smrk text-povrch min-[90rem]:bg-mlha min-[90rem]:text-smrk"
                        : "bg-papir text-mech min-[90rem]:bg-povrch-2"
                    }`}
                  >
                    <time dateTime={ymd}>{kratkyDen(ymd)}</time>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        {muzeSpravovat ? (
          <div className={PATICKA_SHEETU}>
            <button
              type="button"
              ref={spoustecRef}
              disabled={mazeSeSchuzka === schuzka.id}
              onClick={() => {
                setRozsah(opakuje ? "vyskyt" : null);
                setKPotvereni({ id: schuzka.id, nazev: schuzka.nazev });
              }}
              aria-label={mazeSeSchuzka === schuzka.id ? "Mažu…" : `Zrušit termín schůzky ${schuzka.nazev}`}
              className={TLACITKO_PATICKY_ODEBRAT}
            >
              {mazeSeSchuzka === schuzka.id ? (
                "Mažu…"
              ) : (
                <span>
                  Zrušit <span className="hidden min-[90rem]:inline">tento </span>termín
                </span>
              )}
            </button>
            <button type="button" onClick={() => onUpravit(schuzka)} className={TLACITKO_PATICKY_HLAVNI}>
              Upravit
            </button>
          </div>
        ) : null}
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