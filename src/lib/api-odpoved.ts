import { jeApiChyba, type ApiErrorCode } from "../shared/api-types";

/** Fallback when the API body is missing or not the error contract. */
export const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

export function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

/** Safe JSON read — empty or non-JSON body becomes null. */
export async function ctiJsonTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

/** First message per field from a 422 body. */
export function chybyPoliZTela(telo: unknown): Record<string, string> | undefined {
  if (!jeApiChyba(telo)) return undefined;
  const vysledek: Record<string, string> = {};
  for (const [pole, seznam] of Object.entries(telo.error.details ?? {})) {
    const prvni: string | undefined = seznam[0];
    if (typeof prvni === "string" && prvni.length > 0) vysledek[pole] = prvni;
  }
  return Object.keys(vysledek).length > 0 ? vysledek : undefined;
}

export type ChybaZApiTela = {
  ok: false;
  chyba: string;
  kod?: ApiErrorCode;
};

/** Maps an API error body to a Czech message. Callers keep their own result types. */
export function chybaZApiTela(
  telo: unknown,
  nahradni: string = OBECNA_CHYBA,
): ChybaZApiTela {
  if (jeApiChyba(telo)) {
    return { ok: false, chyba: telo.error.message, kod: telo.error.code };
  }
  return { ok: false, chyba: nahradni };
}
