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
