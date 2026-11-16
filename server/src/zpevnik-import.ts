/**
 * Turn an uploaded PDF or photo into one text block per page.
 * PDF text is taken from the file. A photo is read with Czech OCR.
 */
import { extractTextItems, getDocumentProxy } from "unpdf";
import { textZeSouradnic } from "./zpevnik-rozlozeni";

export const PDF_MAX_BAJTU = 40 * 1024 * 1024;
export const PDF_MAX_STRAN = 200;
export const FOTKA_NAHRANI_MAX_BAJTU = 20 * 1024 * 1024;

export function jePdf(bajty: Buffer): boolean {
  const okno = bajty.subarray(0, 1024).toString("latin1");
  return okno.includes("%PDF-");
}

/**
 * A page with only a title and an author starts a song whose text is on the
 * next page. Join them, or the song becomes two proposals.
 */
export function spojHlavickySTextem(texty: readonly string[]): string[] {
  const vysledek: string[] = [];
  for (let i = 0; i < texty.length; i += 1) {
    const text = texty[i] ?? "";
    const dalsi = texty[i + 1];
    const radku = text.split(/\r?\n/).filter((radek) => radek.trim().length > 0).length;
    if (radku >= 1 && radku <= 2 && dalsi !== undefined && dalsi.trim().length > 0) {
      vysledek.push(`${text.trimEnd()}\n${dalsi}`);
      i += 1;
      continue;
    }
    vysledek.push(text);
  }
  return vysledek;
}

export async function textyZPdf(bajty: Buffer): Promise<string[]> {
  const dokument = await getDocumentProxy(new Uint8Array(bajty));
  const vysledek = await extractTextItems(dokument);
  const stranky = vysledek.items.slice(0, PDF_MAX_STRAN);
  return spojHlavickySTextem(stranky.map((polozky) => textZeSouradnic(polozky)));
}

export async function textZFotky(bajty: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("ces");
  try {
    const vysledek = await worker.recognize(bajty);
    return vysledek.data.text;
  } finally {
    await worker.terminate();
  }
}
