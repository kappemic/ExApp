/** Positive integer pixel size from JSON. Anything else stays absent. */
export function volitelnyRozmer(hodnota: unknown): number | undefined {
  if (typeof hodnota !== "number" || !Number.isInteger(hodnota) || hodnota < 1) return undefined;
  return hodnota;
}

/**
 * Width / height for a justified row. A missing pair stays a square
 * until the image element reports its natural size.
 */
export function pomerZRozmeru(
  sirka: number | null | undefined,
  vyska: number | null | undefined,
): number {
  if (sirka == null || vyska == null || sirka < 1 || vyska < 1) return 1;
  return sirka / vyska;
}
