import type { JSX } from "react";

const VYSKA: Record<"sm" | "lg", string> = {
  /** Header bar. Tall enough to read, short enough to sit in h-16. */
  sm: "h-9",
  /** Beside a page title. The crest is a narrow shield, so height carries the weight. */
  lg: "h-20",
};

/** Club crest. Transparent shield, no plate. */
export default function LogoKlubu({
  velikost = "sm",
  className = "",
}: {
  velikost?: "sm" | "lg";
  className?: string;
}): JSX.Element {
  return (
    <img
      src="/logo-klubu.png"
      alt=""
      className={`${VYSKA[velikost]} w-auto shrink-0 object-contain ${className}`}
    />
  );
}
