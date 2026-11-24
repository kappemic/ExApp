import { useLayoutEffect, useRef, type RefObject } from "react";

/** Silné dojetí pro náběhy, stejné jako `--ease-out` v nocturne.css. */
export const KRIVKA = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Křivka spodního panelu: rychle se rozjede a dlouze dojede. */
export const KRIVKA_PANELU = "cubic-bezier(0.32, 0.72, 0, 1)";

export function snizenyPohyb(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Zmizení vyskakovacího panelu zpátky k místu, odkud vyjel. */
export function zmizeniNabidky(uzel: HTMLElement): Animation[] {
  return [
    uzel.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.97)" }], {
      duration: 110,
      easing: "ease-out",
      fill: "forwards",
    }),
  ];
}

/** Zmizení dialogu: závoj (sám uzel) se rozplyne a okno lehce ustoupí. */
export function zmizeniDialogu(uzel: HTMLElement): Animation[] {
  const okno = uzel.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  const volby: KeyframeAnimationOptions = { duration: 150, easing: "ease-out", fill: "forwards" };
  const animace = [uzel.animate([{ opacity: 1 }, { opacity: 0 }], volby)];
  if (okno !== null) {
    animace.push(okno.animate([{ transform: "none" }, { transform: "translateY(6px) scale(0.98)" }], volby));
  }
  return animace;
}

/**
 * Animace při zavření. React uzel odebere hned (stav, fokus i zámek posuvu se
 * uklidí bez čekání) a odebraný uzel se jen na chvíli vrátí do stránky jako
 * neaktivní „duch“, dohraje odchod a zmizí. Díky tomu funguje i tam, kde rodič
 * komponentu rovnou odmontuje.
 */
export function useOdchod(
  ref: RefObject<HTMLElement | null>,
  viditelne: boolean,
  animuj: (uzel: HTMLElement) => Animation[],
): void {
  const animujRef = useRef(animuj);
  animujRef.current = animuj;

  useLayoutEffect(() => {
    const uzel = ref.current;
    if (!viditelne || uzel === null) return;
    const posuny = new Map<Element, number>();
    const zapisPosun = (udalost: Event): void => {
      if (udalost.target instanceof Element) posuny.set(udalost.target, udalost.target.scrollTop);
    };
    uzel.addEventListener("scroll", zapisPosun, true);
    return () => {
      uzel.removeEventListener("scroll", zapisPosun, true);
      if (snizenyPohyb()) return;
      queueMicrotask(() => {
        // Ve StrictMode se efekt jen přehraje a uzel ve stránce zůstává.
        if (uzel.isConnected) return;
        uzel.removeAttribute("id");
        uzel.setAttribute("inert", "");
        uzel.setAttribute("aria-hidden", "true");
        uzel.dataset.odchod = "";
        document.body.appendChild(uzel);
        for (const [prvek, posun] of posuny) prvek.scrollTop = posun;
        const animace = animujRef.current(uzel);
        void Promise.allSettled(animace.map((a) => a.finished)).then(() => uzel.remove());
      });
    };
  }, [ref, viditelne]);
}

/**
 * Krátký náběh obsahu při změně klíče (záložka, filtr, měsíc) bez odmontování.
 * Osa `x` jede podle směru změny, `y` zespodu, `zadna` jen prolne.
 */
export function useNabeh<T extends HTMLElement>(
  klic: string | number,
  osa: "x" | "y" | "zadna" = "y",
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const predchozi = useRef(klic);

  useLayoutEffect(() => {
    if (predchozi.current === klic) return;
    const dopredu = klic > predchozi.current;
    predchozi.current = klic;
    if (snizenyPohyb()) return;
    const posun = osa === "x" ? `translateX(${dopredu ? 14 : -14}px)` : osa === "y" ? "translateY(6px)" : "none";
    ref.current?.animate([{ opacity: 0, transform: posun }, { opacity: 1, transform: "none" }], {
      duration: osa === "zadna" ? 140 : 200,
      easing: KRIVKA,
    });
  }, [klic, osa]);

  return ref;
}
