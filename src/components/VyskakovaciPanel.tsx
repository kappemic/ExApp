import { useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useOdchod, zmizeniNabidky } from "../lib/pohyb";

interface Box {
  top: number;
  left: number;
  width: number;
  nahoru: boolean;
  /** Kam se panel smí nejvíc natáhnout. */
  vyska: number;
  /** Vodorovný bod, odkud panel vyjíždí (u šipky pole). */
  puvod: number;
}

/**
 * Paper popover anchored to a field. Portaled so a scrolling dialog
 * does not clip it. Escape closes only this panel.
 */
export default function VyskakovaciPanel({
  otevreno,
  kotva,
  onZavrit,
  sirka,
  minSirka = 0,
  label,
  role = "dialog",
  puvod = "stred",
  vzhled = "zaklad",
  children,
}: {
  otevreno: boolean;
  kotva: RefObject<HTMLElement | null>;
  onZavrit: () => void;
  sirka?: number;
  minSirka?: number;
  label: string;
  role?: "dialog" | "listbox";
  /** Odkud panel vyjede: střed pole, nebo jeho pravý konec s ikonou. */
  puvod?: "stred" | "konec";
  /** Vzhled z ExApp.pen: výběr data (16 px rohy), času (14 px), nabídka (12 px). */
  vzhled?: "zaklad" | "datum" | "cas" | "nabidka";
  children: ReactNode;
}): JSX.Element | null {
  const [box, setBox] = useState<Box | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const viditelne = otevreno && box !== null;
  useOdchod(panelRef, viditelne, zmizeniNabidky);

  useLayoutEffect(() => {
    if (!otevreno) {
      setBox(null);
      return;
    }
    function mer(): void {
      const el = kotva.current;
      if (el === null) return;
      const rect = el.getBoundingClientRect();
      const width = Math.max(sirka ?? rect.width, minSirka);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const mistoDole = window.innerHeight - rect.bottom - 14;
      const mistoNahore = rect.top - 14;
      const potreba = panelRef.current?.scrollHeight ?? 280;
      const nahoru = potreba > mistoDole && mistoNahore > mistoDole;
      const stred = puvod === "konec" ? rect.right - 22 : rect.left + rect.width / 2;
      setBox({
        top: nahoru ? rect.top : rect.bottom,
        left,
        width,
        nahoru,
        vyska: Math.max(160, nahoru ? mistoNahore : mistoDole),
        puvod: Math.min(Math.max(stred - left, 16), width - 16),
      });
    }
    mer();
    window.addEventListener("resize", mer);
    window.addEventListener("scroll", mer, true);
    return () => {
      window.removeEventListener("resize", mer);
      window.removeEventListener("scroll", mer, true);
    };
  }, [otevreno, viditelne, kotva, sirka, minSirka, puvod]);

  // Otevření klávesnicí: fokus do panelu, po zavření zpátky na pole.
  useEffect(() => {
    if (!viditelne) return;
    const spoustec = document.activeElement;
    const panel = panelRef.current;
    if (spoustec instanceof HTMLElement && kotva.current?.contains(spoustec) && spoustec.matches("button:focus-visible")) {
      (panel?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]') ?? panel?.querySelector<HTMLElement>("button"))?.focus();
    }
    return () => {
      if (spoustec instanceof HTMLElement && spoustec.isConnected && (document.activeElement === null || document.activeElement === document.body)) {
        spoustec.focus();
      }
    };
  }, [viditelne, kotva]);

  useEffect(() => {
    if (!otevreno) return;
    function klavesa(udalost: KeyboardEvent): void {
      if (udalost.key === "ArrowDown" || udalost.key === "ArrowUp") {
        const panel = panelRef.current;
        const aktivni = document.activeElement;
        if (panel === null || !(aktivni instanceof HTMLElement) || !panel.contains(aktivni)) return;
        const seznam = aktivni.closest('[role="listbox"]') ?? panel;
        const polozky = Array.from(seznam.querySelectorAll<HTMLElement>('[role="option"]'));
        const index = polozky.indexOf(aktivni);
        if (index < 0) return;
        udalost.preventDefault();
        polozky[(index + (udalost.key === "ArrowDown" ? 1 : -1) + polozky.length) % polozky.length]?.focus();
        return;
      }
      if (udalost.key !== "Escape") return;
      udalost.preventDefault();
      udalost.stopPropagation();
      onZavrit();
    }
    function venku(udalost: PointerEvent): void {
      const cil = udalost.target;
      if (!(cil instanceof Node)) return;
      if (kotva.current?.contains(cil)) return;
      if (panelRef.current?.contains(cil)) return;
      onZavrit();
    }
    window.addEventListener("keydown", klavesa, true);
    document.addEventListener("pointerdown", venku);
    return () => {
      window.removeEventListener("keydown", klavesa, true);
      document.removeEventListener("pointerdown", venku);
    };
  }, [otevreno, onZavrit, kotva]);

  if (!otevreno || box === null) return null;

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={label}
      style={{
        position: "fixed",
        left: box.left,
        width: box.width,
        maxHeight: box.vyska,
        overflowY: "auto",
        transformOrigin: `${box.puvod}px ${box.nahoru ? "100%" : "0"}`,
        top: box.nahoru ? undefined : box.top + 6,
        bottom: box.nahoru ? window.innerHeight - box.top + 6 : undefined,
        zIndex: 80,
      }}
      className={`nocturne vyskakovaci-panel ${box.nahoru ? "nahoru" : ""} border border-linka bg-povrch text-inkoust ${
        vzhled === "datum"
          ? "rounded-2xl p-3.5"
          : vzhled === "cas"
            ? "rounded-[14px] p-3"
            : vzhled === "nabidka"
              ? "rounded-xl p-1.5"
              : "rounded-2xl p-2"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
