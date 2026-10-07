import type { JSX } from "react";

/**
 * Galerie „zátiší" — generativní terénní obraz místo fotek.
 * Drží offline PWA bez externích assetů, každá výprava má
 * stabilní variantu podle id (0–4).
 */

const PALETY: Array<{
  nebe: string;
  hora: string;
  les: string;
  slunce: string;
}> = [
  { nebe: "#E9DFC8", hora: "#2E4438", les: "#2E4438", slunce: "#E4571D" },
  { nebe: "#DED2B8", hora: "#4A4A3A", les: "#2E4438", slunce: "#E4571D" },
  { nebe: "#E4D9C2", hora: "#211D14", les: "#5C6B60", slunce: "#C75B16" },
  { nebe: "#D8CBAF", hora: "#3A5244", les: "#211D14", slunce: "#E4571D" },
  { nebe: "#ECE2CC", hora: "#556052", les: "#2E4438", slunce: "#A05E0C" },
];

export function variantaObrazu(id: string): number {
  let soucet = 0;
  for (let i = 0; i < id.length; i += 1) {
    soucet += id.charCodeAt(i);
  }
  return soucet % PALETY.length;
}

interface ObrazProps {
  varianta?: number;
  nazev?: string;
  className?: string;
}

export default function Obraz({
  varianta = 0,
  nazev = "Stylizovaná horská krajina",
  className = "",
}: ObrazProps): JSX.Element {
  const paleta = PALETY[((varianta % PALETY.length) + PALETY.length) % PALETY.length];
  const posun = (varianta * 37) % 60;
  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={nazev}
      className={className}
    >
      <rect width="400" height="500" fill={paleta.nebe} />
      {Array.from({ length: 9 }, (_, i) => (
        <line
          key={i}
          x1="0"
          y1={60 + i * 46}
          x2="400"
          y2={60 + i * 46}
          stroke="#211D14"
          strokeOpacity="0.07"
          strokeWidth="1"
        />
      ))}
      <circle cx={300 - posun} cy="110" r="34" fill="none" stroke={paleta.slunce} strokeWidth="5" />
      <circle cx={300 - posun} cy="110" r="10" fill={paleta.slunce} />
      <path
        d={`M-20 380 L${90 - posun} 200 L${160 - posun} 300 L${230 - posun} 150 L${310 - posun} 320 L${360 - posun} 240 L420 330 L420 500 L-20 500 Z`}
        fill="none"
        stroke={paleta.hora}
        strokeOpacity="0.65"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d={`M-20 420 L${70 - posun} 290 L${170 - posun} 380 L${250 - posun} 250 L${330 - posun} 380 L420 320 L420 500 L-20 500 Z`}
        fill={paleta.les}
        fillOpacity="0.28"
        stroke={paleta.les}
        strokeOpacity="0.7"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d={`M-20 460 L80 360 L180 430 L280 340 L360 430 L420 400 L420 500 L-20 500 Z`}
        fill={paleta.les}
        fillOpacity="0.5"
      />
      {/* ptáci — drobná galerijní signatura */}
      <path
        d={`M${120 + posun} 140 q8 -8 16 0 q8 -8 16 0`}
        fill="none"
        stroke="#211D14"
        strokeOpacity="0.55"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d={`M${170 + posun} 165 q6 -6 12 0 q6 -6 12 0`}
        fill="none"
        stroke="#211D14"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
