import type { StavVypravy } from "./api-types";

/** Last seats that still count as almost full. Zero seats is full, not almost full. */
export const SKORO_PLNO_MAX_VOLNYCH = 3;

/**
 * Open-trip status from seats. Unlimited capacity (`celkem <= 0`) stays open.
 * Closed trips keep `proběhlá` and must not call this.
 */
export function stavPodleObsazenosti(
  celkem: number,
  prihlaseno: number,
): Exclude<StavVypravy, "proběhlá"> {
  if (!Number.isInteger(celkem) || celkem <= 0) return "volno";
  const volna = celkem - prihlaseno;
  if (volna >= 1 && volna <= SKORO_PLNO_MAX_VOLNYCH) return "skoro plno";
  return "volno";
}
