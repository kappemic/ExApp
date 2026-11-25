/**
 * Stav spojení se serverem. `navigator.onLine` nestačí: telefon s jednou čárkou
 * signálu hlásí online. Hlásí ho obal fetch (`pwa-historie.ts`) a ověření účtu.
 */
import { useSyncExternalStore } from "react";

type Posluchac = () => void;

/** Text pro zápisy, které bez sítě neprojdou. */
export const ZAPIS_BEZ_SPOJENI =
  "Bez spojení se změna neuložila. Zkus to znovu, až budeš online.";
export const CTENI_BEZ_SPOJENI =
  "Bez spojení se data nenačetla. Zkus to znovu, až budeš online.";

let spojeno = true;
const posluchaci = new Set<Posluchac>();

export function maSpojeni(): boolean {
  return spojeno;
}

export function oznamSpojeni(hodnota: boolean): void {
  if (spojeno === hodnota) return;
  spojeno = hodnota;
  for (const posluchac of [...posluchaci]) posluchac();
}

export function sledujSpojeni(posluchac: Posluchac): () => void {
  posluchaci.add(posluchac);
  return () => {
    posluchaci.delete(posluchac);
  };
}

export function useSpojeni(): boolean {
  return useSyncExternalStore(sledujSpojeni, maSpojeni, () => true);
}
