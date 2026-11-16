/**
 * Songbook actions share one button shape so a link is visibly pressable.
 */
import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

type Varianta = "hlavni" | "vedlejsi" | "tichy";

const ZAKLAD =
  "nahled-press inline-flex min-h-11 items-center justify-center rounded-md border-2 px-4 text-sm font-bold [touch-action:manipulation] transition-[transform,color,background-color,border-color] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-50";

const VZHLED: Record<Varianta, string> = {
  hlavni: "nahled-prejeti border-inkoust bg-papir text-inkoust",
  vedlejsi:
    "border-inkoust bg-papir text-inkoust [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px [@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60 motion-reduce:hover:translate-y-0",
  tichy:
    "border-linka bg-papir text-inkoust [@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60",
};

/** Back from an editor returns to the screen that opened it. */
export function OdkazZpet({ to, children }: { to: string; children: ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const odkud = (location.state as { odkud?: unknown } | null)?.odkud;
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof odkud === "string" && odkud.length > 0 && odkud !== location.pathname) {
          void navigate(odkud);
          return;
        }
        void navigate(to);
      }}
      className="-ml-1 inline-flex min-h-11 w-auto touch-manipulation select-none items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold text-mech transition-[transform,opacity,background-color] duration-[160ms] ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60 focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-smrk"
    >
      <span aria-hidden="true">←</span>
      {children}
    </button>
  );
}

export function OdkazTlacitko({
  to,
  varianta,
  children,
  state,
  onClick,
}: {
  to: string;
  varianta: Varianta;
  children: ReactNode;
  state?: { odkud: string };
  onClick?: () => void;
}): JSX.Element {
  return (
    <Link to={to} state={state} onClick={onClick} className={`${ZAKLAD} ${VZHLED[varianta]}`}>
      {children}
    </Link>
  );
}

export function Tlacitko({
  varianta,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { varianta: Varianta }): JSX.Element {
  return (
    <button type="button" className={`${ZAKLAD} ${VZHLED[varianta]} ${className}`} {...props}>
      {children}
    </button>
  );
}
