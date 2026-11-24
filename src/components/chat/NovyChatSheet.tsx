import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { popisekClena } from "../../lib/clen-popisek";
import type { PravoSkupiny } from "../../lib/skupiny-pristup";
import { mapujRoliNaProfil } from "../../config/roles";
import type { UserListItem } from "../../shared/api-types";
import AvatarKruh from "../AvatarKruh";
import Ikona, { type NazevIkony } from "../Ikona";
import { POLE_FORMULARE } from "../formular-tridy";
import SpodniSheet, { OBSAH_PANELU, PATICKA_SHEETU, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import SkupinaForm from "./SkupinaForm";

type Druh = "soukroma" | "skupina";

const DRUHY: readonly { id: Druh; nazev: string; ikona: NazevIkony }[] = [
  { id: "soukroma", nazev: "Soukromá zpráva", ikona: "user" },
  { id: "skupina", nazev: "Skupina", ikona: "users" },
];

function bezDiakritiky(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Nový chat na jednom místě: soukromá zpráva členovi, pro vedení i nová skupina. */
export default function NovyChatSheet({
  otevreno,
  clenove,
  jaId,
  partneri,
  muzeSkupinu,
  ukladaSe,
  chyba,
  onZavrit,
  onClen,
  onVytvoritSkupinu,
}: {
  otevreno: boolean;
  clenove: readonly UserListItem[];
  jaId: string | null;
  /** Členové, se kterými už soukromý chat existuje (malá písmena). */
  partneri: ReadonlySet<string>;
  muzeSkupinu: boolean;
  ukladaSe: boolean;
  chyba: string | null;
  onZavrit: () => void;
  onClen: (clen: UserListItem) => void;
  onVytvoritSkupinu: (nazev: string, prava: PravoSkupiny[]) => void;
}): JSX.Element {
  const [druh, setDruh] = useState<Druh>("soukroma");
  const [dotaz, setDotaz] = useState("");
  const poleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!otevreno) return;
    setDruh("soukroma");
    setDotaz("");
  }, [otevreno]);

  // Na počítači se rovnou píše, na telefonu by klávesnice zakryla seznam.
  useEffect(() => {
    if (!otevreno || druh !== "soukroma" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    poleRef.current?.focus();
  }, [otevreno, druh]);

  const lide = useMemo(() => {
    const q = bezDiakritiky(dotaz.trim());
    return clenove
      .filter((clen) => clen.id !== jaId)
      .filter((clen) => q.length === 0 || bezDiakritiky(clen.jmeno).includes(q) || clen.email.toLowerCase().includes(q))
      .sort((a, b) => a.jmeno.localeCompare(b.jmeno, "cs"));
  }, [clenove, jaId, dotaz]);

  return (
    <SpodniSheet
      otevreno={otevreno}
      titulek="Nový chat"
      podtitul={druh === "skupina" ? "Skupinu uvidí jen role, které vybereš." : "Vyber, komu chceš napsat."}
      sirka={480}
      onZavrit={onZavrit}
    >
      <div className={OBSAH_PANELU}>
        {muzeSkupinu ? (
          <div role="group" aria-label="Druh chatu" className="flex gap-2">
            {DRUHY.map((polozka) => {
              const vybrany = druh === polozka.id;
              return (
                <button
                  key={polozka.id}
                  type="button"
                  aria-pressed={vybrany}
                  onClick={() => setDruh(polozka.id)}
                  className={`nahled-press flex flex-1 flex-col items-center gap-[5px] rounded-xl border px-2.5 py-3 text-[13px] font-semibold min-[90rem]:rounded-[10px] min-[90rem]:py-[11px] min-[90rem]:text-[11px] ${
                    vybrany ? "border-smrk bg-mlha text-smrk" : "border-transparent bg-papir text-mech hover:bg-povrch-2 min-[90rem]:bg-pole-podklad"
                  }`}
                >
                  <Ikona nazev={polozka.ikona} className={`size-4 ${vybrany ? "text-smrk" : "text-ink-3"}`} />
                  {polozka.nazev}
                </button>
              );
            })}
          </div>
        ) : null}

        {druh === "soukroma" ? (
          <>
            <div className="relative">
              <Ikona
                nazev="search"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3 min-[90rem]:left-3"
              />
              <input
                ref={poleRef}
                type="search"
                value={dotaz}
                onChange={(udalost) => setDotaz(udalost.target.value)}
                aria-label="Najít člena"
                placeholder="Najít člena"
                autoComplete="off"
                className={`!pl-10 min-[90rem]:!pl-9 ${POLE_FORMULARE}`}
              />
            </div>
            {lide.length === 0 ? (
              <p role="status" className="rounded-[14px] bg-papir px-4 py-6 text-center text-[13.5px] text-mech">
                {clenove.length === 0 ? "Načítám členy…" : "Nikdo takový v klubu není."}
              </p>
            ) : (
              <ul className="posuvnik -mx-1.5 m-0 flex max-h-[44dvh] min-h-[180px] list-none flex-col gap-0.5 overflow-y-auto p-0 min-[90rem]:max-h-[340px]">
                {lide.map((clen) => {
                  const profil = mapujRoliNaProfil(clen.role);
                  const popis = popisekClena(
                    {
                      clenstvi: clen.clenstvi ?? profil.clenstvi,
                      funkce: clen.funkce ?? profil.funkce,
                      isAdmin: clen.isAdmin ?? profil.isAdmin,
                    },
                    clen.isSuperadmin === true,
                  );
                  return (
                    <li key={clen.id}>
                      <button
                        type="button"
                        onClick={() => onClen(clen)}
                        className="bez-prejeti flex min-h-[56px] w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left hover:bg-povrch-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation] min-[90rem]:min-h-12"
                      >
                        <AvatarKruh jmeno={clen.jmeno} url={clen.avatarUrl} ton="barevny" velikost={36} />
                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="truncate text-sm font-semibold text-inkoust min-[90rem]:text-[13px]">{clen.jmeno}</span>
                          <span className="truncate text-xs text-ink-3 min-[90rem]:text-[11.5px]">{popis}</span>
                        </span>
                        {partneri.has(clen.id.toLowerCase()) ? (
                          <span className="shrink-0 rounded-full bg-povrch-2 px-[9px] py-[3px] text-[10.5px] font-semibold text-mech">Píšete si</span>
                        ) : null}
                        <Ikona nazev="chevron-right" className="size-4 shrink-0 text-ink-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </div>
      {druh === "soukroma" ? (
        <div className={PATICKA_SHEETU}>
          <button type="button" onClick={onZavrit} className={TLACITKO_PATICKY_ZRUSIT}>
            Zrušit
          </button>
        </div>
      ) : (
        <div className="mt-[18px] min-[90rem]:mt-3.5">
          <SkupinaForm
            nazev=""
            prava={[]}
            odeslat="Vytvořit skupinu"
            ukladaSe={ukladaSe}
            chyba={chyba}
            onZrusit={onZavrit}
            onUlozit={onVytvoritSkupinu}
          />
        </div>
      )}
    </SpodniSheet>
  );
}
