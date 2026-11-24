import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useOdchod, zmizeniNabidky } from "../../lib/pohyb";

type Umisteni = {
  top: number;
  left: number;
  width: number;
  nahoru: boolean;
  puvod: number;
};

type NavigacniRozbalovakProps = {
  otevreno: boolean;
  onZavrit: () => void;
  kotvaRef: RefObject<HTMLElement | null>;
  sirka: number;
  zarovnani?: "start" | "end";
  popisek: string;
  children: ReactNode;
};

/** Cream dropdown anchored to a header control. Closes on Esc and outside click. */
export default function NavigacniRozbalovak({
  otevreno,
  onZavrit,
  kotvaRef,
  sirka,
  zarovnani = "start",
  popisek,
  children,
}: NavigacniRozbalovakProps): JSX.Element | null {
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [umisteni, setUmisteni] = useState<Umisteni | null>(null);
  const viditelne = otevreno && umisteni !== null;
  useOdchod(panelRef, viditelne, zmizeniNabidky);

  useLayoutEffect(() => {
    if (!otevreno) {
      setUmisteni(null);
      return;
    }
    function mer(): void {
      const kotva = kotvaRef.current;
      if (kotva === null) return;
      const rect = kotva.getBoundingClientRect();
      const left =
        zarovnani === "end"
          ? Math.min(Math.max(8, rect.right - sirka), window.innerWidth - sirka - 8)
          : Math.min(Math.max(8, rect.left), window.innerWidth - sirka - 8);
      const vyska = panelRef.current?.offsetHeight ?? 0;
      const nahoru = rect.bottom + 8 + vyska > window.innerHeight - 8 && rect.top - 8 - vyska > 8;
      setUmisteni({
        top: nahoru ? rect.top - 8 - vyska : rect.bottom + 8,
        left,
        width: sirka,
        nahoru,
        puvod: Math.min(Math.max(rect.left + rect.width / 2 - left, 16), sirka - 16),
      });
    }
    mer();
    window.addEventListener("resize", mer);
    window.addEventListener("scroll", mer, true);
    return () => {
      window.removeEventListener("resize", mer);
      window.removeEventListener("scroll", mer, true);
    };
  }, [otevreno, viditelne, kotvaRef, sirka, zarovnani]);

  // Otevření klávesnicí přesune fokus na první položku.
  useEffect(() => {
    if (!viditelne) return;
    const kotva = kotvaRef.current;
    if (kotva !== null && kotva === document.activeElement && kotva.matches(":focus-visible")) {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
    // Fokus, který byl v menu, se vrací na tlačítko (dialog si ho pak převezme).
    return () => {
      if (document.activeElement === null || document.activeElement === document.body) kotva?.focus({ preventScroll: true });
    };
  }, [viditelne, kotvaRef]);

  useEffect(() => {
    if (!otevreno) return;
    function klavesa(udalost: KeyboardEvent): void {
      if (udalost.key === "ArrowDown" || udalost.key === "ArrowUp") {
        const polozky = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (polozky.length === 0) return;
        udalost.preventDefault();
        const index = polozky.findIndex((polozka) => polozka === document.activeElement);
        const smer = udalost.key === "ArrowDown" ? 1 : -1;
        polozky[index < 0 ? (smer === 1 ? 0 : polozky.length - 1) : (index + smer + polozky.length) % polozky.length]?.focus();
        return;
      }
      if (udalost.key === "Tab") {
        onZavrit();
        return;
      }
      if (udalost.key !== "Escape") return;
      udalost.preventDefault();
      onZavrit();
      kotvaRef.current?.focus();
    }
    function venku(udalost: PointerEvent): void {
      const cil = udalost.target;
      if (!(cil instanceof Node)) return;
      if (kotvaRef.current?.contains(cil)) return;
      if (panelRef.current?.contains(cil)) return;
      onZavrit();
    }
    document.addEventListener("keydown", klavesa);
    document.addEventListener("pointerdown", venku);
    return () => {
      document.removeEventListener("keydown", klavesa);
      document.removeEventListener("pointerdown", venku);
    };
  }, [otevreno, onZavrit, kotvaRef]);

  if (!otevreno || umisteni === null || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="menu"
      aria-label={popisek}
      style={{
        position: "fixed",
        top: umisteni.top,
        left: umisteni.left,
        width: umisteni.width,
        transformOrigin: `${umisteni.puvod}px ${umisteni.nahoru ? "100%" : "0"}`,
        zIndex: 60,
      }}
      className="nocturne vyskakovaci-menu rounded-[14px] border border-linka bg-povrch p-2 text-inkoust shadow-modal"
    >
      {children}
    </div>,
    document.body,
  );
}