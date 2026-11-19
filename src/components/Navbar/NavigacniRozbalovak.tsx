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

type Umisteni = {
  top: number;
  left: number;
  width: number;
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
      setUmisteni({ top: rect.bottom + 8, left, width: sirka });
    }
    mer();
    window.addEventListener("resize", mer);
    window.addEventListener("scroll", mer, true);
    return () => {
      window.removeEventListener("resize", mer);
      window.removeEventListener("scroll", mer, true);
    };
  }, [otevreno, kotvaRef, sirka, zarovnani]);

  useEffect(() => {
    if (!otevreno) return;
    function klavesa(udalost: KeyboardEvent): void {
      if (udalost.key !== "Escape") return;
      udalost.preventDefault();
      onZavrit();
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
        zIndex: 60,
      }}
      className="rounded-2xl border border-linka bg-povrch p-2 text-inkoust shadow-denik"
    >
      {children}
    </div>,
    document.body,
  );
}