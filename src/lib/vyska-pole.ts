/** Nejvyšší pole zprávy, zhruba šest řádků. Pak se posouvá uvnitř. */
const STROP_POLE = 148;

/**
 * Pole zprávy roste s textem. Prázdné pole drží výšku z CSS, aby ho
 * neroztáhl zalomený placeholder.
 */
export function prizpusobVyskuPole(pole: HTMLTextAreaElement): void {
  pole.style.overflowY = "hidden";
  if (pole.value.length === 0) {
    pole.style.height = "";
    return;
  }
  // Při měření se pole na okamžik smrskne. Obal drží výšku, jinak by vlákno nad ním odskočilo.
  const obal = pole.parentElement;
  if (obal !== null) obal.style.minHeight = `${obal.offsetHeight}px`;
  pole.style.height = "auto";
  // scrollHeight nepočítá okraj, výška s border-box ano.
  const okraj = pole.offsetHeight - pole.clientHeight;
  const potreba = pole.scrollHeight + okraj;
  pole.style.height = `${Math.min(potreba, STROP_POLE)}px`;
  pole.style.overflowY = potreba > STROP_POLE ? "auto" : "hidden";
  if (obal !== null) obal.style.minHeight = "";
}
