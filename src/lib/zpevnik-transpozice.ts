/**
 * Per-device semitone offset. Never sent to the API.
 */
export interface TranspoziceUloziste {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
}

export function klicTranspozice(id: string): string {
  return `exapp:zpevnik:transpozice:${id}`;
}

export function ctiPosun(uloziste: TranspoziceUloziste, id: string): number {
  const surovy = uloziste.getItem(klicTranspozice(id));
  if (surovy === null) return 0;
  const cislo = Number(surovy);
  if (!Number.isInteger(cislo)) return 0;
  return cislo;
}

export function zapisPosun(uloziste: TranspoziceUloziste, id: string, posun: number): void {
  uloziste.setItem(klicTranspozice(id), String(posun));
}
