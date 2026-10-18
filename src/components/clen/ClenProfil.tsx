import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { nactiCleny } from "../../lib/admin-clenove";
import { inicialyProAvatar, urlAvataruProZobrazeni } from "../../lib/storage/avatar";
import type { UserListItem } from "../../shared/api-types";

export interface ClenProfilVstup {
  id: string;
  jmeno: string;
  avatarUrl?: string | null;
}

interface ClenProfilKontext {
  otevri: (vstup: ClenProfilVstup) => void;
}

const Kontext = createContext<ClenProfilKontext | null>(null);

let otevreneKarty = 0;

/** True while a member card is open, so Escape does not close the page under it. */
export function jeClenProfilOtevreny(): boolean {
  return otevreneKarty > 0;
}

export function useClenProfil(): ClenProfilKontext {
  const hodnota = useContext(Kontext);
  if (hodnota === null) {
    throw new Error("useClenProfil mimo ClenProfilProvider");
  }
  return hodnota;
}

interface TlacitkoProfiluProps {
  id: string;
  jmeno: string;
  avatarUrl?: string | null;
  className?: string;
  children: ReactNode;
}

/** Klik na jméno nebo avatar otevře kartu člena. */
export function TlacitkoProfilu({
  id,
  jmeno,
  avatarUrl = null,
  className = "",
  children,
}: TlacitkoProfiluProps): JSX.Element {
  const { otevri } = useClenProfil();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`Profil: ${jmeno}`}
      onClick={(udalost) => {
        udalost.preventDefault();
        udalost.stopPropagation();
        otevri({ id, jmeno, avatarUrl });
      }}
      className={`min-h-[44px] rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation] ${className}`}
    >
      {children}
    </button>
  );
}

function RadekKontaktu({
  popisek,
  hodnota,
  href,
}: {
  popisek: string;
  hodnota: string;
  href?: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-mech">
        {popisek}
      </span>
      {href !== undefined ? (
        <a href={href} className="text-sm font-semibold text-smrk underline underline-offset-2">
          {hodnota}
        </a>
      ) : (
        <span className="text-sm font-semibold">{hodnota}</span>
      )}
    </div>
  );
}

function KartaProfilu({
  vstup,
  onZavrit,
}: {
  vstup: ClenProfilVstup;
  onZavrit: () => void;
}): JSX.Element {
  const titulekId = useId();
  const [detail, setDetail] = useState<UserListItem | null>(null);
  const [nacitam, setNacitam] = useState<boolean>(true);
  const [zvetseno, setZvetseno] = useState<boolean>(false);
  const [rozbity, setRozbity] = useState<boolean>(false);

  useEffect(() => {
    let zive = true;
    setNacitam(true);
    setDetail(null);
    setRozbity(false);
    setZvetseno(false);
    void nactiCleny().then((vysledek) => {
      if (!zive) return;
      if (vysledek.ok) {
        setDetail(vysledek.data.find((clen) => clen.id === vstup.id) ?? null);
      }
      setNacitam(false);
    });
    return () => {
      zive = false;
    };
  }, [vstup]);

  useEffect(() => {
    otevreneKarty += 1;
    return () => {
      otevreneKarty -= 1;
    };
  }, []);

  useEffect(() => {
    function naKlavesu(udalost: KeyboardEvent): void {
      if (udalost.key !== "Escape") return;
      udalost.preventDefault();
      udalost.stopPropagation();
      if (zvetseno) setZvetseno(false);
      else onZavrit();
    }
    window.addEventListener("keydown", naKlavesu, true);
    return () => window.removeEventListener("keydown", naKlavesu, true);
  }, [onZavrit, zvetseno]);

  const jmeno = detail?.jmeno ?? vstup.jmeno;
  const ulozenaUrl = detail?.avatarUrl ?? vstup.avatarUrl ?? null;
  const fotka = rozbity ? null : urlAvataruProZobrazeni(ulozenaUrl);
  const telefon = (detail?.telefon ?? "").trim();
  const discord = (detail?.discordNick ?? "").trim();
  const email = (detail?.email ?? "").trim();

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-inkoust/50 p-4 sm:items-center"
        onClick={onZavrit}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titulekId}
          onClick={(udalost) => udalost.stopPropagation()}
          className="w-full max-w-sm rounded-2xl border-2 border-inkoust bg-papir p-5 shadow-denik"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            {fotka !== null ? (
              <button
                type="button"
                onClick={() => setZvetseno(true)}
                aria-label="Zvětšit fotku"
                className="h-32 w-32 overflow-hidden rounded-full border-2 border-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
              >
                <img
                  src={fotka}
                  alt=""
                  width={128}
                  height={128}
                  onError={() => setRozbity(true)}
                  className="h-full w-full object-cover"
                />
              </button>
            ) : (
              <div
                aria-hidden="true"
                className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-inkoust bg-linka text-3xl font-extrabold"
              >
                {inicialyProAvatar(jmeno)}
              </div>
            )}
            <h2 id={titulekId} className="text-xl font-extrabold tracking-tight">
              {jmeno}
            </h2>
            {fotka !== null && (
              <p className="text-xs text-inkoust/60">Klepnutím na fotku ji zvětšíš.</p>
            )}
          </div>

          {nacitam && (
            <p role="status" className="mt-4 text-center text-sm text-inkoust/70">
              Načítám profil…
            </p>
          )}

          {detail !== null && (
            <div className="mt-4 flex flex-col gap-3 text-left">
              {email.length > 0 && (
                <RadekKontaktu popisek="E-mail" hodnota={email} href={`mailto:${email}`} />
              )}
              {telefon.length > 0 && (
                <RadekKontaktu popisek="Telefon" hodnota={telefon} href={`tel:${telefon}`} />
              )}
              {discord.length > 0 && <RadekKontaktu popisek="Discord" hodnota={discord} />}
            </div>
          )}

          <button
            type="button"
            onClick={onZavrit}
            className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full border-2 border-inkoust bg-inkoust px-5 text-sm font-bold text-papir focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
          >
            Zavřít
          </button>
        </div>
      </div>
      {zvetseno && fotka !== null && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-inkoust/85 p-4"
          onClick={() => setZvetseno(false)}
        >
          <button
            type="button"
            onClick={() => setZvetseno(false)}
            className="absolute right-4 top-4 inline-flex min-h-[44px] items-center rounded-full border-2 border-papir bg-inkoust px-4 text-sm font-bold text-papir"
          >
            Zavřít
          </button>
          <img
            src={fotka}
            alt={jmeno}
            onClick={(udalost) => udalost.stopPropagation()}
            className="max-h-[85dvh] max-w-full rounded-lg border-2 border-papir object-contain"
          />
        </div>
      )}
    </>
  );
}

export function ClenProfilProvider({ children }: { children: ReactNode }): JSX.Element {
  const [vstup, setVstup] = useState<ClenProfilVstup | null>(null);
  return (
    <Kontext.Provider value={{ otevri: setVstup }}>
      {children}
      {vstup !== null &&
        createPortal(
          <KartaProfilu vstup={vstup} onZavrit={() => setVstup(null)} />,
          document.body,
        )}
    </Kontext.Provider>
  );
}
