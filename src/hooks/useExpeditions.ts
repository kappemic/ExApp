import { useEffect, useState } from "react";
import {
  getExpeditions,
  toUiStav,
  type ExpeditionsResult,
  type ExpeditionsUiStav,
} from "../lib/expeditions-api";

export interface UseExpeditions {
  stav: ExpeditionsUiStav;
  expedice: ExpeditionsResult["data"];
  zdroj: ExpeditionsResult["source"];
  generatedAt: string | null;
  errorCode: ExpeditionsResult["errorCode"];
}

/**
 * Budoucí async napojení UI (paralelní s Krokem 6). Dnes nezapojené –
 * VypravyPage dál jede synchronně, aby se neměnil vzhled ani skeleton flow.
 * Chybové stavy: loading → skeleton, ready → list, prazdno → ExpeditionEmpty,
 * nedostupny → list z fallbacku (dnes se s neprázdnými mocky prakticky
 * nevyskytuje, větev je pro úplnost kontraktu).
 */
export function useExpeditions(): UseExpeditions {
  const [vysledek, setVysledek] = useState<ExpeditionsResult | null>(null);

  useEffect(() => {
    let zive = true;
    getExpeditions().then((r) => {
      if (zive) setVysledek(r);
    });
    return () => {
      zive = false;
    };
  }, []);

  if (vysledek === null) {
    return {
      stav: "loading",
      expedice: [],
      zdroj: "mock-fallback",
      generatedAt: null,
      errorCode: undefined,
    };
  }

  return {
    stav: toUiStav("hotovo", vysledek),
    expedice: vysledek.data,
    zdroj: vysledek.source,
    generatedAt: vysledek.generatedAt,
    errorCode: vysledek.errorCode,
  };
}
