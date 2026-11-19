/**
 * Songbook actions share one button shape so a link is visibly pressable.
 */
import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";
import { Link } from "react-router-dom";

type Varianta = "hlavni" | "vedlejsi" | "tichy";

const ZAKLAD =
  "nahled-press inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-bold [touch-action:manipulation] transition-[transform,color,background-color,border-color] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-smrk disabled:opacity-50";

const VZHLED: Record<Varianta, string> = {
  hlavni: "border-smrk bg-smrk text-papir",
  vedlejsi:
    "border-linka bg-povrch text-inkoust [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px [@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60 motion-reduce:hover:translate-y-0",
  tichy:
    "border-linka bg-papir text-inkoust [@media(hover:hover)_and_(pointer:fine)]:hover:bg-linka/60",
};

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
