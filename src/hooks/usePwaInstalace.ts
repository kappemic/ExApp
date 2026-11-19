import { useEffect, useState } from "react";

type InstalacniUdalost = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function jeNaPlose(): boolean {
  if (typeof window === "undefined") return false;
  const ios = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || ios.standalone === true
  );
}

export function usePwaInstalace(): {
  naPlose: boolean;
  instalace: InstalacniUdalost | null;
  pridejNaPlochu: () => Promise<void>;
} {
  const [instalace, setInstalace] = useState<InstalacniUdalost | null>(null);
  const [naPlose, setNaPlose] = useState(false);

  useEffect(() => {
    setNaPlose(jeNaPlose());
    function naVyzvu(event: Event): void {
      event.preventDefault();
      setInstalace(event as InstalacniUdalost);
    }
    window.addEventListener("beforeinstallprompt", naVyzvu);
    return () => window.removeEventListener("beforeinstallprompt", naVyzvu);
  }, []);

  async function pridejNaPlochu(): Promise<void> {
    if (instalace === null) return;
    await instalace.prompt();
    setInstalace(null);
  }

  return { naPlose, instalace, pridejNaPlochu };
}