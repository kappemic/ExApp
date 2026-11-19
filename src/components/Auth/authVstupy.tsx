import type { InputHTMLAttributes, JSX, ReactNode } from "react";

export const AUTH_VSTUP =
  "min-h-11 w-full rounded-full border border-pole bg-white px-4 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 transition-colors focus:border-smrk focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk motion-reduce:transition-none";
export const AUTH_VSTUP_CHYBA =
  "min-h-11 w-full rounded-full border-2 border-red-800 bg-white px-4 py-2.5 text-base text-inkoust placeholder:text-inkoust/40 focus:border-red-800 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800";

export function AuthPrimarniTlacitko({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-smrk px-5 text-base font-semibold text-papir transition-opacity disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
    >
      {children}
      <span aria-hidden="true" className="text-papir/90">
        →
      </span>
    </button>
  );
}

export function IkonaZamku({ className = "h-[18px] w-[18px]" }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IkonaKlice({ className = "h-5 w-5" }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m15.5 7.5 2.9 2.9" />
      <path d="M11 11 6.6 15.4a4.5 4.5 0 1 0 2.1 2.1L13 13" />
      <path d="m16 6 3-3" />
    </svg>
  );
}

export function AuthVstup({
  id,
  label,
  chyba,
  ikonaVpravo,
  vstup,
}: {
  id: string;
  label: string;
  chyba?: string;
  ikonaVpravo?: ReactNode;
  vstup: InputHTMLAttributes<HTMLInputElement> & { className?: string };
}): JSX.Element {
  const chybaId = `${id}-chyba`;
  const maIkona = ikonaVpravo !== undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-inkoust">
        {label}
      </label>
      <div className="relative">
        <input
          {...vstup}
          id={id}
          aria-invalid={chyba !== undefined}
          aria-describedby={chyba !== undefined ? chybaId : undefined}
          className={`${vstup.className ?? AUTH_VSTUP} ${maIkona ? "pr-12" : ""}`}
        />
        {maIkona ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-mech">
            {ikonaVpravo}
          </div>
        ) : null}
      </div>
      {chyba !== undefined ? (
        <p id={chybaId} role="alert" className="mt-1.5 text-xs font-bold text-red-800">
          {chyba}
        </p>
      ) : null}
    </div>
  );
}

/** Sage info card on invite step after verify (pen frame). */
export function AuthInfoKodVzat(): JSX.Element {
  return (
    <div className="flex gap-3 rounded-2xl border border-mech/30 bg-mech/15 px-4 py-3.5" role="status">
      <IkonaKlice className="mt-0.5 h-5 w-5 shrink-0 text-smrk" />
      <div className="min-w-0 text-sm leading-relaxed text-inkoust">
        <p className="font-semibold text-inkoust">Kód byl vzat</p>
        <p className="mt-0.5 text-inkoust/80">
          Vedení vytváří nové pozvánky v sekci{" "}
          <span className="font-semibold text-inkoust">Více</span>.
        </p>
      </div>
    </div>
  );
}