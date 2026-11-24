import type { InputHTMLAttributes, JSX, ReactNode } from "react";
import { Link } from "react-router-dom";
import Ikona, { type NazevIkony } from "../Ikona";
import { POPISEK_POLE } from "../formular-tridy";

const VSTUP_ZAKLAD =
  "h-[46px] w-full rounded-[11px] border bg-povrch px-3.5 text-base text-inkoust placeholder:text-ink-4 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-smrk/25 lg:text-[13.5px]";
export const AUTH_VSTUP = `${VSTUP_ZAKLAD} border-pole focus:border-smrk`;
export const AUTH_VSTUP_CHYBA = `${VSTUP_ZAKLAD} border-akcent focus:border-akcent`;

/** Nadpis kroku: malý řádek „Krok 1 z 2“ a velký titulek. */
export function AuthNadpis({ krok, children }: { krok?: string; children: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      {krok !== undefined ? (
        <p className="text-xs font-semibold tracking-[0.4px] text-okr">{krok}</p>
      ) : null}
      <h1 className="font-display text-[28px] font-bold leading-[29px] tracking-[-0.8px] text-inkoust lg:text-[34px] lg:leading-[33px] lg:tracking-[-1px]">
        {children}
      </h1>
    </div>
  );
}

/** Chyba celého formuláře. */
export function AuthChyba({ id, children }: { id?: string; children: string }): JSX.Element {
  return (
    <p id={id} role="alert" className="rounded-[10px] bg-[#fbede7] p-3 text-[13px] leading-[18px] text-[#7a3a1b]">
      {children}
    </p>
  );
}

/** Spodek stránky: na telefonu sedí dole, na počítači hned pod poli. */
export function AuthSpodek({ children }: { children: ReactNode }): JSX.Element {
  return <div className="mt-auto flex flex-col gap-5 pt-2 sm:mt-0 lg:mt-0 lg:gap-[22px] lg:pt-0">{children}</div>;
}

/** „Máš pozvánkový kód? Zadej kód“ pod hlavním tlačítkem. */
export function AuthOdkaz({ otazka, odkaz, cil }: { otazka: string; odkaz: string; cil: string }): JSX.Element {
  return (
    <p className="flex flex-col items-center text-[12.5px] text-ink-3 lg:flex-row lg:justify-center lg:gap-1.5 lg:border-t lg:border-linka lg:pt-1.5">
      {otazka}
      <Link
        to={cil}
        className="-my-1 inline-flex min-h-11 items-center px-2 font-semibold text-smrk hover:underline lg:my-0 lg:min-h-8 lg:px-0"
      >
        {odkaz}
      </Link>
    </p>
  );
}

export function AuthPrimarniTlacitko({
  children,
  disabled,
  type = "button",
  sipka = true,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  sipka?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="nahled-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-smrk px-5 text-sm font-semibold text-povrch hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
      {sipka ? <Ikona nazev="arrow-right" className="size-4 lg:size-[15px]" /> : null}
    </button>
  );
}

export function AuthPole({
  id,
  label,
  chyba,
  children,
}: {
  id: string;
  label: string;
  chyba?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={POPISEK_POLE}>
        {label}
      </label>
      {children}
      {chyba !== undefined ? (
        <p id={`${id}-chyba`} role="alert" className="text-[12.5px] font-semibold text-akcent">
          {chyba}
        </p>
      ) : null}
    </div>
  );
}

export function AuthVstup({
  id,
  label,
  chyba,
  ikona,
  vstup,
}: {
  id: string;
  label: string;
  chyba?: string;
  ikona?: NazevIkony;
  vstup: InputHTMLAttributes<HTMLInputElement>;
}): JSX.Element {
  return (
    <AuthPole id={id} label={label} chyba={chyba}>
      <div className="relative">
        <input
          {...vstup}
          id={id}
          aria-invalid={chyba !== undefined}
          aria-describedby={chyba !== undefined ? `${id}-chyba` : undefined}
          className={`${chyba !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP} ${ikona !== undefined ? "pr-11" : ""}`}
        />
        {ikona !== undefined ? (
          <Ikona nazev={ikona} className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        ) : null}
      </div>
    </AuthPole>
  );
}

/** Heslo: ikona zámku zároveň heslo ukáže a skryje. */
export function AuthHeslo({
  id,
  chyba,
  ukazat,
  onUkazat,
  vstup,
}: {
  id: string;
  chyba?: string;
  ukazat: boolean;
  onUkazat: () => void;
  vstup: InputHTMLAttributes<HTMLInputElement>;
}): JSX.Element {
  return (
    <AuthPole id={id} label="Heslo" chyba={chyba}>
      <div className="relative">
        <input
          {...vstup}
          id={id}
          type={ukazat ? "text" : "password"}
          aria-invalid={chyba !== undefined}
          aria-describedby={chyba !== undefined ? `${id}-chyba` : undefined}
          className={`${chyba !== undefined ? AUTH_VSTUP_CHYBA : AUTH_VSTUP} pr-12`}
        />
        <button
          type="button"
          aria-pressed={ukazat}
          aria-label={ukazat ? "Skrýt heslo" : "Zobrazit heslo"}
          onClick={onUkazat}
          className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-[11px] hover:text-inkoust focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk ${ukazat ? "text-smrk" : "text-ink-3"}`}
        >
          <Ikona nazev="lock" className="size-4" />
        </button>
      </div>
    </AuthPole>
  );
}

/** Karta „Kde kód vzít“ pod polem pro pozvánkový kód. */
export function AuthKdeKodVzit(): JSX.Element {
  return (
    <div className="flex gap-3 rounded-2xl bg-povrch-2 p-3.5 lg:rounded-[14px]">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-okr-100 text-okr">
        <Ikona nazev="key-round" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-semibold text-inkoust">Kde kód vzít</p>
        <p className="text-[12.5px] leading-[18px] text-mech">
          Vedoucí ho vytvoří v menu Více → Pozvánkové kódy a pošle ti ho. Má 8 znaků a platí jen chvíli.
        </p>
      </div>
    </div>
  );
}
