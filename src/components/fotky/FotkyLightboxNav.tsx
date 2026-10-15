import type { JSX, MouseEvent } from "react";
import { fotkyLightboxNavTlacitko } from "./fotky-ui";

interface FotkyLightboxNavProps {
  maPredchozi: boolean;
  maDalsi: boolean;
  onPredchozi: () => void;
  onDalsi: () => void;
  onMouseDownZastav?: (udalost: MouseEvent) => void;
}

/** Previous / next controls for album and expedition photo lightboxes. */
export default function FotkyLightboxNav({
  maPredchozi,
  maDalsi,
  onPredchozi,
  onDalsi,
  onMouseDownZastav,
}: FotkyLightboxNavProps): JSX.Element {
  return (
    <>
      <button
        type="button"
        aria-label="Předchozí fotka"
        disabled={!maPredchozi}
        onMouseDown={onMouseDownZastav}
        onClick={onPredchozi}
        className={`${fotkyLightboxNavTlacitko} left-[max(0.75rem,env(safe-area-inset-left))]`}
      >
        <IkonaSipkaVlevo />
      </button>
      <button
        type="button"
        aria-label="Další fotka"
        disabled={!maDalsi}
        onMouseDown={onMouseDownZastav}
        onClick={onDalsi}
        className={`${fotkyLightboxNavTlacitko} right-[max(0.75rem,env(safe-area-inset-right))]`}
      >
        <IkonaSipkaVpravo />
      </button>
    </>
  );
}

function IkonaSipkaVlevo(): JSX.Element {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M14.5 6.5L9 12l5.5 5.5"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IkonaSipkaVpravo(): JSX.Element {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M9.5 6.5L15 12l-5.5 5.5"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
