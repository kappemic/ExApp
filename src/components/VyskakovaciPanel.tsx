import { useEffect, useLayoutEffect, useState, type JSX, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface Box {
  top: number;
  left: number;
  width: number;
  nahoru: boolean;
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
  children,
}: {
  otevreno: boolean;
  kotva: RefObject<HTMLElement | null>;
  onZavrit: () => void;
  sirka?: number;
  minSirka?: number;
  label: string;
  role?: "dialog" | "listbox";
  children: ReactNode;
}): JSX.Element | null {
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    if (!otevreno) return;
    function mer(): void {
      const el = kotva.current;
      if (el === null) return;
      const rect = el.getBoundingClientRect();
      const width = Math.max(sirka ?? rect.width, minSirka);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const mistoDole = window.innerHeight - rect.bottom;
      const nahoru = mistoDole < 280 && rect.top > mistoDole;
      setBox({ top: nahoru ? rect.top : rect.bottom, left, width, nahoru });
    }
    mer();
    window.addEventListener("resize", mer);
    window.addEventListener("scroll", mer, true);
    return () => {
      window.removeEventListener("resize", mer);
      window.removeEventListener("scroll", mer, true);
    };
  }, [otevreno, kotva, sirka, minSirka]);

  useEffect(() => {
    if (!otevreno) return;
    function klavesa(udalost: KeyboardEvent): void {
      if (udalost.key !== "Escape") return;
      udalost.preventDefault();
      udalost.stopPropagation();
      onZavrit();
    }
    function venku(udalost: PointerEvent): void {
      const cil = udalost.target;
      if (!(cil instanceof Node)) return;
      if (kotva.current?.contains(cil)) return;
      const panel = document.getElementById("vyskakovaci-panel");
      if (panel?.contains(cil)) return;
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
      id="vyskakovaci-panel"
      role={role}
      aria-label={label}
      style={{
        position: "fixed",
        left: box.left,
        width: box.width,
        top: box.nahoru ? undefined : box.top + 6,
        bottom: box.nahoru ? window.innerHeight - box.top + 6 : undefined,
        zIndex: 80,
      }}
      className="nocturne vyskakovaci-panel rounded-xl border border-pole p-2 text-inkoust"
    >
      {children}
    </div>,
    document.body,
  );
}
