import { useEffect, useId, useState, type JSX } from "react";
import SpodniSheet, { PATICKA_SHEETU, TLACITKO_PATICKY_HLAVNI, TLACITKO_PATICKY_ZRUSIT } from "../shell/SpodniSheet";
import Ikona from "../Ikona";
import AvatarKruh from "../AvatarKruh";
import VyberPole from "../VyberPole";
import type { ApiUcastnik } from "../../lib/expeditions-ucast";
import type { UserListItem } from "../../shared/api-types";
import type { DochazkaZaznam } from "../../shared/api-types";
import { VALIDACNI_ZPRAVY } from "../../shared/api-types";

function dochazkaJeUplna(
  ucastnici: readonly ApiUcastnik[],
  zaznamy: readonly DochazkaZaznam[],
): boolean {
  if (ucastnici.length === 0) return zaznamy.length === 0;
  const idSet = new Set(zaznamy.map((z) => z.ucastnikId));
  if (idSet.size !== zaznamy.length) return false;
  return ucastnici.every((u) => idSet.has(u.id));
}

export default function DochazkaVypravaSheet({
  otevreno,
  podtitul,
  ucastnici,
  uzivatele,
  nacitaUzivatele,
  ukladaSe,
  chyba,
  onZavrit,
  onPridat,
  onUlozit,
}: {
  otevreno: boolean;
  /** Název výpravy a datum. */
  podtitul: string;
  ucastnici: readonly ApiUcastnik[];
  uzivatele: readonly UserListItem[];
  nacitaUzivatele: boolean;
  ukladaSe: boolean;
  chyba: string | null;
  onZavrit: () => void;
  onPridat: (userId: string) => void;
  onUlozit: (zaznamy: DochazkaZaznam[]) => void;
}): JSX.Element {
  const seznamId = useId();
  const vyberId = useId();
  const [stav, setStav] = useState<Map<string, "ucastnil_se" | "omluven">>(new Map());

  useEffect(() => {
    if (!otevreno) return;
    // Přidaný účastník nesmí zahodit už odškrtnuté řádky.
    setStav((predchozi) => {
      const mapa = new Map<string, "ucastnil_se" | "omluven">();
      for (const clovek of ucastnici) {
        mapa.set(
          clovek.id,
          predchozi.get(clovek.id) ?? (clovek.status === "omluven" ? "omluven" : "ucastnil_se"),
        );
      }
      return mapa;
    });
  }, [otevreno, ucastnici]);

  useEffect(() => {
    if (!otevreno) setStav(new Map());
  }, [otevreno]);

  const evidovaniUserId = new Set(
    ucastnici.flatMap((u) => (u.userId === null ? [] : [u.userId])),
  );
  const dostupni = uzivatele.filter((u) => !evidovaniUserId.has(u.id));

  function prepni(id: string): void {
    setStav((prev) => {
      const dalsi = new Map(prev);
      const aktualni = dalsi.get(id) ?? "ucastnil_se";
      dalsi.set(id, aktualni === "ucastnil_se" ? "omluven" : "ucastnil_se");
      return dalsi;
    });
  }

  function ulozit(): void {
    const zaznamy: DochazkaZaznam[] = ucastnici.map((u) => ({
      ucastnikId: u.id,
      status: stav.get(u.id) ?? (u.status === "omluven" ? "omluven" : "ucastnil_se"),
    }));
    if (!dochazkaJeUplna(ucastnici, zaznamy)) return;
    onUlozit(zaznamy);
  }

  const neuplna =
    !dochazkaJeUplna(
      ucastnici,
      ucastnici.map((u) => ({
        ucastnikId: u.id,
        status: stav.get(u.id) ?? "ucastnil_se",
      })),
    ) && ucastnici.length > 0;

  return (
    <SpodniSheet otevreno={otevreno} titulek="Docházka" podtitul={podtitul} sirka={560} onZavrit={onZavrit}>
      <div className="flex flex-col gap-[18px] min-[90rem]:gap-3.5">
        <ul id={seznamId} className="flex flex-col gap-2 min-[90rem]:gap-3.5">
          {ucastnici.map((clovek) => {
            const pritomen = (stav.get(clovek.id) ?? "ucastnil_se") === "ucastnil_se";
            return (
              <li key={clovek.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={pritomen}
                  onClick={() => prepni(clovek.id)}
                  className="bez-prejeti flex w-full items-center gap-2.5 rounded-[14px] bg-papir p-2.5 text-left min-[90rem]:rounded-lg min-[90rem]:bg-transparent min-[90rem]:px-0 min-[90rem]:py-[7px]"
                >
                  <span className="min-[90rem]:hidden">
                    <AvatarKruh jmeno={clovek.jmeno} url={clovek.avatarUrl} ton="barevny" velikost={36} />
                  </span>
                  <span
                    aria-hidden="true"
                    className={`order-last flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-povrch min-[90rem]:order-first min-[90rem]:size-5 ${
                      pritomen ? "bg-smrk" : "border border-pole bg-povrch min-[90rem]:bg-transparent"
                    }`}
                  >
                    {pritomen ? <Ikona nazev="check" className="size-3" tloustka={3} /> : null}
                  </span>
                  <span className="hidden min-[90rem]:block">
                    <AvatarKruh jmeno={clovek.jmeno} url={clovek.avatarUrl} ton="cizi" velikost={28} />
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium min-[90rem]:text-[13px] ${
                      pritomen ? "text-inkoust min-[90rem]:font-semibold" : "text-inkoust min-[90rem]:text-ink-3"
                    }`}
                  >
                    {clovek.jmeno}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {dostupni.length > 0 ? (
          <VyberPole
            id={vyberId}
            value=""
            disabled={nacitaUzivatele}
            onChange={onPridat}
            prazdnyPopisek={nacitaUzivatele ? "Načítám uživatele…" : "Přidat účastníka"}
            ikonaVlevo="user-plus"
            className="h-11 w-full justify-center rounded-xl bg-mlha text-sm font-semibold text-smrk min-[90rem]:h-[38px] min-[90rem]:justify-start min-[90rem]:rounded-[10px] min-[90rem]:border min-[90rem]:border-linka min-[90rem]:bg-transparent min-[90rem]:px-3 min-[90rem]:text-xs min-[90rem]:font-medium min-[90rem]:text-ink-3"
            volby={dostupni.map((u) => ({ value: u.id, popisek: u.jmeno }))}
          />
        ) : null}
        {neuplna ? (
          <p role="alert" className="text-[13px] font-semibold text-akcent">
            {VALIDACNI_ZPRAVY.dochazkaNeuplna}
          </p>
        ) : null}
        {chyba !== null ? (
          <p role="alert" className="text-[13px] font-semibold text-akcent">
            {chyba}
          </p>
        ) : null}
      </div>
        <div className={PATICKA_SHEETU}>
          <button type="button" onClick={onZavrit} disabled={ukladaSe} className={TLACITKO_PATICKY_ZRUSIT}>
            Zrušit
          </button>
          <button
            type="button"
            onClick={ulozit}
            disabled={ukladaSe || ucastnici.length === 0 || neuplna}
            className={TLACITKO_PATICKY_HLAVNI}
          >
            {ukladaSe ? "Ukládám…" : "Uložit docházku"}
          </button>
        </div>
    </SpodniSheet>
  );
}