let pocet = 0;
let obnov: (() => void) | null = null;

/**
 * Zamkne posuv stránky pod dialogem a vrátí odemčení. Dialogy se smí vrstvit,
 * stránka se uvolní až s posledním. Místo po zmizelém posuvníku se dorovná,
 * jinak by stránka pod závojem o jeho šířku poskočila.
 */
export function zamkniPosuv(): () => void {
  if (pocet === 0) {
    const koren = document.documentElement;
    const telo = document.body;
    const sirka = window.innerWidth - koren.clientWidth;
    const puvodni = {
      overflow: telo.style.overflow,
      odsazeni: telo.style.paddingRight,
      zlabek: koren.style.scrollbarGutter,
    };
    telo.style.overflow = "hidden";
    if (sirka > 0) {
      koren.style.scrollbarGutter = "auto";
      telo.style.paddingRight = `${sirka}px`;
    }
    obnov = () => {
      telo.style.overflow = puvodni.overflow;
      telo.style.paddingRight = puvodni.odsazeni;
      koren.style.scrollbarGutter = puvodni.zlabek;
    };
  }
  pocet += 1;
  let odemceno = false;
  return () => {
    if (odemceno) return;
    odemceno = true;
    pocet -= 1;
    if (pocet > 0) return;
    obnov?.();
    obnov = null;
  };
}
