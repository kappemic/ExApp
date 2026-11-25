import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/** React Router si v historii drží pořadí; 0 znamená stránku otevřenou přímo z odkazu. */
export function jeKamSeVratit(stav: unknown): boolean {
  const poradi = typeof stav === "object" && stav !== null ? (stav as { idx?: unknown }).idx : undefined;
  return typeof poradi === "number" && poradi > 0;
}

/**
 * Návrat na předchozí obrazovku aplikace, po otevření z odkazu na `nahradni`.
 * Náhradní cíl záznam v historii přepíše, jinak by se dvě podstránky mohly
 * vracet jedna na druhou dokola.
 */
export function useZpet(nahradni: string): () => void {
  const navigate = useNavigate();
  return useCallback((): void => {
    if (jeKamSeVratit(window.history.state)) void navigate(-1);
    else void navigate(nahradni, { replace: true });
  }, [navigate, nahradni]);
}
