import { useId, useMemo, type JSX } from "react";
import {
  cestaVrstvy,
  hashRetezce,
  paletaVypravy,
  profilyVrstev,
} from "../../lib/krajina";

const SIRKA = 400;
const VYSKA = 300;
/** Shared by the wide hero crop and the square thumbnail. */
const NEBE_X = 0.62;
const NEBE_Y = 0.3;

/**
 * Stand-in when a trip has no photo. Season comes from the date, the
 * ridge from the id. No route and no rocks: those read as a chart or
 * as UI chips, and a square crop turned them into a color blot. The
 * sun or moon sits where both crops still show sky. Decorative.
 */
export default function KrajinaVypravy({
  id,
  datum,
  className = "",
}: {
  id: string;
  datum: string;
  className?: string;
}): JSX.Element {
  const uid = useId().replace(/:/g, "");
  const { paleta, vrstvy, hvezdy } = useMemo(() => {
    const p = paletaVypravy(id, datum);
    const hv: Array<[number, number, number]> = [];
    if (p.noc) {
      let s = hashRetezce(`${id}-hvezdy`);
      const r = (): number => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
      for (let i = 0; i < 12; i++) {
        hv.push([
          (0.18 + r() * 0.64) * SIRKA,
          (0.26 + r() * 0.1) * VYSKA,
          r() * 1.1 + 0.9,
        ]);
      }
    }
    return {
      paleta: p,
      vrstvy: profilyVrstev(id).map((body) => cestaVrstvy(body, SIRKA, VYSKA, false)),
      hvezdy: hv,
    };
  }, [id, datum]);

  const nebeId = `nebe-${uid}`;
  const svitId = `svit-${uid}`;
  const teleso = 16;

  return (
    <svg
      viewBox={`0 0 ${SIRKA} ${VYSKA}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={`block h-full w-full ${className}`}
    >
      <defs>
        <linearGradient id={nebeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paleta.nebe[0]} />
          <stop offset="0.55" stopColor={paleta.nebe[1]} />
          <stop offset="1" stopColor={paleta.nebe[2]} />
        </linearGradient>
        <radialGradient id={svitId} cx={NEBE_X} cy={NEBE_Y} r="0.28">
          <stop offset="0" stopColor={paleta.zare} stopOpacity="0.55" />
          <stop offset="1" stopColor={paleta.zare} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={SIRKA} height={VYSKA} fill={`url(#${nebeId})`} />
      {paleta.noc ? null : <rect width={SIRKA} height={VYSKA} fill={`url(#${svitId})`} />}
      {hvezdy.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" fillOpacity={0.85} />
      ))}
      {paleta.noc ? (
        <>
          <circle cx={SIRKA * NEBE_X} cy={VYSKA * NEBE_Y} r={teleso} fill="#FFF3C8" />
          <circle
            cx={SIRKA * NEBE_X + teleso * 0.45}
            cy={VYSKA * NEBE_Y - teleso * 0.2}
            r={teleso * 0.86}
            fill={paleta.nebe[0]}
          />
        </>
      ) : (
        <circle cx={SIRKA * NEBE_X} cy={VYSKA * NEBE_Y} r={teleso} fill={paleta.zare} />
      )}
      {vrstvy.map((d, i) => (
        <path key={i} d={d} fill={paleta.vrstvy[i]} />
      ))}
    </svg>
  );
}
