import {
  createContext,
  useContext,
  useEffect,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { nactiCleny } from "../../lib/admin-clenove";
import { urlAvataruProZobrazeni } from "../../lib/storage/avatar";
import PostupnaFotka from "../fotky/PostupnaFotka";
import type { UserListItem } from "../../shared/api-types";
import { zobrazeniTelefonu } from "../../shared/telefon";
import { klicSoukromehoChatu } from "../../shared/soukromy-klic";
import { popisekClena, profilClena } from "../../lib/clen-popisek";
import { useAuth } from "../../hooks/useAuth";
import AvatarKruh from "../AvatarKruh";
import { KARTA_UDAJU } from "../ProfilKusy";
import SpodniSheet, {
  OBSAH_PANELU,
  PATICKA_SHEETU,
  TLACITKO_PATICKY_HLAVNI,
  TLACITKO_PATICKY_ZRUSIT,
} from "../shell/SpodniSheet";

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
    <li className="flex min-h-11 items-center justify-between gap-4 px-3.5">
      <span className="shrink-0 text-[13px] text-ink-3">{popisek}</span>
      {href !== undefined ? (
        <a
          href={href}
          className="inline-flex min-h-11 min-w-0 items-center text-right text-[13px] font-semibold text-smrk hover:underline"
        >
          <span className="min-w-0 break-all">{hodnota}</span>
        </a>
      ) : (
        <span className="min-w-0 break-words text-right text-[13px] font-semibold text-inkoust">{hodnota}</span>
      )}
    </li>
  );
}

function KartaProfilu({
  vstup,
  onZavrit,
}: {
  vstup: ClenProfilVstup;
  onZavrit: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const telefonZobrazeni = zobrazeniTelefonu(detail?.telefon);
  const discord = (detail?.discordNick ?? "").trim();
  const email = (detail?.email ?? "").trim();
  const skola = [detail?.skola ?? "", detail?.trida ?? ""].map((cast) => cast.trim()).filter((cast) => cast.length > 0).join(" · ");
  const klicChatu = user === null || user.id === vstup.id ? null : klicSoukromehoChatu(user.id, vstup.id);

  function prejdi(cil: string): void {
    onZavrit();
    navigate(cil);
  }

  return (
    <>
      <SpodniSheet
        otevreno
        nadDialogem
        titulek={jmeno}
        podtitul={
          detail !== null ? popisekClena(profilClena(detail), detail.isSuperadmin) : nacitam ? "Načítám profil…" : null
        }
        vlevo={
          fotka !== null ? (
            <button
              type="button"
              onClick={() => setZvetseno(true)}
              aria-label="Zvětšit fotku"
              className="nahled-press size-16 shrink-0 overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk [touch-action:manipulation]"
            >
              <PostupnaFotka
                src={fotka}
                alt=""
                width={64}
                height={64}
                onError={() => setRozbity(true)}
                className="size-full object-cover"
              />
            </button>
          ) : (
            <AvatarKruh jmeno={jmeno} url={null} ton="barevny" velikost={64} />
          )
        }
        sirka={420}
        onZavrit={onZavrit}
      >
        <div className={OBSAH_PANELU}>
          {detail !== null ? (
            <ul aria-label="Kontakt" className={KARTA_UDAJU}>
              {email.length > 0 ? <RadekKontaktu popisek="E-mail" hodnota={email} href={`mailto:${email}`} /> : null}
              {telefonZobrazeni.text.length > 0 ? (
                <RadekKontaktu
                  popisek="Telefon"
                  hodnota={telefonZobrazeni.text}
                  href={telefonZobrazeni.href ?? undefined}
                />
              ) : null}
              {discord.length > 0 ? <RadekKontaktu popisek="Discord" hodnota={discord} /> : null}
              {skola.length > 0 ? <RadekKontaktu popisek="Škola" hodnota={skola} /> : null}
            </ul>
          ) : nacitam ? (
            <div role="status" aria-label="Načítám profil" className="h-[140px] rounded-2xl bg-povrch-2 motion-safe:animate-pulse" />
          ) : (
            <p className="text-[13.5px] text-mech">Údaje člena se nepodařilo načíst.</p>
          )}
          <div className={`${PATICKA_SHEETU} -mt-[18px] min-[90rem]:!mt-1.5`}>
            <button
              type="button"
              onClick={() => prejdi(`/cleny/${encodeURIComponent(vstup.id)}`)}
              className={TLACITKO_PATICKY_ZRUSIT}
            >
              Celý profil
            </button>
            {klicChatu !== null ? (
              <button
                type="button"
                onClick={() => prejdi(`/chat?konverzace=${encodeURIComponent(klicChatu)}`)}
                className={TLACITKO_PATICKY_HLAVNI}
              >
                Napsat zprávu
              </button>
            ) : null}
          </div>
        </div>
      </SpodniSheet>
      {zvetseno && fotka !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotka: ${jmeno}`}
          className="nocturne lightbox-pozadi fixed inset-0 z-[120] flex flex-col"
          onClick={() => setZvetseno(false)}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <PostupnaFotka
              src={fotka}
              alt={jmeno}
              prednost
              zamlzeni
              onClick={(udalost) => udalost.stopPropagation()}
              className="max-h-full max-w-full rounded-lg border-2 border-papir object-contain"
            />
          </div>
          <div className="flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={(udalost) => {
                udalost.stopPropagation();
                setZvetseno(false);
              }}
              className="inline-flex min-h-[44px] min-w-[7.5rem] items-center justify-center rounded-xl border-2 border-papir bg-inkoust px-5 text-sm font-bold text-papir focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-papir [touch-action:manipulation]"
            >
              Zavřít
            </button>
          </div>
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
