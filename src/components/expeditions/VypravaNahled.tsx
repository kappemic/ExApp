import { useEffect, useState, type JSX } from "react";
import { urlSouboruFotky } from "../../lib/expedition-fotky";

export interface VypravaNahledProps {
  expeditionId: string;
  /** `null` keeps the diary illustration. */
  fotkaId: string | null;
  probehla: boolean;
  /** Card cover draws the sun; the modal header keeps the older sky. */
  ukazSlunce?: boolean;
}

/**
 * Expedition cover. Highlight photo fills the frame; the mountain SVG
 * stays only when there is no photo or the stream fails.
 */
export default function VypravaNahled({
  expeditionId,
  fotkaId,
  probehla,
  ukazSlunce = false,
}: VypravaNahledProps): JSX.Element {
  const [rozbita, setRozbita] = useState<boolean>(false);

  useEffect(() => {
    setRozbita(false);
  }, [expeditionId, fotkaId]);

  const ukazFoto = fotkaId !== null && !rozbita;

  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 23px, rgba(26,46,34,0.08) 23px 24px)",
        }}
      />
      {ukazFoto ? (
        <img
          src={urlSouboruFotky(expeditionId, fotkaId)}
          alt="Náhled výpravy"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setRozbita(true)}
        />
      ) : (
        <HorskyPodklad probehla={probehla} ukazSlunce={ukazSlunce} />
      )}
    </>
  );
}

function HorskyPodklad({
  probehla,
  ukazSlunce,
}: {
  probehla: boolean;
  ukazSlunce: boolean;
}): JSX.Element {
  return (
    <>
      <svg
        viewBox="0 0 400 180"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 h-full w-full text-inkoust ${probehla ? "opacity-50 grayscale" : ""}`}
      >
        <path
          d="M0 150 L90 70 L150 130 L220 45 L300 130 L350 85 L400 130 L400 180 L0 180 Z"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M0 165 L110 100 L190 155 L270 90 L340 155 L400 120 L400 180 L0 180 Z"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          className="text-smrk"
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {ukazSlunce ? (
          <circle
            cx="322"
            cy="38"
            r="14"
            fill="none"
            stroke="currentColor"
            className="text-jantar"
            strokeOpacity="0.55"
            strokeWidth="2.5"
          />
        ) : null}
      </svg>
      <span className="absolute bottom-2 right-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-inkoust/70">
        {probehla ? "archiv · exapp" : "exapp"}
      </span>
    </>
  );
}
