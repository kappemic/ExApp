import { useEffect, useId, useState, type JSX } from "react";
import SpodniSheet, { PATICKA_SHEETU } from "../shell/SpodniSheet";
import AvatarKruh from "../AvatarKruh";
import VyberPole from "../VyberPole";
import type { ApiUcastnik } from "../../lib/expeditions-ucast";
import type { UserListItem } from "../../shared/api-types";
import type { DochazkaZaznam } from "../../shared/api-types";
import { VALIDACNI_ZPRAVY } from "../../shared/api-types";

const TLACITKO_ULOZIT =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-smrk px-5 text-base font-semibold text-papir hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-60";
const TLACITKO_ZRUSIT =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-pole bg-papir px-5 text-base font-semibold text-inkoust hover:bg-mlha focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-60";

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
  ucastnici,
  uzivatele,
  nacitaUzivatele,
  ukladaSe,
  chyba,
  onZavrit,
  onUlozit,
}: {
  otevreno: boolean;
  ucastnici: readonly ApiUcastnik[];
  uzivatele: readonly UserListItem[];
  nacitaUzivatele: boolean;
  ukladaSe: boolean;
  chyba: string | null;
  onZavrit: () => void;
  onUlozit: (zaznamy: DochazkaZaznam[]) => void;
}): JSX.Element {
  const seznamId = useId();
  const vyberId = useId();
  const [stav, setStav] = useState<Map<string, "ucastnil_se" | "omluven">>(new Map());
  const [vybranyUzivatelId, setVybranyUzivatelId] = useState("");

  useEffect(() => {
    if (!otevreno) return;
    const mapa = new Map<string, "ucastnil_se" | "omluven">();
    for (const clovek of ucastnici) {
      mapa.set(
        clovek.id,
        clovek.status === "omluven" ? "omluven" : "ucastnil_se",
      );
    }
    setStav(mapa);
    setVybranyUzivatelId("");
  }, [otevreno, ucastnici]);

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
    <SpodniSheet otevreno={otevreno} titulek="Docházka" onZavrit={onZavrit}>
      <div className="space-y-4 pb-2">
        <ul id={seznamId} className="divide-y divide-linka rounded-2xl border border-linka">
          {ucastnici.map((clovek) => {
            const ucast = stav.get(clovek.id) ?? "ucastnil_se";
            const pritomen = ucast === "ucastnil_se";
            return (
              <li key={clovek.id} className="flex min-h-[52px] items-center gap-3 px-3">
                <AvatarKruh jmeno={clovek.jmeno} url={clovek.avatarUrl} />
                <span className="min-w-0 flex-1 truncate font-semibold text-inkoust">
                  {clovek.jmeno}
                </span>
                <button
                  type="button"
                  aria-pressed={pritomen}
                  aria-label={`${pritomen ? "Účast potvrzena" : "Omluven"} — ${clovek.jmeno}`}
                  onClick={() => prepni(clovek.id)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                    pritomen
                      ? "border-smrk bg-mlha text-smrk"
                      : "border-pole bg-papir text-mech"
                  }`}
                >
                  {pritomen ? "✓" : "—"}
                </button>
              </li>
            );
          })}
        </ul>
        {dostupni.length > 0 ? (
          <div className="border-t border-linka pt-4">
            <h3 className="text-sm font-bold text-inkoust">Přidat účastníka</h3>
            {nacitaUzivatele ? (
              <p className="mt-2 text-sm text-mech">Načítám uživatele…</p>
            ) : (
              <VyberPole
                id={vyberId}
                value={vybranyUzivatelId}
                onChange={setVybranyUzivatelId}
                className="mt-2 block min-h-11 w-full rounded-xl border border-pole bg-papir px-3 text-base"
                volby={[
                  { value: "", popisek: "— Vyber uživatele —" },
                  ...dostupni.map((u) => ({ value: u.id, popisek: u.jmeno })),
                ]}
              />
            )}
          </div>
        ) : null}
        {neuplna ? (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {VALIDACNI_ZPRAVY.dochazkaNeuplna}
          </p>
        ) : null}
        {chyba !== null ? (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {chyba}
          </p>
        ) : null}
        <div className={PATICKA_SHEETU}>
          <button type="button" onClick={onZavrit} disabled={ukladaSe} className={TLACITKO_ZRUSIT}>
            Zrušit
          </button>
          <button
            type="button"
            onClick={ulozit}
            disabled={ukladaSe || ucastnici.length === 0 || neuplna}
            className={TLACITKO_ULOZIT}
          >
            {ukladaSe ? "Ukládám…" : "Uložit docházku"}
          </button>
        </div>
      </div>
    </SpodniSheet>
  );
}