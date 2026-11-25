import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";

/** Stav podle záznamu v historii, drží se jen po dobu běhu aplikace. */
const ulozeneStavy = new Map<string, unknown>();

/**
 * `useState`, který po návratu zpět na stejný záznam v historii začne tam, kde
 * skončil. Nově otevřená stránka začíná vždy výchozí hodnotou.
 */
export function useStavStranky<T>(nazev: string, vychozi: T): [T, Dispatch<SetStateAction<T>>] {
  const { key } = useLocation();
  const klic = `${key}:${nazev}`;
  const [hodnota, setHodnota] = useState<T>(() => (ulozeneStavy.has(klic) ? (ulozeneStavy.get(klic) as T) : vychozi));
  useEffect(() => {
    ulozeneStavy.set(klic, hodnota);
  }, [klic, hodnota]);
  return [hodnota, setHodnota];
}
