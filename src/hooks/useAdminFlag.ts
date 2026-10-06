import { useCallback, useEffect, useState } from "react";

/**
 * Demo admin flag — pouze UI, bez backendu.
 *
 * Zdroje (v tomto pořadí):
 * 1. URL parametr `?admin=1` (zapne) / `?admin=0` (vypne) + uloží do localStorage.
 * 2. Hodnota v localStorage (přetrvá mezi reloady).
 *
 * Vrací `[jeAdmin, setJeAdmin]`. Víc instancí hooku se synchronizuje
 * přes `storage` event + vlastní window event, takže přepínač v hlavičce
 * a guard routy ukazují vždy stejně.
 */

const STORAGE_KEY = "exapp-admin-demo";
const EVENT_NAME = "exapp:admin-flag-change";

function ctiUlozenyFlag(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function ctiPocatecniFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("admin");
    if (q === "1") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (q === "0") {
      window.localStorage.setItem(STORAGE_KEY, "0");
      return false;
    }
  } catch {
    // Neplatné URL / nepřístupný storage — demo režim mlčky vypnut.
  }
  return ctiUlozenyFlag();
}

export function useAdminFlag(): readonly [boolean, (hodnota: boolean) => void] {
  const [jeAdmin, setJeAdminState] = useState<boolean>(ctiPocatecniFlag);

  const setJeAdmin = useCallback((hodnota: boolean): void => {
    setJeAdminState(hodnota);
    try {
      window.localStorage.setItem(STORAGE_KEY, hodnota ? "1" : "0");
    } catch {
      // Storage nedostupný (privátní režim) — stav držíme jen v paměti.
    }
    window.dispatchEvent(
      new CustomEvent<boolean>(EVENT_NAME, { detail: hodnota }),
    );
  }, []);

  useEffect(() => {
    const syncZeStorage = (): void => {
      setJeAdminState(ctiUlozenyFlag());
    };
    const syncZEventu = (e: Event): void => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") setJeAdminState(detail);
    };
    window.addEventListener("storage", syncZeStorage);
    window.addEventListener(EVENT_NAME, syncZEventu);
    return () => {
      window.removeEventListener("storage", syncZeStorage);
      window.removeEventListener(EVENT_NAME, syncZEventu);
    };
  }, []);

  return [jeAdmin, setJeAdmin] as const;
}
