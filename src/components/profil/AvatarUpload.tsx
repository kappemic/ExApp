/**
 * AvatarUpload — preview + soubor pro tab Osobní údaje (Step 4).
 * URL input odebrán (žádné textové pole na odkaz) — zůstává náhled,
 * výběr souboru, Odebrat (smazat) a Zahodit náhled; DB sloupec
 * `avatar_url` beze změny.
 *
 * Design (frontend-ui-engineering + mobile-native + neon-object-storage):
 * - Deníkové tokeny (papir/inkoust/smrk/linka), 44px touch cíle,
 *   `touch-action: manipulation` z globálu, inputy 16px (text-base)
 *   proti iOS zoomu, `user-select: none` jen na ovládacích prvcích.
 * - Preview 96px kruh; rozbitá URL (`onError`) i prázdný avatar →
 *   fallback iniciály (`inicialyProAvatar` — dlouhá jména, diakritika,
 *   emoji). `aria-hidden` pro dekorativní preview, chybový text přes
 *   `role="alert"`.
 * - Náhled + soubor: `accept` jpeg/png/webp, bez `capture` → mobil nabídne
 *   foťák i galerii; validace typu+velikosti (`overSouborAvataru`, 5 MB).
 *   Uložit nahraje soubor na server (`POST /api/me/avatar`).
 */

import { useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import PostupnaFotka from "../fotky/PostupnaFotka";
import {
  inicialyProAvatar,
  overSouborAvataru,
  urlAvataruProZobrazeni,
} from "../../lib/storage/avatar";

interface AvatarUploadProps {
  /** Existující avatar z profilu (URL z DB, null = bez avatara). Jen k zobrazení + smazání (Odebrat → null); nový odkaz se nevkládá. */
  hodnota: string | null;
  jmeno: string;
  prijmeni?: string | null;
  onZmena: (url: string | null) => void;
  /** Inline chyba pole z formuláře / serveru. */
  chyba?: string | null;
  disabled?: boolean;
  /**
   * Vybraný soubor k nahrání při Uložit. null = žádný nový soubor.
   */
  onSouborZmena?: (soubor: File | null) => void;
}

export default function AvatarUpload({
  hodnota,
  jmeno,
  prijmeni,
  onZmena,
  chyba,
  disabled = false,
  onSouborZmena,
}: AvatarUploadProps): JSX.Element {
  const [rozbity, setRozbity] = useState<boolean>(false);
  const [souborChyba, setSouborChyba] = useState<string | null>(null);
  const [souborNahled, setSouborNahled] = useState<string | null>(null);
  const [souborNazev, setSouborNazev] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRozbity(false);
  }, [hodnota]);

  const predchoziHodnota = useRef<string | null>(hodnota);
  useEffect(() => {
    if (predchoziHodnota.current === hodnota) return;
    predchoziHodnota.current = hodnota;
    if (souborNahled !== null && hodnota !== null && hodnota.startsWith("https://")) {
      URL.revokeObjectURL(souborNahled);
      setSouborNahled(null);
      setSouborNazev(null);
    }
  }, [hodnota, souborNahled]);

  // Lokální object URL vždy uklidit (žádný leak při opakovaném výběru).
  useEffect(() => {
    return () => {
      if (souborNahled !== null) URL.revokeObjectURL(souborNahled);
    };
  }, [souborNahled]);

  const zobrazenyUrl: string | null = souborNahled ?? urlAvataruProZobrazeni(hodnota);
  const ukazInicialy: boolean = rozbity || zobrazenyUrl === null || zobrazenyUrl.length === 0;
  const inicialy: string = inicialyProAvatar(jmeno, prijmeni ?? undefined);
  const fileId = "profil-avatar-soubor";
  const popisChybaId = "profil-avatar-chyba";
  const zobrazenaChyba: string | null = chyba ?? souborChyba;

  function vyberSoubor(e: ChangeEvent<HTMLInputElement>): void {
    const soubor: File | undefined = e.target.files?.[0];
    if (soubor === undefined) return;
    const problem: string | null = overSouborAvataru(soubor);
    if (problem !== null) {
      setSouborChyba(problem);
      return;
    }
    setSouborChyba(null);
    if (souborNahled !== null) URL.revokeObjectURL(souborNahled);
    setSouborNahled(URL.createObjectURL(soubor));
    setSouborNazev(soubor.name);
    setRozbity(false);
    onSouborZmena?.(soubor);
  }

  function zahodSouborNahled(): void {
    if (souborNahled !== null) URL.revokeObjectURL(souborNahled);
    setSouborNahled(null);
    setSouborNazev(null);
    setSouborChyba(null);
    onSouborZmena?.(null);
    if (fileRef.current !== null) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        {ukazInicialy ? (
          <div
            aria-hidden="true"
            className="flex h-24 w-24 shrink-0 select-none items-center justify-center overflow-hidden rounded-full border-2 border-inkoust bg-linka text-2xl font-extrabold tracking-tight text-inkoust"
          >
            <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-2">
              {inicialy}
            </span>
          </div>
        ) : (
          <PostupnaFotka
            src={zobrazenyUrl ?? ""}
            alt=""
            aria-hidden="true"
            width={96}
            height={96}
            onError={() => setRozbity(true)}
            className="h-24 w-24 shrink-0 rounded-full border-2 border-inkoust bg-linka object-cover"
          />
        )}
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold">Avatar</p>
          <p className="mt-0.5 max-w-full overflow-wrap-anywhere break-words text-sm text-inkoust/70">
            {souborNazev !== null
              ? `Vybraný soubor: ${souborNazev}. Uloží se tlačítkem Uložit změny.`
              : "Fotka z mobilu nebo počítače. Uloží se s profilem."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hodnota !== null && hodnota.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  zahodSouborNahled();
                  onZmena(null);
                }}
                className="min-h-[44px] min-w-[44px] touch-manipulation rounded border-2 border-inkoust bg-white px-3 py-2 text-sm font-bold text-inkoust select-none hover:bg-linka/60 disabled:opacity-50"
              >
                Odebrat
              </button>
            )}
            {souborNahled !== null && (
              <button
                type="button"
                disabled={disabled}
                onClick={zahodSouborNahled}
                className="min-h-[44px] min-w-[44px] touch-manipulation rounded border-2 border-inkoust bg-white px-3 py-2 text-sm font-bold text-inkoust select-none hover:bg-linka/60 disabled:opacity-50"
              >
                Zahodit náhled souboru
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fileId} className="text-sm font-bold">
          Vyber foto
        </label>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={vyberSoubor}
          className="min-h-[44px] w-full rounded border-2 border-dashed border-inkoust/40 bg-white/70 px-3 py-2 text-base text-inkoust focus:outline-none focus-visible:ring-2 focus-visible:ring-inkoust focus-visible:ring-offset-2 focus-visible:ring-offset-papir file:mr-3 file:rounded file:border-2 file:border-inkoust file:bg-papir file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-inkoust"
        />
        <p className="text-xs text-inkoust/70">JPEG, PNG nebo WebP, nejvýš 5 MB.</p>
      </div>

      {zobrazenaChyba !== null && (
        <p id={popisChybaId} role="alert" className="text-sm font-bold text-red-800">
          {zobrazenaChyba}
        </p>
      )}
    </div>
  );
}
