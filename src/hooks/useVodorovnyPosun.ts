import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Minimum horizontal travel before a touch changes the period. */
export const PRAH_POSUNU_PX = 48;

export type SmerPosunu = -1 | 1;

/**
 * Horizontal touch or pen drag. Left is the next period, right the previous.
 * A mostly vertical move stays a page scroll. Mouse drags do not change the period.
 */
export function smerVodorovnehoPosunu(
  dx: number,
  dy: number,
  pointerType: string,
  prah = PRAH_POSUNU_PX,
): SmerPosunu | null {
  if (pointerType !== "touch" && pointerType !== "pen") return null;
  if (Math.abs(dx) < prah) return null;
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  return dx < 0 ? 1 : -1;
}

/**
 * Period change by a one-finger horizontal drag. Vertical movement is left
 * to the browser (`touch-action: pan-y` on the surface). A recognized drag
 * swallows the click that would otherwise open the day under the finger.
 */
export function useVodorovnyPosun(onPosun: (smer: SmerPosunu) => void): {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
} {
  const onPosunRef = useRef(onPosun);
  onPosunRef.current = onPosun;
  const spolknoutKlik = useRef(false);
  const uklidRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => uklidRef.current?.();
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    uklidRef.current?.();
    spolknoutKlik.current = false;

    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const pointerType = event.pointerType;

    const uklid = () => {
      window.removeEventListener("pointerup", konec);
      window.removeEventListener("pointercancel", zrus);
      if (uklidRef.current === uklid) uklidRef.current = null;
    };
    const konec = (up: globalThis.PointerEvent) => {
      if (up.pointerId !== pointerId) return;
      uklid();
      const smer = smerVodorovnehoPosunu(up.clientX - startX, up.clientY - startY, pointerType);
      if (smer === null) return;
      spolknoutKlik.current = true;
      onPosunRef.current(smer);
    };
    const zrus = (zruseny: globalThis.PointerEvent) => {
      if (zruseny.pointerId !== pointerId) return;
      uklid();
    };

    uklidRef.current = uklid;
    window.addEventListener("pointerup", konec);
    window.addEventListener("pointercancel", zrus);
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!spolknoutKlik.current) return;
    spolknoutKlik.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { onPointerDown, onClickCapture };
}
