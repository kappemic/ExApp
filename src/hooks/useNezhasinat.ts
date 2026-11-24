import { useEffect } from "react";

/** Drží displej rozsvícený, dokud je `aktivni`. Kde to prohlížeč neumí, nic se nestane. */
export function useNezhasinat(aktivni: boolean): void {
  useEffect(() => {
    if (!aktivni || !("wakeLock" in navigator)) return;
    let zive = true;
    let zamek: WakeLockSentinel | null = null;
    const zamkni = async (): Promise<void> => {
      if (document.visibilityState !== "visible") return;
      try {
        const novy = await navigator.wakeLock.request("screen");
        if (zive) zamek = novy;
        else await novy.release();
      } catch {
        // Úsporný režim nebo zákaz: displej se řídí nastavením telefonu.
      }
    };
    // Skrytí stránky zámek uvolní, po návratu je potřeba nový.
    const naViditelnost = (): void => void zamkni();
    void zamkni();
    document.addEventListener("visibilitychange", naViditelnost);
    return () => {
      zive = false;
      document.removeEventListener("visibilitychange", naViditelnost);
      void zamek?.release().catch(() => undefined);
    };
  }, [aktivni]);
}
