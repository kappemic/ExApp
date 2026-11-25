/** Výpočty posuvníku karet. Poloha je v px od začátku, rychlost v px/ms. */

const TUHOST_GUMY = 0.55;
/** Jak daleko by karty dojely po puštění, než se přichytí. */
const DOJEZD_MS = 165;
/** Od téhle rychlosti švih posune aspoň o jednu kartu. */
const RYCHLOST_SVIHU = 0.35;

const UHLOVA_RYCHLOST = (2 * Math.PI) / 420;
const TLUMENI = 0.82;

/** Posun za krajem: čím dál, tím větší odpor. Nikdy nepřekročí `rozmer`. */
export function guma(presah: number, rozmer: number): number {
  if (presah <= 0 || rozmer <= 0) return 0;
  return rozmer * (1 - 1 / ((presah * TUHOST_GUMY) / rozmer + 1));
}

/** Opak `guma`: kolik prst ujel, když je na obrazovce vidět `vysun`. */
export function odGumy(vysun: number, rozmer: number): number {
  if (vysun <= 0 || rozmer <= 0) return 0;
  const bezpecny = Math.min(vysun, rozmer * 0.95);
  return (rozmer / TUHOST_GUMY) * (1 / (1 - bezpecny / rozmer) - 1);
}

/** Poloha pod prstem převedená na polohu na obrazovce. */
export function sGumou(poloha: number, max: number, rozmer: number): number {
  if (poloha < 0) return -guma(-poloha, rozmer);
  if (poloha > max) return max + guma(poloha - max, rozmer);
  return poloha;
}

/** Opak `sGumou`, aby šlo chytit kartu i za krajem bez skoku. */
export function bezGumy(poloha: number, max: number, rozmer: number): number {
  if (poloha < 0) return -odGumy(-poloha, rozmer);
  if (poloha > max) return max + odGumy(poloha - max, rozmer);
  return poloha;
}

/** Na kterou zarážku se karty po puštění přichytí. */
export function cilPrichyceni(poloha: number, rychlost: number, zarazky: readonly number[]): number {
  if (zarazky.length === 0) return 0;
  const nejblizsi = (kam: number): number =>
    zarazky.reduce((nej, z) => (Math.abs(z - kam) < Math.abs(nej - kam) ? z : nej));
  const cil = nejblizsi(poloha + rychlost * DOJEZD_MS);
  if (Math.abs(rychlost) < RYCHLOST_SVIHU) return cil;
  if (rychlost > 0) {
    const dalsi = zarazky.find((z) => z > poloha + 1) ?? Math.max(...zarazky);
    return Math.max(cil, dalsi);
  }
  const predchozi = [...zarazky].reverse().find((z) => z < poloha - 1) ?? Math.min(...zarazky);
  return Math.min(cil, predchozi);
}

/** Nejbližší další zarážka ve směru šipky, na kraji zůstává krajní. */
export function sousedniZarazka(poloha: number, smer: -1 | 1, zarazky: readonly number[]): number {
  const TOLERANCE = 4;
  const podleSmeru = [...zarazky].sort((a, b) => (a - b) * smer);
  return podleSmeru.find((z) => (z - poloha) * smer > TOLERANCE) ?? podleSmeru[podleSmeru.length - 1] ?? 0;
}

/** Jeden krok pružiny k cíli. Drží rychlost z prstu, proto pohyb po puštění navazuje. */
export function krokPruziny(
  poloha: number,
  rychlost: number,
  cil: number,
  ms: number,
): { poloha: number; rychlost: number; hotovo: boolean } {
  let x = poloha - cil;
  let v = rychlost;
  let zbyva = Math.min(ms, 64);
  while (zbyva > 0) {
    const dt = Math.min(zbyva, 4);
    v += (-UHLOVA_RYCHLOST * UHLOVA_RYCHLOST * x - 2 * TLUMENI * UHLOVA_RYCHLOST * v) * dt;
    x += v * dt;
    zbyva -= dt;
  }
  if (Math.abs(x) < 0.4 && Math.abs(v) < 0.02) return { poloha: cil, rychlost: 0, hotovo: true };
  return { poloha: cil + x, rychlost: v, hotovo: false };
}
