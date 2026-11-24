/** Which bulk download action is active. */
export type RozsahStahovaniFotek = "vybrane" | "vse";

/** Photo ids to download for the active bulk action. */
export function idsFotekKeStazeni(
  fotky: readonly { id: string }[],
  vybrane: ReadonlySet<string>,
  rozsah: RozsahStahovaniFotek,
): string[] {
  if (rozsah === "vse") return fotky.map((fotka) => fotka.id);
  return fotky.filter((fotka) => vybrane.has(fotka.id)).map((fotka) => fotka.id);
}

/** Marks or unmarks one photo. */
export function prepniIdVeVyberu(vybrane: ReadonlySet<string>, fotkaId: string): Set<string> {
  const dalsi = new Set(vybrane);
  if (!dalsi.delete(fotkaId)) dalsi.add(fotkaId);
  return dalsi;
}

export function jeVybranoVse(
  fotky: readonly { id: string }[],
  vybrane: ReadonlySet<string>,
): boolean {
  return fotky.length > 0 && fotky.every((fotka) => vybrane.has(fotka.id));
}

/** Marks every photo. When all are marked already, clears the selection. */
export function prepniVyberVsech(
  fotky: readonly { id: string }[],
  vybrane: ReadonlySet<string>,
): Set<string> {
  if (jeVybranoVse(fotky, vybrane)) return new Set<string>();
  return new Set(fotky.map((fotka) => fotka.id));
}
